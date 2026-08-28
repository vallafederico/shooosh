import { expect, test } from "bun:test"
import {
  applyTextureUv,
  resolveTextureUvTransform,
  textureFitToUni,
} from "./texture-loader"

test("cover scales the shorter axis when the target is wider", () => {
  const t = resolveTextureUvTransform(1, 2, "cover")
  expect(t.scaleX).toBe(1)
  expect(t.scaleY).toBeCloseTo(0.5)
  expect(t.offsetY).toBeCloseTo(0.25)
})

test("applyTextureUv matches scale*uv + offset", () => {
  const t = { scaleX: 0.5, scaleY: 1, offsetX: 0.25, offsetY: 0 }
  expect(applyTextureUv({ x: 0, y: 0 }, t)).toEqual({ x: 0.25, y: 0 })
  expect(applyTextureUv({ x: 1, y: 1 }, t)).toEqual({ x: 0.75, y: 1 })
})

test("textureFitToUni packs value5–8", () => {
  expect(
    textureFitToUni({ scaleX: 1, scaleY: 0.5, offsetX: 0, offsetY: 0.25 }),
  ).toEqual({ value5: 1, value6: 0.5, value7: 0, value8: 0.25 })
})
