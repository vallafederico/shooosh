---
status: done
---
# Lightweight scene composition and production example shaders

User-selected continuation after backend task 16 passed. Extract shared canvas
lifecycle into `CanvasScene`, expose `createCanvasScene` with explicit resource
ownership and keep the full scene API compatible. Migrate example fragments into
`.wgsl` build imports, including composed fabric variants and prepared DOM-input
shaders. Add conservative production shader minification with readable development
source, token/directive/string protection and an explicit opt-out.

Validation: 137 passing package/example tests (one optional skip), package/harness type-checks, all 64 default tree-shaking fixtures, 38 backend
consumer builds, harness/web production builds. Browser checks cover single-target
DOM activation and mismatch rejection, production fabric/physics rendering and
9/9 DOM integration checks with working input submission. See bundle-setup.md.
