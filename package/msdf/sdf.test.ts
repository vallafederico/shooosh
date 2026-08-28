import { expect, test } from "bun:test";
import { alphaToSdf } from "./sdf";

function emptyRgba(width: number, height: number) {
  return new Uint8Array(width * height * 4);
}

function filledRgba(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = 255;
  return data;
}

function boxRgba(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const data = new Uint8Array(width * height * 4);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

test("empty alpha is outside (below 0.5)", () => {
  const sdf = alphaToSdf(emptyRgba(8, 8), 8, 8, 4);
  expect(sdf.length).toBe(64);
  expect(Math.max(...sdf)).toBeLessThan(128);
});

test("fully opaque alpha is inside (above 0.5)", () => {
  const sdf = alphaToSdf(filledRgba(8, 8), 8, 8, 4);
  expect(Math.min(...sdf)).toBeGreaterThan(128);
});

test("a centered box has a bright interior, dark exterior, and ~0.5 edge", () => {
  const w = 32;
  const h = 32;
  const sdf = alphaToSdf(boxRgba(w, h, 8, 8, 24, 24), w, h, 4);
  const at = (x: number, y: number) => sdf[y * w + x]!;

  expect(at(16, 16)).toBeGreaterThan(200);
  expect(at(0, 0)).toBeLessThan(20);
  expect(at(8, 16)).toBeGreaterThan(100);
  expect(at(8, 16)).toBeLessThan(160);
});

test("larger spread widens the band around the edge", () => {
  const w = 32;
  const data = boxRgba(w, w, 8, 8, 24, 24);
  const tight = alphaToSdf(data, w, w, 2);
  const wide = alphaToSdf(data, w, w, 8);
  // a few pixels outside the box: wider spread stays closer to mid-grey
  const tightOut = tight[6 * w + 16]!;
  const wideOut = wide[6 * w + 16]!;
  expect(wideOut).toBeGreaterThan(tightOut);
});
