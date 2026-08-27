---
id: 03
status: todo
title: Named uniforms
---

# 03 — Named uniforms

## Goal

`setUni({ time, speed })` instead of `value1` → `uUni[0].x`. Keep vec4[4] packing underneath for the WebGL fallback.

## Do

- Reflection or an explicit map from WGSL uniform names to slots.
- WebGPU path should bind by name (or a generated layout), not force authors onto `value1`.
- Keep `value1`…`value16` working as aliases so current sites do not break.
- Document the contract in `readme.md` and `llms.txt`.

## Verify

- Existing harness demos still run.
- A new WGSL shader using named fields works on both backends (or WebGL + documented GPU follow-up).
- `bun test package`.

## Done

_Fill in when complete._
