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
import { type Extent, Point, type SpatialReference } from "@arcgis/core/geometry";
import type WebScene from "@arcgis/core/WebScene";
// import convertGLBToOBJ from "./obj-conversion";
import * as projection from "@arcgis/core/geometry/projection";
import { createOriginMarker, ExportColors } from "~/symbology/symbology";
import MeshMaterial from "@arcgis/core/geometry/support/MeshMaterial.js";
import type { MeshGraphic } from "./export-query";

async function extractElevation(ground: Ground, extent: __esri.Extent) {
  const mesh = await meshUtils.createFromElevation(ground, extent, {
    demResolution: "finest-contiguous"
  });

  for (const component of mesh.components) {
    component.name = "elevation";
    component.material ??= new MeshMaterial({
      color: ExportColors.terrain()
    })
  }

  return mesh;
}

async function createLayerMeshes({
  layer,
  features,
  vertexSpace,
  signal,
}: {
  layer: __esri.SceneLayer,
  features: MeshGraphic[],
  vertexSpace: MeshLocalVertexSpace | MeshGeoreferencedVertexSpace,
  signal?: AbortSignal
}) {
  const meshPromises = features
    .map(async (feature) => {
      const { geometry: mesh } = feature;

      await mesh.load();

      const objectId = feature.getObjectId();
      for (const component of mesh.components) {
        component.name = `${layer.title}-${objectId}`;
        // if the feature already has a material, we use that instead
        component.material ??= new MeshMaterial({
          color: ExportColors.feature()
        });
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
    features: Map<__esri.SceneLayer, MeshGraphic[]>
    origin: Point,
    includeOriginMarker?: boolean,
    spatialReference: SpatialReference;
    signal?: AbortSignal
  }) {
  const VertexSpace = spatialReference.isWGS84 || spatialReference.isWebMercator
    ? MeshLocalVertexSpace
    : MeshGeoreferencedVertexSpace

  const vertexSpace = new VertexSpace({
    origin: [origin.x, origin.y, origin.z],
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
    const zmax = features.reduce((max, { geometry: next }) => next.extent.zmax > max ? next.extent.zmax : max, elevation.extent.zmax);
    const zmin = features.reduce((min, { geometry: next }) => min > next.extent.zmin ? next.extent.zmin : min, elevation.extent.zmin);
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
  signal,
}: {
  scene: WebScene,
  extent: Extent,
  features: Map<__esri.SceneLayer, MeshGraphic[]>
  signal?: AbortSignal,
  origin: Point,
  includeOriginMarker?: boolean
}) {
  const ground = scene.ground;
  const originSpatialReference = origin.spatialReference;
  const sr = features.keys().next().value?.spatialReference ?? originSpatialReference;

  let projectedExtent = extent;
  if (extent.spatialReference.wkid !== sr.wkid) {
    await projection.load();
    projectedExtent = projection.project(extent, sr) as Extent;
  }

  let projectedOrigin = origin;
  if (origin.spatialReference.wkid !== sr.wkid) {
    await projection.load();
    projectedOrigin = projection.project(origin, sr) as Point;
  }

  const elevation = await extractElevation(ground, projectedExtent);

  const slice = await mergeSliceMeshes({
    elevation,
    features: features,
    origin: projectedOrigin,
    includeOriginMarker,
    spatialReference: sr,
    signal,
  });

  await slice.load();

  return slice;
}
