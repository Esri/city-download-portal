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
import '@esri/calcite-components/dist/components/calcite-block';
import '@esri/calcite-components/dist/components/calcite-button';
import '@esri/calcite-components/dist/components/calcite-checkbox';
import '@esri/calcite-components/dist/components/calcite-icon';
import '@esri/calcite-components/dist/components/calcite-input-text';
import '@esri/calcite-components/dist/components/calcite-label';
import {
  CalciteBlock,
  CalciteButton,
  CalciteCheckbox,
  CalciteIcon,
  CalciteInputText,
  CalciteLabel,
} from "@esri/calcite-components-react";
import { useScene } from "../../../arcgis/components/maps/web-scene/scene-context";
import { useAccessorValue } from "../../../arcgis/reactive-hooks";
import { Dispatch, useDeferredValue, useEffect, useRef, useState } from "react";
import { useDownloadExportMutation, useExportSizeQuery } from "../../../hooks/queries/download/export-query";
import { BlockAction, BlockState } from "./sidebar";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { useReferenceElementId } from "../selection/walk-through-context";
import { useHasTooManyFeatures, useSelectedFeaturesFromLayers } from "~/hooks/queries/feature-query";
import { usePreciseOriginElevationInfo } from "~/hooks/queries/elevation-query";

interface ExportSettingsProps {
  state: BlockState['state'];
  dispatch: Dispatch<BlockAction[]>;
}
export default function ExportSettings({ dispatch, state }: ExportSettingsProps) {
  const scene = useScene();

  const title = useAccessorValue(() => {
    const title = scene.portalItem?.title ?? "Untitled";
    return title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, "_");
  });
  const [filename, setFilename] = useState("")
  const [includeOriginMarker, setIncludeOriginMarker] = useState(true);
  const [extrudeBase, setExtrudeBase] = useState(true);
  const [extrusionDepth, setExtrusionDepth] = useState("50");

  const store = useSelectionState();
  const editingState = useAccessorValue(() => store.editingState);
  const selection = useAccessorValue(() => store.selection)
  const deferredSelection = useDeferredValue(selection);


  const featureQuery = useSelectedFeaturesFromLayers(editingState === 'idle');

  const modelOrigin = usePreciseOriginElevationInfo().data;

  const hasTooManyFeatures = useHasTooManyFeatures();

  const downloadQuery = useExportSizeQuery({
    includeOriginMarker,
    extrudeBase,
    extrusionDepth: extrusionDepth === '' ? 50 : (parseFloat(extrusionDepth) || 50),
    enabled: editingState === 'idle' && !hasTooManyFeatures
  });

  const mutation = useDownloadExportMutation();

  const canDownload = editingState === 'idle' && !hasTooManyFeatures && selection?.extent && featureQuery.data

  const fileSize = downloadQuery.data;

  let fileSizeString = 'unknown'
  if (deferredSelection == null) fileSizeString = 'no selection';
  if (fileSize != null) fileSizeString = `${(fileSize * 1e-6).toFixed(2)} mb`;
  if ((downloadQuery.isFetching && fileSize == null) || editingState !== 'idle') fileSizeString = 'loading';
  if (hasTooManyFeatures) fileSizeString = 'unavailable - too many features'

  const ref = useRef<HTMLCalciteBlockElement>(null);
  useEffect(() => {
    if (state === 'open') {
      ref.current?.scrollIntoView();
    }
  }, [ref, state])

  const wasClicked = useRef(false);

  const blockElementId = useReferenceElementId('downloading', 'left')

  return (
    <CalciteBlock
      id={blockElementId}
      heading="Export"
      collapsible
      ref={ref}
      expanded={state === 'open'}
      onClick={() => {
        wasClicked.current = true
        setTimeout(() => {
          wasClicked.current = false;
        }, 150)
      }}
      onCalciteBlockClose={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'close',
            mode: 'manual',
            block: 'exportSettings'
          }])
        }
      }}
      onCalciteBlockOpen={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'open',
            mode: 'manual',
            block: 'exportSettings'
          }])
        }
      }}
    >
      <CalciteIcon scale="s" slot="icon" icon="file-data"></CalciteIcon>
      <ul className="mesurement-list">
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">Filename</p>
            <CalciteInputText
              placeholder={title}
              value={filename}
              onCalciteInputTextInput={(event) => {
                setFilename(event.target.value)
              }}
              suffixText=".glb"
            ></CalciteInputText>
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel scale="s" layout="inline">
            <CalciteCheckbox checked={includeOriginMarker} onCalciteCheckboxChange={() => setIncludeOriginMarker(!includeOriginMarker)} />
            Include origin marker
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel scale="s" layout="inline">
            <CalciteCheckbox checked={extrudeBase} onCalciteCheckboxChange={() => setExtrudeBase(!extrudeBase)} />
            Extrude terrain base downward
          </CalciteLabel>
        </li>
        {extrudeBase && (
          <li>
            <CalciteLabel scale="s">
              <p className="font-medium">Extrusion depth (meters)</p>
              <input
                type="number"
                value={extrusionDepth}
                onChange={(e) => {
                  const value = e.target.value;
                  setExtrusionDepth(value);
                }}
                min="0"
                step="10"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                style={{ height: '32px' }}
              />
            </CalciteLabel>
          </li>
        )}
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">File size</p>
            <p className={!canDownload ? "opacity-50" : ""}>{fileSizeString}</p>
          </CalciteLabel>
        </li>
      </ul>
      <CalciteButton
        scale="l"
        width="full"
        iconStart="download"
        disabled={!canDownload || mutation.isPending}
        loading={mutation.isPending}
        onClick={() => {
          if (canDownload) {
            const extrusionDepthValue = extrusionDepth === '' ? 50 : (parseFloat(extrusionDepth) || 50);
            const exportParams = {
              scene,
              extent: selection!.extent!,
              features: featureQuery.data!,
              origin: modelOrigin!,
              includeOriginMarker,
              extrudeBase,
              extrusionDepth: extrusionDepthValue,
              filename,
            };
            mutation.mutateAsync(exportParams)
              .then(blob => {
                const name = filename || title || 'model';
                downloadFile(name, blob);
              })
          }
        }}
      >
        Export model
      </CalciteButton>
    </CalciteBlock>
  );
}

function downloadFile(name: string, blob: Blob) {
  const link = document.createElement("a");
  link.download = `${name}.glb`;
  link.href = window.URL.createObjectURL(blob);
  link.click();
}

