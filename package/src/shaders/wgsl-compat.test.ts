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

test("throws when fsMain is missing", () => {
  expect(() => convertWgslFragmentToGlsl("let x = 1.0;")).toThrow(
    /Unable to locate fsMain/,
  )
})
