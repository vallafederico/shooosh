/**
 * SDF rings — signed distance to a circle, concentric pulses.
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
 * Icons / buttons / loader marks. 0.5-at-edge is the same encoding as shooosh/msdf.
 */

import { createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn sdCircle(p: vec2f, radius: f32) -> f32 {
  return length(p) - radius;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let d = sdCircle(p, 0.35);
  let rings = sin(d * 28.0 - t * 3.0);
  let edge = 1.0 - smoothstep(0.0, 0.02, abs(d));
  let field = 0.5 - d * 0.5;
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, clamp(field, 0.0, 1.0) * 0.25);
  color = mix(color, acid, smoothstep(0.35, 0.9, rings * 0.5 + 0.5) * 0.55);
  color = mix(color, acid, edge);
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

export const sdfRings: ExampleSpec = {
  id: "sdf-rings",
  label: "SDF rings",
  copy: "createScene + signed circle. Concentric pulses — same 0.5-at-edge idea as the MSDF atlases.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
