/**
 * Custom mesh — loadGlb-shaped geometry via shape: { type: "custom" }.
 *
 * How to use with a real file:
 *   const [mesh] = await loadGlb("/models/thing.glb")
 *   createObject(null, { shape: { type: "custom", ...mesh }, shaders: { fragment } })
 *
 * This demo builds a small icosahedron in-memory (no binary asset in the repo).
 */

import { createObject, createScene } from "shooosh"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let n = normalize(vNormal);
  let light = normalize(vec3f(-0.2, 0.8, 0.5));
  let ndl = clamp(dot(n, light), 0.0, 1.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let color = mix(mix(ink, paper, 0.2), acid, ndl);
  return vec4f(color, 1.0);
}
`

/** Unit icosahedron: interleaved pos3 + nrm3 (stride 6). */
function makeIcosahedron(): {
  vertices: Float32Array
  indices: Uint16Array
  vertexStride: 6
} {
  const t = (1 + Math.sqrt(5)) / 2
  const raw: Array<[number, number, number]> = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ]
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ]

  const vertices = new Float32Array(raw.length * 6)
  for (let i = 0; i < raw.length; i++) {
    const [x, y, z] = raw[i]!
    const len = Math.hypot(x, y, z) || 1
    const nx = x / len
    const ny = y / len
    const nz = z / len
    vertices[i * 6] = nx
    vertices[i * 6 + 1] = ny
    vertices[i * 6 + 2] = nz
    vertices[i * 6 + 3] = nx
    vertices[i * 6 + 4] = ny
    vertices[i * 6 + 5] = nz
  }

  const indices = new Uint16Array(faces.length * 3)
  let o = 0
  for (const f of faces) {
    indices[o++] = f[0]!
    indices[o++] = f[1]!
    indices[o++] = f[2]!
  }

  return { vertices, indices, vertexStride: 6 }
}

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let object: ReturnType<typeof createObject> | null = null
  const mesh = makeIcosahedron()

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    object = createObject(null, {
      shape: { type: "custom", ...mesh },
      placement: { centerX: 0, centerY: 0, scale: 1.5 },
      shaders: { fragment },
      onFrame(self, frame) {
        const t = frame.now * 0.001
        self.setTransform({
          rotationY: t * 0.85,
          rotationZ: t * 0.25,
        })
      },
    })
    return engine.backend
  })

  return {
    destroy() {
      object?.destroy()
      object = null
      scene.destroy()
    },
    ready,
  }
}

export const objectMesh: ExampleSpec = {
  id: "object-mesh",
  label: "Custom mesh",
  copy: "createObject shape: { type: \"custom\" } — same packing as loadGlb meshes.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
