import { expect, test } from "bun:test"
import { parseGlb } from "./glb-loader"

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

/** Build a minimal single-triangle GLB (positions + uint16 indices, packed). */
function buildTriangleGlb() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = new Uint16Array([0, 1, 2])
  const bin = new ArrayBuffer(positions.byteLength + indices.byteLength + 2)
  new Float32Array(bin, 0, positions.length).set(positions)
  new Uint16Array(bin, positions.byteLength, indices.length).set(indices)

  const json = {
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  }
  let jsonText = JSON.stringify(json)
  while (jsonText.length % 4 !== 0) jsonText += " "
  const jsonBytes = new TextEncoder().encode(jsonText)

  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, CHUNK_JSON, true)
  new Uint8Array(out, 20, jsonBytes.byteLength).set(jsonBytes)
  const binHeader = 20 + jsonBytes.byteLength
  view.setUint32(binHeader, bin.byteLength, true)
  view.setUint32(binHeader + 4, CHUNK_BIN, true)
  new Uint8Array(out, binHeader + 8, bin.byteLength).set(new Uint8Array(bin))
  return out
}

test("parseGlb reads a packed triangle into interleaved vertices", () => {
  const meshes = parseGlb(buildTriangleGlb())
  expect(meshes.length).toBe(1)
  const mesh = meshes[0]!
  expect(mesh.vertexStride).toBe(6)
  expect(mesh.vertices.length).toBe(3 * 6)
  // Positions land in the first three floats of each vertex.
  expect([...mesh.vertices.slice(0, 3)]).toEqual([0, 0, 0])
  expect([...mesh.vertices.slice(6, 9)]).toEqual([1, 0, 0])
  expect([...mesh.vertices.slice(12, 15)]).toEqual([0, 1, 0])
  expect(mesh.indices).toBeInstanceOf(Uint16Array)
  expect([...mesh.indices]).toEqual([0, 1, 2])
})

test("parseGlb results do not alias the source buffer", () => {
  const data = buildTriangleGlb()
  const meshes = parseGlb(data)
  const mesh = meshes[0]!
  const verticesBefore = [...mesh.vertices]
  const indicesBefore = [...mesh.indices]
  new Uint8Array(data).fill(0xff)
  expect([...mesh.vertices]).toEqual(verticesBefore)
  expect([...mesh.indices]).toEqual(indicesBefore)
})

test("parseGlb rejects a truncated file before reading the header", () => {
  expect(() => parseGlb(new ArrayBuffer(4))).toThrow("Invalid GLB: file too short")
  expect(() => parseGlb(new ArrayBuffer(0))).toThrow("Invalid GLB: file too short")
})

test("parseGlb rejects a bad magic number", () => {
  const data = new ArrayBuffer(16)
  new DataView(data).setUint32(0, 0xdeadbeef, true)
  expect(() => parseGlb(data)).toThrow("Invalid GLB: bad magic")
})
