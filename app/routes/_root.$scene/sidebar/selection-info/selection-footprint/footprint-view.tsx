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
import { Suspense, lazy, memo, useDeferredValue, useEffect, useRef } from "react";
import '@esri/calcite-components/dist/components/calcite-scrim';
import { CalciteScrim } from "@esri/calcite-components-react";
import GraphicsLayer from "~/arcgis/components/graphics-layer";
import Graphic from "~/arcgis/components/graphic";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import { useSceneView } from "~/arcgis/components/views/scene-view/scene-view-context";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import CoreMapView from "@arcgis/core/views/MapView";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import { SymbologyColors } from "~/symbology/symbology";
import { useMutation } from "@tanstack/react-query";
import { FootprintGraphic } from "./footprint-graphic";
import { SelectionPreviewGraphic } from "./selection-preview-graphic";
import * as areaOperator from "@arcgis/core/geometry/operators/areaOperator.js";
import * as bufferOperator from "@arcgis/core/geometry/operators/bufferOperator.js";

const Map = lazy(() => import('~/arcgis/components/maps/map/map'));
const MapView = lazy(() => import('~/arcgis/components/views/map-view/map-view'));

const OriginSymbol = new SimpleMarkerSymbol({
  color: SymbologyColors.measurements(),
  style: 'diamond',
  outline: null!
})

function useGoToSelection() {
  const mutation = useMutation({
    mutationFn: async (vars: {
      view: CoreMapView,
      selection: Polygon,
      origin: Point,
      signal: AbortSignal
    }) => {
      const { view, selection, origin, signal } = vars;
      if (selection.extent == null) return;

      const xmax = origin.x > selection.extent.xmax ? origin.x : selection.extent.xmax;
      const xmin = selection.extent.xmin > origin.x ? origin.x : selection.extent.xmin;
      const ymax = origin.y > selection.extent.ymax ? origin.y : selection.extent.ymax;
      const ymin = selection.extent.ymin > origin.y ? origin.y : selection.extent.ymin;

      const polygon = selection.clone();
      polygon.rings = [
        [
          [xmin, ymin],
          [xmin, ymax],
          [xmax, ymax],
          [xmax, ymin],
          [xmin, ymax],
        ]
      ]

      const area = Math.abs(areaOperator.execute(polygon));
      const buffered = bufferOperator.execute(polygon!, Math.sqrt(area) * 0.5);
      if (buffered == null) return;

      return view.goTo({ target: buffered }, { signal, animate: true });
    }
  });

  return mutation;
}

function InternalMinimap() {
  const sceneView = useSceneView();

  const store = useSelectionState();
  const origin = useAccessorValue(() => store.origin);
  const selection = useAccessorValue(() => store.selection);

  const spatialReference = useAccessorValue(() => sceneView.spatialReference?.wkid);

  const mapRef = useRef<CoreMapView>(null);

  useEffect(() => {
    if (mapRef.current && !mapRef.current?.ready) {
      mapRef.current.extent = sceneView.extent;
    }
  })

  const deferredSelection = useDeferredValue(selection);
  const deferredOrigin = useDeferredValue(origin);

  const { mutate: goToSelection } = useGoToSelection();

  useEffect(() => {
    if (mapRef.current == null || deferredSelection == null || deferredOrigin == null) return;

    const controller = new AbortController();

    goToSelection({
      view: mapRef.current,
      signal: controller.signal,
      selection: deferredSelection,
      origin: deferredOrigin,
    })

    return () => {
      controller.abort()
    }
  }, [deferredOrigin, deferredSelection, goToSelection])

  return (
    <div className={"w-full aspect-[1.5/1] pointer-events-none "}>
      {spatialReference != null ? (
        <Suspense fallback={<CalciteScrim loading />}>
          <Map>
            <GraphicsLayer>
              {deferredOrigin != null ? <Graphic
                index={1}
                geometry={deferredOrigin}
                symbol={OriginSymbol}
              />
                : null}
              {
                deferredOrigin != null && deferredSelection != null
                  ? <SelectionPreviewGraphic origin={deferredOrigin} selection={deferredSelection} />
                  : null
              }
              {
                deferredOrigin != null && deferredSelection != null
                  ? <FootprintGraphic selection={deferredSelection} />
                  : null
              }
            </GraphicsLayer>
            <MapView ref={mapRef} spatialReference={`${spatialReference}`} />
          </Map>
        </Suspense>
      ) : null}
    </div>
  )
}

const Minimap = memo(InternalMinimap);

export default Minimap;

