---
id: 01
status: todo
title: WebGPU renderer (default when probe succeeds)
---

# 01 — WebGPU renderer

## Goal

`createEngine` / `createScene` / `acquireLayer` / `createItem` / `createScreen` run on WebGPU when `probeRenderer()` returns `"webgpu"`. Same site-facing API. WebGL2 remains the fallback path.

## Why

WGSL is the shading language. Converting everything to GLSL is a fallback, not the product.

## Do

- Shared, backend-agnostic frame types. Site code must not need `WebGL2RenderingContext`.
- `createEngine(canvas, { backend?: "auto" | "webgpu" | "webgl2" })` — default `"auto"` uses `probeRenderer()`.
- WebGPU: request adapter/device, configure canvas context, raf + settle window (match current dirty/settle behavior).
- Port **fullscreen screen** and **DOM-tracked item** first (the 80% site path). Post stack can be a follow-up commit if needed to keep this reviewable — if you skip post, document it and leave a checklist in this file.
- WGSL `fsMain` runs as-is on WebGPU. Converter stays on the WebGL path only.
- Harness: show active backend; optional force toggle (`?backend=webgpu|webgl2`).
- Tests: probe + engine options. Browser verification in harness if the environment has WebGPU.

## Do not

- Rewrite the public function names.
- Add Dawn, Node headless, or tensors.
- Break existing GLSL `#version 300 es` escape hatch on WebGL2.

## Verify

```
bun test package
bun run bin/build.ts
pnpm --filter harness dev   # screen + items demos; backend label visible
```

## Done

_Fill in when complete._
