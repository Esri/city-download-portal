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
import '@esri/calcite-components/dist/components/calcite-input-number';
import '@esri/calcite-components/dist/components/calcite-label';
import '@esri/calcite-components/dist/components/calcite-select';
import '@esri/calcite-components/dist/components/calcite-option';
import '@esri/calcite-components/dist/components/calcite-segmented-control';
import '@esri/calcite-components/dist/components/calcite-segmented-control-item';
import {
  CalciteBlock,
  CalciteButton,
  CalciteCheckbox,
  CalciteIcon,
  CalciteInputText,
  CalciteInputNumber,
  CalciteLabel,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
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
import { useSTLConverter } from "~/hooks/useSTLConverter";

type ExportFormat = 'glb' | 'stl';

interface ExportSettingsProps {
  state: BlockState['state'];
  dispatch: Dispatch<BlockAction[]>;
}

export default function ExportSettings({ dispatch, state }: ExportSettingsProps) {
  const scene = useScene();
  const { convertAndDownload } = useSTLConverter();

  const title = useAccessorValue(() => {
    const title = scene.portalItem?.title ?? "Untitled";
    return title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, "_");
  });
  
  const [filename, setFilename] = useState("")
  const [exportFormat, setExportFormat] = useState<ExportFormat>('glb');
  const [includeOriginMarker, setIncludeOriginMarker] = useState(true);
  const [extrudeBase, setExtrudeBase] = useState(true);
  const [extrusionDepth, setExtrusionDepth] = useState("50");
  const [isConvertingToSTL, setIsConvertingToSTL] = useState(false);

  const blockElementId = useReferenceElementId('downloading', 'left');

  const store = useSelectionState();
  const editingState = useAccessorValue(() => store.editingState);
  const selection = useAccessorValue(() => store.selection);
  const deferredSelection = useDeferredValue(selection);

  const { data: modelOrigin } = usePreciseOriginElevationInfo();

  const featureQuery = useSelectedFeaturesFromLayers(editingState === 'idle');
  const hasTooManyFeatures = useHasTooManyFeatures();

  const canDownload = Boolean(
    editingState === 'idle' && 
    !hasTooManyFeatures && 
    selection?.extent && 
    featureQuery.data && 
    modelOrigin
  );

  const sizeQuery = useExportSizeQuery({ 
    enabled: canDownload,
    includeOriginMarker,
    extrudeBase,
    extrusionDepth: extrusionDepth === '' ? 50 : (parseFloat(extrusionDepth) || 50)
  });
  
  const fileSize = sizeQuery.data;
  let fileSizeString = 'unknown';
  if (deferredSelection == null) fileSizeString = 'no selection';
  if (fileSize != null) fileSizeString = `${(fileSize * 1e-6).toFixed(2)} mb`;
  if ((sizeQuery.isFetching && fileSize == null) || editingState !== 'idle') fileSizeString = 'loading';
  if (hasTooManyFeatures) fileSizeString = 'unavailable - too many features';

  const mutation = useDownloadExportMutation();

  const filenameInputRef = useRef<HTMLCalciteInputTextElement>(null);
  const ref = useRef<HTMLCalciteBlockElement>(null);

  useEffect(() => {
    if (state === 'open') {
      filenameInputRef.current?.setFocus();
      ref.current?.scrollIntoView();
    }
  }, [state]);

  useEffect(() => {
    setFilename(title ?? "");
  }, [title]);

  const wasClicked = useRef(false);

  const handleExport = async () => {
    if (!canDownload) return;

    const exportParams = {
      scene,
      extent: selection!.extent!,
      features: featureQuery.data!,
      origin: modelOrigin!,
      includeOriginMarker,
      extrudeBase,
      extrusionDepth: extrusionDepth === '' ? 50 : (parseFloat(extrusionDepth) || 50),
      filename,
    };

    try {
      const blob = await mutation.mutateAsync(exportParams);
      const name = filename || title || 'model';
      
      if (exportFormat === 'glb') {
        downloadFile(name, blob);
      } else if (exportFormat === 'stl') {
        setIsConvertingToSTL(true);
        await convertAndDownload(blob, name, {
          binary: true,
          scale: 1,
          mergeGeometries: true
        });
        setIsConvertingToSTL(false);
      }
    } catch (error) {
      setIsConvertingToSTL(false);
      console.error('Export failed:', error);
    }
  };

  const isExporting = mutation.isPending || isConvertingToSTL;
  const exportButtonText = isConvertingToSTL ? 'Converting to STL...' : 
                          mutation.isPending ? 'Exporting...' : 
                          `Export model (.${exportFormat.toUpperCase()})`;

  return (
    <CalciteBlock
      id={blockElementId}
      heading="Export settings"
      collapsible
      expanded={state === 'open'}
      ref={ref}
      onClick={() => {
        wasClicked.current = true;
        setTimeout(() => {
          wasClicked.current = false;
        }, 150);
      }}
      onCalciteBlockClose={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'close',
            mode: 'manual',
            block: 'exportSettings'
          }]);
        }
      }}
      onCalciteBlockOpen={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'open',
            mode: 'manual',
            block: 'exportSettings'
          }]);
        }
      }}
    >
      <ul className="space-y-4">
        <li>
          <CalciteLabel 
            scale="s"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium">Export format</p>
            <CalciteSegmentedControl
              scale="s"
              onCalciteSegmentedControlChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              onClick={(e) => e.stopPropagation()}
            >
              <CalciteSegmentedControlItem 
                value="glb" 
                checked={exportFormat === 'glb'}
                onClick={(e) => e.stopPropagation()}
              >
                <CalciteIcon icon="shapes" scale="s" slot="icon-start" />
                GLB
              </CalciteSegmentedControlItem>
              <CalciteSegmentedControlItem 
                value="stl" 
                checked={exportFormat === 'stl'}
                onClick={(e) => e.stopPropagation()}
              >
                <CalciteIcon icon="print" scale="s" slot="icon-start" />
                STL
              </CalciteSegmentedControlItem>
            </CalciteSegmentedControl>
          </CalciteLabel>
          {exportFormat === 'stl' && (
            <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-800">
              <CalciteIcon icon="information" scale="s" className="inline mr-1" />
              STL format is optimized for 3D printing
            </div>
          )}
        </li>
        <li>
          <CalciteLabel 
            scale="s"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium">File name</p>
            <CalciteInputText
              ref={filenameInputRef}
              scale="s"
              value={filename}
              onCalciteInputTextInput={(e) => setFilename(e.target.value)}
              placeholder="Enter filename"
              onClick={(e) => e.stopPropagation()}
            />
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel 
            scale="s" 
            layout="inline"
            onClick={(e) => e.stopPropagation()}
          >
            <CalciteCheckbox 
              checked={includeOriginMarker} 
              onCalciteCheckboxChange={() => setIncludeOriginMarker(!includeOriginMarker)} 
              onClick={(e) => e.stopPropagation()}
            />
            Include origin marker
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel 
            scale="s" 
            layout="inline"
            onClick={(e) => e.stopPropagation()}
          >
            <CalciteCheckbox 
              checked={extrudeBase} 
              onCalciteCheckboxChange={() => setExtrudeBase(!extrudeBase)} 
              onClick={(e) => e.stopPropagation()}
            />
            Extrude terrain base downward
          </CalciteLabel>
        </li>
        {extrudeBase && (
          <li>
            <CalciteLabel scale="s">
              <p className="font-medium">Extrusion depth (meters)</p>
              <CalciteInputNumber
                scale="s"
                value={extrusionDepth}
                onCalciteInputNumberChange={(e) => {
                  const value = e.target.value;
                  setExtrusionDepth(value);
                }}
                min={0}
                step={10}
                onClick={(e) => e.stopPropagation()}
              />
            </CalciteLabel>
          </li>
        )}
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">File size</p>
            <p className={!canDownload ? "opacity-50" : ""}>{fileSizeString}</p>
            {exportFormat === 'stl' && (
              <p className="text-xs text-gray-600 mt-1">
                STL files are typically 2-3x larger than GLB
              </p>
            )}
          </CalciteLabel>
        </li>
      </ul>
      
      <CalciteButton
        scale="l"
        width="full"
        iconStart={exportFormat === 'stl' ? 'print' : 'download'}
        disabled={!canDownload || isExporting}
        loading={isExporting}
        onClick={(e) => {
          e.stopPropagation();
          handleExport();
        }}
      >
        {exportButtonText}
      </CalciteButton>
    </CalciteBlock>
  );
}

function downloadFile(name: string, blob: Blob) {
  const link = document.createElement("a");
  link.download = `${name}.glb`;
  link.href = window.URL.createObjectURL(blob);
  link.click();
  window.URL.revokeObjectURL(link.href);
}
