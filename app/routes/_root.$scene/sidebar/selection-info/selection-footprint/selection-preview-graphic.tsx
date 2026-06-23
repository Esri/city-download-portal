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
import Graphic from "~/arcgis/components/graphic";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { SymbologyColors } from "~/symbology/symbology";
import { useHasTooManyFeatures } from "~/hooks/queries/feature-query";
import { memo, useMemo } from "react";

interface SelectionGraphicProps {
  origin: Point
  selection: Polygon
}

export const SelectionPreviewGraphic = memo(function SelectionPreviewGraphic({ origin, selection }: SelectionGraphicProps) {
  const hasTooManyFeatures = useHasTooManyFeatures();

  const [
    oo,
    ot,
    _tt,
    to,
  ] = selection.rings[0];
  const wkid = selection?.spatialReference.wkid;
  const sr = useMemo(() =>
    wkid != null
      ?
      new SpatialReference({
        wkid
      })
      : null, [wkid])

  const ooot = useMemo(() => new Polyline({
    paths: [[
      oo,
      ot
    ]],
    spatialReference: sr!
  }), [oo, ot, sr])

  const ooto = useMemo(() => new Polyline({
    paths: [[
      oo,
      to
    ]],
    spatialReference: sr!
  }), [oo, sr, to])

  if (selection == null || origin == null) return null;

  return (
    <>
      <Graphic
        index={0}
        geometry={selection}
        symbol={!hasTooManyFeatures ? SelectionSymbol : InvalidSelectionSymbol}
      />
      <Graphic
        index={2}
        geometry={ooot}
        symbol={LineSymbol}
      />
      <Graphic
        index={2}
        geometry={ooto}
        symbol={LineSymbol}
      />
    </>
  )
})

const SelectionSymbol = new SimpleFillSymbol({
  color: SymbologyColors.selection(0.25),
  outline: {
    color: SymbologyColors.selection()
  }
})

const InvalidSelectionSymbol = new SimpleFillSymbol({
  color: SymbologyColors.invalidSelection(0.1),
  outline: {
    color: SymbologyColors.invalidSelection()
  }
})

const LineSymbol = new SimpleLineSymbol({
  width: 3,
  color: SymbologyColors.measurements(),
  cap: 'square',
  marker: {
    color: SymbologyColors.measurements(),
    placement: "end",
    style: "arrow"
  }
})
