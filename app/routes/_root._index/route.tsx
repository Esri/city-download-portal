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
import '@esri/calcite-components/dist/components/calcite-scrim';
import { CalciteScrim } from "@esri/calcite-components-react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "City download portal" },
];

export default function Index() {
  return <CalciteScrim loading id="index-route" />;
}
