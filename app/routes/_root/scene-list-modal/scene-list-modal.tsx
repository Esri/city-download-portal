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
import '@esri/calcite-components/dist/components/calcite-card';
import '@esri/calcite-components/dist/components/calcite-chip';
import '@esri/calcite-components/dist/components/calcite-dialog';
import { CalciteCard, CalciteChip, CalciteDialog } from "@esri/calcite-components-react";
import { Link, useParams, useRouteLoaderData } from "react-router";
import useIsRoot from "~/hooks/useIsRoot";
import type PortalItem from "@arcgis/core/portal/PortalItem";
import type WebScene from "@arcgis/core/WebScene";
import { useId } from "react";
import { clientLoader as RootClientLoader } from "../route";
import { useSceneListModal } from "./scene-list-modal-context";
import webSceneLocal from './web-scene-local.svg';
import webSceneGlobal from './web-scene-global.svg';
import { OSM_SCENE_ID, OSM_SCENE_TITLE } from "~/data/osm-scene";

interface SceneCardProps {
  title: string;
  description: string;
  thumbnail: string;
  viewingMode: 'global' | 'local'
  selected?: boolean;
}

function SceneCard({ title, description, thumbnail, viewingMode, selected }: SceneCardProps) {
  const id = useId();

  const sceneDescription = description?.trim() || "there would be a description here, if the portal item actually had one...";

  // the prop ends up being rendered into a boolean attribute
  // so the string "false" is assigned to cards that are not selected
  // since this is a boolean attribute, the value isn't checked, just being present sets the prop to true
  const selectedProp = selected ? { selected } : undefined;

  return (
    <CalciteCard
      className="max-w-[250px]"
      {...selectedProp}
    >
      <img slot="thumbnail" alt="Screenshot of the web scene" src={thumbnail} style={{
        backgroundColor: "var(--calcite-color-foreground-2)",
      }} className="w-[250px] h-[165px] object-cover" />
      <span slot="heading">{title}</span>
      <span slot="description">{sceneDescription}</span>
      <div slot="footer-start">
        <CalciteChip
          id={id}
          value={viewingMode}
        >
          {viewingMode === "global"
            ? <img className="h-[16px]" slot="image" src={webSceneGlobal} alt="" />
            : <img className="h-[16px]" slot="image" src={webSceneLocal} alt="" />
          }
          {viewingMode === 'global' ? 'Global webscene' : 'Local webscene'}
        </CalciteChip>
      </div>
    </CalciteCard>
  )
}

function LoadCard() {
  return (
    <>
      <div className="sr-only">Loading content</div>
      <CalciteCard
        className="max-w-[250px]"
        disabled
        aria-hidden
      >
        <img slot="thumbnail" style={{
          backgroundColor: "var(--calcite-color-foreground-2)",
        }} className="w-[250px] h-[165px]" alt="" src={null!} />
        <span slot="heading" style={{
          backgroundColor: "var(--calcite-color-foreground-2)",
        }} className="rounded-sm w-full min-h-5" />
        <span slot="description" className="rounded-sm w-full flex flex-col gap-0">
          <span className="w-full min-h-5" style={{
            backgroundColor: "var(--calcite-color-foreground-2)",
          }} />
          <span className="w-full min-h-5" style={{
            backgroundColor: "var(--calcite-color-foreground-2)",
          }} />
          <span className="w-16 min-h-5" style={{
            backgroundColor: "var(--calcite-color-foreground-2)",
          }} />
        </span>
        <div slot="footer-start">
          <CalciteChip value="loading">
            <span className="w-[100px] text-transparent">----------------</span>
          </CalciteChip>
        </div>
      </CalciteCard>
    </>
  )
}

export default function SceneListModal() {
  const [open, setOpen] = useSceneListModal();
  const isRoot = useIsRoot();

  const data = useRouteLoaderData<typeof RootClientLoader>("routes/_root");

  const currentScene = useParams().scene;

  const scenes = data?.scenes as PortalItem[] | undefined;
  const maps = data?.maps as WebScene[] | undefined;

  return (
    <CalciteDialog
      slot="dialogs"
      open={isRoot || open}
      modal
      closeDisabled={isRoot}
      escapeDisabled={isRoot}
      outsideCloseDisabled={isRoot}
      onCalciteDialogOpen={() => setOpen(true)}
      onCalciteDialogClose={() => setOpen(false)}
    >
      <p slot="header-content">City download portal</p>
      <p slot="content-top">Choose a city scene or browse the world with OpenStreetMap 3D.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scenes?.map((scene, index) => (
          <Link
            key={scene.id}
            aria-label={scene.id === OSM_SCENE_ID ? OSM_SCENE_TITLE : scene.title ?? "Untitled scene"}
            to={`/${scene.id}`}>
            <SceneCard
              title={scene.id === OSM_SCENE_ID ? OSM_SCENE_TITLE : scene.title ?? "untitled"}
              description={scene.id === OSM_SCENE_ID
                ? "Browse the globe and export terrain with buildings modeled from OpenStreetMap footprints."
                : scene.description ?? ""}
              thumbnail={scene.thumbnailUrl ?? ""}
              viewingMode={(maps![index] as any).viewingMode}
              selected={scene.id === currentScene}
            />
          </Link>
        ))}
        {scenes == null || scenes.length === 0 ? (
          <LoadCard />
        ) : null}
      </div>
    </CalciteDialog>
  )
}
