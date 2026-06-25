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
import { ForwardedRef, ReactNode, useEffect, useId, useRef } from "react";
import { useGraphicsLayer } from "./graphics-layer";
import CoreGraphic from '@arcgis/core/Graphic';
import Geometry from '@arcgis/core/geometry/Geometry';
import useProvideRef from "~/hooks/useProvideRef";
import useInstance from "~/hooks/useInstance";

interface GraphicProps<GeometryType extends Geometry = Geometry> {
  geometry: GeometryType;
  symbol: NonNullable<CoreGraphic['symbol']>;
  ref?: ForwardedRef<CoreGraphic>;
  index?: number
}
export default function Graphic<GeometryType extends Geometry = Geometry>({
  geometry,
  symbol,
  ref,
  index
}: GraphicProps<GeometryType>): ReactNode {
  const id = useId();
  const graphic = useInstance(() => new CoreGraphic({
    attributes: {
      __graphicId: id
    }
  }));

  const layer = useGraphicsLayer();

  const currentGeometryProp = useRef<GeometryType>(geometry);
  useEffect(() => {
    graphic.geometry = geometry
    currentGeometryProp.current = geometry
  }, [geometry, graphic]);

  useEffect(() => {
    graphic.symbol = symbol
  }, [graphic, symbol]);

  useEffect(() => {
    layer.graphics.add(graphic, index);
    return () => {
      layer.remove(graphic)
    }
  }, [graphic, index, layer]);

  useProvideRef(graphic, ref);

  return null;
}
