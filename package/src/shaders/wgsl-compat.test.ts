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

test("translates let/var declarations with explicit type annotations", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  let t: f32 = uUni.values0.x;
  var c: vec3f = vec3f(t, t, t);
  return vec4f(c, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("float t = uUni[0].x;")
  expect(glsl).toContain("vec3 c = vec3(t, t, t);")
  expect(glsl).not.toContain("let ")
  expect(glsl).not.toContain(": f32")
})

test("keeps integer for-loop counters int", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  var acc = 0.0;
  for (var i = 0; i < 4; i++) {
    acc += f32(i) * 0.1;
  }
  return vec4f(acc, acc, acc, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("for (int i = 0; i < 4; i++)")
  expect(glsl).toContain("float acc = 0.0;")
  expect(glsl).toContain("float(i)")
  expect(glsl).not.toContain("float i = 0;")
})

test("declarations derived from an int counter stay int", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn fsMain() -> vec4f {
  var i = 3;
  let j = i + 1;
  return vec4f(f32(j), 0.0, 0.0, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("int i = 3;")
  expect(glsl).toContain("int j = i + 1;")
})

test("maps matNxN<f32> to GLSL matN", () => {
  const glsl = convertWgslFragmentToGlsl(
    `fn tilt(a: f32) -> mat2x2<f32> {
  return mat2x2<f32>(cos(a), -sin(a), sin(a), cos(a));
}

fn fsMain() -> vec4f {
  let m = tilt(uUni.values0.x);
  let big: mat4x4<f32> = mat4x4<f32>();
  let p = m * vUv;
  return vec4f(p, big[0].x, 1.0);
}`,
    { includeUv: true },
  )
  expect(glsl).toContain("mat2 tilt(float a)")
  expect(glsl).toContain("mat2 m = tilt(")
  expect(glsl).toContain("mat4 big = mat4();")
  expect(glsl).toContain("vec2 p = m * vUv;")
  expect(glsl).not.toContain("mat2x2")
  expect(glsl).not.toContain("mat4x4")
  expect(glsl).not.toContain("<float>")
})

test("memoized conversion still honors options", () => {
  const src = `fn fsMain() -> vec4f {
  return vec4f(vUv, 0.0, 1.0);
}`
  const withUv = convertWgslFragmentToGlsl(src, { includeUv: true })
  const withoutUv = convertWgslFragmentToGlsl(src, {})
  expect(withUv).toContain("in vec2 vUv;")
  expect(withoutUv).not.toContain("in vec2 vUv;")
  // Repeat calls return the cached result unchanged.
  expect(convertWgslFragmentToGlsl(src, { includeUv: true })).toBe(withUv)
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
