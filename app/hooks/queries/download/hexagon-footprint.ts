import Extent from "@arcgis/core/geometry/Extent.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { projectExecute, projectLoad } from "@arcgis/core/geometry/operators/projectOperator.js";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils.js";
import MeshGeoreferencedVertexSpace from "@arcgis/core/geometry/support/MeshGeoreferencedVertexSpace.js";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace.js";
import MeshVertexAttributes from "@arcgis/core/geometry/support/MeshVertexAttributes.js";
import { convertVertexSpace } from "@arcgis/core/geometry/support/meshUtils.js";

export type FootprintShape = "rectangle" | "hexagon";
type XY = [x: number, y: number];
export type ClipPlane = { x: number; y: number; offset: number };

export interface ExportFootprint {
  center: Point;
  outline: Polygon;
  selectionExtent: Extent;
  sourceExtent: Extent;
  planes: ClipPlane[];
  corners: XY[];
  tolerance: number;
}
export type HexagonFootprint = ExportFootprint;

const heightRatio = Math.sqrt(3) / 2;
const unitHexagon: XY[] = [
  [1, 0], [0.5, heightRatio], [-0.5, heightRatio],
  [-1, 0], [-0.5, -heightRatio], [0.5, -heightRatio],
];

function usesLocalMeters(sr: SpatialReference) {
  return sr.isWGS84 || sr.isWebMercator;
}

export function vertexSpaceAt(point: Point) {
  const origin = [point.x, point.y, point.z ?? 0] as const;
  return usesLocalMeters(point.spatialReference)
    ? new MeshLocalVertexSpace({ origin })
    : new MeshGeoreferencedVertexSpace({ origin });
}

export async function projectPoint(point: Point, sr: SpatialReference) {
  if (point.spatialReference.equals(sr)) return point;
  if (webMercatorUtils.canProject(point, sr)) {
    const projected = webMercatorUtils.project(point, sr);
    if (projected instanceof Point) return projected;
  }

  await projectLoad();
  const projected = projectExecute(point, sr);
  if (!(projected instanceof Point)) {
    throw new Error("The selected area could not be projected for export.");
  }
  return projected;
}

function pointMesh(position: number[], spatialReference: SpatialReference, vertexSpace?: ReturnType<typeof vertexSpaceAt>) {
  return new Mesh({
    spatialReference,
    vertexSpace,
    vertexAttributes: new MeshVertexAttributes({ position: Float64Array.from(position) }),
  });
}

function planesForRing(ring: XY[]): ClipPlane[] {
  return ring.map(([x, y], index) => {
    const [nextX, nextY] = ring[(index + 1) % ring.length];
    const length = Math.hypot(nextX - x, nextY - y);
    const normalX = (y - nextY) / length;
    const normalY = (nextX - x) / length;
    return { x: normalX, y: normalY, offset: -(normalX * x + normalY * y) };
  });
}

export function signedDistance(plane: ClipPlane, x: number, y: number) {
  return plane.x * x + plane.y * y + plane.offset;
}

export function createHexagonFootprint(extent: Extent, signal?: AbortSignal) {
  return createFootprint(extent, "hexagon", signal);
}

export function createRectangleFootprint(extent: Extent, signal?: AbortSignal) {
  return createFootprint(extent, "rectangle", signal);
}

