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
import { useSketch } from "../sketch";
import { forwardRef, ReactNode, useEffect } from "react";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import useInstance from "~/hooks/useInstance";
import { CreateTool, ToolEvent } from "./create-tool";
import { PolygonSymbol3D } from "@arcgis/core/symbols";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import useProvideRef from "~/hooks/useProvideRef";

interface PolygonToolProps {
  onStart?: (point: Polygon) => void;
  onActive?: (point: Polygon) => void;
  onComplete?: (point: Polygon) => void;
  onCancel?: (point: Polygon) => void;
  createSymbol?: PolygonSymbol3D;
  children: ({ start }: { start: () => void, cancel: () => void, state: CreateRectangleToolManager['state'] }) => ReactNode;
}

const CreateRectangleTool = forwardRef<CreateRectangleToolManager, PolygonToolProps>(function CreateRectangleTool({
  children,
  createSymbol,
  onStart,
  onActive,
  onComplete,
  onCancel,
}, ref) {
  const t = useInstance(() => new CreateRectangleToolManager());
  const sketch = useSketch();

  useEffect(() => {
    t.manager = sketch;
  }, [t, sketch])

  useEffect(() => {
    return t.on(["start", "active", "complete", "cancel"], (event) => {
      switch (event.state) {
        case 'start': return onStart?.(event.graphic.geometry as Polygon)
        case 'active': return onActive?.(event.graphic.geometry as Polygon)
        case 'complete': return onComplete?.(event.graphic.geometry as Polygon)
        case 'cancel': return onCancel?.(event.graphic?.geometry as Polygon)
      }
    }).remove
  }, [onActive, onCancel, onComplete, onStart, t])

  useEffect(() => {
    t.createSymbol = createSymbol
  }, [createSymbol, t])

  const state = useAccessorValue(() => t.state) ?? 'disabled';

  useProvideRef(t, ref);

  return children({
    start: () => t.start(),
    cancel: () => t.cancel(),
    state
  });
})

@subclass()
class CreateRectangleToolManager extends CreateTool {
  protected readonly overwrittenEvents: ToolEvent[] = ['start', 'active']

  @property()
  createSymbol?: PolygonSymbol3D;

  initialize() {
    this.addHandles([
      reactiveUtils.watch(() => this.manager?.createGraphic?.geometry,
        (geometry, previous) => {
          if (this.manager?.activeToolId !== this.id) return;

          if (geometry != null && previous == null)
            this.emit(
              "start",
              { tool: "polygon", state: 'start', graphic: this.manager!.createGraphic!, toolEventInfo: null!, type: 'create' }
            )
          if (geometry != null && previous != null)
            this.emit(
              "active",
              { tool: "polygon", state: 'active', graphic: this.manager!.createGraphic!, toolEventInfo: null!, type: 'create' }
            )
          if (geometry == null && previous != null) {
            this.manager.snappingOptions.enabled = false;
          }
        }),
    ])
  }

  start = (options?: __esri.SketchViewModelCreateCreateOptions) => {
    if (this.state === 'ready') {
      this.manager!.polygonSymbol = this.createSymbol!;
      this.manager!.activeToolId = this.id;
      this.manager!.snappingOptions.enabled = true;
      this.manager!.create("rectangle", options)
    }
  }

  cancel = () => {
    if (this.state === 'active') {
      if (this.manager?.state === 'ready') {
        this.manager!.activeToolId = null!;
        this.emit(
          "cancel",
          { tool: "point", state: 'cancel', graphic: this.manager?.createGraphic, toolEventInfo: null!, type: 'create' }
        )
      }
      this.manager!.pointSymbol = null!;
      this.manager!.cancel()
    }
  }
}

export default CreateRectangleTool;