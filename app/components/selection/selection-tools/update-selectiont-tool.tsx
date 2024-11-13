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
import { Polygon } from "@arcgis/core/geometry";
import { CalciteButton } from "@esri/calcite-components-react";
import { useRef } from "react";
import { SketchTooltip } from "~/components/arcgis/sketch/sketch";
import { ReshapeTool } from "~/components/arcgis/sketch/tools/reshape-tool";
import { useSelectionState } from "~/data/selection-store";
import { useAccessorValue, useWatch } from "~/hooks/reactive";

export function UpdateSelectionTool() {
  const store = useSelectionState();

  const toolRef = useRef<any>(null)
  useWatch(() => store.editingState, (next,) => {
    if (next === 'updating-selection' && store.graphic) {
      toolRef.current?.start([store.graphic]);
    } else {
      toolRef.current?.complete()
    }
  }, { initial: false })

  const hasSelection = useAccessorValue(() => store.selection != null)

  const previousSelection = useRef<Polygon | null>(null);

  return (
    <>
      <ReshapeTool
        ref={toolRef}
        onStart={([graphic]) => {
          store.editingState = 'updating-selection';
          previousSelection.current = store.selection;
          store.updateSelectionPolygon(graphic.geometry as Polygon)
        }}
        onActive={([graphic], event) => {
          if (event.toolEventInfo?.type === 'vertex-remove') {
            store.selection = null
            toolRef.current.complete()
          }
          else store.updateSelectionPolygon(graphic.geometry as Polygon)
        }}
        onComplete={([graphic]) => {
          if (store.editingState === 'updating-selection') store.editingState = 'idle';
          store.updateSelectionPolygon(graphic.geometry as Polygon)
        }}
        onCancel={() => {
          if (store.editingState === 'updating-selection') store.editingState = 'idle';
          store.selection = previousSelection.current;
        }}
        onDelete={() => {
          store.selection = null;
        }}
      >{({ start, complete, state }) => (
        <>
          <CalciteButton
            onClick={() => {
              if (store.graphic) {
                if (state === 'active') {
                  complete()
                } else start([store.graphic])
              }
            }}
            disabled={!hasSelection}
            appearance={state === 'active' ? 'solid' : 'outline-fill'}
            scale="l"
            iconStart="check"
          >
            {
              state === 'active'
                ? "Confirm selection"
                : "Update selection"
            }
          </CalciteButton>
          {state === 'active' ? <SketchTooltip /> : null}
        </>
      )}</ReshapeTool >
    </>
  )
}
