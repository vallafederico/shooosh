# Shader translation (WGSL ↔ GLSL 300 es)

[Documentation](./README.md)

Use this when a site shader must move between the authored language (WGSL) and the WebGL2 escape hatch (GLSL 300 es).

Prefer the library functions when the source is in the **supported subset**. Use the agent skills for anything the converters reject — then keep the result inside the [shader contract](./shader-contract.md).

```ts
import { convertWgslFragmentToGlsl, convertGlslFragmentToWgsl } from "shooosh"

const glsl = convertWgslFragmentToGlsl(wgsl, { includeUv: true })
const wgslAgain = convertGlslFragmentToWgsl(glsl)
```

## When to convert

| Situation | Do |
| --- | --- |
| New shader | Write WGSL `fn fsMain`. Do not start in GLSL. |
| Existing `#version 300 es` site shader | Convert to WGSL so WebGPU can run it. |
| Debugging the WebGL fallback | Convert WGSL → GLSL and compare the log. |
| Full WebGPU module (`@vertex`, bind groups) | Not this subset. Extract a fragment body first. |

## Mapping

| WGSL | GLSL 300 es |
| --- | --- |
| `fn fsMain() -> vec4f { return color; }` | `void main() { outColor = color; }` |
| `vUv` (injected) | `in vec2 vUv;` |
| `uUni.values0` | `uUni[0]` |
| `uUni.valuesN.x` | `uUni[N].x` |
| `vec2f` / `vec3f` / `vec4f` | `vec2` / `vec3` / `vec4` |
| `f32` / `i32` / `u32` | `float` / `int` / `uint` |
| `mat4x4<f32>` | `mat4` |
| `let x =` / `var x =` | `float x =` (type inferred on the way to GLSL) |
| `fn foo(p: vec2f) -> f32` | `float foo(vec2 p)` |
| `atan2(y, x)` | `atan(y, x)` (two-arg) |
| `mix` / `sin` / `smoothstep` / `length` | same names |
| engine-wrapped `@vertex vsMain` | default `aPosition` / `aUv` vertex (not authored) |

GLSL headers the engine expects (and the converter emits):

```glsl
#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;
```

Do not author those in new WGSL. The wrap / converter inject them.

## Worked example

WGSL (authored):

```wgsl
fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let a = atan2(p.y, p.x);
  return vec4f(vUv, 0.5 + 0.5 * sin(t + r), 1.0);
}
```

GLSL 300 es (WebGL2 / escape hatch):

```glsl
#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;

void main() {
  float t = uUni[0].x;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  outColor = vec4(vUv, 0.5 + 0.5 * sin(t + r), 1.0);
}
```

## Subset limits

The converters are string rewrites, not a compiler. They handle `fsMain` / `void main` fragments that use `vUv`, `uUni`, and the types above.

They will not faithfully translate:

- Samplers / `texture()` / `textureSample` (textures are WebGL2-only today)
- Custom vertex stage, storage buffers, compute
- `#include`, WGSL `import` (task 02)
- GLSL preprocessor beyond `#version 300 es`
- `inout` parameters, structs you defined, `layout(location=…)`

If conversion fails, keep the last good shader and show the log. Do not invent a second scene API to paper over it.

## Agent skills

- [wgsl-to-glsl](../.cursor/skills/wgsl-to-glsl/SKILL.md) — WebGPU / WGSL → WebGL
- [glsl-to-wgsl](../.cursor/skills/glsl-to-wgsl/SKILL.md) — WebGL / GLSL → WGSL
