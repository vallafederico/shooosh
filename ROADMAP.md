# Roadmap

The engine stays what it is: a site-native WebGL2 runtime with WGSL-or-GLSL fragments, a shared page layer, and DOM-tracked items. [vgpu](https://github.com/vercel-labs/vgpu) is the reference for shader DX — file imports, named uniforms, in-place HMR, a small stdlib, a `check` CLI — not for tensors, Dawn, or a WebGPU rewrite.

## Now

- Publishable package (`esm` / `cjs` / IIFE / types)
- `createEngine` / `createScene` / `acquireLayer` / `createItem`
- GLSL 300 es passthrough + WGSL subset → GLSL
- Post presets, loaders, particles / objects / MSDF
- Vite harness + Astro `/web`

## Next — shader files + HMR

Edit a `.frag` / `.glsl` / `.wgsl` and the live program swaps. Failed compile keeps the last good program and surfaces the log. Vite and Bun share one runtime accept path.

### Runtime (package)

- `configure({ shaders })` on screen / item / object actually rebuilds the program (async, settle-aware)
- `hotSwapShader(target, source)` — same path used by both bundlers
- Overlay or `onShaderError` for compile/link logs; never blank the page
- Watch `#include` / WGSL `import` graphs so a shared noise helper invalidates every consumer

### Vite plugin (`shooosh/vite`)

- `import frag from "./wave.frag"` (also `.glsl`, `.wgsl`, `.vert`)
- `addWatchFile` for transitive includes (same idea as `@vgpu/wgsl/loader-vite`)
- Custom event `shooosh:shader` so the scene does **not** full-reload
- `import.meta.hot.accept` fallback when the consumer owns the swap

### Bun plugin (`shooosh/bun`)

- `onLoad` for the same extensions under `bun --hot` / `Bun.plugin`
- File watcher + the same `hotSwapShader` accept path
- Works in the harness when we run it on Bun, not only Vite

Harness gets a demo that imports a file shader and survives edits.

## Steal from vgpu

| Feature | Why |
| --- | --- |
| Named uniforms | `setUni({ time, speed })` instead of `value1` → `uUni[0].x`. Keep the vec4[4] packing underneath. |
| Shader stdlib | Tiny GLSL/WGSL modules: hash, value noise, color. Importable from files once HMR exists. |
| `shooosh check` | Compile/validate a shader from the CLI. No browser. CI + agents. |
| Agent docs | `llms.txt` / `agents.md` for the public API and shader contract. |
| Compile overlay | vgpu-style “keep drawing, show the error”. |

## Later

- Stronger WGSL converter (or keep GLSL as the source of truth and treat WGSL as a subset)
- WebGPU backend behind the same scene/item API, WebGL2 remains default
- Example gallery the harness can pull from
- Bundle budget on the IIFE build
- Headless / mock adapter for CI (vgpu/mock energy, WebGL-less)

## Not this package

vgpu’s tensors, neural nets, Dawn node adapter, and explicit `frame.pass` graph. Those are a different product. Shooosh is the thing already on the sites.
