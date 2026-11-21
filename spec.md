# Day 20 Hexagons — City Download Portal export mask

## Goal

Add a **Footprint** option under **Export settings**. Choosing **Hexagon** takes a square source area and cuts a single regular hexagon from its terrain surface. With terrain extrusion enabled, the cut surface becomes the top of a closed six-sided base with vertical walls and a flat bottom. Both GLB and STL use the same cropped model.

## Current export path

- The selection tools store an axis-aligned rectangular polygon and manage the model origin separately. The origin defaults to a selection corner and can be moved independently. [Selection store](app/routes/_root.$scene/selection/selection-store.tsx)
- `sidebar.tsx` renders `export-settings-with-stl.tsx`. Download and file-size estimation both build a GLB through `createModelBlob`. STL converts that GLB in the browser. The size query currently reports GLB bytes. [Active export settings](app/routes/_root.$scene/sidebar/export-settings-with-stl.tsx) · [Export query](app/hooks/queries/download/export-query.tsx) · [STL converter](app/utils/glb-to-stl-converter.ts)
- Scene-layer queries use the selection extent to fetch candidate meshes. `createMesh` samples a rectangular terrain grid, optionally extrudes it, converts vertex spaces, and merges terrain, whole scene meshes, and the optional origin marker. An intersecting feature can extend beyond the selection. [Feature queries](app/hooks/queries/feature-query.tsx) · [Mesh creation](app/hooks/queries/download/create-mesh.tsx)
- The portal uses ArcGIS Maps SDK for JavaScript 5.2.7, React Router 7, and Calcite 5.2.1. It runs as a static browser app and uses WebScene, query-capable scene layers, ground elevation, and ArcGIS sign-in where required. The mask operates on mesh data in the browser. [Lockfile](package-lock.json) · [Scene route](app/routes/_root.$scene/route.tsx) · [Deployment workflow](.github/workflows/build-deploy.yml)

## User workflow

1. Choose **Rectangle** or **Hexagon** in either **Selection** or **Export settings**. Both controls update the same footprint setting. Rectangle is the default when the scene opens.
2. In Hexagon mode, the 3D scene and the Selection panel's map preview display the export boundary in purple while drawing, adjusting, and reviewing the selection. The outline follows the current area and clears when the selection is cleared or Rectangle is selected. The rectangular area remains editable and drives feature highlights and counts.
3. Choose GLB or STL and download through the existing export button. **Extrude terrain base downward** stays on by default with the existing depth setting. Turning it off exports the clipped terrain surface and city meshes without base walls or a bottom.
4. Keep the existing model origin for both formats. In Hexagon mode, include the optional origin marker only if all of its geometry fits within the mask. When it is omitted, show a short explanation by the checkbox or in export status. A corner origin can still be used as the export coordinate origin.

## Where the mask runs

**Square source extent → sampled terrain surface → hexagon clip → perimeter extrusion and bottom cap → mesh merge → GLB or STL**

In `create-mesh.tsx`, `extractElevation` currently calls `meshUtils.createFromElevation` and then passes the sampled mesh to `extrudeTerrainMesh`. Apply the mask between those operations in Hexagon mode. The sampler receives a square extent that covers the full hexagon. The extrusion step receives the clipped hexagonal top surface and builds walls down from its cut perimeter. Cap the bottom and merge the closed terrain solid with the clipped city meshes before GLB serialization. STL uses the resulting GLB. [Mesh creation](app/hooks/queries/download/create-mesh.tsx) · [Export query](app/hooks/queries/download/export-query.tsx)

## Footprint and mesh rules

