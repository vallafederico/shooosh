---
id: 07
status: todo
title: Compile overlay
---

# 07 — Compile overlay

## Goal

When a shader fails, keep drawing the last good program and show the error (vgpu energy). Used by HMR and by first compile.

## Do

- `onShaderError` callback on scene/item/screen.
- Default harness overlay: label + compiler log, not a blank canvas.
- Works on both backends.

## Verify

- Break a harness shader; previous image stays; overlay appears.
- Fix it; overlay clears; new program runs.

## Done

_Fill in when complete._
