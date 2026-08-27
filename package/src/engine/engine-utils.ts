/**
 * Canvas clear color + DPR helpers. Shared by both engines.
 *
 * How to use: createEngine({ clearColor, dpr: { max: 1.5 } }).
 * Marketing pages cap DPR at 1.5–2. Match clearColor to the page paper
 * if the canvas is opaque.
 *
 * Docs: docs/site-patterns.md
 */

export type ClearColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function clampColorChannel(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function resolveClearColor(partial?: Partial<ClearColor>): ClearColor {
  return {
    r: partial?.r ?? 0,
    g: partial?.g ?? 0,
    b: partial?.b ?? 0,
    a: partial?.a ?? 0,
  };
}

export function applyCanvasBackdrop(canvas: HTMLCanvasElement, color: ClearColor) {
  canvas.style.backgroundColor =
    color.a > 0
      ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
      : "transparent";
}

export function getEffectiveDevicePixelRatio(max?: number) {
  const dpr = window.devicePixelRatio;
  const resolved = !Number.isFinite(dpr) || (dpr ?? 0) <= 0 ? 1 : (dpr as number);
  if (typeof max === "number" && max > 0) {
    return Math.min(resolved, max);
  }
  return resolved;
}
