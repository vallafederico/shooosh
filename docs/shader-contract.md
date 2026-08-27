# Shader contract

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
- Textures, post, objects, particles, MSDF — WebGL2 only today.
- Dawn, tensors, vgpu `frame.pass` graphs.

## Translate

WGSL ↔ GLSL mapping: [shader-translation.md](./shader-translation.md).

Agent skills: [`.cursor/skills/wgsl-to-glsl`](../.cursor/skills/wgsl-to-glsl/SKILL.md), [`.cursor/skills/glsl-to-wgsl`](../.cursor/skills/glsl-to-wgsl/SKILL.md).
