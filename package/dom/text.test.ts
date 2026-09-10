import { expect, test } from "bun:test"
import { glyphInkRect, validateFontAtlas } from "./text"

test("DOM MSDF placement preserves padding, bearings and baseline at CSS font size", () => {
  // A 64px baked glyph at 16px CSS size, with a negative left bearing.
  expect(glyphInkRect({ id: 106, x: 0, y: 0, width: 20, height: 66, xoffset: -5, yoffset: 6 },
    16, 64, 56, 100, 40)).toEqual({ left: 98.75, top: 27.5, right: 103.75, bottom: 44 })
})

test("font atlas validation rejects corrupt metrics, duplicate glyphs and out-of-bounds tiles", () => {
  const valid = { info: { size: 64 }, common: { scaleW: 128, scaleH: 128, base: 50 }, chars: [{ id: 65, x: 0, y: 0, width: 20, height: 40 }] };
  expect(validateFontAtlas(valid)).toBe(valid);
  for (const bad of [null, {}, { ...valid, info: { size: 0 } },
    { ...valid, chars: [valid.chars[0], valid.chars[0]] },
    { ...valid, chars: [{ ...valid.chars[0], x: 120 }] },
    { ...valid, distanceField: { distanceRange: NaN } }]) {
    expect(() => validateFontAtlas(bad)).toThrow();
  }
});
