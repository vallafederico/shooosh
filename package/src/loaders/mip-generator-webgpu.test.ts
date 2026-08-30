import { expect, test } from "bun:test"
import type { GpuDevice, GpuTexture } from "../engine/gpu-api"
import { generateWebGpuMipmaps, mipLevelCountFor } from "./mip-generator-webgpu"

function createMockDevice() {
  const calls = {
    pipelines: 0,
    passes: [] as Array<{ label?: string }>,
    bindGroups: 0,
    submits: 0,
  }
  const device = {
    queue: {
      writeBuffer() {},
      submit() {
        calls.submits += 1
      },
    },
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: () => {
      calls.pipelines += 1
      return { getBindGroupLayout: () => ({}) }
    },
    createBindGroup: () => {
      calls.bindGroups += 1
      return {}
    },
    createCommandEncoder: () => ({
      beginRenderPass: (descriptor: { label?: string }) => {
        calls.passes.push(descriptor)
        return {
          setPipeline() {},
          setBindGroup() {},
          draw() {},
          end() {},
        }
      },
      finish: () => ({}),
    }),
  } as unknown as GpuDevice
  return { device, calls }
}

function createMockTexture() {
  const views: Array<{ baseMipLevel?: number; mipLevelCount?: number }> = []
  const texture = {
    createView(descriptor?: { baseMipLevel?: number; mipLevelCount?: number }) {
      views.push(descriptor ?? {})
      return {}
    },
    destroy() {},
  } as unknown as GpuTexture
  return { texture, views }
}

test("mipLevelCountFor covers the full chain", () => {
  expect(mipLevelCountFor(256, 256)).toBe(9)
  expect(mipLevelCountFor(300, 200)).toBe(9)
  expect(mipLevelCountFor(1, 1)).toBe(1)
})

test("generates one pass per level below the top", () => {
  const { device, calls } = createMockDevice()
  const { texture, views } = createMockTexture()
  generateWebGpuMipmaps(device, texture, "rgba8unorm", 4)
  expect(calls.passes.length).toBe(3)
  expect(calls.bindGroups).toBe(3)
  expect(calls.submits).toBe(1)
  // Level 0 source view, then one single-level view per generated level.
  expect(views.map((v) => v.baseMipLevel)).toEqual([0, 1, 2, 3])
  expect(views.every((v) => v.mipLevelCount === 1)).toBe(true)
})

test("caches the pipeline per device and format", () => {
  const { device, calls } = createMockDevice()
  generateWebGpuMipmaps(device, createMockTexture().texture, "rgba8unorm", 3)
  generateWebGpuMipmaps(device, createMockTexture().texture, "rgba8unorm", 5)
  expect(calls.pipelines).toBe(1)
  generateWebGpuMipmaps(device, createMockTexture().texture, "rgba16float", 3)
  expect(calls.pipelines).toBe(2)
})

test("a single-level texture is a no-op", () => {
  const { device, calls } = createMockDevice()
  generateWebGpuMipmaps(device, createMockTexture().texture, "rgba8unorm", 1)
  expect(calls.passes.length).toBe(0)
  expect(calls.submits).toBe(0)
})
