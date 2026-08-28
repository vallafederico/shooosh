import { expect, test } from "bun:test"
import {
  defaultTextureWgslFragment,
  defaultWgslFragment,
  isGlsl300,
  resolveWgslFragment,
  resolveWgslModule,
  wrapWgslFragment,
} from "./wgsl-wrap"

test("wraps fsMain and injects Uni, vsMain, and vUv", () => {
  const src = wrapWgslFragment(`fn fsMain() -> vec4f { return vec4f(vUv, 0.0, 1.0); }`)
  expect(src).toContain("struct Uni")
  expect(src).toContain("var<uniform> uUni: Uni")
  expect(src).toContain("fn vsMain")
  expect(src).toContain("var<private> vUv")
  expect(src).toContain("fn fsEntry")
  expect(src).toContain("fn fsMain")
})

test("strips @fragment from the user source", () => {
  const src = wrapWgslFragment(`@fragment
fn fsMain() -> vec4f { return vec4f(1.0); }
`)
  expect(src).not.toMatch(/@fragment\s+fn fsMain/)
  expect(src).toContain("@fragment\nfn fsEntry")
})

test("detects the GLSL 300 es escape hatch", () => {
  expect(isGlsl300("#version 300 es\nvoid main(){}")).toBe(true)
  expect(isGlsl300("fn fsMain() -> vec4f { return vec4f(1.0); }")).toBe(false)
})

test("resolveWgslFragment falls back when given GLSL", () => {
  const src = resolveWgslFragment({
    fragment: "#version 300 es\nvoid main(){}",
    debugUv: true,
  })
  expect(src).toContain("fn fsMain")
  expect(src).toContain("vUv")
  expect(src).not.toContain("#version 300 es")
})

test("default debug fragment mentions vUv", () => {
  expect(defaultWgslFragment(true)).toContain("vUv")
})

test("injects texture bindings only when the fragment samples uTexture", () => {
  const sampling = resolveWgslModule({
    fragment: `fn fsMain() -> vec4f { return textureSample(uTexture, uSampler, vUv); }`,
    hasTexture: true,
  })
  expect(sampling.usesTexture).toBe(true)
  expect(sampling.code).toContain("@binding(1) var uSampler: sampler")
  expect(sampling.code).toContain("@binding(2) var uTexture: texture_2d<f32>")
  expect(sampling.code).toContain("fn fitUv(uv: vec2f)")

  const ignoring = resolveWgslModule({
    fragment: `fn fsMain() -> vec4f { return vec4f(vUv, 0.0, 1.0); }`,
    hasTexture: true,
  })
  expect(ignoring.usesTexture).toBe(false)
  expect(ignoring.code).not.toContain("var uTexture")
  expect(ignoring.code).not.toContain("fn fitUv")
})

test("texture default fragment samples through the injected bindings", () => {
  expect(defaultTextureWgslFragment()).toContain("textureSample(uTexture, uSampler")
  const resolved = resolveWgslModule({ hasTexture: true })
  expect(resolved.usesTexture).toBe(true)
  expect(resolved.code).toContain("var uTexture")
})

test("no texture bindings without a texture", () => {
  const resolved = resolveWgslModule({ hasTexture: false })
  expect(resolved.usesTexture).toBe(false)
  expect(resolved.code).not.toContain("var uTexture")
})
