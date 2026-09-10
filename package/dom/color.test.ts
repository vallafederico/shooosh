import { describe, expect, test } from "bun:test"
import { parseCssColor } from "./color"

describe("parseCssColor", () => {
  test("rgb and hex", () => {
    expect(parseCssColor("transparent")).toEqual([0, 0, 0, 0])
    expect(parseCssColor("#171717")).toEqual([23 / 255, 23 / 255, 23 / 255, 1])
    expect(parseCssColor("rgb(23, 23, 23)")).toEqual([23 / 255, 23 / 255, 23 / 255, 1])
    expect(parseCssColor("rgb(255 255 255 / 0.5)")?.[3]).toBe(0.5)
  })
  test("unsupported syntax stays native", () => {
    expect(parseCssColor("color(srgb 1 0 0)")).toBeNull()
    expect(parseCssColor("lab(50% 0 0)")).toBeNull()
  })
})
