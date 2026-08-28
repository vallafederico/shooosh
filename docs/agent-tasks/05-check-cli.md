---
id: 05
status: todo
title: shooosh check CLI
---

# 05 — `shooosh check`

## Goal

Validate a WGSL file (and the GLSL fallback compile) from the CLI. No browser. Agents and CI can run it.

## Do

- `shooosh check <file.wgsl>` (bin in the published package or a `bin/` script).
- Parse/convert as the WebGL path would; report converter + optional naga/tint later if you can do it without native deps. First version: converter + structural checks is enough.
- Exit non-zero on failure. Print a short, agent-readable log.
- Document in `agents.md` and `llms.txt` (vgpu-style: prefer the CLI for validation).

## Verify

- Good fixture exits 0; broken fixture exits 1.
- `bun test package`.

## Done

_Fill in when complete._
