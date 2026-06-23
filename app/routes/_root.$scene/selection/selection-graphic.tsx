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
import { memo, useDeferredValue, useMemo } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import Graphic from "~/arcgis/components/graphic";
import ExtrudeSymbol3DLayer from "@arcgis/core/symbols/ExtrudeSymbol3DLayer";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D";
import GraphicsLayer from "~/arcgis/components/graphics-layer";
import { createOriginSymbol, SymbologyColors } from "~/symbology/symbology";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { usePreciseOriginElevationInfo, useSelectionVolumeExtent } from "~/hooks/queries/elevation-query";
import SolidEdges3D from "@arcgis/core/symbols/edges/SolidEdges3D.js";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { useHasTooManyFeatures, useSelectedFeaturesFromLayerViews } from "~/hooks/queries/feature-query";
import Highlights from "./highlights";

function InternalSelectionGraphic() {
  const store = useSelectionState();
  const isIdle = useAccessorValue(() => store.editingState === 'idle');
  const isUpdatingOrigin = useAccessorValue(() => store.editingState === 'updating-origin');
  const selection = useAccessorValue(() => store.selection)
  const hasTooManyFeatures = useHasTooManyFeatures()
  const selectedFeaturesQuery = useSelectedFeaturesFromLayerViews();

  return (
    <>
      {selection != null ? (
        <Graphic
          ref={(graphic) => {
            store.graphic = graphic
          }}
          geometry={selection}
          symbol={!hasTooManyFeatures ? FootprintSymbol : InvalidFootprintSymbol}
        />
      ) : null}
      <GraphicsLayer elevationMode="absolute-height">
        {isIdle ? <Volume /> : null}
        {!isUpdatingOrigin ? <Origin /> : null}
      </GraphicsLayer>
      {selectedFeaturesQuery.data ? <Highlights
        name="selected-features"
        data={selectedFeaturesQuery.data}
        color={hasTooManyFeatures ? SymbologyColors.invalidSelection(1) : SymbologyColors.selection(1)}
      /> : null}
    </>
  )
}

function Origin() {
  const store = useSelectionState();
  const origin = useAccessorValue(() => store.modelOrigin ?? store.selectionOrigin);
  const selection = useAccessorValue(() => store.selection);
  const originElevationInfo = usePreciseOriginElevationInfo().data;

  /* since the elevation calculations are async they can be quite slow, so using the z enriched origin directly would look choppy. Instead, we just use the current origin, and add the most current elevation info we have to that point */
  const elevatedOrigin = origin?.clone();
  if (originElevationInfo && elevatedOrigin) elevatedOrigin.z = originElevationInfo.z;

  const { data } = useSelectionVolumeExtent();

  const volumeExtent = useDeferredValue(data ?? selection?.extent)
  const height = (volumeExtent?.zmax ?? 0) - (volumeExtent?.zmin ?? 0);
  const symbol = useMemo(() => createOriginSymbol(height), [height])

  return (
    elevatedOrigin ? (
      <Graphic
        geometry={elevatedOrigin}
        symbol={symbol}
      />
    ) : null
  )
}

function Volume() {
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);

  const { data } = useSelectionVolumeExtent();

  const zmin = data?.zmin ?? 0
  const zmax = data?.zmax ?? 0

  const bufferedZmin = zmin - 100;
  const bufferedZmax = zmax + 5;
  const height = (bufferedZmax - bufferedZmin);

  const volumeSymbol = useMemo(() => new PolygonSymbol3D({
    symbolLayers: [
      new ExtrudeSymbol3DLayer({
        size: height,
        castShadows: false,
        edges: new SolidEdges3D({
          color: SymbologyColors.selection(0.85),
          size: 1
        })
      })
    ]
  }), [height])

  const elevatedPolygon = useMemo(() => {
    if (selection == null) return null;

    const ring = selection.rings[0]
    const elevatedRing = ring.map(([x, y]) => [x, y, bufferedZmin])

    return new Polygon({
      rings: [elevatedRing],
      spatialReference: selection.spatialReference
    })
  }, [bufferedZmin, selection])

  return (
    elevatedPolygon ? (
      <Graphic
        geometry={elevatedPolygon}
        symbol={volumeSymbol}
      />
    ) : null
  )
}

const FootprintSymbol = new PolygonSymbol3D({
  symbolLayers: [
    new FillSymbol3DLayer({
      material: { color: SymbologyColors.selection(0.25) },
      outline: { color: SymbologyColors.selection() },
    })
  ]
});


const InvalidFootprintSymbol = new PolygonSymbol3D({
  symbolLayers: [
    new FillSymbol3DLayer({
      material: { color: SymbologyColors.invalidSelection(0.1) },
      outline: { color: SymbologyColors.invalidSelection() },
    })
  ]
});

const SelectionGraphic = memo(InternalSelectionGraphic);
export default SelectionGraphic;