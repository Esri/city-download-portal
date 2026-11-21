import Mesh from "@arcgis/core/geometry/Mesh.js";
import MeshComponent from "@arcgis/core/geometry/support/MeshComponent.js";
import MeshVertexAttributes, { type MeshVertexAttributesProperties } from "@arcgis/core/geometry/support/MeshVertexAttributes.js";
import { signedDistance, type ClipPlane, type ExportFootprint } from "./hexagon-footprint";

type Edge = [start: number, end: number];

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function clipMeshToFootprint(mesh: Mesh, footprint: ExportFootprint, terrain = false, signal?: AbortSignal) {
  const { planes, tolerance } = footprint;
  const attributes = mesh.vertexAttributes;
  const position = Array.from(attributes.position);
  const buffers = [
    { key: "position", values: position, size: 3 },
    { key: "uv", values: Array.from(terrain ? [] : attributes.uv ?? []), size: 2 },
    { key: "normal", values: Array.from(terrain ? [] : attributes.normal ?? []), size: 3 },
    { key: "tangent", values: Array.from(terrain ? [] : attributes.tangent ?? []), size: 4 },
    { key: "color", values: Array.from(terrain ? [] : attributes.color ?? []), size: 4 },
  ] as const;
  const activeBuffers = buffers.filter(buffer => buffer.values.length > 0);
  const intersections = planes.map(() => new Map<string, number>());
  const vertexCount = position.length / 3;

  function distance(plane: ClipPlane, index: number) {
    return signedDistance(plane, position[index * 3], position[index * 3 + 1]);
  }

  function intersect(a: number, b: number, da: number, db: number, plane: number) {
    if (Math.abs(da) <= tolerance / 8) return a;
    if (Math.abs(db) <= tolerance / 8) return b;
    const key = edgeKey(a, b);
    const cache = intersections[plane];
    const previous = cache.get(key);
    if (previous !== undefined) return previous;

    const index = position.length / 3;
    const ratio = da / (da - db);
    for (const { values, size } of activeBuffers) {
      for (let axis = 0; axis < size; axis++) {
        const start = values[a * size + axis];
        values.push(start + ratio * (values[b * size + axis] - start));
      }
    }
    cache.set(key, index);
    return index;
  }

  function clipPolygon(polygon: number[], plane: ClipPlane, planeIndex: number) {
    const clipped: number[] = [];
    let a = polygon[polygon.length - 1];
    let da = distance(plane, a);
    for (const b of polygon) {
      const db = distance(plane, b);
      if ((da >= 0) !== (db >= 0)) clipped.push(intersect(a, b, da, db, planeIndex));
      if (db >= 0) clipped.push(b);
      a = b;
      da = db;
    }
    return clipped.filter((index, offset) => index !== clipped[(offset + clipped.length - 1) % clipped.length]);
  }

  const packedVertices: number[] = [];
  const outputIndex = new Map<number, number>();
  const vertexBuckets = new Map<string, number[]>();
  function pack(index: number) {
    const previous = outputIndex.get(index);
    if (previous !== undefined) return previous;

    let output = packedVertices.length;
    if (terrain) {
      const [x, y, z] = position.slice(index * 3, index * 3 + 3);
      const column = Math.floor(x / tolerance);
      const row = Math.floor(y / tolerance);
      let match: number | undefined;
      for (let dx = -1; dx <= 1 && match === undefined; dx++) {
        for (let dy = -1; dy <= 1 && match === undefined; dy++) {
          const neighbors = vertexBuckets.get(`${column + dx}:${row + dy}`) ?? [];
          match = neighbors.find(candidate => {
            const offset = packedVertices[candidate] * 3;
            return Math.hypot(position[offset] - x, position[offset + 1] - y, position[offset + 2] - z) <= tolerance;
          });
        }
      }
      if (match !== undefined) {
        output = match;
      } else {
        const key = `${column}:${row}`;
        const bucket = vertexBuckets.get(key) ?? [];
        bucket.push(output);
        vertexBuckets.set(key, bucket);
      }
    }
    if (output === packedVertices.length) packedVertices.push(index);
    outputIndex.set(index, output);
    return output;
  }

  function triangleHasArea(a: number, b: number, c: number) {
    const abx = position[b * 3] - position[a * 3];
    const aby = position[b * 3 + 1] - position[a * 3 + 1];
    const abz = position[b * 3 + 2] - position[a * 3 + 2];
    const acx = position[c * 3] - position[a * 3];
    const acy = position[c * 3 + 1] - position[a * 3 + 1];
    const acz = position[c * 3 + 2] - position[a * 3 + 2];
    return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) > tolerance ** 2;
  }

  const components: MeshComponent[] = [];
  const sourceComponents = mesh.components ?? [new MeshComponent()];
  for (const component of sourceComponents) {
    const faces = component.faces ?? Uint32Array.from({ length: vertexCount }, (_, index) => index);
    const clippedFaces: number[] = [];
    for (let index = 0; index + 2 < faces.length; index += 3) {
      if (index % 3072 === 0) signal?.throwIfAborted();
      let polygon = [faces[index], faces[index + 1], faces[index + 2]];
      for (let side = 0; side < planes.length && polygon.length >= 3; side++) {
        polygon = clipPolygon(polygon, planes[side], side);
      }

      for (let i = 1; i + 1 < polygon.length; i++) {
        if (!triangleHasArea(polygon[0], polygon[i], polygon[i + 1])) continue;
        const a = pack(polygon[0]);
        const b = pack(polygon[i]);
        const c = pack(polygon[i + 1]);
        if (a !== b && b !== c && a !== c) clippedFaces.push(a, b, c);
      }
    }
    if (clippedFaces.length > 0) {
      const clipped = component.clone();
      clipped.faces = Uint32Array.from(clippedFaces);
      components.push(clipped);
    }
  }

  if (components.length === 0) return null;

  const packed: MeshVertexAttributesProperties = {};
  for (const { key, values, size } of activeBuffers) {
    const coordinates = new Float64Array(packedVertices.length * size);
    for (const [index, source] of packedVertices.entries()) {
      for (let axis = 0; axis < size; axis++) {
        coordinates[index * size + axis] = values[source * size + axis];
      }
      if (key === "normal" || key === "tangent") {
        const offset = index * size;
        const length = Math.hypot(coordinates[offset], coordinates[offset + 1], coordinates[offset + 2]);
        if (length > 0) {
          for (let axis = 0; axis < 3; axis++) coordinates[offset + axis] /= length;
        }
        if (key === "tangent") coordinates[offset + 3] = coordinates[offset + 3] < 0 ? -1 : 1;
      }
    }
    if (key === "position") packed.position = coordinates;
    else if (key === "color") packed.color = Uint8Array.from(coordinates, Math.round);
    else packed[key] = Float32Array.from(coordinates);
  }

  return new Mesh({
    spatialReference: mesh.spatialReference,
    vertexSpace: mesh.vertexSpace,
    components,
    vertexAttributes: new MeshVertexAttributes(packed),
  });
}

