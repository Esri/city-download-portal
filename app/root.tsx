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
import {
  Links,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  LinksFunction
} from "react-router";
import { setAssetPath } from "@esri/calcite-components";

import calciteStyles from "@esri/calcite-components/main.css?url";
import arcgisStyles from '@arcgis/core/assets/esri/themes/light/main.css?url'
import tailwindStyles from "./global-styles/tailwind.css?url";
import globalStyles from "./global-styles/global.css?url";

import '@esri/calcite-components/dist/components/calcite-action';
import '@esri/calcite-components/dist/components/calcite-alert';
import '@esri/calcite-components/dist/components/calcite-scrim';
import { CalciteAction, CalciteAlert, CalciteScrim } from "@esri/calcite-components-react";
import { PropsWithChildren } from "react";

declare const BASE_PATH: string;

export const meta: MetaFunction = () => {
  return [
    { title: "City download portal" },
  ];
};

const styles = [
  tailwindStyles,
  calciteStyles,
  arcgisStyles,
  globalStyles,
]

export const links: LinksFunction = () => [
  {
    rel: "icon",
    type: "image/svg",
    sizes: "32x32",
    href: "favicon-32x32.svg",
  },
  {
    rel: "icon",
    type: "image/svg",
    sizes: "64x364",
    href: "favicon-64x64.svg",
  },
  ...styles.map(stylesheet => ({ rel: 'stylesheet', href: stylesheet }))
]

if (typeof window !== 'undefined') {
  // defineCustomElements(window);
}

let hasSetup = false;
async function setup() {
  if (hasSetup) return;
  setAssetPath(`${BASE_PATH}assets`);
  document.body.classList.toggle('setup')
  hasSetup = true;
}

export function clientLoader() {
  setup();
  return null;
}

export function Layout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className={hasSetup ? "setup" : ""}>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html >
  );
}

export default function App() {
  return <Outlet />
}

export function HydrateFallback() {
  return (
    <CalciteScrim loading />
  )
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error(error)

  return (
    <>
      <CalciteAlert slot="alerts" kind="danger" ref={ref => {
        if (ref) {
          ref.open = true;
        }
      }} label={""}>
        <div slot="title">Error</div>
        <div slot="message">The application failed to load</div>
        <CalciteAction slot="actions-end" text="Reload" icon="refresh" onClick={() => {
          window.location.reload();
        }} />
      </CalciteAlert>
    </>
  );
}

