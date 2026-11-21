/* Copyright 2024 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import Mesh from "@arcgis/core/geometry/Mesh";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace";
import MeshGeoreferencedVertexSpace from "@arcgis/core/geometry/support/MeshGeoreferencedVertexSpace";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils";
import type Ground from '@arcgis/core/Ground';
import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import type WebScene from "@arcgis/core/WebScene";
import type SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import MeshVertexAttributes from "@arcgis/core/geometry/support/MeshVertexAttributes.js";
import { projectExecute, projectLoad } from "@arcgis/core/geometry/operators/projectOperator.js";
import { createOriginMarker, ExportColors } from "~/symbology/symbology";
import MeshMaterial from "@arcgis/core/geometry/support/MeshMaterial.js";
import type { MeshGraphic } from "./export-query";
import { clipMeshToFootprint, extrudeMeshSurface, getFootprintPerimeter } from "./clip-footprint-mesh";
import { createRectangleFootprint, meshInFootprintSpace, projectPoint, signedDistance, vertexSpaceAt, type ExportFootprint, type HexagonFootprint } from "./hexagon-footprint";
import { createOsmBuildingMeshes } from "./osm-building-mesh";
import type { OsmBuilding } from "./osm-building-query";

async function extractElevation(ground: Ground, extent: Extent, features?: Map<SceneLayer, MeshGraphic[]>, extrudeBase: boolean = true, extrusionDepth: number = 50) {
  const mesh = await meshUtils.createFromElevation(ground, extent, {
    demResolution: "finest-contiguous"
  });

  if (!extrudeBase) {
    // Return the original terrain mesh without extrusion
    for (const component of mesh.components ?? []) {
      component.name = "<terrain>";
      component.material = new MeshMaterial({
        color: ExportColors.terrain()
      });
    }
    return mesh;
  }

  // Calculate base elevation from features if available
  let minElevation = mesh.extent.zmin ?? 0;
  if (features && features.size > 0) {
    const allFeatures = Array.from(features.values()).flat();
    if (allFeatures.length > 0) {
      minElevation = Math.min(
        minElevation,
        ...allFeatures.map(f => f.geometry.extent.zmin).filter((z): z is number => z !== undefined)
      );
    }
  }

  // Use the specified extrusion depth
  const baseElevation = minElevation - extrusionDepth;
  
  const extrudedMesh = await extrudeTerrainMesh(mesh, baseElevation);

  for (const component of extrudedMesh.components ?? []) {
    component.name = "elevation";
    component.material ??= new MeshMaterial({
      color: ExportColors.terrain()
    })
  }

  return extrudedMesh;
}

async function extrudeTerrainMesh(mesh: Mesh, bottomElevation: number): Promise<Mesh> {
  const originalVertices = mesh.vertexAttributes.position;
  const originalFaces = mesh.components?.[0]?.faces;
  
  if (!originalVertices || !originalFaces || !mesh.components) {
    return mesh; // Return original if no valid geometry
  }

  const vertexCount = originalVertices.length / 3;
  
  // Create new vertex array with double the vertices (top + bottom)
  const newVertices = new Float64Array(originalVertices.length * 2);
  
  // Copy original vertices (top surface - preserve terrain detail)
  newVertices.set(originalVertices, 0);
  
  // Create bottom vertices by copying X,Y and setting Z to flat bottom elevation
  for (let i = 0; i < vertexCount; i++) {
    const baseIndex = i * 3;
    newVertices[originalVertices.length + baseIndex] = originalVertices[baseIndex];         // X
    newVertices[originalVertices.length + baseIndex + 1] = originalVertices[baseIndex + 1]; // Y
    newVertices[originalVertices.length + baseIndex + 2] = bottomElevation;                 // Z (flat)
  }

  // Find boundary edges for side walls
  const boundaryEdges = findBoundaryEdges(originalFaces);
  
  // Calculate face counts
  const originalFaceCount = originalFaces.length;
  const sideFaceCount = boundaryEdges.length * 6; // 2 triangles per boundary edge
  const bottomFaceCount = originalFaceCount; // Bottom face
  
  const newFaces = new Uint32Array(originalFaceCount + sideFaceCount + bottomFaceCount);
  let faceIndex = 0;
  
  // Copy original top faces (preserve terrain surface)
  newFaces.set(originalFaces, faceIndex);
  faceIndex += originalFaceCount;
  
  // Create side faces connecting top perimeter to bottom perimeter
  for (const [v1, v2] of boundaryEdges) {
    const topV1 = v1;
    const topV2 = v2;
    const bottomV1 = v1 + vertexCount;
    const bottomV2 = v2 + vertexCount;
    
    // Triangle 1
    newFaces[faceIndex++] = topV1;
    newFaces[faceIndex++] = bottomV1;
    newFaces[faceIndex++] = topV2;
    
    // Triangle 2
    newFaces[faceIndex++] = topV2;
    newFaces[faceIndex++] = bottomV1;
    newFaces[faceIndex++] = bottomV2;
  }
  
  // Create flat bottom faces (reverse winding order to face downward)
  for (let i = 0; i < originalFaceCount; i += 3) {
    newFaces[faceIndex + i] = originalFaces[i + 2] + vertexCount;     // Reverse winding
    newFaces[faceIndex + i + 1] = originalFaces[i + 1] + vertexCount;
    newFaces[faceIndex + i + 2] = originalFaces[i] + vertexCount;
  }

  // Create the extruded solid mesh
  const extrudedMesh = new Mesh({
    vertexAttributes: new MeshVertexAttributes({ position: newVertices }),
    components: [{
      faces: newFaces
    }],
    spatialReference: mesh.spatialReference
  });

  return extrudedMesh;
}

function findBoundaryEdges(faces: Uint32Array): [number, number][] {
  // Create edge map to find boundary edges (edges that appear only once)
  const edgeMap = new Map<string, number>();
  
  // Process all faces to count edge occurrences
  for (let i = 0; i < faces.length; i += 3) {
    const v1 = faces[i];
    const v2 = faces[i + 1];
    const v3 = faces[i + 2];
    
    // Add all three edges of the triangle
    addEdge(edgeMap, v1, v2);
    addEdge(edgeMap, v2, v3);
    addEdge(edgeMap, v3, v1);
  }
  
  // Find edges that appear only once (boundary edges)
  const boundaryEdges: [number, number][] = [];
  for (const [edgeKey, count] of edgeMap.entries()) {
    if (count === 1) {
      const [v1, v2] = edgeKey.split('-').map(Number);
      boundaryEdges.push([v1, v2]);
    }
  }
  
  return boundaryEdges;
}

function addEdge(edgeMap: Map<string, number>, v1: number, v2: number): void {
  // Create consistent edge key (smaller vertex first)
  const edgeKey = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
  edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
}



async function createLayerMeshes({
  layer,
  features,
  vertexSpace,
  signal,
}: {
  layer: SceneLayer,
  features: MeshGraphic[],
  vertexSpace: MeshLocalVertexSpace | MeshGeoreferencedVertexSpace,
  signal?: AbortSignal
}) {
  const meshPromises = features
    .map(async (feature) => {
      const { geometry: mesh } = feature;

      await mesh.load();

      const objectId = feature.getObjectId();

      if (mesh.components) {
        for (const component of mesh.components) {
          component.name = `${layer.title}-${objectId}`;
          // if the feature already has a material, we use that instead
          component.material ??= new MeshMaterial({
            color: ExportColors.feature()
          });
        }
      }
      return meshUtils.convertVertexSpace(mesh, vertexSpace, { signal });
    })

  const meshes = await Promise.all(meshPromises)
  return meshes;
}

async function mergeSliceMeshes(
  {
    elevation,
    features: featureMap,
    origin,
    includeOriginMarker = true,
    spatialReference,
    signal,
  }: {
    elevation: Mesh,
    features: Map<SceneLayer, MeshGraphic[]>
    origin: Point,
    includeOriginMarker?: boolean,
    spatialReference: SpatialReference;
    signal?: AbortSignal
  }) {
  const VertexSpace = spatialReference.isWGS84 || spatialReference.isWebMercator
    ? MeshLocalVertexSpace
    : MeshGeoreferencedVertexSpace

  const vertexSpace = new VertexSpace({
    origin: [origin.x, origin.y, origin.z ?? 0],
  });

  const promises: Promise<Mesh[] | Mesh>[] = [];
  for (const [layer, features] of featureMap.entries()) {
    if (layer.spatialReference.wkid !== origin.spatialReference.wkid) {
      console.warn(`Layer ${layer.title} has a different spatial reference than previous layers. Skipping.`);
      continue;
    }

    const meshes = createLayerMeshes({
      layer,
      features,
      vertexSpace,
      signal,
    });
    promises.push(meshes);
  }

  promises.push(meshUtils.convertVertexSpace(elevation, vertexSpace, { signal }));

  if (includeOriginMarker) {
    const features = Array.from(featureMap.values()).flat();
    const zmax = features.reduce(
      (max, { geometry: next }) => {
        const z = next.extent.zmax ?? -Infinity;
        return z > max ? z : max;
      },
      elevation.extent.zmax ?? -Infinity
    );
    const zmin = features.reduce(
      (min, { geometry: next }) => {
        const nextZmin = next.extent.zmin ?? Infinity;
        return min > nextZmin ? nextZmin : min;
      },
      elevation.extent.zmin ?? Infinity
    );
    const height = zmax - zmin;

    const originMesh = await createOriginMarker(origin, height);
    promises.push(meshUtils.convertVertexSpace(originMesh, vertexSpace, { signal }))
  }

  const meshes = await Promise.all(promises).then((meshes) => meshes.flat());

  const slice = meshUtils.merge(meshes.filter((mesh): mesh is Mesh => mesh != null));

  return slice;
}

export async function createMesh({
  scene,
  extent,
  features,
  origin,
  includeOriginMarker = true,
  extrudeBase = true,
  extrusionDepth = 50,
  hexagon,
  osmBuildings,
  signal,
}: {
  scene: WebScene,
  extent: Extent,
  features: Map<SceneLayer, MeshGraphic[]>
  signal?: AbortSignal,
  origin: Point,
  includeOriginMarker?: boolean,
  extrudeBase?: boolean,
  extrusionDepth?: number
  hexagon?: HexagonFootprint,
  osmBuildings?: OsmBuilding[],
}) {
  if (hexagon || osmBuildings) {
    const footprint = hexagon ?? await createRectangleFootprint(extent, signal);
    return createMaskedMesh({ scene, features, origin, includeOriginMarker, extrudeBase, extrusionDepth, footprint, osmBuildings, signal });
  }

  const ground = scene.ground;
  const originSpatialReference = origin.spatialReference;
  const sr = features.keys().next().value?.spatialReference ?? originSpatialReference;

  let projectedExtent = extent;
  if (!extent.spatialReference.equals(sr)) {
    await projectLoad();
    const projected = projectExecute(extent, sr);
    if (!(projected instanceof Extent)) throw new Error("Could not project the export extent.");
    projectedExtent = projected;
  }

  const projectedOrigin = await projectPoint(origin, sr);

  const elevation = await extractElevation(ground, projectedExtent, features, extrudeBase, extrusionDepth);

  const slice = await mergeSliceMeshes({
    elevation,
    features: features,
    origin: projectedOrigin,
    includeOriginMarker,
    spatialReference: sr,
    signal,
  });

  await slice!.load();

  return slice;
}

async function createMaskedMesh({
  scene, features, origin, includeOriginMarker, extrudeBase, extrusionDepth, footprint, osmBuildings, signal,
}: {
  scene: WebScene;
  features: Map<SceneLayer, MeshGraphic[]>;
  origin: Point;
  includeOriginMarker: boolean;
  extrudeBase: boolean;
  extrusionDepth: number;
  footprint: ExportFootprint;
  osmBuildings?: OsmBuilding[];
  signal?: AbortSignal;
}) {
  const sampled = await meshUtils.createFromElevation(scene.ground, footprint.sourceExtent, {
    demResolution: "finest-contiguous",
    signal,
  });
  const square = await meshInFootprintSpace(sampled, footprint, signal);
  let terrain = clipMeshToFootprint(square, footprint, true, signal);
  if (!terrain) throw new Error("No terrain was sampled inside the export footprint. Try a larger selection.");
  const perimeter = getFootprintPerimeter(terrain, footprint);
  for (const component of terrain.components ?? []) {
    component.name = "<terrain>";
    component.material = new MeshMaterial({ color: ExportColors.terrain() });
  }

  const city = osmBuildings ? await createOsmBuildingMeshes(osmBuildings, footprint, square, signal)
    : (await Promise.all(Array.from(features, ([layer, graphics]) => graphics.map(async feature => {
    const mesh = feature.geometry;
    await mesh.load({ signal });
    const local = await meshInFootprintSpace(mesh, footprint, signal);
    const clipped = clipMeshToFootprint(local, footprint, false, signal);
    for (const component of clipped?.components ?? []) {
      component.name = `${layer.title}-${feature.getObjectId()}`;
      component.material ??= new MeshMaterial({ color: ExportColors.feature() });
    }
    return clipped;
  })).flat())).filter((mesh): mesh is Mesh => mesh !== null);

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (const { vertexAttributes: { position } } of [terrain, ...city]) {
    for (let index = 2; index < position.length; index += 3) {
      minElevation = Math.min(minElevation, position[index]);
      maxElevation = Math.max(maxElevation, position[index]);
    }
  }

  if (extrudeBase) {
    const sr = terrain.spatialReference;
    const metersPerUnit = terrain.vertexSpace.type === "local" ? 1 : sr.metersPerUnit;
    terrain = extrudeMeshSurface(terrain, perimeter, minElevation - extrusionDepth / metersPerUnit, "terrain-base");
  }

  const meshes = [terrain, ...city];
  const exportOrigin = await projectPoint(origin, footprint.center.spatialReference);
  if (includeOriginMarker && maxElevation > minElevation) {
    const marker = await createOriginMarker(exportOrigin, maxElevation - minElevation);
    const local = await meshInFootprintSpace(marker, footprint, signal);
    const position = local.vertexAttributes.position;
    let fits = true;
    for (let i = 0; i < position.length && fits; i += 3) {
      fits = footprint.planes.every(plane => signedDistance(plane, position[i], position[i + 1]) >= -footprint.tolerance);
    }
    if (fits) meshes.push(local);
  }

  const merged = meshUtils.merge(meshes);
  if (!merged) throw new Error("The terrain and building meshes could not be combined for export.");
  return meshUtils.convertVertexSpace(merged, vertexSpaceAt(exportOrigin), { signal });
}
