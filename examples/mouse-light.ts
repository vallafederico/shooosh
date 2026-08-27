/**
 * Mouse light — spotlight + ripples from the pointer.
 *
 * value1 = seconds. value2 / value3 = pointer UV (0..1, top-origin).
 * Skip setUni when the pointer has not moved and time is unused — here time
 * always changes, so the loop stays hot on purpose.
 */

import type { ExampleSpec } from "./types"

export const mouseLight: ExampleSpec = {
  id: "mouse-light",
  label: "Mouse light",
  copy: "Pointer as value2/value3 (same space as vUv). Spotlight plus ripples from the cursor.",
  pointer: true,
  fragment: `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let mouse = vec2f(uUni.values0.y, uUni.values0.z);
  let p = vUv - mouse;
  let d = length(p);
  let spot = exp(-d * d * 16.0);
  let rip = sin(d * 36.0 - t * 5.0) * exp(-d * 4.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.12 + 0.2 * vUv.y);
  color = mix(color, acid, spot * 0.85 + rip * 0.25);
  return vec4f(color, 1.0);
}
`,
}
