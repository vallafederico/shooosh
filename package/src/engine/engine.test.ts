import { expect, test } from "bun:test"
import { createEngine } from "./engine"
import { GpuUnavailableError } from "./errors"

test("createEngine rejects when no GPU backend exists", async () => {
  await expect(createEngine({} as HTMLCanvasElement)).rejects.toBeInstanceOf(
    GpuUnavailableError,
  )
})

test("createEngine honors backend: webgpu when unavailable", async () => {
  await expect(
    createEngine({} as HTMLCanvasElement, { backend: "webgpu" }),
  ).rejects.toBeInstanceOf(GpuUnavailableError)
})

test("createEngine honors backend: webgl2 when unavailable", async () => {
  await expect(
    createEngine({} as HTMLCanvasElement, { backend: "webgl2" }),
  ).rejects.toBeInstanceOf(GpuUnavailableError)
})
