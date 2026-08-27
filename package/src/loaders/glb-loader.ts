/**
 * Loads a GLB file and returns only mesh geometry (positions + normals + optional UVs).
 * Ignores lights, cameras, materials, and other non-mesh data.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const GLB_CHUNK_JSON = 0x4e4f534a; // 'JSON'
const GLB_CHUNK_BIN = 0x004e4942; // 'BIN'

const COMPONENT_TYPE_FLOAT = 5126;
const COMPONENT_TYPE_UNSIGNED_SHORT = 5123;
const COMPONENT_TYPE_UNSIGNED_INT = 5125;

export type GlbMesh = {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexStride: 6 | 8;
};

type GltfJson = {
  buffers?: Array<{ byteLength: number }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
    }>;
  }>;
};

function parseGlbHeader(data: ArrayBuffer): {
  jsonLength: number;
  jsonOffset: number;
  binLength: number;
  binOffset: number;
} {
  const view = new DataView(data);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Invalid GLB: bad magic");
  }
  const totalLength = view.getUint32(8, true);
  if (data.byteLength < 12) {
    throw new Error("Invalid GLB: file too short");
  }
  let offset = 12;
  const chunk0Length = view.getUint32(offset, true);
  const chunk0Type = view.getUint32(offset + 4, true);
  offset += 8;
  if (chunk0Type !== GLB_CHUNK_JSON) {
    throw new Error("Invalid GLB: first chunk is not JSON");
  }
  const jsonOffset = offset;
  const jsonLength = chunk0Length;
  offset += chunk0Length;

  if (offset >= data.byteLength) {
    return { jsonLength, jsonOffset, binLength: 0, binOffset: 0 };
  }
  const chunk1Length = view.getUint32(offset, true);
  const chunk1Type = view.getUint32(offset + 4, true);
  offset += 8;
  const binOffset = chunk1Type === GLB_CHUNK_BIN ? offset : 0;
  const binLength = chunk1Type === GLB_CHUNK_BIN ? chunk1Length : 0;
  return { jsonLength, jsonOffset, binLength, binOffset };
}

function getAccessorData(
  data: ArrayBuffer,
  binStart: number,
  json: GltfJson,
  accessorIndex: number,
  componentType: number,
  componentCount: number,
): Float32Array | Uint16Array | Uint32Array {
  const acc = json.accessors?.[accessorIndex];
  if (!acc || acc.bufferView == null) {
    throw new Error("Missing accessor or bufferView");
  }
  const view = json.bufferViews?.[acc.bufferView];
  if (!view) {
    throw new Error("Missing bufferView");
  }
  const byteOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const bytesPerComponent = componentSize(componentType);
  const packedStride = bytesPerComponent * componentCount;
  const stride = view.byteStride ?? packedStride;
  const count = acc.count * componentCount;
  const start = binStart + byteOffset;

  // Fast path: data is tightly packed and properly aligned, so we can wrap the
  // underlying ArrayBuffer in a single typed-array view with zero per-element
  // copies via DataView (which would otherwise allocate/branch per component).
  const isPacked = stride === packedStride;
  const isAligned = start % bytesPerComponent === 0;

  if (componentType === COMPONENT_TYPE_FLOAT) {
    if (isPacked && isAligned) {
      return new Float32Array(data, start, count).slice();
    }
    const dv = new DataView(data);
    const out = new Float32Array(count);
    for (let i = 0; i < acc.count; i++) {
      const src = start + i * stride;
      for (let c = 0; c < componentCount; c++) {
        out[i * componentCount + c] = dv.getFloat32(
          src + c * bytesPerComponent,
          true,
        );
      }
    }
    return out;
  }
  if (componentType === COMPONENT_TYPE_UNSIGNED_SHORT) {
    if (isPacked && isAligned) {
      return new Uint16Array(data, start, count).slice();
    }
    const dv = new DataView(data);
    const out = new Uint16Array(count);
    for (let i = 0; i < acc.count; i++) {
      const src = start + i * stride;
      for (let c = 0; c < componentCount; c++) {
        out[i * componentCount + c] = dv.getUint16(
          src + c * bytesPerComponent,
          true,
        );
      }
    }
    return out;
  }
  if (componentType === COMPONENT_TYPE_UNSIGNED_INT) {
    if (isPacked && isAligned) {
      return new Uint32Array(data, start, count).slice();
    }
    const dv = new DataView(data);
    const out = new Uint32Array(count);
    for (let i = 0; i < acc.count; i++) {
      const src = start + i * stride;
      for (let c = 0; c < componentCount; c++) {
        out[i * componentCount + c] = dv.getUint32(
          src + c * bytesPerComponent,
          true,
        );
      }
    }
    return out;
  }
  throw new Error(`Unsupported accessor componentType: ${componentType}`);
}

function componentSize(componentType: number): number {
  switch (componentType) {
    case 5120:
    case 5121:
      return 1;
    case 5122:
    case 5123:
      return 2;
    case 5125:
    case 5126:
      return 4;
    default:
      return 0;
  }
}

function readIndices(
  data: ArrayBuffer,
  binStart: number,
  json: GltfJson,
  accessorIndex: number,
): Uint16Array | Uint32Array {
  const acc = json.accessors?.[accessorIndex];
  if (!acc || acc.bufferView == null)
    throw new Error("Missing indices accessor");
  const view = json.bufferViews?.[acc.bufferView];
  if (!view) throw new Error("Missing bufferView for indices");
  const byteOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const componentType = acc.componentType;
  const bytesPerComponent = componentSize(componentType);
  const stride = view.byteStride ?? bytesPerComponent;
  const start = binStart + byteOffset;
  const count = acc.count;
  const isPacked = stride === bytesPerComponent;
  const isAligned = start % bytesPerComponent === 0;

  if (componentType === COMPONENT_TYPE_UNSIGNED_SHORT) {
    if (isPacked && isAligned) {
      return new Uint16Array(data, start, count).slice();
    }
    const dv = new DataView(data);
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = dv.getUint16(start + i * stride, true);
    }
    return out;
  }
  if (componentType === COMPONENT_TYPE_UNSIGNED_INT) {
    if (isPacked && isAligned) {
      return new Uint32Array(data, start, count).slice();
    }
    const dv = new DataView(data);
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = dv.getUint32(start + i * stride, true);
    }
    return out;
  }
  throw new Error(`Unsupported index componentType: ${componentType}`);
}

function computeFlatNormals(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
): Float32Array {
  const numVertices = positions.length / 3;
  const normals = new Float32Array(numVertices * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const ax = positions[i1 * 3 + 0] - positions[i0 * 3 + 0];
    const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const bx = positions[i2 * 3 + 0] - positions[i0 * 3 + 0];
    const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    normals[i0 * 3 + 0] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;
    normals[i1 * 3 + 0] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;
    normals[i2 * 3 + 0] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }
  for (let i = 0; i < numVertices; i++) {
    const len =
      Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
    normals[i * 3] /= len;
    normals[i * 3 + 1] /= len;
    normals[i * 3 + 2] /= len;
  }
  return normals;
}

/**
 * Load a GLB from URL and return an array of meshes.
 * Each mesh has interleaved vertices:
 * - [position.x,y,z, normal.x,y,z] (6 floats per vertex), or
 * - [position.x,y,z, normal.x,y,z, uv.u, uv.v] (8 floats per vertex)
 * and indices (Uint16Array or Uint32Array). Only mesh primitives with POSITION are included;
 * NORMAL is used when present, otherwise flat normals are computed. TEXCOORD_0 is used when present.
 */
