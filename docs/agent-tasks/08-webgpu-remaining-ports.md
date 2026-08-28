---
id: 08
status: done
title: WebGPU remaining ports (textures, post, objects, particles, MSDF, mouse trail)
---

# 08 — WebGPU remaining ports

## Goal

Same public API on WebGPU for post, textures, objects, particles, MSDF glyphs, and mouse trail. Gate backend module graphs so `backend: "webgpu" | "webgl2"` only loads that side; omit/`auto` picks the best.

## Done

- Phase 0: Dynamic-import `gpu-*` drawers; ESM `splitting: true` + chunk checks in `bin/test-build.ts`
- Phase 1: Backend-agnostic texture handle + upload modules; WebGPU scene color target + real `onPostRender`; screen/item texture bind groups; scene no longer skips post
- Phase 2: Split post (`processor-webgl2` / `processor-webgpu`); WGSL `applyEffect` via `fragmentShaderWgsl`; examples updated
- Phase 3: `gpu-particles`, `gpu-msdf-glyphs`, `gpu-object`; scene pass always has depth for meshes
- Phase 4: `gpu-mousetrail`; trail handle shaped like `loadTexture` result

## Known follow-ups (not blockers)

- WebGPU post `textureUniforms` still unbound (warn; sample via item/screen instead)
- Browser smoke on harness `?backend=webgpu` recommended (unit tests are headless)

## Verify

```
bun test package
bun run bin/build.ts
```