async function createFootprint(extent: Extent, shape: FootprintShape, signal?: AbortSignal): Promise<ExportFootprint> {
  if (!(extent.width > 0 && extent.height > 0)) {
    throw new Error("Draw a selection with a positive width and height.");
  }

  const sr = extent.spatialReference;
  if (sr.isGeographic && !sr.isWGS84) {
    throw new Error("Use a WGS84, Web Mercator, or projected scene for a hexagon export.");
  }

  const center = new Point({ x: extent.center.x, y: extent.center.y, z: 0, spatialReference: sr });
  const vertexSpace = vertexSpaceAt(center);
  const selection = pointMesh([
    extent.xmin, extent.ymin, 0, extent.xmax, extent.ymin, 0,
    extent.xmax, extent.ymax, 0, extent.xmin, extent.ymax, 0,
  ], sr);
  const localSelection = await convertVertexSpace(selection, vertexSpace, { signal });
  const positions = localSelection.vertexAttributes.position;
  const selectionCorners: XY[] = [0, 3, 6, 9].map(index => [positions[index], positions[index + 1]]);
  const selectionPlanes = planesForRing(selectionCorners);

  // Each direction can extend up to the first selection edge it meets.
  let radius = Infinity;
  for (const [x, y] of unitHexagon) {
    for (const plane of selectionPlanes) {
      const rate = plane.x * x + plane.y * y;
      if (rate < 0) radius = Math.min(radius, plane.offset / -rate);
    }
  }

  const metersPerUnit = usesLocalMeters(sr) ? 1 : sr.metersPerUnit;
  const tolerance = Math.max(1e-6 / metersPerUnit, radius * 1e-10);
  if (!Number.isFinite(radius) || !Number.isFinite(tolerance) || radius <= tolerance * 100) {
    throw new Error("Draw a larger selection to create a hexagon.");
  }

  const corners: XY[] = shape === "hexagon" ? unitHexagon.map(([x, y]) => [x * radius, y * radius]) : selectionCorners;
  const outlineMesh = pointMesh(corners.flatMap(([x, y]) => [x, y, 0]), sr, vertexSpace);
  const georeferenced = await convertVertexSpace(outlineMesh, new MeshGeoreferencedVertexSpace(), { signal });
  const outlinePositions = georeferenced.vertexAttributes.position;
  const outlineRing: XY[] = corners.map((_, index) => [outlinePositions[index * 3], outlinePositions[index * 3 + 1]]);
  if (outlineRing.some(point => !point.every(Number.isFinite))) {
    throw new Error("Draw a selection that can be represented in the scene coordinate system.");
  }

  // ArcGIS polygon exterior rings use clockwise order.
  const ring = outlineRing.reverse();
  const outline = new Polygon({ spatialReference: sr, rings: [[...ring, ring[0]]] });
  const bounds = outline.extent!;
  // Leave sampling room at the six edges, including for projected elevation vertices.
  const halfWidth = (shape === "hexagon" ? Math.max(bounds.width, bounds.height) : bounds.width) * 0.51;
  const halfHeight = (shape === "hexagon" ? Math.max(bounds.width, bounds.height) : bounds.height) * 0.51;
  const sourceExtent = new Extent({
    xmin: bounds.center.x - halfWidth, xmax: bounds.center.x + halfWidth,
    ymin: bounds.center.y - halfHeight, ymax: bounds.center.y + halfHeight,
    spatialReference: sr,
  });

  return { center, sourceExtent, selectionExtent: extent, outline, planes: planesForRing(corners), corners, tolerance };
}

export async function meshInFootprintSpace(mesh: Mesh, footprint: ExportFootprint, signal?: AbortSignal) {
  const sr = footprint.center.spatialReference;
  const meshSR = mesh.spatialReference;
  if (meshSR.equals(sr)) {
    return convertVertexSpace(mesh, vertexSpaceAt(footprint.center), { signal });
  }

  if (usesLocalMeters(sr) && usesLocalMeters(meshSR)) {
    // Both geographic representations convert to the same local east/north/up frame.
    const center = await projectPoint(footprint.center, meshSR);
    const converted = await convertVertexSpace(mesh, vertexSpaceAt(center), { signal });
    return new Mesh({
      spatialReference: sr,
      vertexSpace: vertexSpaceAt(footprint.center),
      vertexAttributes: converted.vertexAttributes,
      components: converted.components,
    });
  }

  throw new Error("A selected mesh uses an incompatible spatial reference. Hide its scene layer and retry.");
}
