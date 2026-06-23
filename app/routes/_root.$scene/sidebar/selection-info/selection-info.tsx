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
import '@esri/calcite-components/dist/components/calcite-icon';
import '@esri/calcite-components/dist/components/calcite-label';
import '@esri/calcite-components/dist/components/calcite-notice';
import {
  CalciteBlock,
  CalciteIcon,
  CalciteLabel,
  CalciteNotice,
} from "@esri/calcite-components-react";
import Minimap from "./selection-footprint/footprint-view";
import {
  Dispatch,
  type ComponentProps,
  useDeferredValue,
  useEffect,
  useRef
} from "react";
import DimensionsLayer from "~/arcgis/components/dimensions-layer/dimensions-layer";
import LengthDimension from "~/arcgis/components/dimensions-layer/length-dimension";
import { useSelectionElevationInfo } from "~/hooks/queries/elevation-query";
import { useSelectionState } from "~/routes/_root.$scene/selection/selection-store";
import * as intl from "@arcgis/core/intl";
import { useHasTooManyFeatures, useSelectedFeaturesCount } from "~/hooks/queries/feature-query";
import { UpdateSelectionTool } from "../../selection/selection-tools/update-selectiont-tool";
import { useQuery } from "@tanstack/react-query";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import type { BlockAction, BlockState } from '../sidebar';

type CalciteIconName = ComponentProps<typeof CalciteIcon>["icon"];

interface MeasurementsProps {
  state: BlockState['state'];
  dispatch: Dispatch<BlockAction[]>;
}
export default function SelectionInfo({ state, dispatch }: MeasurementsProps) {
  const store = useSelectionState();
  const selection = useAccessorValue(() => store.selection);

  const deferredSelection = useDeferredValue(selection);

  const hasTooManyFeatures = useHasTooManyFeatures();

  let area = null;
  let northToSouthLength = null;
  let eastToWestLength = null;

  const areaQuery = useQuery({
    queryKey: ['selection-info', 'area', deferredSelection?.toJSON()],
    queryFn: async () => {
      const areaOperator = deferredSelection!.spatialReference.isWGS84 || deferredSelection!.spatialReference.isWebMercator
        ? await import("@arcgis/core/geometry/operators/geodeticAreaOperator.js")
        : await import("@arcgis/core/geometry/operators/areaOperator.js");

      const area = await areaOperator.execute(deferredSelection!);

      return Math.abs(area);
    },
    enabled: deferredSelection != null
  });

  if (areaQuery.data && deferredSelection?.extent) {
    area = intl.formatNumber(
      areaQuery.data,
      // intl does not support area units see list of supported units:
      //  https://tc39.es/proposal-unified-intl-numberformat/section6/locales-currencies-tz_proposed_out.html#table-sanctioned-simple-unit-identifiers
      { maximumFractionDigits: 2, style: 'unit', unit: 'meter', unitDisplay: 'short' }
    ) + '²';

    northToSouthLength = intl.formatNumber(
      deferredSelection.extent.height,
      { maximumFractionDigits: 2, style: 'unit', unit: 'meter', unitDisplay: 'short' },
    );
    eastToWestLength = intl.formatNumber(
      deferredSelection.extent.width,
      { maximumFractionDigits: 2, style: 'unit', unit: 'meter', unitDisplay: 'short' }
    )
  }
  const { data: featureCount = 0 } = useSelectedFeaturesCount();

  const ref = useRef<HTMLCalciteBlockElement>(null);
  useEffect(() => {
    if (state === 'open') {
      setTimeout(() => ref.current?.scrollIntoView(), 150);
    }
  }, [ref, state])

  const wasClicked = useRef(false);

  return (
    <>
      <CalciteBlock
        ref={ref}
        heading="Selection"
        collapsible
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
              block: 'selection'
            }])
          }
        }}
        onCalciteBlockBeforeOpen={() => {
          if (wasClicked.current) {
            dispatch([{
              type: 'open',
              mode: 'manual',
              block: 'selection'
            }])
          }
        }}
      >
        <CalciteIcon scale="s" slot="icon" icon="cursor-marquee"></CalciteIcon>
        <div className="flex flex-col gap-2">
          <Minimap />
          <ul className="h-full grid grid-cols-2 grid-rows-2 gap-2">
            <li>
              <MeasurementValue icon="arrow-double-vertical" label="North to south length" value={northToSouthLength} />
            </li>
            <li>
              <MeasurementValue icon="arrow-double-horizontal" label="East to west length" value={eastToWestLength} />
            </li>
            <li>
              <MeasurementValue icon="grid-diamond" label="Area" value={area} />
            </li>
            <li>
              <MeasurementValue icon="urban-model" label="Selected features" value={featureCount} />
            </li>
          </ul>
          <UpdateSelectionTool invalid={hasTooManyFeatures} />
          <CalciteNotice kind="warning" open={hasTooManyFeatures}>
            <p className="p-2 text-xs" slot="message">
              The selection has too many features. Please reduce the size of the selected area or adjust its location.
            </p>
          </CalciteNotice>
        </div>
      </CalciteBlock>
      <Dimensions />
    </>
  );
}

function Dimensions() {
  const store = useSelectionState();
  const positionOrigin = useAccessorValue(() => store.selectionOrigin);
  const terminal = useAccessorValue(() => store.selectionTerminal);
  const isIdle = useAccessorValue(() => store.editingState === 'idle');

  const elevationQuery = useSelectionElevationInfo()

  if (positionOrigin == null || terminal == null || elevationQuery.data == null) return null;

  const otz = elevationQuery.data.selectionPoints.ot?.z ?? 0;
  const toz = elevationQuery.data.selectionPoints.to?.z ?? 0;

  // the elevation origin is updated async, so the dimensions will look choppy if we use that directly
  // instead we take the last available elevation, but use the x and y from the synchronously updating origin
  // this leads to some jumping around if the elevation changes a lot, but that isn't super concerning
  const origin = positionOrigin.clone();
  origin.x = positionOrigin.x;
  origin.y = positionOrigin.y;
  origin.z = elevationQuery.data.selectionPoints.oo?.z

  const widthStart = origin.clone();
  const widthEnd = widthStart.clone();
  widthEnd.y = terminal?.y;
  widthEnd.z = Math.min(otz ?? widthEnd.z, widthEnd.z ?? Infinity);

  const heightStart = origin.clone();
  const heightEnd = heightStart.clone();
  heightEnd.x = terminal?.x;
  heightEnd.z = Math.min(toz ?? heightEnd.z, heightEnd.z ?? Infinity);

  return (
    <DimensionsLayer fontSize={12}>
      {isIdle ? (
        <LengthDimension
          measureType="horizontal"
          startPoint={widthEnd}
          endPoint={origin}
        />
      ) : null}
      {isIdle ? (
        <LengthDimension
          measureType="horizontal"
          startPoint={heightEnd}
          endPoint={origin}
        />
      ) : null}
    </DimensionsLayer>
  )
}

interface MeasurementValueProps {
  icon: CalciteIconName;
  label: string;
  value?: string | number | null;
}
function MeasurementValue({ icon, label, value }: MeasurementValueProps) {
  return (
    <CalciteLabel scale="s">
      <span className="grid grid-rows-2 grid-cols-[min-content_1fr] gap-x-2">
        <CalciteIcon icon={icon} className="row-span-full place-self-center" />
        <p className="font-medium">{label}</p>
        <p>{value ?? "--"}</p>
      </span>
    </CalciteLabel>
  )
}
