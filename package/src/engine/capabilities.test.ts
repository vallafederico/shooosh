import { expect, test } from "bun:test"
import { probeRenderer } from "./capabilities"

test("probeRenderer returns null in a headless bun process", async () => {
  expect(await probeRenderer()).toBeNull()
})

test("forcing webgpu without navigator.gpu returns null", async () => {
  expect(await probeRenderer({ backend: "webgpu" })).toBeNull()
})
