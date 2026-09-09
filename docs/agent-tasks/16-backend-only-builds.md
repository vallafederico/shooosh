---
status: done
---
# Backend-only builds (follow-up plan)

User-requested follow-up. Default remains both backends, probing WebGPU and falling
back to WebGL2. A consumer must be able to exclude every unused backend module and
shader variant from emitted JavaScript, including lazy chunks.

## Delivered

- `shooosh/webgl2`, `shooosh/webgpu` and their `/dom` entries.
- Vite/Rollup shader plugin resolves the matching runtime entries; CLI and Bun
  transforms accept matching shader targets. Default remains both.
- Direct build constants eliminate excluded renderer branches, shaders, uploads,
  post backends, compute implementation and mouse trails. No extra frame dispatch.
- SSR probes, conflicting runtime options, emitted-code assertions, 38 Bun/Vite
  consumer builds and browser DOM activation checks pass.

See [consumer setup](../bundle-setup.md), [exact measurements](../audits/2026-09-09-backend-builds.json)
and `bin/test-backends.ts`. The light scene and example migration are task 17.
