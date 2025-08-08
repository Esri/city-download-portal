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
import '@esri/calcite-components/dist/components/calcite-panel';
import '@esri/calcite-components/dist/components/calcite-shell-panel';
import {
  CalcitePanel,
  CalciteShellPanel,
} from "@esri/calcite-components-react";
import useIsRoot from "~/hooks/useIsRoot";
import ModelOrigin from "./model-origin";
import SelectionInfo from "./selection-info/selection-info";
import ExportSettings from "./export-settings-with-stl";
import { useEffect, useReducer } from "react";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { useReferenceElementId } from "../selection/walk-through-context";

export type BlockAction = { mode?: 'managed' | 'manual', type: 'open' | 'close', block: keyof SidebarState }

export interface BlockState { mode: 'managed' | 'manual', state: 'closed' | 'open' }
interface SidebarState {
  modelOrigin: BlockState;
  selection: BlockState;
  exportSettings: BlockState;
}
function BlockStateReducer(state: SidebarState, actions: BlockAction[]) {
  const next = { ...state, };
  for (const action of actions) {
    const { type, mode = 'managed', block } = action;
    const blockState = { ...next[block] };
    next[block] = blockState

    if (blockState.mode === "manual") {
      if (mode === 'manual') {
        blockState.state = type === 'open' ? 'open' : 'closed';
      }
    } else {
      blockState.mode = mode;
      blockState.state = type === 'open' ? 'open' : 'closed';
    }
  }

  return next;
}

const createInitialState: SidebarState = {
  modelOrigin: { mode: 'managed', state: 'closed' },
  selection: { mode: 'managed', state: 'closed' },
  exportSettings: { mode: 'managed', state: 'closed' },
};

export default function Sidebar() {
  const id = useReferenceElementId(['confirming', "updating-origin"], 'left');
  const isRoot = useIsRoot();

  const store = useSelectionState()
  const walkthroughState = useAccessorValue(() => store.walkthroughState);

  const [blockState, dispatch] = useReducer(
    BlockStateReducer,
    createInitialState
  );

  useEffect(() => {
    switch (walkthroughState) {
      case 'not-started':
      case 'done': break;
      case 'placing-origin': {
        dispatch([
          { block: 'modelOrigin', type: 'open', },
          { block: 'selection', type: 'close' },
          { block: 'exportSettings', type: 'close' },
        ]);
        break;
      }
      case 'placing-terminal': {
        dispatch([
          { block: 'modelOrigin', type: 'open' },
          { block: 'selection', type: 'open' },
          { block: 'exportSettings', type: 'close' },
        ]);
        break;
      }
      case 'confirming': {
        dispatch([
          { block: 'modelOrigin', type: 'close' },
          { block: 'selection', type: 'open' },
          { block: 'exportSettings', type: 'close' },
        ]);
        break;
      }
      case 'downloading': {
        dispatch([
          { block: 'modelOrigin', type: 'close' },
          { block: 'selection', type: 'close' },
          { block: 'exportSettings', type: 'open' },
        ]);
        break;
      }
    }
  }, [walkthroughState]);

  return (
    <CalciteShellPanel slot="panel-end" collapsed={isRoot} style={{
      '--calcite-shell-panel-width': '30vw'
    }}>
      <CalcitePanel id={id}>
        <ModelOrigin state={blockState.modelOrigin.state} dispatch={dispatch} />
        <SelectionInfo
          state={blockState.selection.state}
          dispatch={dispatch}
        />
        <ExportSettings state={blockState.exportSettings.state} dispatch={dispatch} />
      </CalcitePanel>
    </CalciteShellPanel>
  );
}
