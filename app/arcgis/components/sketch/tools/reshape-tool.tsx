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
import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import { UpdateTool } from "./update-tool";
import { useSketch } from "../sketch";
import { forwardRef, ReactNode, useEffect } from "react";
import useInstance from "~/hooks/useInstance";
import Graphic from "@arcgis/core/Graphic";
import useProvideRef from "~/hooks/useProvideRef";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import type { UpdateEvent } from "@arcgis/core/widgets/Sketch/types";

interface ReshapeToolProps {
  onStart?: (graphics: Graphic[]) => void;
  onActive?: (graphics: Graphic[], event: UpdateEvent) => void;
  onComplete?: (graphics: Graphic[]) => void;
  onCancel?: (graphics: Graphic[]) => void;
  onDelete?: (graphics: Graphic[]) => void;
  children: ({ start }: {
    start: (graphics: Graphic[]) => void
    complete: () => void
    cancel: () => void
    state: ReshapeToolManager['state']
  }) => ReactNode;
}

export const ReshapeTool = forwardRef<ReshapeToolManager, ReshapeToolProps>(function ReshapeTool({
  onStart,
  onActive,
  onComplete,
  onCancel,
  onDelete,
  children
}: ReshapeToolProps, ref) {
  const sketch = useSketch();
  const manager = useInstance(() => new ReshapeToolManager())

  useEffect(() => {
    manager.manager = sketch;
  }, [sketch, manager]);

  useEffect(() => {
    const handle = manager.on(["start", "active", "complete", "cancel", "delete"], (event) => {
      if (event.type === 'delete') return onDelete?.(event.graphics);
      switch (event.state) {
        case 'start': return onStart?.(event.graphics)
        case 'active': return onActive?.(event.graphics, event)
        case 'complete':
          if (event.aborted) return onCancel?.(event.graphics)
          return onComplete?.(event.graphics)
      }
    })

    return () => {
      handle.remove()
    }
  }, [onActive, onCancel, onComplete, onStart, onDelete, manager])

  useProvideRef(manager, ref);

  const state = useAccessorValue(() => manager.state) ?? 'disabled';

  return children({
    start: (graphics: Graphic[]) => manager.start(graphics),
    complete: () => manager.complete(),
    cancel: () => manager.cancel(),
    state
  });
})

@subclass()
class ReshapeToolManager extends UpdateTool {
  protected readonly type = 'reshape';

  start = (graphics: Graphic[]) => {
    if (this.state === 'ready') {
      this.manager!.defaultUpdateOptions = {
        enableRotation: false,
        enableScaling: false,
        enableZ: false,
        multipleSelectionEnabled: false,
        toggleToolOnClick: false,
        tool: 'reshape',
        reshapeOptions: {
          edgeOperation: 'offset',
          shapeOperation: 'none',
          vertexOperation: 'move'
        },
      }
      this.manager!.activeToolId = this.id;
      this.manager!.update(graphics)
    }
  }

  complete = () => {
    if (this.state === 'active') {
      this.manager!.complete()
    }
  }

  cancel = () => {
    if (this.state === 'active') {
      this.manager!.cancel()
    }
  }
}