---
id: 01
status: done
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

`createEngine` is async and defaults to `probeRenderer()`. WebGPU runs `fn fsMain` as-is (wrapped with `Uni` + `vUv` + `vsMain`). WebGL2 is unchanged, including the GLSL `#version 300 es` escape hatch. Screen and item render on both backends. Harness shows `backend · webgpu|webgl2` and honors `?backend=`.

Verify: `bun test package` · `bun run bin/build.ts` · harness screen + items.

### Follow-up (skipped to keep this reviewable)

Post stack, `loadTexture`, objects, particles, and MSDF stay WebGL2-only. On WebGPU they no-op / warn / throw a readable error. Port those next if a site path needs them. → **Done in [08](./08-webgpu-remaining-ports.md).**
