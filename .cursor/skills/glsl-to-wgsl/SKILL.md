---
name: glsl-to-wgsl
description: Convert GLSL 300 es / WebGL fragment shaders into shooosh WGSL (fn fsMain) so they run on WebGPU. Use when the user asks to port a WebGL, GLSL, or #version 300 es shader to WGSL, WebGPU, or the authored shooosh language.
---

# GLSL 300 es → WGSL

Read [docs/shader-translation.md](../../../docs/shader-translation.md) and [docs/shader-contract.md](../../../docs/shader-contract.md) before rewriting anything.

## Do this first

If the source is a `#version 300 es` fragment with `void main` and `outColor`, call the library:

```ts
import { convertGlslFragmentToWgsl } from "shooosh"

const wgsl = convertGlslFragmentToWgsl(glsl)
```

If the function throws or the shader is outside the subset, translate by hand using the mapping table in `docs/shader-translation.md`.

## Rules

- Target shape is `fn fsMain() -> vec4f { … }`. No `@vertex`, no `struct Uni` — the engine wraps those.
- Drop `#version`, `precision`, `in vec2 vUv`, `uniform vec4 uUni[4]`, `out vec4 outColor`.
- `outColor = c;` becomes `return c;`.
- `uUni[N]` → `uUni.valuesN`. `vUv` stays `vUv` (injected).
- `vec4`/`vec3`/`vec2`/`float` → `vec4f`/`vec3f`/`vec2f`/`f32`.
- Two-arg `atan(y, x)` → `atan2(y, x)`. One-arg `atan(x)` stays `atan`.
- Reassigned locals must be `var`, not `let`.
- `texture()` / samplers are WebGL2-only today — do not silently invent `textureSample`.
- New site shaders should be **stored as WGSL**. Do not leave GLSL as the source of truth if WebGPU should run it.

## After

Pass the result as `shaders.fragment`. On WebGPU it is wrapped; on WebGL2 it is converted back to GLSL. Verify with `bun test package` if you touched converter code.
