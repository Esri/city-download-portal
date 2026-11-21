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
import { createMesh } from "./create-mesh";
import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import Mesh from "@arcgis/core/geometry/Mesh";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { MAX_FEATURES } from "../feature-query";
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastableError, useToast } from "~/components/toast";
import WebScene from "@arcgis/core/WebScene";
import type Graphic from "@arcgis/core/Graphic";
import type SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type FeatureSet from "@arcgis/core/rest/support/FeatureSet.js";
import type { HexagonFootprint } from "./hexagon-footprint";
import type { OsmBuilding } from "./osm-building-query";
import { OSM_ATTRIBUTION } from "~/data/osm-scene";

export function useExportSizeQuery(args?: ExportModelOptions) {
  const isDownloading = useIsMutating({ mutationKey: ['export-download'] }) > 0;
  return useQuery({
    queryKey: [
      'export', 'size', args?.scene.portalItem?.id, args?.scene.portalItem?.portal?.url,
      args?.extent.toJSON(), args?.origin.toJSON(), args?.hexagon?.outline.toJSON(),
      args?.includeOriginMarker, args?.extrudeBase, args?.extrusionDepth,
      args && Array.from(args.features, ([layer, features]) => [layer.url, layer.id, features.map(f => f.getObjectId())]),
      args?.osmBuildings?.map(building => [building.id, building.height, building.footprint.rings]),
    ],
    queryFn: async ({ signal }) => {
      try {
        return (await createModelBlob({ ...args!, signal })).size;
      } catch {
        signal.throwIfAborted();
        return null;
      }
    },
    enabled: args != null && !isDownloading,
    placeholderData: undefined,
    retry: false,
  });
}

export function useDownloadExportMutation() {
  const store = useSelectionState();
  const toast = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['export-download'],
    mutationFn: createModelBlob,
    onMutate: () => queryClient.cancelQueries({ queryKey: ['export', 'size'] }),
    onSuccess: () => {
      store.exportState = 'exported'
    },
    onError: (error) => {
      if (error instanceof ToastableError) {
        toast(error);
      } else {
        toast({
          key: 'mesh-export-failed',
          message: 'Failed to export mesh',
          title: 'Export error',
          severity: 'danger',
        })
      }
    }
  })
}

export interface ExportModelOptions {
  includeOriginMarker?: boolean,
  extrudeBase?: boolean,
  extrusionDepth?: number,
  scene: WebScene,
  extent: Extent,
  features: Map<SceneLayer, MeshGraphic[]>
  origin: Point,
  hexagon?: HexagonFootprint,
  osmBuildings?: OsmBuilding[],
  signal?: AbortSignal
}

async function createModelBlob(args: ExportModelOptions) {
  const {
    includeOriginMarker = false,
    extrudeBase = true,
    scene,
    extent,
    features,
    origin,
    hexagon,
    osmBuildings,
    signal
  } = args;
  
  // Convert extrusionDepth string to number, with fallback to 50
  const extrusionDepth = args.extrusionDepth ? Number(args.extrusionDepth) : 50;

  const featureCount = osmBuildings?.length ?? Array.from(features.values()).flat().length;
  if (featureCount > MAX_FEATURES) {
    throw new ToastableError({
      key: 'too-many-features',
      message: 'Too many features have been selected',
      severity: 'danger',
      title: 'Too many features in selection'
    })
  }

  try {
    // eslint-disable-next-line no-var
    var mesh = await createMesh({
      scene,
      extent,
      features,
      origin,
      includeOriginMarker,
      extrudeBase,
      extrusionDepth,
      hexagon,
      osmBuildings,
      signal,
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new ToastableError({
      key: 'mesh-creation-failed',
      message: (hexagon || osmBuildings) && error instanceof Error ? error.message : 'Failed to create mesh. Try a smaller selection.',
      title: 'Export error',
      severity: 'danger',
      originalError: error
    })
  }

  const file = await mesh!.toBinaryGLTF({ origin: mesh!.origin ?? origin, signal });
  return osmBuildings ? attributeOsmGlb(file) : new Blob([file], { type: 'model/gltf-binary' });
}

function attributeOsmGlb(file: ArrayBuffer) {
  // GLB starts with a 12-byte header and one padded JSON chunk.
  const originalJsonSize = new DataView(file).getUint32(12, true);
  const originalJsonEnd = 20 + originalJsonSize;
  const model = JSON.parse(new TextDecoder().decode(file.slice(20, originalJsonEnd)));
  model.asset.copyright = [model.asset.copyright, OSM_ATTRIBUTION].filter(Boolean).join(" | ");
  const json = new TextEncoder().encode(JSON.stringify(model));
  const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  padded.set(json);
  const header = file.slice(0, 20);
  const headerView = new DataView(header);
  headerView.setUint32(8, 20 + padded.length + file.byteLength - originalJsonEnd, true);
  headerView.setUint32(12, padded.length, true);
  return new Blob([header, padded, file.slice(originalJsonEnd)], { type: "model/gltf-binary" });
}

export type MeshGraphic = Omit<Graphic, 'geometry'> & { geometry: Mesh }
export function filterMeshGraphicsFromFeatureSet(featureSet: FeatureSet): MeshGraphic[] {
  return featureSet.features.filter(feature => feature.geometry?.type === "mesh") as any as MeshGraphic[]
}
