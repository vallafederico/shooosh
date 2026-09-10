import { expect, test } from "bun:test";
import { mediaRasterSize } from "./media-resolution";

test("vector resolution follows size and density, with stable bounded buckets", () => {
  expect(mediaRasterSize("icon.svg", 10, 10, 2)).toBe(64);
  expect(mediaRasterSize("icon.svg?v=1", 11, 11, 2)).toBe(64);
  expect(mediaRasterSize("icon.svg", 100, 100, 2)).toBe(512);
  expect(mediaRasterSize("icon.svg", 10000, 10000, 3)).toBe(4096);
  expect(mediaRasterSize("photo.png", 100, 100, 2)).toBe(0);
});
