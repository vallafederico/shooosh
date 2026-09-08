/**
 * Transparent refractive glass over an example-owned procedural backdrop.
 * Copy run(canvas), or reuse the WGSL material with your own backdrop sampler.
 * This is screen-space refraction, not capture of HTML behind the canvas.
 * No textures, post stack, dependencies or continuous time animation required.
 * value5/6 = pitch/yaw radians; value2/3 = pointer UV; value9 = aspect; value10 = reciprocal framebuffer pixel height (1 / height).
 */
import { createMouseMonad, createScene } from "shooosh"
import { createSpinner } from "shooosh/utility"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `
fn glassBox(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let q: vec2f = abs(p) - halfSize + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

fn glassBackdrop(p: vec2f) -> vec3f {
  let paper: vec3f = vec3f(0.91, 0.925, 0.88);
  let mint: vec3f = vec3f(0.62, 0.77, 0.67);
  var color: vec3f = mix(paper, mint, smoothstep(-0.55, 0.65, p.x + p.y * 0.4) * 0.45);
  let disc: f32 = 1.0 - smoothstep(0.232, 0.236, length(p - vec2f(-0.22, -0.055)));
  color = mix(color, vec3f(0.91, 0.25, 0.12), disc);
  let bar: f32 = 1.0 - smoothstep(-0.002, 0.002, glassBox(p - vec2f(0.28, 0.06), vec2f(0.115, 0.34), 0.012));
  color = mix(color, vec3f(0.14, 0.24, 0.70), bar);
  let hole: f32 = 1.0 - smoothstep(0.084, 0.087, length(p - vec2f(0.28, -0.015)));
  color = mix(color, paper, hole);
  let band: f32 = smoothstep(0.22, 0.225, p.y) * (1.0 - smoothstep(0.34, 0.345, p.y));
  let stripe: f32 = 1.0 - smoothstep(0.055, 0.12, abs(sin(p.x * 100.0)));
  color = mix(color, vec3f(0.12, 0.20, 0.16), stripe * band * 0.85);
  let rule: f32 = 1.0 - smoothstep(0.0008, 0.002, abs(p.y + 0.30));
  color = mix(color, vec3f(0.30, 0.38, 0.32), rule * 0.45);
  return color;
}

// Inverse rotations take the camera ray into the slab's local space.
fn glassLocal(p: vec3f) -> vec3f {
  let a: f32 = uUni.values1.x;
  let b: f32 = uUni.values1.y;
  let r: vec3f = vec3f(cos(b) * p.x - sin(b) * p.z, p.y, sin(b) * p.x + cos(b) * p.z);
  return vec3f(r.x, cos(a) * r.y + sin(a) * r.z, -sin(a) * r.y + cos(a) * r.z);
}
fn glassWorld(p: vec3f) -> vec3f {
  let a: f32 = uUni.values1.x;
  let b: f32 = uUni.values1.y;
  let r: vec3f = vec3f(p.x, cos(a) * p.y - sin(a) * p.z, sin(a) * p.y + cos(a) * p.z);
  return vec3f(cos(b) * r.x + sin(b) * r.z, r.y, -sin(b) * r.x + cos(b) * r.z);
}
fn glassSlab(p: vec3f) -> f32 {
  let d: vec2f = vec2f(glassBox(p.xy, vec2f(0.333, 0.213), 0.063), abs(p.z) - 0.018);
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - 0.012;
}

fn fsMain() -> vec4f {
  let aspect: f32 = max(uUni.values2.x, 0.25);
  let scale: f32 = min(aspect, 1.0);
  let p: vec2f = (vUv - vec2f(0.5)) * vec2f(aspect, 1.0) / scale;
  let mouse: vec2f = (vec2f(uUni.values0.y, uUni.values0.z) - vec2f(0.5)) * vec2f(aspect, 1.0) / scale;
  let aa: f32 = max(uUni.values2.y / scale, 0.0004);
  var color: vec3f = glassBackdrop(p);
  // Orthographic ray march through a thin, rounded solid: valid even edge-on.
  let origin: vec3f = glassLocal(vec3f(p - vec2f(0.0, 0.025), 1.0));
  let ray: vec3f = glassLocal(vec3f(0.0, 0.0, -1.0));
  var travel: f32 = 0.5;
  var hit: vec3f = origin + ray * travel;
  var distance: f32 = 1.0;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    hit = origin + ray * travel;
    distance = glassSlab(hit);
    if (distance < aa * 0.5 || travel > 1.5) { break; }
    travel = travel + distance;
  }
  if (travel > 1.5 || distance > aa) { return vec4f(color, 1.0); }
  let q: vec2f = hit.xy;
  let halfSize: vec2f = vec2f(0.345, 0.225);
  let radius: f32 = 0.075;
  let d: f32 = glassBox(q, halfSize, radius);
  let epsilon: f32 = 0.001;
  let gx: f32 = glassBox(q + vec2f(epsilon, 0.0), halfSize, radius) - glassBox(q - vec2f(epsilon, 0.0), halfSize, radius);
  let gy: f32 = glassBox(q + vec2f(0.0, epsilon), halfSize, radius) - glassBox(q - vec2f(0.0, epsilon), halfSize, radius);
  let normal: vec2f = normalize(vec2f(gx, gy) + vec2f(0.000001));
  let bevel: f32 = 1.0 - smoothstep(0.0, 0.047, -d);
  let surface: vec3f = normalize(vec3f(
    glassSlab(hit + vec3f(epsilon, 0.0, 0.0)) - glassSlab(hit - vec3f(epsilon, 0.0, 0.0)),
    glassSlab(hit + vec3f(0.0, epsilon, 0.0)) - glassSlab(hit - vec3f(0.0, epsilon, 0.0)),
    glassSlab(hit + vec3f(0.0, 0.0, epsilon)) - glassSlab(hit - vec3f(0.0, 0.0, epsilon))));
  let worldNormal: vec3f = glassWorld(surface);
  let edge: vec2f = glassWorld(vec3f(normal, 0.0)).xy;
  let offset: vec2f = edge * bevel * bevel * 0.062 + glassWorld(vec3f(q * 0.075, 0.0)).xy + worldNormal.xy * 0.035;
  let refracted: vec2f = p - offset;
  // Different channel offsets give a restrained chromatic edge, not an opaque fill.
  let red: vec3f = glassBackdrop(p - offset * 1.045);
  let green: vec3f = glassBackdrop(refracted);
  let blue: vec3f = glassBackdrop(p - offset * 0.955);
  var transmitted: vec3f = vec3f(red.r, green.g, blue.b);
  let soft: vec3f = (glassBackdrop(refracted + vec2f(0.0012, 0.0)) + glassBackdrop(refracted - vec2f(0.0012, 0.0))) * 0.5;
  transmitted = mix(transmitted, soft, 0.12);
  transmitted = mix(transmitted, vec3f(0.80, 0.94, 0.91), 0.035);

  let light: vec2f = normalize(vec2f(-0.65, -0.75) + mouse * 0.45);
  let facing: f32 = dot(edge, light);
  let reflection: f32 = pow(max(facing, 0.0), 5.0) * bevel * 0.45;
  let fresnel: f32 = bevel * bevel * 0.12 + pow(1.0 - abs(worldNormal.z), 3.0) * 0.3;
  transmitted = mix(transmitted, vec3f(1.0), reflection + fresnel);
  let innerRim: f32 = exp(-abs(d + 0.006) * 550.0);
  transmitted = transmitted + vec3f(0.95, 0.99, 1.0) * innerRim * (0.12 + max(facing, 0.0) * 0.22);
  let outerRim: f32 = 1.0 - smoothstep(0.0, aa * 1.8, abs(d));
  transmitted = mix(transmitted, vec3f(0.95, 0.99, 1.0), outerRim * 0.65);
  let glareDistance: f32 = (q.y + q.x * 0.30 + 0.12 - mouse.y * 0.015) * 32.0;
  let glare: f32 = exp(-glareDistance * glareDistance);
  transmitted = transmitted + vec3f(1.0) * glare * 0.055;
  color = transmitted;
  return vec4f(color, 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  const spinner = createSpinner({ element: canvas, inertia: !reducedMotion.matches })
  const previousTouchAction = canvas.style.touchAction
  const previousCursor = canvas.style.cursor
  canvas.style.touchAction = "none"
  canvas.style.cursor = "grab"
  const reset = () => spinner.reset()
  canvas.addEventListener("dblclick", reset)
  const mouse = createMouseMonad({ element: canvas, easing: 0.2 })
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 2 },
    onInitError: options.onInitError,
    screen: {
      shaders: { fragment },
      uni: { value2: 0.5, value3: 0.5, value9: 1, value10: 0.001 },
      onFrame(self, frame) {
        const rotation = spinner.update(frame.delta / 1000)
        const cursor = rotation.dragging ? "grabbing" : "grab"
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
        const pointer = mouse.update()
        self.setUni({
          value2: reducedMotion.matches ? 0.5 : pointer.x * 0.5 + 0.5,
          value3: reducedMotion.matches ? 0.5 : pointer.y * 0.5 + 0.5,
          value5: rotation.x,
          value6: rotation.y,
          value9: frame.canvas.width / Math.max(1, frame.canvas.height),
          value10: 1 / Math.max(1, frame.canvas.height),
        })
      },
    },
  })
  return fromScene(scene, () => {
    mouse.destroy()
    spinner.destroy()
    canvas.removeEventListener("dblclick", reset)
    canvas.style.touchAction = previousTouchAction
    canvas.style.cursor = previousCursor
  })
}

export const refractiveGlass: ExampleSpec = {
  id: "refractive-glass",
  label: "Refractive glass",
  copy: "Transparent rounded glass, bevel refraction and chromatic edges over a procedural backdrop. Drag to spin; release to coast. Double-click to reset. Procedural backdrop, no HTML capture.",
  pointer: true,
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
