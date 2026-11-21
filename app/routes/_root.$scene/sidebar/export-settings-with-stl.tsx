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
import { Dispatch, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDownloadExportMutation, useExportSizeQuery, type ExportModelOptions } from "../../../hooks/queries/download/export-query";
import { BlockAction, BlockState } from "./sidebar";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { useReferenceElementId } from "../selection/walk-through-context";
import { ExportFeatureLimitError, MAX_FEATURES, useHasTooManyFeatures, useSelectedFeaturesFromLayers } from "~/hooks/queries/feature-query";
import { usePreciseOriginElevationInfo } from "~/hooks/queries/elevation-query";
import { useSTLConverter } from "~/hooks/useSTLConverter";
import type { HexagonFootprint } from "~/hooks/queries/download/hexagon-footprint";
import { useToast } from "~/components/toast";
import FootprintControl from "./footprint-control";
import { OSM_ATTRIBUTION, OSM_ATTRIBUTION_URL, OSM_SCENE_ID } from "~/data/osm-scene";
import { queryOsmBuildings } from "~/hooks/queries/download/osm-building-query";
import ModelViewerDialog from "~/components/model-viewer-dialog";

type ExportFormat = 'glb' | 'stl';
const noSceneFeatures: ExportModelOptions["features"] = new Map();

interface ExportSettingsProps {
  state: BlockState['state'];
  dispatch: Dispatch<BlockAction[]>;
  hexagon?: HexagonFootprint;
  footprintError: Error | null;
  footprintLoading: boolean;
}

