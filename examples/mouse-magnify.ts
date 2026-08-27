/**
 * Custom post magnify — aiuis mouse-distortion shape.
 *
 * When: pointer-driven zoom / warp over the scene texture.
 * Backend: WebGL2 only. Force `{ backend: "webgl2" }` if you need this today.
 *
 * applyEffect is NOT fsMain. Injected: uTexture, uResolution, uTime, uDelta, uUni[4].
 * Skip updateEffect once the lerp has snapped so the 250ms settle loop can idle.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post
 */

import { createMouseMonad, createScene, effects } from "shooosh"

const screenFrag = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  let bands = sin((vUv.x * 8.0 + vUv.y * 6.0) - t)
  return vec4f(mix(vec3f(0.05), vec3f(0.85, 1.0, 0.24), bands * 0.5 + 0.5), 1.0)
}
`

const magnify = `
vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  vec2 mouse = uni[0].xy;
  float radius = uni[0].z;
  float strength = uni[0].w;
  vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
  float mask = smoothstep(radius, radius * 0.55, length((uv - mouse) * aspect));
  vec2 zoomed = mouse + (uv - mouse) * (1.0 - mask * strength);
  return texture(uTexture, zoomed);
}
`

export async function mount(canvas: HTMLCanvasElement) {
  const mouse = createMouseMonad({ element: window, easing: 0.12 })
  let lastX = -1
  let lastY = -1

  const scene = createScene(canvas, {
    backend: "webgl2",
    dpr: { max: 1.5 },
    post: [
      effects.custom({
        id: "magnify",
        fragmentShader: magnify,
        uni: { value1: 0.5, value2: 0.5, value3: 0.22, value4: 0.35 },
      }),
    ],
    screen: {
      shaders: { fragment: screenFrag },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
        const state = mouse.update()
        if (state.x === lastX && state.y === lastY) return
        lastX = state.x
        lastY = state.y
        scene.getPostProcessor()?.updateEffect("magnify", {
          uni: {
            value1: state.x * 0.5 + 0.5,
            value2: state.y * 0.5 + 0.5,
            value3: 0.22,
            value4: 0.35,
          },
        })
      },
    },
  })

  await scene.getInitPromise()

  return () => {
    mouse.destroy()
    scene.destroy()
  }
}
