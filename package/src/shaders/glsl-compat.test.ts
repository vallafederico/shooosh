import { expect, test } from "bun:test"
import { convertWgslFragmentToGlsl } from "./wgsl-compat"
import { convertGlslFragmentToWgsl } from "./glsl-compat"

const WGSL = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let color = vec3f(vUv.x, vUv.y, 0.5 + 0.5 * sin(t));
  return vec4f(color, 1.0);
}
`

const GLSL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;

void main() {
  float t = uUni[0].x;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  outColor = vec4(vUv, 0.5 + 0.5 * sin(t + r + a), 1.0);
}
`

test("converts a GLSL 300 es fragment to WGSL fsMain", () => {
  const wgsl = convertGlslFragmentToWgsl(GLSL)
  expect(wgsl).toContain("fn fsMain() -> vec4f")
  expect(wgsl).toContain("uUni.values0.x")
  expect(wgsl).toContain("atan2(")
  expect(wgsl).toContain("return vec4f")
  expect(wgsl).not.toContain("#version")
  expect(wgsl).not.toContain("void main")
  expect(wgsl).not.toContain("outColor")
})

test("is idempotent for already-WGSL fsMain", () => {
  const wgsl = convertGlslFragmentToWgsl(WGSL)
  expect(wgsl).toContain("fn fsMain")
  expect(wgsl).toContain("uUni.values0.x")
})

test("throws when main is missing", () => {
  expect(() => convertGlslFragmentToWgsl("float x = 1.0;")).toThrow(
    /Unable to locate void main/,
  )
})

test("round-trips a WGSL fragment through GLSL and back", () => {
  const glsl = convertWgslFragmentToGlsl(WGSL, { includeUv: true })
  const back = convertGlslFragmentToWgsl(glsl)
  expect(back).toContain("fn fsMain() -> vec4f")
  expect(back).toContain("uUni.values0.x")
  expect(back).toContain("vUv")
  expect(back).toContain("vec4f")
  expect(back).not.toContain("uUni[0]")
})

test("converts texture(...) calls to textureSample(..., uSampler, ...)", () => {
  const wgsl = convertGlslFragmentToWgsl(`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
uniform sampler2D uTexture;
out vec4 outColor;

void main() {
  outColor = texture(uTexture, fitUv(vUv));
}
`)
  expect(wgsl).toContain("textureSample(uTexture, uSampler, fitUv(vUv))")
  expect(wgsl).not.toContain("sampler2D")
  expect(wgsl).not.toMatch(/(?<!textureSample\b.*)\btexture\(/)
})

test("keeps top-level const declarations const in WGSL", () => {
  const wgsl = convertGlslFragmentToWgsl(`#version 300 es
precision highp float;
uniform vec4 uUni[4];
out vec4 outColor;

const float PI = 3.14159;

void main() {
  outColor = vec4(sin(PI * uUni[0].x));
}
`)
  expect(wgsl).toContain("const PI: f32 = 3.14159;")
  expect(wgsl).not.toContain("var PI")
})

test("round-trips a textured WGSL fragment through GLSL and back", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  return textureSample(uTexture, uSampler, vUv);
}`,
    { includeUv: true },
  )
  const back = convertGlslFragmentToWgsl(glsl)
  expect(back).toContain("textureSample(uTexture, uSampler,")
  expect(back).not.toContain("sampler2D")
})

test("converts helper function signatures", () => {
  const wgsl = convertGlslFragmentToWgsl(`#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;

float twice(float x) {
  return x * 2.0;
}

void main() {
  float t = twice(uUni[0].x);
  outColor = vec4(vec3(t), 1.0);
}
`)
  expect(wgsl).toContain("fn twice(x: f32) -> f32")
  expect(wgsl).toContain("fn fsMain() -> vec4f")
  expect(wgsl).toContain("twice(uUni.values0.x)")
})
