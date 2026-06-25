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
import { PropsWithChildren, useEffect, useMemo } from "react";
import DimensionLayer from "@arcgis/core/layers/DimensionLayer.js";
import DimensionAnalysis from "@arcgis/core/analysis/DimensionAnalysis.js";
import DimensionSimpleStyle from "@arcgis/core/analysis/DimensionSimpleStyle.js";
import { DimensionsContext } from "./dimensions-context";
import { useSceneView } from "../views/scene-view/scene-view-context";
import useInstance from "~/hooks/useInstance";
import { SymbologyColors } from "~/symbology/symbology";

interface DimensionLayerProps {
  fontSize?: number
}
export default function DimensionsLayer({ fontSize = 0, children }: PropsWithChildren<DimensionLayerProps>) {
  const view = useSceneView();

  const analyses = useInstance(() => new DimensionAnalysis({
    style: new DimensionSimpleStyle({
      color: SymbologyColors.measurements(),
      fontSize,
      textColor: 'white',
      textBackgroundColor: 'black'
    })
  }));

  const layer = useInstance(() => new DimensionLayer({
    source: analyses,
  }));

  useEffect(() => {
    analyses.style.fontSize = fontSize
  }, [analyses.style, fontSize])

  useEffect(() => {
    const map = view.map;
    if (map == null) return;

    view.analyses.add(analyses);
    map.add(layer);

    return () => {
      map.remove(layer)
      view.analyses.remove(analyses)
    };
  }, [analyses, layer, view.analyses, view.map]);

  const value = useMemo(() => ({ analyses, layer }), [analyses, layer])

  return (
    <DimensionsContext.Provider value={value}>
      {children}
    </DimensionsContext.Provider>
  )
}