export async function loadGlb(url: string): Promise<GlbMesh[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch GLB: ${res.status} ${res.statusText}`);
  }
  const data = await res.arrayBuffer();
  return parseGlb(data);
}

/**
 * Parse GLB binary data and return mesh geometries only (no lights, cameras, etc.).
 */
export function parseGlb(data: ArrayBuffer): GlbMesh[] {
  const { jsonLength, jsonOffset, binLength, binOffset } = parseGlbHeader(data);
  const jsonBytes = new Uint8Array(data, jsonOffset, jsonLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  const json: GltfJson = JSON.parse(jsonText);

  const binStart = binOffset;
  const meshes: GlbMesh[] = [];

  if (!json.meshes) {
    return meshes;
  }

  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) {
        continue;
      }
      const positionAcc = prim.attributes.POSITION;
      if (positionAcc == null) {
        continue;
      }
      const positions = getAccessorData(
        data,
        binStart,
        json,
        positionAcc,
        COMPONENT_TYPE_FLOAT,
        3,
      ) as Float32Array;

      let indices: Uint16Array | Uint32Array;
      if (prim.indices != null) {
        indices = readIndices(data, binStart, json, prim.indices);
      } else {
        indices = new Uint32Array(positions.length / 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
      }

      let normals: Float32Array;
      const normalAcc = prim.attributes.NORMAL;
      if (normalAcc != null) {
        normals = getAccessorData(
          data,
          binStart,
          json,
          normalAcc,
          COMPONENT_TYPE_FLOAT,
          3,
        ) as Float32Array;
      } else {
        normals = computeFlatNormals(positions, indices);
      }

      let uvs: Float32Array | null = null;
      const uvAcc = prim.attributes.TEXCOORD_0;
      if (uvAcc != null) {
        uvs = getAccessorData(
          data,
          binStart,
          json,
          uvAcc,
          COMPONENT_TYPE_FLOAT,
          2,
        ) as Float32Array;
      }

      const vertexCount = positions.length / 3;
      const vertexStride: 6 | 8 = uvs ? 8 : 6;
      const vertices = new Float32Array(vertexCount * vertexStride);
      for (let i = 0; i < vertexCount; i++) {
        vertices[i * vertexStride + 0] = positions[i * 3 + 0];
        vertices[i * vertexStride + 1] = positions[i * 3 + 1];
        vertices[i * vertexStride + 2] = positions[i * 3 + 2];
        vertices[i * vertexStride + 3] = normals[i * 3 + 0];
        vertices[i * vertexStride + 4] = normals[i * 3 + 1];
        vertices[i * vertexStride + 5] = normals[i * 3 + 2];
        if (uvs) {
          vertices[i * vertexStride + 6] = uvs[i * 2 + 0];
          vertices[i * vertexStride + 7] = uvs[i * 2 + 1];
        }
      }

      if (indices instanceof Uint32Array && indices.length <= 65535) {
        const u16 = new Uint16Array(indices.length);
        for (let i = 0; i < indices.length; i++) {
          u16[i] = indices[i];
        }
        indices = u16;
      }

      meshes.push({ vertices, indices, vertexStride });
    }
  }

  return meshes;
}
