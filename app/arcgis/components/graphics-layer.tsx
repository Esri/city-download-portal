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
import CoreGraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import { PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import { useScene } from './maps/web-scene/scene-context';
import { useMap } from './maps/map/map-context';

type GraphicsLayerElevationInfo = Exclude<CoreGraphicsLayer['elevationInfo'], (null | undefined)>;

const GraphicsLayerContext = createContext<CoreGraphicsLayer>(null!);

export function useGraphicsLayer() {
  return useContext(GraphicsLayerContext);
}

interface GraphicsLayerProps {
  elevationMode?: GraphicsLayerElevationInfo['mode']
  title?: string;
}
export default function GraphicsLayer({ children, elevationMode = 'on-the-ground', title }: PropsWithChildren<GraphicsLayerProps>) {
  const scene = useScene();
  const map = useMap();

  const [layer] = useState(() => new CoreGraphicsLayer({
    elevationInfo: { mode: elevationMode },
  }));

  useEffect(() => {
    if (map) map.add(layer);
    else scene.add(layer);
    return () => {
      if (map) map.remove(layer);
      else scene.remove(layer)
    };
  }, [layer, map, scene]);

  useEffect(() => {
    layer.elevationInfo ??= {}
    layer.elevationInfo!.mode = elevationMode;
    if (title) layer.title = title;
  }, [elevationMode, title, layer, layer.elevationInfo])

  return (
    <GraphicsLayerContext.Provider value={layer}>
      {children}
    </GraphicsLayerContext.Provider>
  )
}
