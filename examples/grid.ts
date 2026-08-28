/**
 * Grid — graph-paper lines in vUv. Common page texture / overlay.
 *
 * How to use:
 *   import { createScene } from "shooosh"
 *   createScene(canvas, {
 *     screen: {
 *       shaders: { fragment },
 *       onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *     },
 *   })
 *
 * value1 = seconds (drives a slow pulse on the major lines).
 */

import { createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let cells = 10.0;
  let p = vUv * cells;
  let fx = min(fract(p.x), 1.0 - fract(p.x));
  let fy = min(fract(p.y), 1.0 - fract(p.y));
  let fine = 1.0 - smoothstep(0.0, 0.035, min(fx, fy));
  let majorP = vUv * 2.0;
  let mx = min(fract(majorP.x), 1.0 - fract(majorP.x));
  let my = min(fract(majorP.y), 1.0 - fract(majorP.y));
  let major = 1.0 - smoothstep(0.0, 0.012, min(mx, my));
  let pulse = 0.55 + 0.45 * sin(t * 1.4);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.1);
  color = mix(color, paper, fine * 0.22);
  color = mix(color, acid, major * pulse);
  return vec4f(color, 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: { fragment },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
  })
  return fromScene(scene)
}

export const grid: ExampleSpec = {
  id: "grid",
  label: "Grid",
  copy: "createScene + a graph-paper field in vUv. Fine cells, pulsing major lines.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
