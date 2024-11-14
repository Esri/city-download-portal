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
import { useEffect } from "react";
import { useSceneView } from "../components/views/scene-view/scene-view-context";
import SearchWidget from "@arcgis/core/widgets/Search.js";
import { useScene } from "../components/maps/web-scene/scene-context";
import Geometry from "@arcgis/core/geometry/Geometry";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import useInstance from "~/hooks/useInstance";
import { removeSceneLayerClones } from "~/routes/_root.$scene/selection/scene-filter-highlights";
import Highlights from "~/routes/_root.$scene/selection/highlights";
import SceneLayerView from "@arcgis/core/views/layers/SceneLayerView";
import { useSceneLayerViews } from "~/hooks/useSceneLayers";
import { useQuery } from '@tanstack/react-query';

export default function Search() {
  const view = useSceneView();
  const scene = useScene();
  const widget = useInstance(() => new SearchWidget({
    view,
    resultGraphicEnabled: true,
    popupEnabled: false,
    goToOverride: (view, params) => {
      params.target.zoom = 20
      view.goTo(params.target, params.options)
    }
  }));

  const extent = useAccessorValue(
    () => {
      const layers = scene.allLayers
        .filter(removeSceneLayerClones)
        .filter(layer => layer.type === 'scene' && layer.fullExtent != null)

      if (layers.length > 0) {
        const extents = layers
          .reduce((extent, layer) => layer.fullExtent.union(extent), layers.at(0).fullExtent)

        return extents;
      }
    },
  );

  // this is a little hacky, we access source.initialized just to access something on the source object
  // then we get a reaction any time a new source is added to the list of sources
  const sources = useAccessorValue(() => widget.allSources.map(source => (source.initialized, source)), { initial: true });

  useEffect(() => {
    if (extent && sources) {
      for (const source of sources) {
        source.filter = {
          geometry: extent
        }
      }
    }
  }, [extent, sources])

  useEffect(() => {
    widget.view = view;
    view.ui.add(widget, { position: 'top-left', index: 0 });

    return () => {
      view.ui.remove(widget);
    }
  }, [scene.allLayers, view, widget])

  const result = useAccessorValue(() => widget.resultGraphic?.geometry);
  const query = useSearchHighlight(result);
  const highlights = query.isSuccess ? query.data : undefined

  return <Highlights data={highlights} />;
}


export function useSearchHighlight(searchGeometry?: Geometry) {
  const sceneLayerViews = useSceneLayerViews();
  const query = useQuery({
    queryKey: ['search', sceneLayerViews?.map(lv => lv.layer.id), searchGeometry?.toJSON()],
    queryFn: async ({ signal }) => {
      const featureMap = new Map<SceneLayerView, __esri.FeatureSet['features']>();
      const promises: Promise<unknown>[] = [];
      for (const layerView of sceneLayerViews!) {
        const query = layerView.layer.createQuery();
        query.geometry = searchGeometry!;
        query.spatialRelationship = 'intersects'
        query.returnGeometry = true;
        const queryPromise = layerView.layer.queryFeatures(query, { signal })
          .then((featureSet) => featureMap.set(layerView, featureSet.features));
        promises.push(queryPromise);
      }

      await Promise.all(promises)
      return featureMap;
    },
    enabled: searchGeometry != null && sceneLayerViews != null,
  })

  return query;
}