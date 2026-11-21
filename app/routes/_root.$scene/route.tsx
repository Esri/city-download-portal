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
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { lazy } from "react";
import { redirect, useLoaderData, useRouteError } from "react-router";
import Sidebar from "~/routes/_root.$scene/sidebar/sidebar";
import invariant from "tiny-invariant";
import { ViewUI } from "~/arcgis/components/views/scene-view/scene-view-ui";
import '@esri/calcite-components/dist/components/calcite-action';
import '@esri/calcite-components/dist/components/calcite-navigation';
import '@esri/calcite-components/dist/components/calcite-navigation-logo';
import '@esri/calcite-components/dist/components/calcite-navigation-user';
import '@esri/calcite-components/dist/components/calcite-popover';
import { CalciteAction, CalciteNavigation, CalciteNavigationLogo, CalciteNavigationUser, CalcitePopover } from "@esri/calcite-components-react";
import { useSceneListModal } from "~/routes/_root/scene-list-modal/scene-list-modal-context";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import PortalItem from "@arcgis/core/portal/PortalItem";
import SelectionGraphic from "./selection/selection-graphic";
import { SketchLayer } from "~/arcgis/components/sketch/sketch-layer";
import { CreateSelectionTool } from "./selection/selection-tools/create-selection-tool";
import WalkthroughPopover from "./selection/walk-through-popover";
import { RootShellPortal } from "~/routes/_root/root-shell";
import { useMutation, useQuery } from "@tanstack/react-query";
import WalkthroughStoreProvider from "./selection/walk-through-context";
import { useSelectionState } from "./selection/selection-store";
import { createHexagonFootprint } from "~/hooks/queries/download/hexagon-footprint";
import { OSM_SCENE_ID, OSM_SCENE_TITLE } from "~/data/osm-scene";

const SceneView = lazy(() => import('~/arcgis/components/views/scene-view/scene-view'));
const Scene = lazy(() => import('~/arcgis/components/maps/web-scene/scene'));
const Search = lazy(() => import('~/arcgis/components/search/search'));

export const meta: MetaFunction<typeof clientLoader> = ({ data }) => {
  return [
    { title: data?.title },
    { name: "description", content: data?.description },
  ];
};

export async function clientLoader({ params }: LoaderFunctionArgs) {
  invariant(params.scene, "Expected params.scene");

  const scene = new PortalItem({
    id: params.scene,
  });


  if (scene == null) {
    throw redirect("/");
  }

  await scene.load();

  return {
    instance: scene,
    title: scene.id === OSM_SCENE_ID ? OSM_SCENE_TITLE : scene.title,
    description: scene.description,
    thumbnailUrl: scene.thumbnailUrl,
  };
}

function Header({ portalItem }: { portalItem: PortalItem }) {
  const [, setOpen] = useSceneListModal();

  const identityMutation = useMutation({
    mutationFn: async ({ portalUrl }: { portalUrl: string }) => {
      const { default: IdentityManager } = await import('@arcgis/core/identity/IdentityManager');
      try {
        await IdentityManager.checkSignInStatus(portalUrl)
        IdentityManager.destroyCredentials();

        // signing out does not clear the userinfo from the portalItem
        // so we reload the entire page to clear all the user info
        location.reload();
      } catch (_error) {
        return await IdentityManager.getCredential(portalUrl + "/sharing");
      }
    }
  })

  const fullName = useAccessorValue(() => portalItem.portal.user?.fullName);
  const username = useAccessorValue(() => portalItem.portal.user?.username);
  const avatar = useAccessorValue(() => portalItem.portal.user?.thumbnailUrl)

  const title = useAccessorValue(() => portalItem.title);
  const description = useAccessorValue(() => portalItem.description);
  const isOsm = portalItem.id === OSM_SCENE_ID;

  return (
    <CalciteNavigation slot="header">
      <CalciteNavigationLogo
        slot="logo"
        heading={isOsm ? OSM_SCENE_TITLE : title ?? "Untitled"}
        description={isOsm ? "Select an area to export terrain and OpenStreetMap buildings." : description ?? ""}
      />
      <div slot="content-end">
        <CalciteNavigationUser
          className="h-full"
          id="user-menu"
          full-name={fullName}
          username={username}
          thumbnail={avatar ?? ""}
        />
        <CalcitePopover
          label="Sign in settings"
          referenceElement="user-menu"
          placement="bottom-end"
          offsetDistance={0}
          pointer-disabled
          autoClose
          triggerDisabled={identityMutation.isPending}
        >
          <CalciteAction
            text={fullName == null ? "Sign in" : "Sign out"}
            label={fullName == null ? "Sign in" : "Sign out"}
            textEnabled
            scale="l"
            disabled={identityMutation.isPending}
            onClick={() => {
              identityMutation.mutate({
                portalUrl: portalItem.portal.url,
              });
            }}
          >
            {fullName == null ? "Sign in" : "Sign out"}
          </CalciteAction>
        </CalcitePopover>
      </div>
      <CalciteAction slot="navigation-action" text={""} icon="hamburger" onClick={() => setOpen(true)} />
    </CalciteNavigation>
  )
}

export default function SceneRoute() {
  const {
    instance
  } = useLoaderData() as Awaited<ReturnType<typeof clientLoader>>;

  const selectionStore = useSelectionState();
  const extent = useAccessorValue(() => selectionStore.selection?.extent);
  const isHexagon = useAccessorValue(() => selectionStore.footprintShape) === "hexagon";
  const footprint = useQuery({
    queryKey: ["hexagon-footprint", extent?.toJSON()],
    queryFn: ({ signal }) => createHexagonFootprint(extent!, signal),
    enabled: isHexagon && extent != null && extent.width > 0 && extent.height > 0,
    placeholderData: undefined,
    gcTime: 0,
    retry: false,
  });
  const hexagon = isHexagon ? footprint.data : undefined;

  return (
    <WalkthroughStoreProvider>
      <Scene key={instance.id} portalItem={instance}>
        <Header portalItem={instance} />
        <SceneView>
          <SketchLayer disableZ elevationMode="on-the-ground" title="selection-graphics-layer">
            <Search />
            <Sidebar
              key={"sidebar" + instance.id}
              hexagon={hexagon}
              footprintError={isHexagon ? footprint.error : null}
              footprintLoading={isHexagon && footprint.isFetching}
            />
            <ViewUI position="bottom-left">
              <div className="flex gap-4">
                <SelectionGraphic hexagon={hexagon?.outline} />
                <CreateSelectionTool />
              </div>
            </ViewUI>
            <RootShellPortal>
              <WalkthroughPopover />
            </RootShellPortal>
          </SketchLayer>
        </SceneView>
      </Scene>
    </WalkthroughStoreProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (error instanceof Error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error.message}</p>
        <p>The stack trace is:</p>
        <pre>{error.stack}</pre>
      </div>
    );
  } else {
    return <h1>Unknown Error</h1>;
  }
}
