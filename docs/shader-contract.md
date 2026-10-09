# Shader contract


**Unreleased shader migration:** WebGL2 now requires prepared `fragmentGlsl`. Use the [build-time shader pipeline](./shader-build.md) for compiler-free output, or import `compileShader` from `shooosh/compiler` and pass `shaders: compileShader(wgsl)` for inline strings. Older raw-WGSL snippets below require this adjustment for dual-backend use.

[Documentation](./README.md)

Author **WGSL**. GLSL 300 es is a WebGL2 escape hatch only.

This is the site-facing fragment contract for `createScreen` / `createItem` (and `createScene({ screen })`). Both backends consume the same source string.

## Entry

```wgsl
fn fsMain() -> vec4f {
  return vec4f(vUv, 0.0, 1.0);
}
```

`@fragment` on `fsMain` is optional and stripped. Do not write `@vertex` or a full pipeline module — the engine wraps the fragment.

## Injected names

| Name | Meaning |
| --- | --- |
| `vUv` | Top-origin UV. `(0,0)` is the top-left of the quad / screen. |
| `uUni` | 16 floats packed as four `vec4`s. |
| `uTexture` / `uSampler` | Bound when a texture is set and the fragment names `uTexture`. |
| `fitUv(uv)` | Cover/contain helper — `uv * values1.xy + values1.zw`. Injected with `uTexture`. |
| item `maps` (`uDepth`…) | Extra `texture_2d<f32>`s named by `createItem({ maps })`, sampled with `uSampler`. Bound from `@binding(3)` in name order, only the ones the fragment names. |

On **WebGPU** the engine prepends `struct Uni { values0..3 }`, `vsMain`, and `var<private> vUv`, then calls `fsMain` from `fsEntry`.

On **WebGL2** `convertWgslFragmentToGlsl` emits `in vec2 vUv`, `uniform vec4 uUni[4]`, and `void main()`.

## Uniforms

```js
self.setUni({ value1: t, value2: 0.5 })
```

| JS | WGSL | GLSL |
| --- | --- | --- |
| `value1` | `uUni.values0.x` | `uUni[0].x` |
| `value2` | `uUni.values0.y` | `uUni[0].y` |
| `value5` | `uUni.values1.x` | `uUni[1].x` |
| `value16` | `uUni.values3.w` | `uUni[3].w` |

Named uniforms are task 03. Until then, stick to `value1`…`value16`.

The WebGL plane also writes `value4` as seconds (`performance.now() * 0.001`) each draw.

### Texture fit (CSS object-fit)

When `createScreen` / `createItem` has a `texture`, the engine writes a cover/contain transform into **value5–8** every frame (`textureFit`, default `"cover"`):

| Slot | Meaning |
| --- | --- |
| `value5` / `values1.x` | scaleX |
| `value6` / `values1.y` | scaleY |
| `value7` / `values1.z` | offsetX |
| `value8` / `values1.w` | offsetY |

Sample with the injected helper:

```wgsl
fn fsMain() -> vec4f {
  return textureSample(uTexture, uSampler, fitUv(vUv));
}
```

JS helpers: `resolveTextureUvTransform`, `applyTextureUv`, `textureFitToUni`.

### Item maps

An item can sample more textures next to `uTexture`, for example a depth or mask
map baked for the image. The `maps` names are the slots, fixed when the item is
created. `null` declares a slot that gets filled later, when the map has loaded:

```ts
const item = createItem(img, { texture, shaders, maps: { uDepth: null } })
// later, when the depth map has loaded:
item.setMap("uDepth", await loadTexture(depthBitmap))
item.setUni({ value4: 1 }) // the fragment's own "map ready" flag
```

```wgsl
let depth = textureSample(uDepth, uSampler, fitUv(vUv)).r;
```

An empty slot samples one transparent texel `(0, 0, 0, 0)`, so gate the effect
on a uniform set alongside `setMap`. `setMap` rebinds on the next frame without
recompiling. Maps share `uTexture`'s sampler and fit, so bake them with the
image's aspect ratio. On WebGL2 the translator declares a `sampler2D` for every
texture passed to `textureSample`, and each map takes a texture unit after
`uTexture`'s.

## Backends

| Backend | What happens to `shaders.fragment` |
| --- | --- |
| WebGPU | Wrapped and compiled as WGSL. |
| WebGL2 | Converted to GLSL 300 es, compiled async. |
| WebGL2 + `#version 300 es` | Used as-is (escape hatch). |
| WebGPU + `#version 300 es` | Ignored; default WGSL fragment + a console warning. |

Force a backend only when debugging: `createEngine(canvas, { backend: "webgpu" })` or harness `?backend=webgl2`.

## Failure

A bad compile must not blank the page. Keep the last good program (or skip the draw), and surface the log. Never throw through the raf callback.

## Post (`applyEffect`, WebGL2)

Custom post is a **different** entry than `fsMain`:

```glsl
vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) { … }
```

See [site-patterns.md](./site-patterns.md) and skill `shooosh-post`.

## Out of contract

- Custom vertex shaders (logged, ignored).
- GLSL on WebGPU: a `#version 300 es` fragment is ignored there (warning + default fragment). Convert it.
- Post `textureUniforms` on WebGPU (warned, unbound).
- Dawn, tensors, vgpu `frame.pass` graphs.

## Translate

WGSL ↔ GLSL mapping: [shader-translation.md](./shader-translation.md).

Agent skills: [`.cursor/skills/wgsl-to-glsl`](../.cursor/skills/wgsl-to-glsl/SKILL.md), [`.cursor/skills/glsl-to-wgsl`](../.cursor/skills/glsl-to-wgsl/SKILL.md).
