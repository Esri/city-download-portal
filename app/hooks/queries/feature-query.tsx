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
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import SceneLayer from "@arcgis/core/layers/SceneLayer";
import SceneLayerView from "@arcgis/core/views/layers/SceneLayerView";
import { useDeferredValue } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import { useSceneLayerViews } from "../useSceneLayers";
import { useQuery } from '@tanstack/react-query';
import { useAccessorValue } from "../../arcgis/reactive-hooks";
import { useDebouncedValue } from "../useDebouncedValue";
import { filterMeshGraphicsFromFeatureSet, type MeshGraphic } from "./download/export-query";
import * as bufferOperator from "@arcgis/core/geometry/operators/bufferOperator.js";
import * as unionOperator from "@arcgis/core/geometry/operators/unionOperator.js";
import type FeatureSet from "@arcgis/core/rest/support/FeatureSet";

/**
 * This function performs a client side query on the layer views, to find features that intersect with the given boundary.
 * This is very fast and is useful to keep track of the selected features during interaction, but the query does not return any geometries.
 */
async function queryFeaturesWithoutGeometries(sceneLayerViews: SceneLayerView[], boundary: Polygon, signal: AbortSignal) {
  const featureMap = new Map<SceneLayerView, FeatureSet['features']>();
  const promises: Promise<unknown>[] = [];

  for (const layerView of sceneLayerViews!) {
    const query = layerView.createQuery();
    query.geometry = boundary.extent;
    query.spatialRelationship = 'intersects'
    const queryPromise = layerView.queryFeatures(query, { signal })
      .then((featureSet) => featureMap.set(layerView, featureSet.features));
    promises.push(queryPromise);
  }

  await Promise.all(promises)

  return featureMap;
}

/**
 * This function performs a server side query on the layers, to find features that intersect with the given boundary.
 * This is slower than the client side query, but it returns the geometries of the features and is useful for exporting.
 */
async function queryFeaturesWithGeometries(sceneLayerViews: SceneLayerView[], boundary: Polygon, signal: AbortSignal) {
  const featureMap = new Map<SceneLayer, MeshGraphic[]>();
  const promises: Promise<unknown>[] = [];
  for (const { layer } of sceneLayerViews!) {
    const query = layer.createQuery();
    query.geometry = boundary.extent;
    query.spatialRelationship = 'intersects'
    const queryPromise = layer.queryFeatures(query, { signal })
      .then((featureSet) => {
        featureMap.set(layer, filterMeshGraphicsFromFeatureSet(featureSet))
      });
    promises.push(queryPromise);
  }
  await Promise.all(promises)

  return featureMap;
}

async function countFeatures(sceneLayerViews: SceneLayerView[], boundary: Polygon, signal: AbortSignal) {
  const promises: Promise<unknown>[] = [];

  let count = 0;
  for (const layerView of sceneLayerViews!) {
    const query = layerView.createQuery();
    query.geometry = boundary.extent;
    query.spatialRelationship = 'intersects'

    const queryPromise = layerView.queryExtent(query, { signal }).then(result => {
      count += result.count;
    });
    promises.push(queryPromise);
  }
  await Promise.all(promises)

  return count;
}

async function queryFootprints(sceneLayerViews: SceneLayerView[], boundary: Polygon, signal: AbortSignal) {
  const sceneLayers = sceneLayerViews!.map(lv => lv.layer);

  const footprints: Polygon[] = []

  for (const layer of sceneLayers) {
    const footprintQuery = layer.createQuery()
    footprintQuery.multipatchOption = "xyFootprint";
    footprintQuery.returnGeometry = true;
    footprintQuery.geometry = boundary.extent
    footprintQuery.outSpatialReference = boundary.spatialReference;
    footprintQuery.spatialRelationship = "intersects";

    const results = await layer.queryFeatures(footprintQuery, { signal });
    const layerFootprints = await Promise.all(results.features
      .map(f => f.geometry as Polygon)
      .filter(Boolean)
      // the footprints are often quite sharp directly from the query,
      // so we add a little bit of a buffer to smooth them out
      .map(f => bufferOperator.execute(f, 0.2, { unit: 'meters' })!)
    )
    footprints.push(...layerFootprints)
  }

  const fpUnion = unionOperator.executeMany(footprints) as Polygon;

  if (fpUnion != null) return fpUnion
  else throw new Error('failed to combine footprints');
}

export function useSelectedFeaturesFromLayerViews(key?: string) {
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);
  const deferredPolygon = useDeferredValue(selection)
  const sceneLayerViews = useSceneLayerViews();

  const query = useQuery({
    queryKey: ['selected-features', 'layerviews', sceneLayerViews?.map(lv => lv.layer.id), deferredPolygon?.rings, key],
    queryFn: async ({ signal }) => await queryFeaturesWithoutGeometries(sceneLayerViews ?? [], deferredPolygon!, signal),
    enabled: deferredPolygon != null && sceneLayerViews != null,
  })

  return query;
}

export function useSelectedFeaturesCount() {
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);
  const sceneLayerViews = useSceneLayerViews();

  const queryKey = useDeferredValue(
    ['selected-features', 'layerviews', sceneLayerViews?.map(lv => lv.layer.id), selection?.rings]
  )

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => await countFeatures(sceneLayerViews ?? [], selection!, signal),
    enabled: selection != null && sceneLayerViews != null,
  })

  return query;
}

export const MAX_FEATURES = 100;

export function useHasTooManyFeatures() {
  const { data: featureCount = 0 } = useSelectedFeaturesCount();
  const hasTooManyFeatures = featureCount > MAX_FEATURES

  return hasTooManyFeatures;
}

export function useSelectedFeaturesFromLayers(enabled = false) {
  const sceneLayerViews = useSceneLayerViews();
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);
  const deferredPolygon = useDeferredValue(selection)

  const query = useQuery({
    queryKey: ['selected-features', 'layers', sceneLayerViews?.map(lv => lv.layer.id), deferredPolygon?.rings],
    queryFn: async ({ signal }) => await queryFeaturesWithGeometries(sceneLayerViews ?? [], deferredPolygon!, signal),
    enabled: enabled && deferredPolygon != null && sceneLayerViews != null,
  })

  return query;
}

export function useSelectionFootprints(selection: Polygon | null) {
  const sceneLayerViews = useSceneLayerViews();
  const hasTooManyFeatures = useHasTooManyFeatures();

  const deferredPolygon = useDebouncedValue(selection)

  const query = useQuery({
    queryKey: [
      'selecion-footprints',
      'layers',
      sceneLayerViews?.map(lv => lv.layer.id), deferredPolygon?.rings
    ],
    queryFn: async ({ signal }) => await queryFootprints(sceneLayerViews ?? [], deferredPolygon!, signal),
    enabled: !hasTooManyFeatures && deferredPolygon != null && sceneLayerViews != null,
  })

  return query;
}
