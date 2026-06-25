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
import { ForwardedRef, PropsWithChildren, memo, useEffect, useMemo } from "react"
import CoreMapView from '@arcgis/core/views/MapView';
import { MapViewContext } from "./map-view-context";
import Color from "@arcgis/core/Color.js";
import { useMap } from "../../maps/map/map-context";
import Extent from "@arcgis/core/geometry/Extent";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import useInstance from "~/hooks/useInstance";
import useProvideRef from "~/hooks/useProvideRef";

interface MapViewProps {
  spatialReference?: string;
  extent?: Extent;
  ref?: ForwardedRef<CoreMapView>;
}

function InternalMapView({ ref, children, spatialReference, extent }: PropsWithChildren<MapViewProps>) {
  const map = useMap();

  const sr = useMemo(() => spatialReference == null ?
    SpatialReference.WebMercator :
    new SpatialReference({
      wkid: +spatialReference
    }), [spatialReference])

  const view = useInstance(() => new CoreMapView({
    map,
    extent,
    spatialReference: sr,
    constraints: {
      snapToZoom: false,
    },
    highlights: [{
      name: "default",
      color: new Color([255, 255, 0, 0.25]),
    }],
    ui: {
      components: []
    }
  }));

  useEffect(() => {
    view.extent = extent!
  }, [extent, view])

  useEffect(() => {
    view.spatialReference = sr
  }, [sr, view])

  useEffect(() => {
    view.map = map;
  }, [view, map]);

  useProvideRef(view, ref)

  return (
    <MapViewContext.Provider value={view}>
      <div
        className="w-full h-full isolate"
        ref={(node) => {
          if (node && view.container !== node) {
            view.container = node;
          }
        }}
      />
      {children}
    </MapViewContext.Provider>
  )
}

const MapView = memo(InternalMapView)

export default MapView;