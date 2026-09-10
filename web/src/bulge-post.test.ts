import { expect, test } from "bun:test";
import { bulgePointerY } from "./bulge-post";

test("single-pass bulge maps top and bottom pointer positions to each backend's UV origin", () => {
  expect(bulgePointerY(-1, "webgl2")).toBe(1);
  expect(bulgePointerY(-1, "webgpu")).toBe(0);
  expect(bulgePointerY(1, "webgl2")).toBe(0);
  expect(bulgePointerY(1, "webgpu")).toBe(1);
  expect(bulgePointerY(0, "webgl2")).toBe(0.5);
  expect(bulgePointerY(0, "webgpu")).toBe(0.5);
});
