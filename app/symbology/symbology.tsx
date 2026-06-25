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
import Color from "@arcgis/core/Color";
import Point from "@arcgis/core/geometry/Point";
import Mesh from "@arcgis/core/geometry/Mesh";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import ObjectSymbol3DLayer from "@arcgis/core/symbols/ObjectSymbol3DLayer";
import Diamond from './diamond.gltf?url';
import MeshMaterial from "@arcgis/core/geometry/support/MeshMaterial";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";

export const SymbologyColors = {
  selection(alpha = 1) {
    return new Color([99, 177, 255, alpha])
  },
  staleSelection(alpha = 1) {
    return new Color([157, 201, 238, alpha])
  },
  invalidSelection(alpha = 1) {
    return new Color([255, 0, 0, alpha])
  },
  measurements(alpha = 1) {
    return new Color([255, 135, 0, alpha])
  }
} as const;

export const ExportColors = {
  terrain(alpha = 1) {
    return new Color([106, 106, 106, alpha])
  },
  feature(alpha = 1) {
    return new Color([210, 210, 210, alpha])
  },
  marker(alpha = 1) {
    return new Color([255, 0, 0, alpha])
  }
}

const diamondSize = 7.5;
const cylinderSize = 2;

export function createOriginSymbol(height: number) {
  const heightWithFallback = height || 50
  const layers = [
    new ObjectSymbol3DLayer({
      material: { color: SymbologyColors.measurements() },
      resource: { primitive: 'cylinder' },
      width: cylinderSize,
      depth: cylinderSize,
      height: heightWithFallback,
    }),
    new ObjectSymbol3DLayer({
      material: { color: SymbologyColors.measurements() },
      resource: { primitive: 'diamond' },
      width: diamondSize,
      depth: diamondSize,
      height: diamondSize,
      anchor: 'relative',
      anchorPosition: { x: 0, y: 0, z: -(heightWithFallback / diamondSize) }
    })
  ]

  return new PointSymbol3D({
    symbolLayers: layers
  })
}

export async function createOriginMarker(origin: Point, meshHeight: number) {
  const material = new MeshMaterial({
    color: ExportColors.marker(1)
  });
  const markerHeight = meshHeight;
  new MeshMaterialMetallicRoughness
  const box = (await Mesh.createFromGLTF(origin, Diamond))
    .scale(diamondSize)
    .offset(0, 0, markerHeight);

  const cylender = Mesh.createCylinder(origin);

  const transform = cylender.transform?.clone();
  if (transform) transform.scale = [cylinderSize, cylinderSize, markerHeight];

  cylender.transform = transform;

  const mesh = meshUtils.merge([box, cylender])!;

  for (const component of mesh.components ?? []) {
    component.name = "<origin-point>";
    component.material = material
  }

  return mesh;
}
