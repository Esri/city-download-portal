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
import Polygon from "@arcgis/core/geometry/Polygon";
import { SymbologyColors } from "~/symbology/symbology";
import { useSelectionFootprints } from "../../../../../hooks/queries/feature-query";

interface FootprintGraphicProps {
  selection: Polygon
}
export function FootprintGraphic({ selection }: FootprintGraphicProps) {
  const footprintQuery = useSelectionFootprints(selection);
  const footprints = footprintQuery.data;

  if (footprints == null) return null;

  if (footprintQuery.isSuccess) {
    return (
      <Graphic
        index={0}
        geometry={footprints}
        symbol={FootprintSymbol}
      />
    )
  } else {
    return (
      <Graphic
        index={0}
        geometry={footprints}
        symbol={StaleFootprintSymbol}
      />
    )
  }
}

const FootprintSymbol = new SimpleFillSymbol({
  color: SymbologyColors.selection(0.4),
  outline: {
    width: 1,
    color: SymbologyColors.selection(),
  }
})

const StaleFootprintSymbol = new SimpleFillSymbol({
  color: SymbologyColors.staleSelection(0.8),
  outline: {
    width: 0,
  }
})