export default function ExportSettings({ dispatch, state, hexagon, footprintError, footprintLoading }: ExportSettingsProps) {
  const scene = useScene();
  const isOsm = scene.portalItem?.id === OSM_SCENE_ID;
  const { convertAndDownload } = useSTLConverter();
  const toast = useToast();

  const title = useAccessorValue(() => {
    const title = isOsm ? "OpenStreetMap 3D" : scene.portalItem?.title ?? "Untitled";
    return title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, "_");
  });
  
  const [filename, setFilename] = useState("")
  const [exportFormat, setExportFormat] = useState<ExportFormat>('glb');
  const [includeOriginMarker, setIncludeOriginMarker] = useState(!isOsm);
  const [extrudeBase, setExtrudeBase] = useState(true);
  const [extrusionDepth, setExtrusionDepth] = useState("50");
  const [isConvertingToSTL, setIsConvertingToSTL] = useState(false);
  const [lastExport, setLastExport] = useState<File>();
  const [viewerOpen, setViewerOpen] = useState(false);

  const blockElementId = useReferenceElementId('downloading', 'left');

  const store = useSelectionState();
  const editingState = useAccessorValue(() => store.editingState);
  const selection = useAccessorValue(() => store.selection);
  const selectionExtent = selection?.extent;
  const isHexagon = useAccessorValue(() => store.footprintShape) === "hexagon";
  const isIdle = editingState === "idle";
  const modelOriginQuery = usePreciseOriginElevationInfo();
  const exportHexagon = isHexagon && hexagon?.selectionExtent.equals(selectionExtent) ? hexagon : undefined;
  const currentExtent = isHexagon ? exportHexagon?.sourceExtent : selectionExtent;
  const osmQuery = useQuery({
    queryKey: ["osm-export-buildings", currentExtent?.toJSON()],
    queryFn: ({ signal }) => queryOsmBuildings(currentExtent!, MAX_FEATURES, signal),
    enabled: isOsm && isIdle && currentExtent != null,
    placeholderData: undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const rectangleOverLimit = useHasTooManyFeatures();
  const featureQuery = useSelectedFeaturesFromLayers(
    !isOsm && isIdle && (isHexagon ? exportHexagon != null : !rectangleOverLimit),
    isHexagon ? exportHexagon?.sourceExtent ?? null : undefined,
  );
  const buildings = isOsm ? osmQuery.data : undefined;
  const features = isOsm ? (buildings && noSceneFeatures) : featureQuery.data;
  const modelOrigin = modelOriginQuery.isPlaceholderData ? undefined : modelOriginQuery.data;
  const featureCount = features && Array.from(features.values()).reduce((count, layer) => count + layer.length, 0);
  const hasTooManyFeatures = isOsm ? (buildings?.length ?? 0) > MAX_FEATURES
    : isHexagon ? featureQuery.error instanceof ExportFeatureLimitError || (featureCount ?? 0) > MAX_FEATURES
      : rectangleOverLimit;
  const featuresError = isOsm ? osmQuery.error : featureQuery.error;
  const exportParams: ExportModelOptions | undefined =
    isIdle && currentExtent && features && modelOrigin && !hasTooManyFeatures && !featuresError ? {
      scene,
      extent: currentExtent,
      features,
      origin: modelOrigin,
      includeOriginMarker,
      extrudeBase,
      extrusionDepth: Math.max(0, Number.parseFloat(extrusionDepth)) || 50,
      hexagon: exportHexagon,
      osmBuildings: buildings,
    } : undefined;
  const sizeQuery = useExportSizeQuery(exportParams);

  const fileSize = sizeQuery.data;
  let fileSizeString = "Unavailable";
  if (selection == null) fileSizeString = "Select an area";
  else if (hasTooManyFeatures) fileSizeString = "Too many features. Draw a smaller selection.";
  else if (footprintError) fileSizeString = footprintError.message;
  else if (featuresError) fileSizeString = isOsm ? featuresError.message : "Could not query city features. Try the selection again.";
  else if (modelOriginQuery.error) fileSizeString = "Could not read the origin elevation. Move the model origin and retry.";
  else if (exportParams && fileSize != null) fileSizeString = `${(fileSize * 1e-6).toFixed(2)} MB`;
  else if (!isIdle || featureQuery.isFetching || osmQuery.isFetching || modelOriginQuery.isFetching || footprintLoading || sizeQuery.isFetching) {
    fileSizeString = "Calculating…";
  }

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
  const exportInProgress = useRef(false);

  const handleExport = async () => {
    if (!exportParams || exportInProgress.current) return;
    exportInProgress.current = true;

    try {
      const blob = await mutation.mutateAsync(exportParams);
      const name = filename || title || 'model';
      
      let file: File;
      if (exportFormat === 'glb') {
        file = new File([blob], `${name}.glb`, { type: 'model/gltf-binary' });
        downloadFile(file);
      } else {
        setIsConvertingToSTL(true);
        try {
          file = await convertAndDownload(blob, name, {
            binary: true,
            scale: 1,
            mergeGeometries: true,
            binaryHeader: isOsm ? OSM_ATTRIBUTION : undefined,
          });
        } catch {
          toast({ key: "stl-conversion-failed", title: "Export error", message: "Could not convert the model to STL. Try the export again.", severity: "danger" });
          return;
        }
      }
      setLastExport(file);
      setViewerOpen(true);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsConvertingToSTL(false);
      exportInProgress.current = false;
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
      expandable
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
        {isOsm && (
          <li className="text-xs">
            Buildings use OpenStreetMap footprints and recorded or estimated heights.
            {buildings?.length === 0 && <p className="mt-1">This area has no mapped buildings. The export will contain terrain.</p>}
            <p className="mt-1">
              Credit <a className="underline" href={OSM_ATTRIBUTION_URL} target="_blank" rel="noreferrer">OpenStreetMap contributors</a> when sharing a print.
            </p>
          </li>
        )}
        <li>
          <FootprintControl disabled={isExporting} />
        </li>
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
          {isHexagon && includeOriginMarker && (
            <p className="text-xs text-gray-600">The origin marker is included when it fits inside the hexagon.</p>
          )}
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
            <p className="font-medium">{exportFormat === "stl" ? "GLB size estimate" : "File size"}</p>
            <p aria-live="polite">{fileSizeString}</p>
          </CalciteLabel>
          {isOsm && osmQuery.error && (
            <CalciteButton appearance="outline" scale="s" onClick={() => void osmQuery.refetch()}>
              Retry building data
            </CalciteButton>
          )}
        </li>
      </ul>
      
      <CalciteButton
        scale="l"
        width="full"
        iconStart={exportFormat === 'stl' ? 'print' : 'download'}
        disabled={!exportParams || isExporting}
        loading={isExporting}
        onClick={(e) => {
          e.stopPropagation();
          handleExport();
        }}
      >
        {exportButtonText}
      </CalciteButton>
      <CalciteButton
        className="mt-2"
        appearance="outline"
        width="full"
        iconStart="cube"
        onClick={(event) => {
          event.stopPropagation();
          setViewerOpen(true);
        }}
      >
        {lastExport ? "View last export" : "Open model viewer"}
      </CalciteButton>
      <ModelViewerDialog open={viewerOpen} initialFile={lastExport} onClose={() => setViewerOpen(false)} />
    </CalciteBlock>
  );
}

function downloadFile(file: File) {
  const link = document.createElement("a");
  link.download = file.name;
  link.href = window.URL.createObjectURL(file);
  link.click();
  window.URL.revokeObjectURL(link.href);
}
