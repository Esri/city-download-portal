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
import { Extent, Point } from "@arcgis/core/geometry";
import Mesh from "@arcgis/core/geometry/Mesh";
import { useScene } from "~/arcgis/components/maps/web-scene/scene-context";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { MAX_FEATURES, useSelectedFeaturesFromLayers } from "../feature-query";
import { useDeferredValue, useEffect } from "react";
import { usePreciseOriginElevationInfo } from "../elevation-query";
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query';
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { ToastableError, useToast } from "~/components/toast";
import WebScene from "@arcgis/core/WebScene";
import type Graphic from "@arcgis/core/Graphic";

export function useExportSizeQuery({ 
  enabled = false, 
  includeOriginMarker = true,
  extrudeBase = true,
  extrusionDepth = 50
}: { 
  enabled?: boolean, 
  includeOriginMarker?: boolean,
  extrudeBase?: boolean,
  extrusionDepth?: number
}) {
  const scene = useScene()
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);
  const featureQuery = useSelectedFeaturesFromLayers(enabled);
  const retry = featureQuery.refetch;
  const featureQueryError = featureQuery.error;
  const features = Array.from(featureQuery.data?.values() ?? []).flat();

  const modelOrigin = usePreciseOriginElevationInfo().data

  useEffect(() => {
    if (enabled) {
      retry()
    }
  }, [enabled, retry])

  const isDownloading = useIsMutating({ mutationKey: ['export-download'] }) > 0

  const isEnabled =
    enabled &&
    !isDownloading &&
    scene != null &&
    selection != null &&
    featureQueryError == null &&
    modelOrigin != null;

  const queryKey = useDeferredValue([
    'export',
    'size',
    features.map(f => f.getObjectId()),
    selection?.extent?.toJSON(),
    modelOrigin?.toJSON(),
    includeOriginMarker,
    extrudeBase,
    extrusionDepth
  ]);

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (featureQueryError) {
        throw featureQueryError;
      }

      try {
        const blob = await createModelBlob({
          scene,
          extent: selection!.extent!,
          features: featureQuery.data!,
          signal,
          origin: modelOrigin!,
          includeOriginMarker,
          extrudeBase,
          extrusionDepth,
          filename: "unknown",
        })

        return blob.size;
      } catch (error) {
        if (error instanceof ToastableError) return null;
        else throw error;
      }
    },
    enabled: isEnabled,
    placeholderData: null
  })

  return query;
}

export function useDownloadExportMutation() {
  const store = useSelectionState();
  const toast = useToast();

  return useMutation({
    mutationKey: ['export-download'],
    mutationFn: createModelBlob,
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

async function createModelBlob(args: {
  includeOriginMarker?: boolean,
  extrudeBase?: boolean,
  extrusionDepth?: number,
  filename: string,
  scene: WebScene,
  extent: Extent,
  features: Map<__esri.SceneLayer, MeshGraphic[]>
  origin: Point,
  signal?: AbortSignal
}) {
  const {
    includeOriginMarker = false,
    extrudeBase = true,
    scene,
    extent,
    features,
    origin,
    signal
  } = args;
  
  // Convert extrusionDepth string to number, with fallback to 50
  const extrusionDepth = args.extrusionDepth ? Number(args.extrusionDepth) : 50;

  const featureCount = Array.from(features.values()).flat().length;
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
      signal,
    });
  } catch (error) {
    throw new ToastableError({
      key: 'mesh-creation-failed',
      message: 'Failed to create mesh',
      title: 'Export error',
      severity: 'danger',
      originalError: error
    })
  }

  const file = await mesh!.toBinaryGLTF();
  const blob = new Blob([file], { type: 'model/gltf-binary' });
  return blob
}

export type MeshGraphic = Omit<Graphic, 'geometry'> & { geometry: Mesh }
export function filterMeshGraphicsFromFeatureSet(featureSet: __esri.FeatureSet): MeshGraphic[] {
  return featureSet.features.filter(feature => feature.geometry?.type === "mesh") as any as MeshGraphic[]
}