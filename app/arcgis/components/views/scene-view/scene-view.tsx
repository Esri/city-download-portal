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
import { PropsWithChildren, memo, useEffect } from "react"
import CoreSceneView from '@arcgis/core/views/SceneView';
import { SceneViewContext } from "./scene-view-context";
import { useScene } from "../../maps/web-scene/scene-context";
import useInstance from "~/hooks/useInstance";
import { useToast } from "~/components/toast";
import { getSceneLayers } from "~/hooks/useSceneLayers";

function InternalView({ children }: PropsWithChildren) {
  const scene = useScene();

  const view = useInstance(() => new CoreSceneView({
    map: scene,
    popupEnabled: false,
  }));

  const toast = useToast();

  useEffect(() => {
    view.map = scene;
  }, [view, scene, toast]);

  useEffect(() => {
    const controller = new AbortController();

    view.when(async () => {
      if (view.map == null) return;

      await Promise.all(view.map.allLayers.map(layer => layer.load()).toArray())
      const queryableSceneLayers = getSceneLayers(view.map);
      if (queryableSceneLayers.length === 0) {
        toast({
          message: 'Exported meshes will only include terrain.',
          key: 'no-queryable-scene-layers',
          severity: 'warning',
          title: 'Scene has no queryable scene layers'
        })
      }
    })

    return () => controller.abort();
  }, [toast, view]);


  return (
    <SceneViewContext.Provider value={view}>
      <div
        className="w-full h-full isolate"
        ref={(node) => {
          if (node && view.container !== node) {
            view.container = node;
          }
        }}
      />
      {children}
    </SceneViewContext.Provider>
  )
}

const SceneView = memo(InternalView)

export default SceneView;