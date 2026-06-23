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
import Accessor from "@arcgis/core/core/Accessor";
import { subclass, property } from "@arcgis/core/core/accessorSupport/decorators";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { SketchToolManager } from "./create-tool";
import type { DeleteEvent, UpdateEvent } from "@arcgis/core/widgets/Sketch/types";
import type { ResourceHandle } from "@arcgis/core/core/Handles";

export type ShapeEvent = "start" | "active" | "complete" | "cancel" | "delete"

@subclass()
export class UpdateTool extends Accessor {
  readonly id = crypto.randomUUID();
  #listeners = new Map<ShapeEvent, Set<(event: UpdateEvent | DeleteEvent) => void>>();

  protected readonly type!: "move" | "transform" | "reshape";
  protected readonly overwrittenEvents: ShapeEvent[] = []

  @property()
  manager?: SketchToolManager;

  @property()
  get state() {
    if (this.manager?.state == null || this.manager?.state === 'disabled') return 'disabled';
    if (this.manager.activeToolId === this.id) return 'active';
    return this.manager == null ? 'disabled' : 'ready';
  }
  initialize() {
    this.addHandles([
      reactiveUtils.watch(() => this.manager, (vm) => {
        let didDelete = false;
        let eventToEmitAfterAbort: any = null;
        vm?.on("delete", (event) => {
          didDelete = true;
          eventToEmitAfterAbort = event;
        });
        vm?.on('update', (event) => {
          if (vm.activeToolId === this.id) {
            if (!this.overwrittenEvents.includes(event.state) && event.tool === this.type && !didDelete) {
              if (event.state === 'complete' && event.aborted) {
                eventToEmitAfterAbort = event;

                setTimeout(() => {
                  this.emit(didDelete ? 'delete' : 'cancel', eventToEmitAfterAbort)
                  didDelete = false;
                })
              } else this.emit(event.state, event);
            }
            if (event.state === 'complete')
              vm.activeToolId = null;

          }
        })
      })
    ])
  }

  emit(type: ShapeEvent, event: UpdateEvent | DeleteEvent): boolean {
    if (!this.hasEventListener(type)) return false;
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }

    return true;
  }

  hasEventListener(type: ShapeEvent): boolean {
    return this.#listeners.has(type);
  }

  on(type: ShapeEvent | ShapeEvent[], listener: (event: UpdateEvent | DeleteEvent) => void): ResourceHandle {
    if (Array.isArray(type)) {
      const handles = type.map(t => this.#on(t, listener))

      return {
        remove: () => {
          for (const handle of handles) handle.remove()
        }
      }
    }
    else return this.#on(type, listener);
  }

  #on(type: ShapeEvent, listener: (event: UpdateEvent | DeleteEvent) => void): ResourceHandle {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);

    if (!this.hasEventListener(type)) this.#listeners.set(type, listeners)

    return {
      remove: () => {
        listeners.delete(listener);
        if (listeners.size === 0) this.#listeners.delete(type)
      }
    }
  }
}