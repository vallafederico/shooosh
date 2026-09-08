# New examples: bundle and runtime follow-up

The later [completed DOM idle pass](./2026-09-08-dom-idle-optimization.md) supersedes
the open input-cache and repair-wakeup findings below.

Scope: glass, interaction utility, example import paths and the DOM input prototype.
This follows the [tree-shaking work](./2026-09-08-tree-shaking-results.md). No runtime
browser dependencies were added. Documentation-only changes emit no browser code.

## Consumer bundles

`bin/test-tree-shaking.ts` now checks 16 consumer shapes under both Bun and
Vite/Rollup (32 checks). New fixtures import the plasma fragment and glass `run`
directly and through the examples index. Example imports resolve the emitted
package ESM rather than the workspace's source alias. Fixtures retain the selected
export, enforce initial gzip ceilings, and reject unrelated DOM/fluid code.
Fragment-only consumers must contain no renderer chunks or glass shader.

Measured gzip-9 bytes, including each tiny fixture:

| Import | Bun initial / all emitted | Vite initial / all emitted |
| --- | ---: | ---: |
| `createSpinner` | 736 / 736 | 734 / 734 |
| Plasma fragment, direct | 430 / 430 | 311 / 311 |
| Plasma fragment, index | 430 / 430 | 311 / 311 |
| Glass `run`, direct | 22,629 / 41,864 | 18,975 / 38,802 |
| Glass `run`, index | 22,632 / 41,887 | 18,974 / 38,801 |

Unused utility imports disappear completely; the remaining fixture is 44 gzip
bytes. Spinner has no renderer imports, RAF, per-update allocation or layout reads.
Listeners attach only during construction and are removed on destroy. Importing
the examples index by name does not retain the other looks in these fixtures.
Importing the whole `examples` catalog intentionally retains all gallery entries.

Glass still inherits `createScene`'s broader method surface and associated lazy
object/post support. Its full emitted code is not its startup network cost. A
smaller scene facade remains separate architectural work. These are measured
bundles, not a guarantee about every bundler configuration or CJS consumer.

Reproduce after `bun run bin/build.ts` with `bun run test:tree-shaking`.
The new fragment ceiling is 600 gzip bytes; glass is 24,000 initial gzip bytes.

## Runtime measurement and fix

Added a glass idle scenario to `/perf.html`. The harness measures one second after
1.5 seconds of warm-up; explicit bounds/style calls and registered render callback
spans are instrumented. It does not measure GPU execution, total browser CPU,
compositor latency, or shader cost while dragging.

Before the change, the focused DOM input woke every 100 ms, keeping the engine's
250 ms settle window permanently active. Replaced that interval with a timeout
aligned to the 530 ms caret edge. It disarms on blur, hidden document, composition,
printing, noncollapsed selection, RTL native fallback and destruction. Unrelated
document selection changes no longer invalidate the unfocused input.

WebGL2 before/after, visible Chrome 152, DPR 2:

| Scenario | Frames / second | Bounds reads / second |
| --- | ---: | ---: |
| Glass idle, before and after | 0 | 0 |
| Input unfocused, before and after | 0 | 0 |
| Input focused, before | 60 | 300 |
| Input focused, after | 32 | 160 |

This is a reduction in unnecessary work, not a 47% total-browser speedup. The
before viewport was 921×879; reopening the browser produced a 1280×720 after
viewport. Geometry operation counts and scheduling are comparable, but CPU/GPU
cost across these sizes should not be treated as a controlled timing comparison.
The browser closed during the first after-run; only the completed rerun is used.

WebGPU after-run (921×879, DPR 2) also measured 32 focused-input frames and
160 bounds reads, with two style reads. Glass idle remained at zero. The WebGPU
unfocused-input sample unexpectedly recorded 34 frames/170 bounds reads, and
repair-disabled images recorded six frames. This harness does not distinguish
late initialization from global pointer/resize wakeups; these samples do not
establish a clean WebGPU idle baseline. Investigate with event-attributed traces
before claiming all DOM cases are idle on both backends.

## Still open

- The input still performs five bounds reads per rendered frame and repaints a
  whole texture when caret paint changes. Shared geometry snapshots and smaller
  dynamic updates remain DOM hardening work; offscreen focused inputs still need
  explicit visibility scheduling.
- Each caret wake still renders during the 250 ms settle window. Rendering only
  once per blink needs a separate engine scheduling contract.
- `repairInterval: 500` still wakes otherwise idle DOM scenes. The after WebGL2
  sample rendered 31 frames, with 91 bounds reads and 72 style reads. Disabling
  repair produced zero idle work, but trades away detection of unobserved changes.
- Glass idle is verified; pointer/drag tail duration and GPU fragment cost under
  load were not profiled here. Its shader uses a procedural backdrop, no DOM capture.
- Most animated looks and fluids deliberately update continuously. They should
  not be used as evidence for the idle cost of a static product page.

Validation: 111 package tests passed, one optional font test skipped; package
build and 32 consumer checks passed; Vite harness production build passed.
Harness TypeScript still reports the existing FXAA metadata mismatch and nullable
main-page elements, with no errors in the changed input/performance harness.

The WebGPU DOM lab also accepted typing and title submission after the timer
change, with the field reporting active GPU paint.
