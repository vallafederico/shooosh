# Roadmap

Site-native GPU runtime: scenes, a shared page layer, DOM-tracked items. **WGSL is the shading language.** The engine **prefers WebGPU** and **falls back to WebGL2** when the adapter or device is missing. Same `createScene` / `createItem` / `acquireLayer` API on both backends.

[vgpu](https://github.com/vercel-labs/vgpu) is the reference for shader DX (file imports, named uniforms, in-place HMR, stdlib, `check` CLI) — not for tensors, Dawn, or their frame/pass graph.

## Runtime policy

1. Probe `navigator.gpu` → adapter → device.
2. If that works, run the WebGPU renderer. Shaders stay WGSL.
3. If it fails, run the existing WebGL2 renderer. WGSL is converted to GLSL 300 es.
4. If neither works, return `null` / throw `GpuUnavailableError`. The page stays readable.

Force a backend only when debugging: `createEngine(canvas, { backend: "webgpu" | "webgl2" })`.

GLSL 300 es (`#version 300 es`) remains accepted as an escape hatch for current sites. New work is WGSL.

## Now

- Publishable package (`esm` / `cjs` / IIFE / types)
- WebGL2 renderer: `createEngine` / `createScene` / `acquireLayer` / `createItem`
- WGSL subset → GLSL for the fallback path
- Post presets, loaders, particles / objects / MSDF
- Vite harness + Astro `/web`

## Next — WebGPU renderer

Same scene/item/layer surface. WebGPU is the default when the probe succeeds.

- `probeRenderer()` → `"webgpu" | "webgl2" | null`
- Shared frame types that do not leak `WebGL2RenderingContext` into site code
- Fullscreen screen, DOM-tracked items, post stack on GPU
- WGSL as the authored source; converter only on the WebGL path
- Harness toggle + automatic probe display

Shader-file HMR (below) should land against this contract so a `.wgsl` edit hot-swaps on whichever backend is live.

## Next — shader files + HMR

Edit a `.wgsl` (also `.frag` / `.glsl` for legacy) and the live program swaps. Failed compile keeps the last good program and surfaces the log. Vite and Bun share one runtime accept path.

### Runtime (package)

- `configure({ shaders })` on screen / item / object actually rebuilds the program (async, settle-aware)
- `hotSwapShader(target, source)` — same path used by both bundlers and both backends
- Overlay or `onShaderError` for compile/link logs; never blank the page
- Watch `#include` / WGSL `import` graphs so a shared noise helper invalidates every consumer

### Vite plugin (`shooosh/vite`)

- `import frag from "./wave.wgsl"` (also `.frag`, `.glsl`, `.vert`)
- `addWatchFile` for transitive includes (same idea as `@vgpu/wgsl/loader-vite`)
- Custom event `shooosh:shader` so the scene does **not** full-reload
- `import.meta.hot.accept` fallback when the consumer owns the swap

### Bun plugin (`shooosh/bun`)

- `onLoad` for the same extensions under `bun --hot` / `Bun.plugin`
- File watcher + the same `hotSwapShader` accept path
- Works in the harness when we run it on Bun, not only Vite

## Steal from vgpu

| Feature | Why |
| --- | --- |
| Named uniforms | `setUni({ time, speed })` instead of `value1` → `uUni[0].x`. Keep the vec4[4] packing underneath. |
| Shader stdlib | Tiny WGSL modules: hash, value noise, color. Importable from files once HMR exists. |
| `shooosh check` | Validate WGSL (and the GLSL fallback compile) from the CLI. No browser. |
| Agent docs | `llms.txt` / `agents.md` for the public API and shader contract. |
| Compile overlay | Keep drawing, show the error. |

## Later

- Stronger WGSL → GLSL converter for the fallback path
- Example gallery the harness can pull from
- Bundle budget on the IIFE build
- Headless / mock adapter for CI (optional; not Dawn-in-the-package)

## Not this package

vgpu’s tensors, neural nets, Dawn node adapter, and explicit `frame.pass` graph. Shooosh is the site engine — two renderers, one WGSL-first API.
