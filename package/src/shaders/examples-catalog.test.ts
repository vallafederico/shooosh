import { expect, test } from "bun:test"
import { examples } from "../../../examples/catalog"
import { convertWgslFragmentToGlsl } from "./wgsl-compat"

for (const example of examples) {
  test(`${example.id} is convertible WGSL fsMain`, () => {
    expect(example.fragment).toContain("fn fsMain")
    const glsl = convertWgslFragmentToGlsl(example.fragment, { includeUv: true })
    expect(glsl.startsWith("#version 300 es")).toBe(true)
    expect(glsl).toContain("void main()")
    expect(glsl).toContain("outColor")
    expect(glsl).not.toContain("atan2")
    expect(glsl).not.toMatch(/vec2 \w+ = mix\(ink/)
    expect(glsl).not.toMatch(/float \w+ = mix\(ink/)
    expect(glsl).not.toMatch(/float g = mix/)
    expect(glsl).not.toMatch(/float color = mix\(ink/)
    expect(glsl).not.toMatch(/vec2 d = sd/)
    expect(glsl).not.toMatch(/float i = floor\(p\)/)
    expect(glsl).not.toMatch(/float f = fract\(p\)/)
  })
}
