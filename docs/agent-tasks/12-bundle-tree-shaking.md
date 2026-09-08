---
id: 12
status: done
title: Remove avoidable consumer bundle retention
---

# 12 — Remove avoidable consumer bundle retention

Completed first task for the user-requested lightweightness audit track. This is
independent of DOM hardening task 11, which remains open.
See [results and verification](../audits/2026-09-08-tree-shaking-results.md).
See [audit and measurements](../audits/2026-09-08-lightweight-performance.md).

## Objective

A capability-only import must not retain unused primitive renderer modules.
Preserve real initialization behavior, SSR safety, lazy backend loading and the
global/IIFE entry. Do not change renderer behavior or implement scheduler fixes
in this task.

## Work

1. Review top-level lazy-factory/pending-queue initializers for actual side effects.
   Add justified purity annotations or restructure pure initialization so unused
   imports disappear. No blanket annotation of behaviorful calls.
2. Audit package side-effect metadata, including global entry behavior. Add precise
   metadata only with tests; purity of an allocation is not proof that the whole
   package has no side effects.
3. Extend `bin/audit-bundle.ts` into consumer regression checks under Bun and the
   existing Vite/Rollup toolchain. Include probe, screen/scene, item, DOM, combined
   root+DOM, and unused-import cases. No browser runtime dependencies.
4. Record before/after initial closure, emitted lazy chunks, raw/gzip and request
   count. Verify capability-only bundles lack GPU primitive import trees; verify
   actual scene creation, registration and lazy rendering still work.
5. Freeze measured per-consumer size budgets after review. Explain any budget
   movement and distinguish startup transfer from all emitted backend code.

## Agent ownership

- Implementer: justified source initializer annotations/refactoring and package
  metadata. One writer for those files.
- Validation agent: consumer fixtures/build audit assertions, browser smoke tests,
  independent before/after evidence; coordinate shared build-file edits with lead.
- Reviewer: inspect every purity/side-effect claim, SSR/global behavior and final
  consumer artifacts. Review evidence independently of implementer conclusions.
- Lead: integrate final diff, resolve findings, rerun checks and record results.

## Gate

`bun test package`, `bun run bin/build.ts`, consumer audit and app-bundler fixtures
pass. Actual WebGPU/WebGL2 scene/item/DOM mounts still work; native fallback and
global initialization are preserved. No MSDF Node tooling/DOM entry leakage into
small root consumers. No unresolved behavior changes hidden behind smaller bytes.

Do not start runtime scheduling/backend splitting tasks in this run. Mark done
only after the final integrated candidate and independent review pass.