- Fit the largest centered, flat-top regular hexagon with the specified orientation inside the selection in a planar metric frame. Its upper and lower sides run parallel to the horizontal X axis of that frame. For an axis-aligned rectangle of width `W` and height `H` in meters, the circumradius is `min(W / 2, H / sqrt(3))`. For transformed bounds, constrain all six rays against the selection boundary in the working frame. A wide or tall selection may leave more space on one pair of sides.
- Derive the footprint from the selection alone. Use a common metric frame for the footprint, terrain, and scene meshes. For WGS84 and Web Mercator, use a local tangent frame anchored at the selection center. For projected scenes, account for the spatial reference's linear units. Bake mesh transforms into the shared frame before clipping. Use the same six corners for the preview and for the clip planes. Retain the user's model origin when assembling the output. [Mesh local vertex space](https://developers.arcgis.com/javascript/latest/references/core/geometry/support/MeshLocalVertexSpace/)
- Derive a square source extent from the hexagon's bounds by expanding the shorter axis in the source coordinate system. Verify coverage after coordinate conversion and expand the square as needed to sample the full perimeter. Use the square for terrain sampling and export candidate queries in Hexagon mode. Apply the existing 100-candidate limit to that query area.
- Clip the sampled terrain and candidate city triangles against the same six vertical planes. Drop exterior triangles and retain the inside portion of crossing triangles, including intersecting buildings. Interpolate elevation, UVs, and other applicable attributes at intersections. Preserve per-component materials for GLB. Clone or construct output geometry so repeated exports can reuse the original query results. [Terrain sampling](https://developers.arcgis.com/javascript/latest/references/core/geometry/support/meshUtils/#createFromElevation) · [Scene-layer spatial queries](https://developers.arcgis.com/javascript/latest/references/core/layers/SceneLayer/)
- Weld shared terrain intersection vertices within a documented tolerance, remove degenerate faces, and extract the directed perimeter of the clipped terrain. With extrusion enabled, construct outward-facing walls along that perimeter and close a flat bottom at the minimum retained terrain or city elevation minus the chosen depth. Use the same boundary vertices at the walls and caps so the terrain base is watertight. City meshes are trimmed as surfaces. The closed-base criterion applies to the extruded terrain component.
- Export terrain alone if no city meshes survive the mask. Report an actionable error for a degenerate selection, a coordinate conversion failure, or terrain that cannot provide a complete hexagon. Keep the selection available for retry.

## Implementation order

1. Add an export footprint type and a deterministic footprint builder. Wire the Calcite control to the derived scene outline. Check the coordinate conversion with the pinned ArcGIS version before integrating the clipping path. [Calcite segmented control](https://developers.arcgis.com/calcite-design-system/components/segmented-control/)
2. Make terrain sampling and extrusion independently callable in `app/hooks/queries/download/create-mesh.tsx`. In Hexagon mode, sample the square extent, convert to the working frame, clip the terrain top, and pass that surface to the extrusion step when enabled. Merge the result with the separately clipped city meshes. Keep the existing Rectangle mesh path as the default for current callers.
3. Pass the same shape, selection snapshot, and export settings into `createModelBlob` from both the size query and the download mutation. Include the footprint and its spatial reference in the size cache key. Use only feature and origin results from the current inputs, even during deferred queries. Clear stale sizes after a change and label the size as a GLB estimate when STL is selected. Prevent duplicate export requests and use the existing loading states and error toasts.
4. Feed the masked GLB into the existing GLB download and STL conversion paths. Keep filename handling and units consistent with the current exports.

## Acceptance checks

| Scenario | Expected result |
| --- | --- |
| Default Rectangle | The original workflow still exports GLB and STL with the same selection, marker, base, filename, and depth behavior. |
| Square and elongated selections | The footprint is centered with six equal sides in the working frame. The outline matches the exported plan view and responds to selection edits. |
| Square source and hexagonal cut | Terrain sampling and export candidate queries receive an enclosing square extent. The terrain surface passed to extrusion has a complete six-sided perimeter. The top, walls, and cap share that footprint. |
| Features inside, outside, and across edges | Inside features retain their geometry and GLB materials. Outside features disappear. Crossing triangles are cut at the boundary. Exported geometry stays within the six planes, within the documented tolerance. |
| Sloped terrain, base on and off | Base on produces a single closed terrain solid with six straight sides in plan, consistently oriented faces, and a level underside at the requested depth. Each undirected terrain edge has two incident faces after welding. Base off exports the clipped top surface without walls or bottom faces. |
| Terrain-only, empty, and invalid cases | Terrain-only selections export successfully. Missing or invalid selections keep export unavailable. Incomplete terrain and geometry failures produce actionable feedback. |
| Marker, origin, and settings changes | A marker wholly inside is exported when enabled. A crossing or outside marker is omitted with an explanation. Moving the model origin changes the export coordinate reference while the mask remains tied to the selection. Rapid changes cannot display a stale size or export an earlier selection. |
| Projection, formats, and workflow | Exercise a supported global scene and a projected local scene. Open both exports and compare footprint and scale. Check keyboard operation, the existing feature limit, and export failure and retry. |

## Implementation verification

- In the St. Gallen local scene, exported the same selection as GLB and binary STL. The GLB terrain solid has six equal sides, a level bottom, and two oppositely wound faces at every edge after welding. The STL and GLB contain the same number of triangles.
- In the Vigo global scene, confirmed the Hexagon option, file-size estimate, and GLB download. Synthetic terrain checks exercised projected, Web Mercator, and WGS84 coordinate systems, including edge-crossing meshes and GLB-to-STL conversion.
- The production build and lint checks for the changed source files passed. Repository-wide lint reports pre-existing issues in demo components.

## OpenStreetMap 3D preset

The fourth picker option opens Esri's **OpenStreetMap Style** 3D web scene over Seattle. Users can search or navigate to another location. The scene supplies the visual basemap and the portal loads world elevation for the terrain model. [OpenStreetMap Style web scene](https://www.arcgis.com/home/item.html?id=1c071fcf8ff2448599b0547116e2de55)

On confirmation, the app queries open OSM building footprints for the source extent. It uses the hosted North America OSM replica for supported US and Canadian selections and public Overpass services in other areas. Export availability depends on building coverage and service availability. The export limits the source area to 1.5 km across and 100 buildings. [North America building features](https://www.arcgis.com/home/item.html?id=2be4ad6652c649cbaea2be211555b1cf) · [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)

Rectangle and Hexagon exports cut each building footprint before extruding its walls. Tagged building height takes precedence, followed by three meters per recorded floor and an eight-meter fallback. The exported geometry has flat roofs and a closed terrain base when terrain extrusion is enabled. Both GLB and binary STL embed OpenStreetMap attribution. [OpenStreetMap attribution and licensing](https://www.openstreetmap.org/copyright)

Validated a Seattle selection in the browser. The rectangular GLB contained 44 OSM buildings. The hexagonal STL had six base corners and a valid binary triangle count. Both downloads embedded the source credit. A Berlin test confirmed the European Overpass endpoint supplied building geometry to a browser origin.

## 3D model viewer

After a GLB or STL download, the portal opens the 3D model viewer with the exact file bytes. **View last export** reopens that file while the scene is open. **Open GLB or STL** loads a local file into the browser without uploading it. The viewer fits the model and provides orbit, pan, zoom, and reset controls. STL files open with the portal's Y-up orientation and can be switched to Z-up.
