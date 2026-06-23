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
import CoreLengthDimension from "@arcgis/core/analysis/LengthDimension.js";
import { useDimensions } from "./dimensions-context";
import { memo, useEffect } from "react";
import Point from "@arcgis/core/geometry/Point";
import useInstance from "~/hooks/useInstance";
import type { Length } from "@arcgis/core/core/quantity";

interface LengthDimensionProps {
  startPoint: Point;
  endPoint: Point;
  measureType?: 'horizontal' | 'vertical' | 'direct'
  orientation?: number;
  offset?: number;
  onMeasurementResult?: (result?: Length) => void;
}

function InternalLengthDimension({
  startPoint,
  endPoint,
  measureType,
  orientation,
  offset,
}: LengthDimensionProps) {
  const measurement = useInstance(() => new CoreLengthDimension({
    startPoint,
    endPoint,
    measureType,
    orientation,
    offset
  }));
  const { analyses } = useDimensions();

  useEffect(() => {
    measurement.measureType = measureType ?? null!
  }, [measureType, measurement]);

  useEffect(() => {
    measurement.offset = offset ?? null!
  }, [measurement, offset]);

  useEffect(() => {
    measurement.startPoint = startPoint;
    measurement.endPoint = endPoint;
  }, [endPoint, measurement, startPoint]);

  useEffect(() => {
    analyses.dimensions.add(measurement);
    return () => { analyses.dimensions.remove(measurement) };
  }, [analyses.dimensions, measurement]);

  return null;
}

const LengthDimension = memo(InternalLengthDimension, (prev, next) => {
  return (
    prev.endPoint.equals(next.endPoint) &&
    prev.startPoint.equals(next.startPoint) &&
    prev.offset === next.offset &&
    prev.measureType === next.measureType &&
    prev.orientation === next.orientation &&
    prev.onMeasurementResult === next.onMeasurementResult
  )
});

export default LengthDimension;