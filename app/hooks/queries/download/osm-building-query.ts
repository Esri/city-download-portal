import Extent from "@arcgis/core/geometry/Extent.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { project } from "@arcgis/core/geometry/support/webMercatorUtils.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

export interface OsmBuilding {
  id: string;
  footprint: Polygon;
  height: number;
}

const northAmericaBuildings = "https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_NA_Buildings/FeatureServer/0";
const globalOverpass = "https://overpass.private.coffee/api/interpreter";
const maxSourceMeters = 1500;

interface OsmPoint { lat: number; lon: number }
interface OsmMember { type: "way" | "node" | "relation"; ref: number; role: string; geometry?: OsmPoint[] }
interface OsmElement {
  id: number;
  type: "way" | "relation";
  geometry?: OsmPoint[];
  members?: OsmMember[];
  tags?: Record<string, string>;
}

function meters(value?: string | number) {
  const text = String(value ?? "").trim();
  const feetAndInches = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/.exec(text);
  if (feetAndInches) return Number(feetAndInches[1]) * 0.3048 + Number(feetAndInches[2] ?? 0) * 0.0254;
  const scalar = /^(\d+(?:\.\d+)?)\s*(m|ft|feet)?$/i.exec(text);
  return scalar ? Number(scalar[1]) * (/^(ft|feet)$/i.test(scalar[2] ?? "") ? 0.3048 : 1) : 0;
}

export function osmBuildingHeight(height?: string | number, levels?: string | number) {
  const levelCount = Number(levels);
  return meters(height) || (Number.isFinite(levelCount) && levelCount > 0 ? levelCount * 3 : 8);
}

function samePoint(a: OsmPoint, b: OsmPoint) {
  return a.lat === b.lat && a.lon === b.lon;
}

function overpassEndpoint(bounds: Extent) {
  // The regional Overpass instances use Geofabrik extracts. Use the global
  // endpoint for selections near continental boundaries or in other regions.
  if (bounds.xmin >= -13 && bounds.xmax <= 40 && bounds.ymin >= 37 && bounds.ymax <= 72) {
    return "https://ovp.dresel.systems/api/interpreter";
  }
  if (bounds.xmin >= 68 && bounds.xmax <= 150 && bounds.ymin >= 5 && bounds.ymax <= 55) {
    return "https://ovp.dresel.systems/api-as/interpreter";
  }
  if (bounds.xmin >= -82 && bounds.xmax <= -34 && bounds.ymax <= 12 && bounds.ymin >= -57) {
    return "https://ovp.dresel.systems/api-sa/interpreter";
  }
  return globalOverpass;
}

