---
status: done
---
# Build-time WGSL fragment artifacts

Move translation out of the default browser dependency graph. Provide a Node/Bun
build entry, `.wgsl` Vite/Rollup plugin and CLI; keep explicitly imported runtime
compilation available through `shooosh/compiler`. Prepared WGSL/GLSL pairs work
across screen/item/object paths. Migrate examples and built-in DOM images; document
the raw-WGSL WebGL2 compatibility change and follow-up backend-only build plan.

Validation: 130 tests pass, one optional skip; package build and all 62 Bun/Vite
consumer checks pass; nine example tests pass. Harness and website production
builds pass. Prepared gradient visually verified on WebGL2 and WebGPU. Integration
tests cover CLI artifacts/declarations, conversion failure preserving output,
actual Vite imports, and generated-source freshness. Non-compiler runtime fixtures
assert translator exclusion. Backend-only builds are task 16, not implemented here.
