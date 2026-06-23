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
import { useEffect, useState } from "react";
import { useSceneView } from "../views/scene-view/scene-view-context";
import "@arcgis/map-components/components/arcgis-search";
import { useScene } from "../maps/web-scene/scene-context";
import { GeometryUnion } from "@arcgis/core/geometry/types";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import useInstance from "~/hooks/useInstance";
import Highlights from "~/routes/_root.$scene/selection/highlights";
import SceneLayerView from "@arcgis/core/views/layers/SceneLayerView";
import { useSceneLayerViews } from "~/hooks/useSceneLayers";
import { useQuery } from '@tanstack/react-query';
import type FeatureSet from "@arcgis/core/rest/support/FeatureSet";
import type { ArcgisSearch } from "@arcgis/map-components/components/arcgis-search/customElement";

type SearchComponent = ArcgisSearch & HTMLElement;

export default function Search() {
  const view = useSceneView();
  const scene = useScene();
  const [isSearchReady, setIsSearchReady] = useState(false);
  const search = useInstance<SearchComponent | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }

    return document.createElement("arcgis-search") as SearchComponent;
  });

  const extent = useAccessorValue(
    () => {
      const layers = scene.allLayers
        .filter(layer => layer.type === 'scene' && layer.fullExtent != null)

      if (layers.length > 0) {
        const extents = layers
          .reduce((extent, layer) => {
            if (extent == null) return layer.fullExtent!;
            if (layer.fullExtent == null) return extent;
            return layer.fullExtent.union(extent)
          }, layers.at(0)!.fullExtent)

        return extents;
      }
    },
  );

  useEffect(() => {
    if (!search) {
      return;
    }

    setIsSearchReady(false);

    const handleReady = () => {
      setIsSearchReady(true);
    };

    search.addEventListener("arcgisReady", handleReady);

    return () => {
      search.removeEventListener("arcgisReady", handleReady);
    };
  }, [search]);

  // this is a little hacky, we access source.initialized just to access something on the source object
  // then we get a reaction any time a new source is added to the list of sources
  const sources = useAccessorValue(() => {
    if (!search || !isSearchReady) {
      return undefined;
    }

    return search.allSources.map(source => (source.initialized, source));
  }, { initial: true });

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
    if (!search) {
      return;
    }

    search.autoDestroyDisabled = true;
    search.view = view;
    search.resultGraphicDisabled = false;
    search.popupDisabled = true;
    search.goToOverride = async (view, params) => {
      const target = params.target as typeof params.target & { zoom?: number };
      target.zoom = 20
      await view.goTo(target, params.options)
    };

    view.ui.add(search, { position: 'top-left', index: 0 });

    return () => {
      view.ui.remove(search);
      void search.destroy();
    }
  }, [view, search])

  const result = useAccessorValue(() => {
    if (!search || !isSearchReady) {
      return undefined;
    }

    return search.resultGraphic?.geometry;
  });
  const query = useSearchHighlight(result);
  const highlights = query.isSuccess ? query.data : undefined

  return <Highlights name="search-result" data={highlights} />;
}

export function useSearchHighlight(searchGeometry?: GeometryUnion | null | undefined) {
  const sceneLayerViews = useSceneLayerViews();
  const query = useQuery({
    queryKey: ['search', sceneLayerViews?.map(lv => lv.layer.id), searchGeometry?.toJSON()],
    queryFn: async ({ signal }) => {
      const featureMap = new Map<SceneLayerView, FeatureSet['features']>();
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