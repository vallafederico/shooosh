---
name: shooosh-post
description: Add a shooosh post effect (custom applyEffect on both backends). Bloom/grain live as example GLSL + WGSL. Use for mouse-magnify, film grain, bloom, or any full-frame post that reads the scene texture.
---

# Post effects

Read [docs/site-patterns.md](../../../docs/site-patterns.md). Post runs on **WebGL2 and WebGPU**. Give each effect both `fragmentShader` (GLSL) and `fragmentShaderWgsl` (WGSL).

Looks (bloom, grain, FXAA, …) live in **examples**, not package presets. See [`examples/post-shaders.ts`](../../../examples/post-shaders.ts).

## Custom `applyEffect`

```js
import { createScene, createPostProcessor } from "shooosh"
import {
  bloomEffect, bloomEffectWgsl,
  fxaaEffect, fxaaEffectWgsl,
  grainEffect, grainEffectWgsl,
} from "./post-shaders"

const scene = createScene(canvas, {
  screen: { shaders: { fragment } },
})
await scene.getInitPromise()
const post = createPostProcessor()
post.addFragmentEffect({
  fragmentShader: bloomEffect,
  fragmentShaderWgsl: bloomEffectWgsl,
  uni: { value1: 0.75, value2: 0.5, value3: 1.5 },
})
// Optional AA — omit to skip. Prefer after bloom, before grain.
post.addFragmentEffect({
  fragmentShader: fxaaEffect,
  fragmentShaderWgsl: fxaaEffectWgsl,
  uni: { value1: 1, value2: 0.125 }, // strength, edgeThreshold
})
post.addFragmentEffect({
  fragmentShader: grainEffect,
  fragmentShaderWgsl: grainEffectWgsl,
  uni: { value1: 0.08, value2: 520 },
})
```

`effects.custom` + `createScene({ post })` still works as thin sugar; examples use the processor primitive.

This is **not** `fsMain`. WebGL2 wraps GLSL:

```glsl
vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) { ... }
```

WebGPU wraps WGSL `fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f`.

Injected: scene texture, resolution, time, delta, uni. `uv` is top-origin.

Drive `uUni` from `onFrame` on the processor. **Return early** when the lerp has snapped so the settle loop can idle.

Failed custom compile disables that effect; it must not blank the page.
