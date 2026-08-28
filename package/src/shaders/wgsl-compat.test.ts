import { expect, test } from "bun:test"
import { convertWgslFragmentToGlsl } from "./wgsl-compat"

const WGSL = `
@fragment
fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let color = vec3f(vUv.x, vUv.y, 0.5 + 0.5 * sin(t));
  return vec4f(color, 1.0);
}
`

test("converts a simple WGSL fragment to GLSL 300 es", () => {
  const glsl = convertWgslFragmentToGlsl(WGSL, { includeUv: true })
  expect(glsl.startsWith("#version 300 es")).toBe(true)
  expect(glsl).toContain("in vec2 vUv")
  expect(glsl).toContain("uniform vec4 uUni[4]")
  expect(glsl).toContain("void main()")
  expect(glsl).toContain("outColor =")
  expect(glsl).toContain("uUni[0]")
  expect(glsl).not.toContain("fn fsMain")
})

test("maps atan2(y, x) to GLSL atan(y, x)", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  let a = atan2(vUv.y, vUv.x);
  return vec4f(a, 0.0, 0.0, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("atan(")
  expect(glsl).not.toContain("atan2")
})

test("maps textureSample(tex, sampler, uv) to texture(tex, uv)", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  return textureSample(uTexture, uSampler, vUv);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("texture(uTexture, vUv)")
  expect(glsl).toContain("uniform sampler2D uTexture;")
  expect(glsl).not.toContain("textureSample")
})

test("injects fitUv when the fragment samples uTexture", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  return textureSample(uTexture, uSampler, fitUv(vUv));
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("vec2 fitUv(vec2 uv)")
  expect(glsl).toContain("uUni[1].xy")
  expect(glsl).toContain("fitUv(vUv)")
})

test("renames GLSL reserved identifier `sample`", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  let sample = textureSample(uTexture, uSampler, vUv).r;
  return vec4f(sample, sample, sample, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("float _sample =")
  expect(glsl).toContain("_sample, _sample, _sample")
  expect(glsl).not.toMatch(/(?<![_\w])sample(?![_\w])/)
})
