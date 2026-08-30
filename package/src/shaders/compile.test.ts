import { expect, test } from "bun:test"
import { compileProgramAsync } from "./compile"
import { compileGpuPipeline } from "./gpu-compile"
import type { GpuDevice } from "../engine/gpu-api"

function makeMockGl() {
  let programsCreated = 0
  let programsDeleted = 0
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    LINK_STATUS: 3,
    createProgram: () => {
      programsCreated += 1
      return { id: programsCreated }
    },
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    attachShader: () => {},
    linkProgram: () => {},
    getExtension: () => null,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    getShaderInfoLog: () => "",
    deleteShader: () => {},
    deleteProgram: () => {
      programsDeleted += 1
    },
  }
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    created: () => programsCreated,
    deleted: () => programsDeleted,
  }
}

test("compileProgramAsync shares one program per vs+fs and refcounts destroy", () => {
  const { gl, created, deleted } = makeMockGl()
  const vs = "void main() { gl_Position = vec4(0.0); }"
  const fs = "void main() {}"
  const a = compileProgramAsync(gl, vs, fs, "a")
  const b = compileProgramAsync(gl, vs, fs, "b")
  expect(created()).toBe(1)
  expect(a.poll()).toBe(b.poll())

  a.destroy()
  expect(deleted()).toBe(0)
  expect(b.poll()).not.toBe(null)
  expect(a.poll()).toBe(null)
  b.destroy()
  expect(deleted()).toBe(1)

  // Last release evicted the entry — a new request compiles again.
  const c = compileProgramAsync(gl, vs, fs, "c")
  expect(created()).toBe(2)
  c.destroy()
})

test("compileProgramAsync keys the cache per context", () => {
  const first = makeMockGl()
  const second = makeMockGl()
  const vs = "void main() {}"
  const fs = "void main() {}"
  compileProgramAsync(first.gl, vs, fs)
  compileProgramAsync(second.gl, vs, fs)
  expect(first.created()).toBe(1)
  expect(second.created()).toBe(1)
})

function makeMockDevice() {
  let pipelinesCreated = 0
  const device = {
    createShaderModule: () => ({
      getCompilationInfo: async () => ({ messages: [] }),
    }),
    createRenderPipeline: () => {
      pipelinesCreated += 1
      return { getBindGroupLayout: () => ({}) }
    },
    pushErrorScope: () => {},
    popErrorScope: async () => null,
  }
  return {
    device: device as unknown as GpuDevice,
    created: () => pipelinesCreated,
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("compileGpuPipeline shares one pipeline per code+format+options", async () => {
  const { device, created } = makeMockDevice()
  const code = "fn fsEntry() {}"
  const a = compileGpuPipeline(device, code, "rgba8unorm", "a")
  const b = compileGpuPipeline(device, code, "rgba8unorm", "b")
  const other = compileGpuPipeline(device, code, "bgra8unorm", "other")
  await tick()
  expect(created()).toBe(2)
  expect(a.poll()).toBe(b.poll())
  expect(other.poll()).not.toBe(a.poll())

  a.destroy()
  expect(a.poll()).toBe(null)
  expect(b.poll()).not.toBe(null)
  b.destroy()
  other.destroy()

  // Last release evicted the entry — a new request compiles again.
  const c = compileGpuPipeline(device, code, "rgba8unorm", "c")
  await tick()
  expect(created()).toBe(3)
  c.destroy()
})

test("compileGpuPipeline keys explicit layout objects by identity", async () => {
  const { device, created } = makeMockDevice()
  const code = "fn fsEntry() {}"
  const layoutA = Object.create(class Layout {}.prototype) as object
  const layoutB = Object.create(class Layout {}.prototype) as object
  const a = compileGpuPipeline(device, code, "rgba8unorm", "a", { layout: layoutA })
  const b = compileGpuPipeline(device, code, "rgba8unorm", "b", { layout: layoutB })
  const c = compileGpuPipeline(device, code, "rgba8unorm", "c", { layout: layoutA })
  await tick()
  expect(created()).toBe(2)
  expect(a.poll()).toBe(c.poll())
  expect(a.poll()).not.toBe(b.poll())
  a.destroy()
  b.destroy()
  c.destroy()
})
