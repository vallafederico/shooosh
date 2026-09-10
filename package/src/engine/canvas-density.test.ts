import { expect, test } from "bun:test";
import { computeCanvasSize, getEffectiveDevicePixelRatio } from "./engine-utils";

test("canvas density follows browser zoom, supersampling and explicit caps", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  const environment = { devicePixelRatio: 2 };
  Object.defineProperty(globalThis, "window", { configurable: true, value: environment });
  try {
    expect(getEffectiveDevicePixelRatio()).toBe(2);
    expect(getEffectiveDevicePixelRatio(undefined, 2)).toBe(4);
    environment.devicePixelRatio = 3;
    expect(getEffectiveDevicePixelRatio(undefined, 2)).toBe(6);
    expect(getEffectiveDevicePixelRatio(4, 2)).toBe(4);
    expect(getEffectiveDevicePixelRatio(undefined, NaN)).toBe(3);
    const canvas = { getBoundingClientRect: () => ({ width: 2000, height: 1000 }) } as HTMLCanvasElement;
    expect(computeCanvasSize(canvas, undefined, 2, 8192)).toEqual({ ratio: 6, width: 8192, height: 4096 });
  } finally {
    if (old) Object.defineProperty(globalThis, "window", old);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
