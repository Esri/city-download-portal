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
import { Polygon } from "@arcgis/core/geometry"
import '@esri/calcite-components/dist/components/calcite-button';
import { CalciteButton } from "@esri/calcite-components-react"
import { useRef } from "react"
import { SketchTooltip } from "~/arcgis/components/sketch/sketch"
import CreateExtentTool from "~/arcgis/components/sketch/tools/create-extent-tool"
import { useSceneView } from "~/arcgis/components/views/scene-view/scene-view-context"
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store"
import { useAccessorValue, useWatch } from "~/arcgis/reactive-hooks"
import { useReferenceElementId } from "../walk-through-context"

export function CreateSelectionTool() {
  const view = useSceneView();
  const viewReady = useAccessorValue(() => view.ready);
  const id = useReferenceElementId([
    'not-started',
    'placing-origin',
    'placing-terminal',
  ],
    'top');

  const store = useSelectionState();

  const toolRef = useRef<any>(null)
  useWatch(() => store.editingState, (next,) => {
    if (next === 'creating') {
      toolRef.current?.start();
    } else {
      toolRef.current?.cancel()
    }
  }, { initial: false })

  const previousSelection = useRef<Polygon | null>(null);

  return (
    <>
      <CreateExtentTool
        ref={toolRef}
        onStart={() => {
          store.editingState = 'creating'
          previousSelection.current = store.selection;
        }}
        onActive={(polygon) => {
          if (polygon) store.selection = polygon
        }}
        onComplete={(polygon) => {
          store.editingState = 'updating-selection'
          store.selection = polygon;
        }}
        onCancel={() => {
          store.editingState = 'idle'
          store.selection = previousSelection.current;
        }}
      >
        {({ start, cancel, state }) => (
          <>
            <CalciteButton
              id={id}
              scale="l"
              iconStart="rectangle-plus"
              disabled={!viewReady}
              kind="brand"
              appearance={state === 'active' ? "outline-fill" : "solid"}
              onClick={() => {
                if (state === 'active') cancel()
                else start()
              }}
            >
              {state === 'active' ? "Cancel selection" : "Select area"}
            </CalciteButton>
            {state === 'active' ? (
              <SketchTooltip
                helpMessage="Press tab to enter or paste a precise coordinate"
                helpMessageIcon="information"
                inputEnabled
              />
            ) : null}
          </>
        )}
      </CreateExtentTool>
    </>
  )
}