function makeRings(members: OsmMember[], role: "outer" | "inner") {
  const pending = members
    .filter(member => member.type === "way" && (member.role === role || (role === "outer" && member.role === "")))
    .flatMap(member => member.geometry && member.geometry.length >= 2 ? [member.geometry.slice()] : []);
  const rings: OsmPoint[][] = [];
  while (pending.length) {
    const ring = pending.pop()!;
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const last = ring[ring.length - 1];
      const next = pending.findIndex(points => samePoint(last, points[0]) || samePoint(last, points[points.length - 1]));
      if (next === -1) break;
      const [points] = pending.splice(next, 1);
      if (!samePoint(last, points[0])) points.reverse();
      ring.push(...points.slice(1));
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function orientedRing(points: OsmPoint[], clockwise: boolean) {
  if (points.length < 4 || !samePoint(points[0], points[points.length - 1])) return [];
  const ring = points.map(({ lon, lat }) => [lon, lat]);
  const [originX, originY] = ring[0];
  let signedArea = 0;
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = ring[i - 1];
    const [nextX, nextY] = ring[i];
    signedArea += (x - originX) * (nextY - originY) - (nextX - originX) * (y - originY);
  }
  if (!Number.isFinite(signedArea) || signedArea === 0) return [];
  return (signedArea < 0) === clockwise ? ring : ring.reverse();
}

export function readOverpassBuildings(elements: OsmElement[]): OsmBuilding[] {
  const buildings: OsmBuilding[] = [];
  const relationOuterWays = new Set<number>();
  for (const element of elements) {
    if (element.type !== "relation") continue;
    const members = element.members ?? [];
    const outer = makeRings(members, "outer").map(points => orientedRing(points, true)).filter(ring => ring.length);
    if (!outer.length) continue;
    const inner = makeRings(members, "inner").map(points => orientedRing(points, false)).filter(ring => ring.length);
    for (const member of members) {
      if (member.type === "way" && member.role !== "inner") relationOuterWays.add(member.ref);
    }
    buildings.push({
      id: `relation/${element.id}`,
      footprint: new Polygon({ spatialReference: SpatialReference.WGS84, rings: [...outer, ...inner] }),
      height: osmBuildingHeight(element.tags?.height, element.tags?.["building:levels"]),
    });
  }
  for (const element of elements) {
    if (element.type !== "way" || relationOuterWays.has(element.id)) continue;
    const ring = orientedRing(element.geometry ?? [], true);
    if (ring.length) buildings.push({
      id: `way/${element.id}`,
      footprint: new Polygon({ spatialReference: SpatialReference.WGS84, rings: [ring] }),
      height: osmBuildingHeight(element.tags?.height, element.tags?.["building:levels"]),
    });
  }
  return buildings;
}

export async function queryOsmBuildings(extent: Extent, limit: number, signal: AbortSignal) {
  const bounds = project(extent, SpatialReference.WGS84) as Extent | null;
  if (bounds == null || bounds.xmin < -180 || bounds.xmax > 180 || bounds.xmin >= bounds.xmax || bounds.ymin >= bounds.ymax) {
    throw new Error("Choose a selection within a single world wrap to download OpenStreetMap buildings.");
  }
  const lat = (bounds.ymin + bounds.ymax) / 2;
  if (bounds.height * 111320 > maxSourceMeters || bounds.width * 111320 * Math.cos(lat * Math.PI / 180) > maxSourceMeters) {
    throw new Error("Select an area under 1.5 km across to download OpenStreetMap buildings.");
  }

  // Use the live OSM replica in the US and Canada and Overpass elsewhere.
  if (bounds.xmin >= -172 && bounds.xmax <= -49 && bounds.ymin >= 25 && bounds.ymax <= 83) {
    const layer = new FeatureLayer({ url: northAmericaBuildings });
    try {
      await layer.load({ signal });
      const query = layer.createQuery();
      query.geometry = bounds;
      query.spatialRelationship = "intersects";
      query.where = "building <> 'no'";
      query.returnGeometry = true;
      query.outSpatialReference = SpatialReference.WGS84;
      query.outFields = ["osm_id", "height", "building_levels"];
      query.num = limit + 1;
      const result = await layer.queryFeatures(query, { signal });
      return result.features.flatMap((feature): OsmBuilding[] => feature.geometry?.type === "polygon" ? [{
        id: String(feature.attributes.osm_id ?? feature.getObjectId()),
        footprint: feature.geometry as Polygon,
        height: osmBuildingHeight(feature.attributes.height, feature.attributes.building_levels),
      }] : []);
    } finally {
      layer.destroy();
    }
  }

  const bbox = [bounds.ymin, bounds.xmin, bounds.ymax, bounds.xmax].map(value => value.toFixed(7)).join(",");
  const maxResults = limit * 2 + 1;
  const query = `[out:json][timeout:18];(way["building"]["building"!="no"](${bbox});relation["type"="multipolygon"]["building"]["building"!="no"](${bbox}););out geom ${maxResults};`;
  const response = await fetch(`${overpassEndpoint(bounds)}?${new URLSearchParams({ data: query })}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  }).catch(() => {
    signal.throwIfAborted();
    throw new Error("OpenStreetMap building data is temporarily unavailable. Retry this selection.");
  });
  if (!response.ok) throw new Error("OpenStreetMap building data is temporarily unavailable. Retry this selection.");
  const data = await response.json() as { elements?: OsmElement[]; remark?: string };
  if (!data.elements || data.remark) throw new Error("OpenStreetMap returned an incomplete response. Retry this selection.");
  const buildings = readOverpassBuildings(data.elements);
  if (data.elements.length >= maxResults || buildings.length > limit) {
    throw new Error(`Select a smaller area with at most ${limit} OpenStreetMap buildings.`);
  }
  return buildings;
}
