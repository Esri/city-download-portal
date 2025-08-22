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
import {
  subclass,
  property,
} from "@arcgis/core/core/accessorSupport/decorators";
import Accessor from "@arcgis/core/core/Accessor";
import { Point, Polygon } from "@arcgis/core/geometry";
import { PropsWithChildren, createContext, useContext } from "react";
import useInstance from "~/hooks/useInstance";
import Graphic from "@arcgis/core/Graphic";

@subclass()
class SelectionStore extends Accessor {
  @property()
  editingState: 'idle' | 'creating' | 'updating-selection' | 'updating-origin' = 'idle'

  @property()
  exportState: 'not-exported' | 'exported' = 'not-exported';

  @property()
  get walkthroughState() {
    if (this.selection == null) {
      if (this.editingState === 'idle' && this.selection == null) {
        return 'not-started' as const;
      }
      if (this.editingState === 'creating' && this.selection == null) {
        return 'placing-origin' as const;
      }
    }

    if (this.selection != null) {
      if (this.editingState === 'creating') {
        return 'placing-terminal' as const;
      }
      if (this.editingState === 'updating-selection') {
        return 'confirming' as const;
      }
      if (this.editingState === 'updating-origin') {
        return 'updating-origin' as const;
      }
      if (this.editingState === 'idle') {
        if (this.exportState === 'not-exported') {
          return 'downloading' as const;
        }
        if (this.exportState === 'exported') {
          return 'done' as const;
        }
      }
    }

    return 'not-started'
  }

  @property()
  graphic: Graphic | null = null;

  @property()
  selection: Polygon | null = null;

  @property()
  modelOrigin: Point | null = null;

  @property()
  get selectionOrigin(): Point | null {
    const selection = this.selection;
    if (selection != null && selection.rings?.length > 0 && selection.rings[0].length > 0) {
      const [x, y] = selection.rings[0][0];
      return new Point({
        x,
        y,
        spatialReference: selection.spatialReference
      });
    } else {
      return null;
    }
  }

  #previousOrigin = null as Point | null;
  @property()
  get origin(): Point | null {
    this.#previousOrigin ??= this.modelOrigin ?? this.selectionOrigin;

    if (this.#previousOrigin == null) return null;

    if (this.#previousOrigin?.equals((this.modelOrigin ?? this.selectionOrigin)!)) {
      return this.#previousOrigin;
    } else {
      this.#previousOrigin ??= this.modelOrigin ?? this.selectionOrigin;
      return this.modelOrigin ?? this.selectionOrigin;
    }
  }

  @property()
  get selectionTerminal(): Point | null {
    const selection = this.selection;
    if (selection != null && selection.rings?.length > 0 && selection.rings[0].length > 0) {
      // Use the last point in the first ring (not the closing point, which is usually a repeat of the first)
      const ring = selection.rings[0];
      // If ring is closed, last point equals first; use second-to-last for terminal
      const idx = (ring.length > 2 && ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]) ? ring.length - 2 : ring.length - 1;
      const [x, y] = ring[idx];
      return new Point({
        x,
        y,
        spatialReference: selection.spatialReference
      });
    } else {
      return null;
    }
  }

  updateSelectionPolygon(polygon: Polygon) {
    if (this.selection) this.selection = alignPolygon(polygon, this.selection);
  }
}

export type WalkthroughState = SelectionStore['walkthroughState']

const SelectionContext = createContext<SelectionStore>(null!);
export default function StoreProvider({ children }: PropsWithChildren) {
  const store = useInstance(() => new SelectionStore());

  return (
    <SelectionContext.Provider value={store}>
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelectionState() {
  return useContext(SelectionContext);
}

function alignPolygon(next: Polygon, previous: Polygon) {
  const [
    noo,
    not,
    ntt,
    nto,
  ] = next.rings[0];

  const [
    poo,
    pot,
    ptt,
    pto,
  ] = previous.rings[0];

  let oo: number[];
  let tt: number[];
  if (noo[0] !== poo[0] || noo[1] !== poo[1]) {
    oo = noo;
    tt = ptt;
  } else if (not[0] !== pot[0] || not[1] !== pot[1]) {
    oo = [not[0], poo[1]]
    tt = [ptt[0], not[1]]
  } else if (ntt[0] !== ptt[0] || ntt[1] !== ptt[1]) {
    oo = poo;
    tt = ntt;
  } else if (nto[0] !== pto[0] || nto[1] !== pto[1]) {
    tt = [nto[0], ptt[1]]
    oo = [poo[0], nto[1]]
  } else {
    oo = poo;
    tt = ptt;
  }

  const alignedPolygon = next.clone();
  alignedPolygon.rings = [
    [
      oo,
      [oo[0], tt[1]],
      tt,
      [tt[0], oo[1]],
      oo,
    ]
  ];

  return alignedPolygon;
}