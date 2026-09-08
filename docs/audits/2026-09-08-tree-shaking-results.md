# Tree-shaking results

Task 12 removes avoidable module retention without changing renderer behavior.
Seven top-level lazy-factory/queue allocations are annotated pure after independent
source review. Their constructors allocate local state; importing, scheduling and
attaching still happen only when the returned functions are used. Unit tests check
both inert construction and subsequent activation.

The minified ESM/CJS builds now preserve dead-code annotations with Bun's
`emitDCEAnnotations`. Without that build option the source annotations were lost
before downstream bundlers saw them. The package `sideEffects` whitelist preserves
the global source entry, published IIFE and CLI. No runtime dependencies were added.

## Measured change

Same Bun 1.4.0 consumer audit, gzip-9 summed per generated file. These fixtures retain
named exports; they are transfer comparisons, not complete applications. Initial
means static import closure. All emitted bytes include unused backend alternatives
and are not a claim about network transfer for a selected backend.

| Consumer | Initial gzip before → after | Reduction | All emitted gzip before → after |
| --- | ---: | ---: | ---: |
| `probeRenderer` | 6,520 → 452 B | 93.1% | 15,837 → 452 B |
| `createItem` | 10,969 → 7,749 B | 29.4% | 20,287 → 10,141 B |
| `createScene` | 18,840 → 18,729 B | 0.6% | 41,462 → 37,960 B |
| `createDomLayer` | 14,681 → 13,780 B | 6.1% | 26,019 → 23,799 B |
| scene + DOM | 23,454 → 23,341 B | 0.5% | 46,086 → 42,602 B |

[Before snapshot](./2026-09-08-bundle.json) and
[after snapshot](./2026-09-08-bundle-after-tree-shaking.json) contain raw bytes,
gzip bytes, emitted/static file counts and build fingerprints. Reproduce with
`bun run bin/audit-bundle.ts` after building. Generated static file counts are not
measured browser requests.

## Regression gates

`bun run bin/build.ts` runs the normal nine build checks and twenty consumer checks
across Bun and Vite/Rollup. Install workspace development dependencies first; the
consumer checks use the harness's installed Vite. Run them separately with
`bun run test:tree-shaking`.

The fixtures exercise real package resolution and metadata, unused imports,
capability probes, screen/scene/item, DOM, combined root+DOM and side-effect-only
IIFE imports. Per-consumer gzip ceilings allow modest toolchain variation. Tiny
consumers must emit one file with no renderer imports. Runnable combinations
(`createScreen` + `initEngine`, `createItem` + `acquireLayer`) must retain GPU
pipeline creation and actual lazy renderer bodies. This matters because Rollup
can correctly eliminate an unreachable renderer from a bare primitive consumer
that has no engine creation in its graph.

For context, Vite's runnable screen+engine fixture has 8,099 B initial / 15,325 B
all-emitted gzip; item+layer has 8,155 / 15,514 B. These use different fixtures from
the before/after table and should not be compared directly to its numbers.

Validation: 107 package tests passed, one optional font-generation test skipped;
nine build checks and twenty consumer checks passed. Independent review found no
unsafe purity claims. The built ESM and a production Vite build of the smoke page
both rendered the scene and DOM image on WebGPU and WebGL2. The DOM image exercises
the item renderer with a separate engine while the scene is still active.

Browser reproduction:

```sh
bun run bin/build.ts
bun run --cwd harness build:shake
bun run --cwd harness preview --outDir dist/shake --port 5174
```

Open `/shake.html?backend=webgpu` and `/shake.html?backend=webgl2`. The smoke page
imports emitted ESM directly, bypassing the harness's source aliases. It shows a
gradient scene, an enhanced image and initialization status; verify the pixels
as well as the status. Its async startup function avoids a top-level-await cycle
with lazy renderer chunks that import shared code from the application entry.

Harness TypeScript checking still reports existing errors in `examples/fxaa.ts`
and nullable elements in `harness/src/main.ts`; none point to the smoke entry.

## Remaining work

The scene facade still retains APIs exposed by its methods, including object/post
support. Removing that cost requires an API/backend module split with separate
compatibility review. This task does not claim that all bundles are minimal or
that browser frame performance improved. Runtime scheduling findings remain in
the [original audit](./2026-09-08-lightweight-performance.md).

Browser verification also exposed an existing WebGPU screen limitation:
`gpu-plane.ts` uses automatic layout while always supplying the uniform binding.
A fragment that never reads uniforms can therefore render blank. The smoke uses
`uUni.values0.x` and renders correctly. Generalize the explicit layout approach
already used by GPU items in a separate correctness task. Also verify that async
pipeline completion wakes an idle engine; source review found no completion wake.
