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
import { PropsWithChildren, memo, useEffect, useMemo, useState } from "react";
import CoreWebScene from '@arcgis/core/WebScene';
import PortalItem from '@arcgis/core/portal/PortalItem';
import { useSceneListModal } from "~/routes/_root/scene-list-modal/scene-list-modal-context";
import { SceneContext } from "./scene-context";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { OSM_SCENE_ID } from "~/data/osm-scene";

interface WebSceneProps {
  portalItem: string | PortalItem;
}

function InternalScene({ portalItem, children }: PropsWithChildren<WebSceneProps>) {
  const item = useMemo(() => {
    return typeof portalItem === "string" ? new PortalItem({
      id: portalItem,
    }) : portalItem
  }, [portalItem])

  const [scene, setScene] = useState(() => new CoreWebScene({
    portalItem: item,
    ...(item.id === OSM_SCENE_ID ? { ground: "world-elevation" } : {}),
  }));

  const loaded = useAccessorValue(
    () => scene.loaded,
  )

  useEffect(() => {
    const isSamePortalItem =
      typeof portalItem === "string" ? item.id === portalItem : item.id === portalItem.id

    item.portal.units = 'metric';

    if (!isSamePortalItem) {
      setScene(new CoreWebScene({
        portalItem: item,
        ...(item.id === OSM_SCENE_ID ? { ground: "world-elevation" } : {}),
      }));
    }
  }, [item, portalItem]);

  const [, setOpen] = useSceneListModal();

  useEffect(() => {
    if (loaded) setOpen(false);
  }, [loaded, setOpen]);

  return (
    <SceneContext.Provider value={scene}>
      {children}
    </SceneContext.Provider>
  );
}

const WebScene = memo(InternalScene)

export default WebScene;
