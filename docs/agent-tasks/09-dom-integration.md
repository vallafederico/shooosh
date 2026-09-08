---
id: 09
status: done
title: Optional DOM adapter foundation and image enhancement
---

# 09 — DOM adapter foundation

Explicitly selected by the user after reviewing the DOMGL implementation plan.
This is one bounded engine/integration task; it does not complete tasks 02–07.

## Scope

- Separate `shooosh/dom` entry over the existing engine, SSR-safe exports.
- Explicit engine attachment and texture upload ownership.
- Cached document-space rectangle tracking; shared reads; rectangular clipping.
- Decorative WGSL bindings and existing-image enhancement with supported CSS checks.
- Per-binding activation after submission, native restoration, cancellation-safe
  resource ownership, renderer-loss fallback, and idempotent cleanup.
- Vite harness for both backends and native fallback; meaningful lifecycle tests.

Automatic box painting, rounded geometry, text, video, full CSS stacking, and
performance batching are follow-up tasks, not acceptance criteria for this slice.

## Verify

`bun test package` · `bun run bin/build.ts` · `/dom.html?backend=webgpu|webgl2` in
the Vite harness, including its lifecycle-check button and renderer-loss control.

## Done

Implemented `shooosh/dom`, explicit item/texture engine ownership, submitted-frame
activation, conservative CSS fallback, shared geometry/resource caches, and
idempotent cleanup. Existing item and scene APIs remain available.

Verified: 101 package tests passed (1 existing font-atlas test skipped); 9 build
checks passed, including SSR-safe ESM/CJS subpath imports. Strict TypeScript checks
passed for the adapter and fixture. All 16 executable harness lifecycle checks
passed on forced WebGPU and WebGL2. WebGL context-loss control restored native
content. The fixture's DOM/GPU views were inspected in the browser.

Follow-up scope remains in [the design](../proposals/dom-integration.md); no next
engine task was started.
