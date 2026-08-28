---
name: shooosh-post
description: Add a shooosh post effect (bloom, grain, or custom applyEffect). Use for mouse-magnify, film grain, bloom, or any full-frame WebGL2 post that reads the scene texture.
---

# Post effects (WebGL2)

Read [docs/site-patterns.md](../../../docs/site-patterns.md). Post is **not implemented on WebGPU** yet — skip or force `{ backend: "webgl2" }` and say so.

## Presets

```js
createScene(canvas, {
  post: [
    effects.bloom({ intensity: 0.7 }),
    effects.noise({ amount: 0.08 }),
  ],
})
```

Or after init: `createPostProcessor()` + `addBloomEffect` / `addNoiseEffect` / `addFragmentEffect`.

## Custom `applyEffect`

This is **not** `fsMain`. The processor wraps your snippet:

```glsl
vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  vec2 mouse = uni[0].xy;
  float radius = uni[0].z;
  float strength = uni[0].w;
  vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
  float mask = smoothstep(radius, radius * 0.55, length((uv - mouse) * aspect));
  vec2 zoomed = mouse + (uv - mouse) * (1.0 - mask * strength);
  return texture(uTexture, zoomed);
}
```

Injected uniforms: `uTexture` (scene), `uResolution`, `uTime`, `uDelta`, `uUni[4]`. `uv` is top-origin.

Drive `uUni` from `onFrame` on the processor. **Return early** when the lerp has snapped so the settle loop can idle (aiuis `MouseDistortion`).

Failed custom compile disables that effect; it must not blank the page.
