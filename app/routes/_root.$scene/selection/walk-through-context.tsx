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
import { PropsWithChildren, createContext, useContext, useEffect, useId, useRef } from "react";
import useInstance from "~/hooks/useInstance";
import { useAccessorValue, useEffectWhen } from "~/arcgis/reactive-hooks";
import { useSelectionState, WalkthroughState } from "~/routes/_root.$scene/selection/selection-store";
import type { ReactiveWatchOptions } from "@arcgis/core/core/reactiveUtils";

const StatePositionMap = {
  'not-started': 0,
  'placing-origin': 1,
  'placing-terminal': 2,
  'confirming': 3,
  'updating-origin': 3,
  'downloading': 4,
  'done': 5,
  0: 'not-started',
  1: 'placing-origin',
  2: 'placing-terminal',
  3: 'confirming',
  4: 'downloading',
  5: 'done',
} as const;

type ElementReference = { id: string, placement: HTMLCalcitePopoverElement['placement'] };

const shouldRatchet = false;
@subclass()
class WalkthroughStore extends Accessor {
  #referenceElements = new Map<WalkthroughState, ElementReference>();

  @property()
  state: WalkthroughState = 'not-started';

  @property()
  get position() {
    return StatePositionMap[this.state];
  }

  @property()
  get referenceElement() {
    return this.#referenceElements.get(this.state);
  }

  setAsReferenceElement(state: WalkthroughState, reference: ElementReference) {
    this.#referenceElements.set(state, reference);
    this.notifyChange("referenceElement")
  }
}

const WalkthroughContext = createContext<WalkthroughStore>(null!);
export default function WalkthroughStoreProvider({ children }: PropsWithChildren) {
  const store = useSelectionState();
  const walkthrough = useInstance(() => new WalkthroughStore());

  useEffectWhen(() => store.walkthroughState, (state) => {
    if (shouldRatchet) {
      const nextPosition = StatePositionMap[state];
      const prevPosition = StatePositionMap[walkthrough.state];

      if (nextPosition > prevPosition) walkthrough.state = state;
    } else {
      walkthrough.state = state
    }

  })

  return (
    <WalkthroughContext.Provider value={walkthrough}>
      {children}
    </WalkthroughContext.Provider>
  )
}

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}

export function useWalkthroughSelector<T>(get: (store: WalkthroughStore) => T, options?: ReactiveWatchOptions) {
  const store = useWalkthrough()

  const currentGetter = useRef(get);
  useEffect(() => {
    currentGetter.current = get;
  });

  return useAccessorValue(() => currentGetter.current(store), options);
}

export function useReferenceElementId(state: WalkthroughState | WalkthroughState[], placement: HTMLCalcitePopoverElement['placement']) {
  const walkthrough = useWalkthrough();
  const id = useId();
  useEffect(() => {
    const states = Array.isArray(state) ? state : [state];

    for (const state of states) {
      walkthrough.setAsReferenceElement(state, { id, placement });
    }
  }, [id, placement, state, walkthrough])

  return id;
}