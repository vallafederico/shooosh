import { expect, test } from "bun:test"
import { bloomEffectWgsl, grainEffectWgsl } from "../../../examples/post-shaders"
import { wrapWgslPostEffect } from "./processor-webgpu"

test("post wrap injects the Uni struct, texture bindings, and the entry points", () => {
  const src = wrapWgslPostEffect(
    `fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f { return color; }`,
  )
  expect(src).toContain("struct Uni")
  expect(src).toContain("var<uniform> uUni: Uni")
  expect(src).toContain("var uSampler: sampler")
  expect(src).toContain("var uTexture: texture_2d<f32>")
  expect(src).toContain("fn vsMain")
  expect(src).toContain("fn fsEntry")
  expect(src).toContain("applyEffect(color, in.uv, uUni.resolution, uUni)")
})

test("post wrap strips @fragment from the effect source", () => {
  const src = wrapWgslPostEffect(`@fragment
fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f { return color; }
`)
  expect(src).not.toMatch(/@fragment\s+fn applyEffect/)
  expect(src).toContain("@fragment\nfn fsEntry")
})

for (const [name, source] of Object.entries({ bloomEffectWgsl, grainEffectWgsl })) {
  test(`${name} matches the WGSL applyEffect contract`, () => {
    expect(source).toContain("fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni)")
    expect(source).not.toContain("#version")
    expect(wrapWgslPostEffect(source)).toContain("fn fsEntry")
  })
}
