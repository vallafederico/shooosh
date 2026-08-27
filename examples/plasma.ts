/**
 * Plasma — overlapping sines in polar space.
 *
 * Classic hero background. value1 = seconds.
 */

import type { ExampleSpec } from "./types"

export const plasma: ExampleSpec = {
  id: "plasma",
  label: "Plasma",
  copy: "Overlapping sines in polar UV. The fullscreen fragment most marketing heroes start from.",
  fragment: `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let a = atan2(p.y, p.x);
  let bands = sin(r * 14.0 - t * 1.6 + sin(a * 3.0 + t));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.08 + 0.12 * r);
  color = mix(color, acid, smoothstep(0.2, 0.85, bands * 0.5 + 0.5) * (1.0 - r * 0.45));
  return vec4f(color, 1.0);
}
`,
}
