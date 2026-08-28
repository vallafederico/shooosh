---
id: 02
status: todo
title: Shader files + HMR (Vite and Bun)
---

# 02 — Shader files + HMR

Depends on 01 so a `.wgsl` swap hits whichever backend is live.

## Goal

Edit a `.wgsl` (also `.frag` / `.glsl`) and the live program swaps in place. Failed compile keeps the last good program and shows the log.

## Do

- Runtime: `configure({ shaders })` actually rebuilds the program (async, settle-aware).
- `hotSwapShader(target, source)` — one accept path for both bundlers and both backends.
- Vite plugin `shooosh/vite`: import `.wgsl` / `.frag` / `.glsl` / `.vert`; `addWatchFile` for includes; custom event `shooosh:shader` (no full reload).
- Bun plugin `shooosh/bun`: `onLoad` + `--hot` / file watcher, same accept path.
- Watch `#include` / WGSL `import` graphs.
- Harness demo that imports a file shader and survives edits.

Reference: `@vgpu/wgsl/loader-vite` (`addWatchFile`, leaf vs import graph).

## Verify

- Change a harness `.wgsl`; scene updates without remount.
- Break the shader; last good frame stays; error is visible.
- `bun test package` and `bun run bin/build.ts`.

## Done

_Fill in when complete._
