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
import { useEffect, memo, useMemo } from "react";
import Graphic from "@arcgis/core/Graphic";
import SceneLayerView from "@arcgis/core/views/layers/SceneLayerView";
import { useSceneView } from "~/arcgis/components/views/scene-view/scene-view-context";
import HighlightOptions from "@arcgis/core/views/support/HighlightOptions.js";
import Color from "@arcgis/core/Color";
import type { ResourceHandle } from "@arcgis/core/core/Handles";

interface HighlightProps {
  name: string;
  color?: Color;
  data?: Map<SceneLayerView, Graphic[]>
}
function InternalHighlight({ name, color, data }: HighlightProps) {
  const view = useSceneView();
  const highlight = useMemo(
    () => new HighlightOptions({ name, color, haloOpacity: 1, fillOpacity: 0.5, }),
    [color, name]
  );

  useEffect(() => {
    highlight.color = color!;
  }, [color, highlight])

  useEffect(() => {
    view.highlights.add(highlight);
    return () => {
      view.highlights.remove(highlight);
    }
  }, [highlight, view.highlights])

  useEffect(() => {
    if (data) {
      const handles: ResourceHandle[] = [];
      for (const [layerview, features] of data) {
        const handle = layerview.highlight(features, { name });
        handles.push(handle);
      }

      return () => {
        for (const handle of handles) handle.remove();
      }
    }
  }, [data, name, view]);

  return null;
}

const Highlights = memo(InternalHighlight);

export default Highlights;