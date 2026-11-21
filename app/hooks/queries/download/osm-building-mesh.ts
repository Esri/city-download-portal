import Mesh from "@arcgis/core/geometry/Mesh.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { createElevationSampler, createFromPolygon } from "@arcgis/core/geometry/support/meshUtils.js";
import MeshMaterial from "@arcgis/core/geometry/support/MeshMaterial.js";
import MeshVertexAttributes from "@arcgis/core/geometry/support/MeshVertexAttributes.js";
import { intersectionExecute } from "@arcgis/core/geometry/operators/intersectionOperator.js";
import { ExportColors } from "~/symbology/symbology";
import { meshInFootprintSpace, type ExportFootprint } from "./hexagon-footprint";
import { extrudeMeshSurface, getMeshPerimeter } from "./clip-footprint-mesh";
import type { OsmBuilding } from "./osm-building-query";

export async function createOsmBuildingMeshes(
  buildings: OsmBuilding[],
  footprint: ExportFootprint,
  sampledTerrain: Mesh,
  signal?: AbortSignal,
) {
  if (buildings.length === 0) return [];

  // All XY coordinates in this plane are already local meters. The projected SR
  // lets the planar operators and elevation sampler consume those coordinates.
  const planar = SpatialReference.WebMercator;
  const clockwise = [...footprint.corners].reverse();
  const mask = new Polygon({ spatialReference: planar, rings: [[...clockwise, clockwise[0]]] });
  const terrain = new Mesh({
    spatialReference: planar,
    vertexAttributes: sampledTerrain.vertexAttributes,
    components: sampledTerrain.components,
  });
  const elevation = await createElevationSampler(terrain);
  const meshes: Mesh[] = [];
  const material = new MeshMaterial({ color: ExportColors.feature() });

  for (const building of buildings) {
    signal?.throwIfAborted();
    const rings = building.footprint.rings;
    const input = new Mesh({
      spatialReference: building.footprint.spatialReference,
      vertexAttributes: new MeshVertexAttributes({
        position: Float64Array.from(rings.flatMap(ring => ring.flatMap(([x, y]) => [x, y, 0]))),
      }),
    });
    const local = (await meshInFootprintSpace(input, footprint, signal)).vertexAttributes.position;
    let offset = 0;
    const polygon = new Polygon({
      spatialReference: planar,
      rings: rings.map(ring => ring.map(() => {
        const xy = [local[offset], local[offset + 1]];
        offset += 3;
        return xy;
      })),
    });

    // Cut the footprint before extruding so buildings along the mask have closed cut faces.
    const clipped = intersectionExecute(polygon, mask);
    if (clipped?.type !== "polygon") continue;

    const roof = await createFromPolygon(clipped as Polygon);
    const positions = roof?.vertexAttributes.position;
    if (!positions?.length || !roof.components?.length) continue;

    let lowest = Infinity;
    let highest = -Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      const z = elevation.elevationAt(positions[index], positions[index + 1]);
      if (z != null && Number.isFinite(z)) {
        lowest = Math.min(lowest, z);
        highest = Math.max(highest, z);
      }
    }
    if (!Number.isFinite(lowest)) continue;

    const top = positions.slice();
    for (let index = 2; index < top.length; index += 3) top[index] = highest + building.height;
    const name = `OpenStreetMap building ${building.id}`;
    const components = roof.components.map(component => {
      const faces = component.faces ?? [];
      const upwards: number[] = [];
      for (let index = 0; index < faces.length; index += 3) {
        const [a, b, c] = [faces[index], faces[index + 1], faces[index + 2]];
        const ax = top[a * 3], ay = top[a * 3 + 1];
        const winding = (top[b * 3] - ax) * (top[c * 3 + 1] - ay) - (top[b * 3 + 1] - ay) * (top[c * 3] - ax);
        if (winding > 0) upwards.push(a, b, c);
        else if (winding < 0) upwards.push(a, c, b);
      }
      return { faces: Uint32Array.from(upwards), material, shading: "flat" as const, name };
    }).filter(component => component.faces.length);
    if (!components.length) continue;

    const surface = new Mesh({
      spatialReference: sampledTerrain.spatialReference,
      vertexSpace: sampledTerrain.vertexSpace,
      vertexAttributes: new MeshVertexAttributes({ position: top }),
      components,
    });
    const perimeter = getMeshPerimeter(surface, () => new Error(`Could not close the footprint for ${name}.`));
    if (!perimeter.length) continue;
    // Extend the walls slightly into the terrain to keep the print in contact across slopes.
    meshes.push(extrudeMeshSurface(surface, perimeter, lowest - 0.25, `${name} walls`));
  }

  return meshes;
}
