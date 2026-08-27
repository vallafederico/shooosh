# Working in shooosh

Read `agents.md` and `llms.txt` first. Then open the next `docs/agent-tasks/0N-*.md` with `status: todo`.

## Conventions

- Package source lives in `package/`. Root `package.json` is what npm publishes.
- Harness and web import source via alias (`shooosh` → `package/index.ts`). Do not publish-then-consume for local work.
- Zero runtime dependencies. Do not add Three, Dawn, or a GPU tensor stack.
- New public types are backend-agnostic. Do not put `WebGL2RenderingContext` or `GPUDevice` on `EngineFrame` for site authors — hide them on a backend handle if needed.
- WGSL is the authored language. The GLSL converter is fallback-only (`package/src/shaders/wgsl-compat.ts`).
- `acquireLayer()` / `probeRenderer()` returning `null` is a valid outcome. Callers no-op; the page stays readable.
- Tests: `bun test package`. Build: `bun run bin/build.ts` (needs bun on PATH).
- Do not commit `dist/`, `node_modules/`, `.env*`, or `.npmrc`.

## Layout

```
package/src/engine/     createEngine (WebGL2 today), probeRenderer
package/src/scene/      createScene
package/src/primitives/ screen, item, object, particles, msdf
package/src/post/       bloom, bw, noise, custom
package/src/shaders/    compile + wgsl-compat
harness/                Vite demos
web/                    Astro landing
docs/agent-tasks/       cloud-agent queue
```

## Out of scope

Tensors, neural nets, shipping Dawn inside this package, rewriting the API to vgpu’s `frame.pass` style.
