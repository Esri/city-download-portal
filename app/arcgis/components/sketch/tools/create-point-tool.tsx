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
import Point from "@arcgis/core/geometry/Point";
import { useSketch } from "../sketch";
import { ReactNode, useEffect } from "react";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import useInstance from "~/hooks/useInstance";
import { CreateTool, ToolEvent } from "./create-tool";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import type { CreateOptions } from "@arcgis/core/widgets/Sketch/types";

interface PointToolProps {
  onStart?: (point: Point) => void;
  onActive?: (point: Point) => void;
  onComplete?: (point: Point) => void;
  onCancel?: (point: Point) => void;
  createSymbol?: PointSymbol3D;
  children: ({ start }: { start: () => void, cancel: () => void, state: CreatePointToolManager['state'] }) => ReactNode;
}

export default function CreatePointTool({
  children,
  createSymbol,
  onStart,
  onActive,
  onComplete,
  onCancel,
}: PointToolProps) {
  const t = useInstance(() => new CreatePointToolManager());
  const sketch = useSketch();

  useEffect(() => {
    t.manager = sketch;
  }, [t, sketch])

  useEffect(() => {
    return t.on(["start", "active", "complete", "cancel"], (event) => {
      switch (event.state) {
        case 'start': return onStart?.(event.graphic!.geometry as Point)
        case 'active': return onActive?.(event.graphic!.geometry as Point)
        case 'complete': return onComplete?.(event.graphic!.geometry as Point)
        case 'cancel': return onCancel?.(event.graphic?.geometry as Point)
      }
    }).remove
  }, [onActive, onCancel, onComplete, onStart, t])

  useEffect(() => {
    t.createSymbol = createSymbol
  }, [createSymbol, t])

  const state = useAccessorValue(() => t.state) ?? 'disabled';

  return children({
    start: () => t.start(),
    cancel: () => t.cancel(),
    state
  });
}

@subclass()
class CreatePointToolManager extends CreateTool {
  protected readonly overwrittenEvents: ToolEvent[] = ['start', 'active']

  @property()
  createSymbol?: PointSymbol3D;

  initialize() {
    this.addHandles([
      reactiveUtils.watch(() => this.manager?.createGraphic?.geometry,
        (geometry, previous) => {
          if (this.manager?.activeToolId !== this.id) return;

          if (geometry != null && previous == null)
            this.emit(
              "start",
              { tool: "point", state: 'start', graphic: this.manager!.createGraphic!, toolEventInfo: null!, type: 'create' }
            )
          if (geometry != null && previous != null)
            this.emit(
              "active",
              { tool: "point", state: 'active', graphic: this.manager!.createGraphic!, toolEventInfo: null!, type: 'create' }
            )
          if (geometry == null && previous != null) {
            this.manager.snappingOptions.enabled = false;
          }
        }),
    ])
  }

  start = (options?: CreateOptions) => {
    if (this.state === 'ready') {
      this.manager!.pointSymbol = this.createSymbol!;
      this.manager!.activeToolId = this.id;
      this.manager!.snappingOptions.enabled = true;
      this.manager!.create("point", options)
    }
  }

  cancel = () => {
    if (this.state === 'active') {
      if (this.manager?.state === 'ready') {
        this.manager!.activeToolId = null!;
        this.emit(
          "cancel",
          { tool: "point", state: 'cancel', graphic: this.manager?.createGraphic ?? undefined!, toolEventInfo: null!, type: 'create' }
        )
      }
      this.manager!.pointSymbol = null!;
      this.manager!.cancel()
    }
  }
}