export function getMeshPerimeter(surface: Mesh, invalid: () => Error): Edge[] {
  const edges = new Map<string, Edge>();
  const paired = new Set<string>();
  const position = surface.vertexAttributes.position;
  for (const { faces } of surface.components ?? []) {
    if (!faces) throw invalid();
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i];
      const b = faces[i + 1];
      const c = faces[i + 2];
      const winding = (position[b * 3] - position[a * 3]) * (position[c * 3 + 1] - position[a * 3 + 1])
        - (position[b * 3 + 1] - position[a * 3 + 1]) * (position[c * 3] - position[a * 3]);
      if (winding <= 0) throw invalid();

      const triangle: Edge[] = [[a, b], [b, c], [c, a]];
      for (const [start, end] of triangle) {
        const key = edgeKey(start, end);
        const previous = edges.get(key);
        if (paired.has(key) || previous?.[0] === start) throw invalid();
        if (previous) {
          paired.add(key);
          edges.delete(key);
        } else {
          edges.set(key, [start, end]);
        }
      }
    }
  }

  return Array.from(edges.values());
}

export function getFootprintPerimeter(terrain: Mesh, footprint: ExportFootprint): Edge[] {
  const incomplete = () => new Error("Terrain does not cover the export boundary. Try a larger selection or another area.");
  const position = terrain.vertexAttributes.position;
  const perimeter = getMeshPerimeter(terrain, incomplete);
  const next = new Map(perimeter);
  if (next.size < footprint.corners.length || next.size !== perimeter.length) throw incomplete();

  const tolerance = footprint.tolerance * 4;
  for (const [a, b] of perimeter) {
    const onSameSide = footprint.planes.some(plane =>
      Math.abs(signedDistance(plane, position[a * 3], position[a * 3 + 1])) <= tolerance &&
      Math.abs(signedDistance(plane, position[b * 3], position[b * 3 + 1])) <= tolerance);
    if (!onSameSide) throw incomplete();
  }

  const [first] = perimeter[0];
  let current: number | undefined = first;
  let visited = 0;
  do {
    current = current === undefined ? undefined : next.get(current);
    visited++;
  } while (current !== first && current !== undefined && visited < perimeter.length);
  if (current !== first || visited !== perimeter.length) throw incomplete();

  for (const [x, y] of footprint.corners) {
    if (!perimeter.some(([vertex]) => Math.hypot(position[vertex * 3] - x, position[vertex * 3 + 1] - y) <= tolerance)) {
      throw incomplete();
    }
  }

  return perimeter;
}

export function extrudeMeshSurface(surface: Mesh, perimeter: Edge[], bottom: number, shellName: string) {
  const top = surface.vertexAttributes.position;
  const vertexCount = top.length / 3;
  const position = new Float64Array(top.length * 2);
  position.set(top);
  for (let i = 0; i < top.length; i += 3) {
    position.set([top[i], top[i + 1], bottom], top.length + i);
  }

  const topFaces = (surface.components ?? []).flatMap(component => Array.from(component.faces ?? []));
  const shellFaces: number[] = [];
  for (const [a, b] of perimeter) {
    shellFaces.push(a, a + vertexCount, b, b, a + vertexCount, b + vertexCount);
  }
  for (let i = 0; i < topFaces.length; i += 3) {
    shellFaces.push(topFaces[i + 2] + vertexCount, topFaces[i + 1] + vertexCount, topFaces[i] + vertexCount);
  }

  return new Mesh({
    spatialReference: surface.spatialReference,
    vertexSpace: surface.vertexSpace,
    vertexAttributes: new MeshVertexAttributes({ position }),
    components: [
      ...(surface.components ?? []),
      new MeshComponent({ name: shellName, faces: Uint32Array.from(shellFaces), shading: "flat", material: surface.components?.[0]?.material }),
    ],
  });
}
