---
id: 04
status: todo
title: WGSL stdlib
---

# 04 — WGSL stdlib

Depends on 02 if modules are imported as files.

## Goal

Tiny reusable WGSL modules: hash, value noise, color. Importable from shader files.

## Do

- Ship as package files (e.g. `package/wgsl/hash.wgsl`) or a `shooosh/wgsl-std` export.
- Keep them pure (no entry bindings) so they compose.
- Wire into the Vite/Bun resolvers from task 02.
- Document in `llms.txt`.

Do not copy all of `@vgpu/wgsl-std`. Start with hash, value noise, one color helper.

## Verify

- Harness shader imports the stdlib and HMR still works.
- `bun test package`.

## Done

_Fill in when complete._
