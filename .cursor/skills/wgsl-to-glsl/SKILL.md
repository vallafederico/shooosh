---
name: wgsl-to-glsl
description: Convert shooosh WGSL fragment shaders (fn fsMain) to GLSL 300 es for the WebGL2 fallback. Use when the user asks to port a WebGPU/WGSL/GPU shader to WebGL, GLSL, or the escape hatch.
---

# WGSL → GLSL 300 es

Read [docs/shader-translation.md](../../../docs/shader-translation.md) and [docs/shader-contract.md](../../../docs/shader-contract.md) before rewriting anything.

## Do this first

If the source is a shooosh `fn fsMain` fragment, call the library:

```ts
import { convertWgslFragmentToGlsl } from "shooosh"

const glsl = convertWgslFragmentToGlsl(wgsl, { includeUv: true })
```

Pass `{ includeNormal: true }` only when the shader reads `vNormal` (objects, not screen/item).

If the function throws or the shader is outside the subset, translate by hand using the mapping table in `docs/shader-translation.md`.

## Rules

- Output must start with `#version 300 es` and `precision highp float;`.
- `fn fsMain() -> vec4f { return c; }` becomes `void main() { outColor = c; }`.
- `uUni.valuesN` → `uUni[N]`. `vUv` stays `vUv` (`in vec2 vUv`).
- `vec4f`/`vec3f`/`vec2f`/`f32` → `vec4`/`vec3`/`vec2`/`float`.
- `atan2(y, x)` → `atan(y, x)`.
- Do not emit `@vertex`, bind groups, or `var<private>`. The WebGL default vertex already writes `vUv`.
- Do not add Three, Dawn, or a second engine API.
- Failed compile: keep the last good program, show the log.

## After

If this is a site shader, prefer leaving the **WGSL** as `shaders.fragment`. GLSL is only required for the escape hatch or for reading a WebGL compile log.
