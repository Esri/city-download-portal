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
import useInstance from "~/hooks/useInstance";
import { useGraphicsLayer } from "../graphics-layer";
import { useSceneView } from "../views/scene-view/scene-view-context";
import { ForwardedRef, PropsWithChildren, createContext, memo, useContext, useEffect } from "react";
import useProvideRef from "~/hooks/useProvideRef";
import { SketchToolManager } from "./tools/create-tool";
import FeatureSnappingLayerSource from "@arcgis/core/views/interactive/snapping/FeatureSnappingLayerSource.js";
import Layer from "@arcgis/core/layers/Layer";
import type BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import type CSVLayer from '@arcgis/core/layers/CSVLayer';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import type GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import type MapNotesLayer from '@arcgis/core/layers/MapNotesLayer';
import type SceneLayer from '@arcgis/core/layers/SceneLayer';
import type WFSLayer from '@arcgis/core/layers/WFSLayer';
import type SketchTooltipOptions from '@arcgis/core/views/interactive/sketch/SketchTooltipOptions.js';
import { useWatch } from "~/arcgis/reactive-hooks";
import Collection from '@arcgis/core/core/Collection';

interface SketchProps {
  ref?: ForwardedRef<SketchToolManager>;
  disableZ?: boolean;
}

const SketchContext = createContext<SketchToolManager>(null!);
export function useSketch() {
  return useContext(SketchContext);
}

interface SketchTooltipProps {
  inputEnabled: boolean,
  helpMessageIcon: NonNullable<SketchTooltipOptions['helpMessageIcon']>;
  helpMessage: string;
}
export const SketchTooltip = memo(
  function SketchTooltip({
    helpMessage,
    helpMessageIcon,
    inputEnabled = false
  }: Partial<SketchTooltipProps>) {
    const sketch = useSketch();

    useEffect(() => {
      sketch.tooltipOptions.enabled = true;
      sketch.tooltipOptions.inputEnabled = inputEnabled;

      if (helpMessage) {
        sketch.tooltipOptions.visibleElements.helpMessage = true;
        sketch.tooltipOptions.helpMessage = helpMessage;
        sketch.tooltipOptions.helpMessageIcon = helpMessageIcon!;
      } else {
        sketch.tooltipOptions.visibleElements.helpMessage = false;
      }

      return () => {
        sketch.tooltipOptions.enabled = false;
      }
    }, [helpMessage, helpMessageIcon, inputEnabled, sketch.tooltipOptions]);

    return null;
  }
)

export default function Sketch(props: PropsWithChildren<SketchProps>) {
  const { ref, children, disableZ = false } = props;
  const view = useSceneView();
  const layer = useGraphicsLayer();

  const sketch = useInstance(() => new SketchToolManager({
    /*
    it's important to not assign the view/layer here in the state initializer
    
    in strict mode, React runs initializers twice - this means we will end up creating two instances targeting the same view/layer
    
    the second instance should mostly be ignored and eventually destroyed, but if the user interacts with a graphic on the layer before that happens, both svm's will be attempting to control it leading to undefined behavior
    */
    defaultCreateOptions: {
      hasZ: !disableZ
    },
    snappingOptions: {
      featureEnabled: true,
    },
    updateOnGraphicClick: false,
  }));

  useEffect(() => {
    sketch.defaultCreateOptions.hasZ = !disableZ
  }, [disableZ, sketch.defaultCreateOptions])

  useProvideRef(sketch, ref);

  useEffect(() => {
    sketch.view = view;
    sketch.layer = layer;
  }, [view, layer, sketch]);

  useWatch(() => {
    if (!view.map) {
      return new Collection<SnappableLayer>();
    }

    const snappableLayers = view.map.allLayers
      .filter(layer => isSnappableLayer(layer))
      .filter(layer => layer.type !== 'graphics' || layer.title === "selection-graphics-layer") as Collection<SnappableLayer>;

    return snappableLayers;
  }, (layer, previous) => {
    if (previous) {
      for (const layer of previous) {
        const fs = sketch
          .snappingOptions
          .featureSources
          .find(source => source.layer === layer);

        if (fs) sketch.snappingOptions.featureSources.remove(fs);
      }
    }

    sketch.snappingOptions
      .featureSources
      .addMany(layer.map(layer => new FeatureSnappingLayerSource({
        layer,
        enabled: true
      })))
  })

  useEffect(() => {
    const handle = sketch.on("create", (event) => {
      if (event.state === 'complete' && sketch.layer?.type === 'graphics') {
        sketch.layer.remove(event.graphic);
      }
    })

    return handle.remove
  });

  return (
    <SketchContext.Provider value={sketch}>
      {children}
    </SketchContext.Provider>
  );
}

const snappableLayerTypes = [
  "building-scene",
  "csv",
  "feature",
  "geojson",
  "graphics",
  "map-notes",
  "scene",
  "wfs"
] as const satisfies Layer['type'][];

type SnappableLayer =
  | BuildingSceneLayer
  | CSVLayer
  | FeatureLayer
  | GeoJSONLayer
  | GraphicsLayer
  | MapNotesLayer
  | SceneLayer
  | WFSLayer

function isSnappableLayer(layer: Layer): layer is SnappableLayer {
  return snappableLayerTypes.includes(layer.type as any);
}
