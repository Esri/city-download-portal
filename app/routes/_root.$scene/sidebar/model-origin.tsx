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
import '@esri/calcite-components/dist/components/calcite-dropdown-item';
import '@esri/calcite-components/dist/components/calcite-icon';
import '@esri/calcite-components/dist/components/calcite-label';
import '@esri/calcite-components/dist/components/calcite-split-button';
import {
  CalciteBlock,
  CalciteDropdownItem,
  CalciteIcon,
  CalciteLabel,
  CalciteSplitButton,
} from "@esri/calcite-components-react";
import { useSceneView } from "~/arcgis/components/views/scene-view/scene-view-context";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { Dispatch, memo, useDeferredValue, useRef } from "react";
import { BlockAction, BlockState } from "./sidebar";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import { usePreciseOriginElevationInfo } from "~/hooks/queries/elevation-query";
import * as intl from "@arcgis/core/intl.js";
import * as coordinateFormatter from "@arcgis/core/geometry/coordinateFormatter.js";
import { UpdateOriginTool } from "../selection/selection-tools/update-origin-tool";
import { SketchLayer } from "~/arcgis/components/sketch/sketch-layer";
import { useQuery } from '@tanstack/react-query';

interface ModelOriginProps {
  state: BlockState['state'];
  dispatch: Dispatch<BlockAction[]>;
}
const ModelOrigin = memo(function ModelOrigin({
  state,
  dispatch,
}: ModelOriginProps) {
  const view = useSceneView();
  const sr = useAccessorValue(() => (view.spatialReference as any)?.latestWkid ?? view.spatialReference?.wkid);

  const query = useQuery({
    queryKey: ["spatial-reference", { wkid: sr }],
    queryFn: async ({ signal }) => {
      const data = await fetch(`https://spatialreference.org/ref/epsg/${sr!}/projjson.json`, {
        cache: 'force-cache',
        signal,
      })
        .then(response => response.json())

      return `${data.name} (${sr})` as string;
    },
    enabled: sr != null,
  })

  const srName = query.data ?? '--'

  const ele = usePreciseOriginElevationInfo();
  const elevationPoint = ele.data;

  const store = useSelectionState();
  const positionOrigin = useAccessorValue(() => store.origin);
  const adjustedOrigin = elevationPoint?.clone() ?? positionOrigin;
  if (positionOrigin) {
    adjustedOrigin!.x = positionOrigin.x;
    adjustedOrigin!.y = positionOrigin.y;
  }

  const origin = useDeferredValue(adjustedOrigin);
  const elevation =
    origin?.z != null
      ? intl.formatNumber(
        origin.z,
        { maximumFractionDigits: 2, style: 'unit', unit: 'meter', unitDisplay: 'short' }
      )
      : null;

  const latitude = origin?.latitude;
  const x = origin?.x;

  const longitude = origin?.longitude;
  const y = origin?.y;

  const latitudeString = latitude != null
    ? `${latitude.toFixed(2)}°`
    : null;

  const longitudeString = longitude != null
    ? `${longitude.toFixed(2)}°`
    : null;

  const wasClicked = useRef(false);

  return (
    <CalciteBlock
      id="modelOrigin"
      heading="Model origin"
      expandable
      expanded={state === 'open'}
      onClick={() => {
        wasClicked.current = true;

        setTimeout(() => {
          wasClicked.current = false;
        }, 150)
      }}
      onCalciteBlockBeforeClose={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'close',
            mode: 'manual',
            block: 'modelOrigin'
          }])
        }
      }}
      onCalciteBlockBeforeOpen={() => {
        if (wasClicked.current) {
          dispatch([{
            type: 'open',
            mode: 'manual',
            block: 'modelOrigin'
          }])
        }
      }}
    >
      <CalciteIcon slot="icon" icon="diamond" scale="s"></CalciteIcon>
      <ul className="grid grid-cols-2 grid-rows-2">
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">{latitude != null ? "Latitude" : "x"}</p>
            <p>
              {latitudeString ?? x?.toFixed(2) ?? "--"}
            </p>
          </CalciteLabel>
        </li>
        <li className="row-start-2">
          <CalciteLabel scale="s">
            <p className="font-medium">{longitude != null ? "Longitude" : 'y'}</p>
            <p>
              {longitudeString ?? y?.toFixed(2) ?? "--"}
            </p>
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">Spatial reference (WKID)</p>
            <p>
              {srName}
            </p>
          </CalciteLabel>
        </li>
        <li>
          <CalciteLabel scale="s">
            <p className="font-medium">Elevation</p>
            <p>
              {elevation != null ? elevation : "--"}
            </p>
          </CalciteLabel>
        </li>
      </ul>
      <div className="flex gap-2 flex-col">
        <SketchLayer elevationMode="absolute-height">
          <UpdateOriginTool />
        </SketchLayer>
        <CalciteSplitButton
          primaryText="Copy to clipboard"
          width="full"
          primaryIconStart="copy-to-clipboard"
          appearance="outline-fill"
          disabled={origin == null}
          onCalciteSplitButtonPrimaryClick={() => {
            if (origin) {
              try {
                const text = coordinateFormatter.toLatitudeLongitude(origin, 'dms', 3);

                if (text) navigator.clipboard.writeText(text)
              } catch (_) {
                const { x, y, z } = origin;

                // let text = z == null ? `${x},${y}` : `${x},${y},${z}`;
                // tooltips don't support pasting values with z when the layer is on-the-ground...
                const text = z == null ? `${x},${y}` : `${x},${y}`;
                navigator.clipboard.writeText(text);
              }
            }
          }}
        >
          <CalciteDropdownItem
            onClick={() => {
              if (origin) {
                try {
                  const text = coordinateFormatter.toLatitudeLongitude(origin, 'dms', 3);
                  if (text) navigator.clipboard.writeText(text)
                } catch (_) {
                  const { x, y, z } = origin;

                  // let text = z == null ? `${x},${y}` : `${x},${y},${z}`;
                  // tooltips don't support pasting values with z when the layer is on-the-ground...
                  const text = z == null ? `${x},${y}` : `${x},${y}`;
                  navigator.clipboard.writeText(text);
                }
              }
            }}
          >
            Copy as a latitude, longitude pair
          </CalciteDropdownItem>
          <CalciteDropdownItem
            onClick={() => {
              if (origin) {
                const { x, y, latitude, longitude, z } = origin;

                let wkt = z == null ? `POINT(${x} ${y})` : `POINTZ(${x} ${y} ${z})`;

                if (latitude != null && longitude != null)
                  wkt = z == null ? `POINT(${latitude} ${longitude})` : `POINTZ(${latitude} ${longitude} ${z})`;

                navigator.clipboard.writeText(wkt);
              }
            }}
          >
            Copy as WKT
          </CalciteDropdownItem>
        </CalciteSplitButton>
      </div>
    </CalciteBlock>
  );
})

export default ModelOrigin;