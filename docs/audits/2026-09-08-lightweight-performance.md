# Bundle and browser performance audit

Date: 2026-09-08. Scope: current uncommitted workspace, including the DOM adapter
and example-only input mirror. Three independent agents reviewed bundle reachability,
core runtime costs and DOM/input performance. Lead added reproducible measurements.
The baseline below predates production optimization. The completed
[tree-shaking follow-up](./2026-09-08-tree-shaking-results.md) records the first fixes,
consumer budgets and browser verification; runtime findings remain separate.

## Measured bundle costs

Reproduce after building: `bun run bin/audit-bundle.ts`.
[Recorded data](./2026-09-08-bundle.json), Bun 1.4.0, minified browser ESM, splitting.
Tiny consumers retain named exports in a global array. Initial bytes traverse
static generated imports; emitted bytes also include lazy chunks. gzip level 9
is summed per file. Sizes include the tiny fixture, exclude HTTP headers/maps.
The saved snapshot includes a SHA-256 fingerprint of the inspected dist JavaScript
files, along with Bun/platform/architecture metadata.

| Consumer | Initial raw / gzip bytes | All emitted raw / gzip bytes |
| --- | ---: | ---: |
| `probeRenderer` | 14,083 / 6,520 | 33,364 / 15,837 |
| `createItem` | 25,692 / 10,969 | 44,909 / 20,287 |
| `createScene` | 47,176 / 18,840 | 99,571 / 41,462 |
| `createDomLayer` | 35,233 / 14,681 | 59,203 / 26,019 |
| `createScene` + `createDomLayer` | 59,390 / 23,454 | 111,694 / 46,086 |

All emitted bytes are **not** initial browser download cost. Actual selected-backend
fetch totals remain to be recorded with a production app bundler/network trace.
The audit script's static-import scanner handles Bun's generated forms; it is not
a general JavaScript parser. Add Rollup/Vite consumer checks before release budgets.

### Strongest bundle finding: unused factories survive tree shaking

Top-level `createLazyGpuFactory()` / `createPendingAttachQueue()` initializers are
not declared pure. This retains otherwise unused primitive modules and GPU import
trees even for a capability-only import. See [plane](../../package/src/primitives/plane.ts:417),
[item](../../package/src/primitives/item.ts:33), [object](../../package/src/primitives/object.ts:31),
[particles](../../package/src/primitives/particles.ts:48),
[MSDF](../../package/src/primitives/msdf-glyphs.ts:46), and
[lifecycle](../../package/src/primitives/primitive-lifecycle.ts:29).

An agent's temporary source-build experiment annotated these factories in memory:
the capability consumer fell from 13,866 raw / 6,433 gzip bytes across 8 initial
files to 1,035 / 580 bytes in one file. A direct capabilities-module import was
554 / 322 bytes. This is a separate experimental fixture from the table above;
its source transform is not a production fix and must be validated for semantic
safety. The factories appear to allocate closures/collections without initiating
rendering; review that invariant before adding purity annotations.

Other bundle opportunities:

- `package.json` has no side-effect metadata. Audit real initialization effects
  and the global/IIFE entry before adding precise metadata; never apply a blanket
  `sideEffects:false` without runtime tests.
- Backend engines are lazy, but managers statically include WebGL renderer,
  compiler and translation code even for WebGPU. Evaluate symmetric lazy backend
  renderers after fixing dead-code retention; measure added requests/chunk costs.
- `createScene` intentionally supports textures/post/items/objects/screens and
  imports that machinery. Measure a lean screen mount and feature-level loading
  before changing the public API. Do not count intentional capabilities as bugs.
- Root/DOM share ESM chunks; Node MSDF remains separate; browser runtime has zero
  npm dependencies. Preserve those boundaries as input/SVG features are added.
- Single-file IIFE is 141,406 raw / 43,340 gzip bytes, root CJS 141,728 / 43,500,
  DOM CJS 61,356 / 21,359 in the inspected build. They intentionally inline lazy
  imports. Prefer ESM for browser size benefits.
- Inspected dist was 1,960,564 bytes, including 1,400,744 bytes of source maps.
  Disk/install size is separate from normal network transfer. npm tarball size
  was not measured. Source maps are not automatically wasteful browser bytes.

## Measured browser costs

Reproduce with the Vite harness at `/perf.html?backend=webgpu` and
`/perf.html?backend=webgl2`, then **Run audit**. Keep the tab visible and pointer
stationary. Fixture instruments all explicit `getBoundingClientRect` and
`getComputedStyle` calls and restores instrumentation after each scenario.

[Recorded data](./2026-09-08-runtime.json): Chromium 152 in-app browser, DPR 2,
921×879 viewport, 600×360 canvas, 1.5s warmup + one nominal 1s sample per scenario.
All requested images/input activated; document remained visible. Actual hardware
model was not recorded. Source was served by Vite dev server.
Image scenarios share one synthetic 48×30 texture across all bindings; they do
not measure unique-image decode/upload/residency scaling. Discarded engines and
canvases are destroyed between cases. The revised harness rejects any run hidden
during warmup or sampling.

| Scenario | Frames in 1s (GPU / GL) | Bounds / style calls (both unless stated) | GPU / GL callback CPU p95, ms |
| --- | ---: | ---: | ---: |
| Bare engine idle | 0 | 0 / 0 | — / — |
| 20 DOM images, repair disabled, idle | 0 | 0 / 0 | — / — |
| 20 DOM images, default 500ms repair, idle | 33 / 33 | 93 / 72 | 1.6 / 1.8 |
| 1 DOM image, explicitly active | 60 / 60 | 60 / 0 | 0.1 / 0.2 |
| 20 DOM images, explicitly active | 61 / 60 | GPU 61 / 0; GL 60 / 0 | 0.4 / 0.4 |
| 100 DOM images, explicitly active | 60 / 60 | 60 / 0 | 0.8 / 1.0 |
| Input prototype, unfocused idle | 0 | 0 / 0 | — / — |
| Input prototype, focused | 60 / 60 | 300 / 2 | 0.4 / 0.3 |

These are short instrumented callback spans, **not total frame/GPU time**, not
forced-layout counts, not FPS guarantees and not portable performance budgets.
Use repeated production traces on target devices before setting timing limits.
The operation counts directly confirm two avoidable scheduling costs:

1. DOM repair invalidates everything every 500ms, repeatedly activating the 250ms
   settle tail. A static default session rendered 33 times in the final one-second sample.
2. The example's 100ms focused-caret timer never lets that settle tail expire.
   Its five bounds calls per active frame produced 300 calls in one second.
   This is example code, not yet a packaged input feature. The lab's old adapter
   counter excludes these calls; the benchmark does not.

Cached DOM geometry is already effective: the 100-image case used one shared
canvas bounds read per frame and no style reads after warmup.

## Source-backed runtime opportunities

These require targeted measurements before claiming millisecond savings.

| Priority | Finding | Evidence and next test |
| --- | --- | --- |
| P1 | Global input events wake every running engine, including unrelated/offscreen scenes | [settle-loop.ts](../../package/src/engine/settle-loop.ts:89); test 1/10 isolated offscreen scenes with pointer movement elsewhere |
| P1 | Pending primitives can poll rAF indefinitely when no engine appears | [pending-attach.ts](../../package/src/primitives/pending-attach.ts:49); fake-rAF unavailable/destroy/late-engine tests; replace polling with lifecycle subscription or bounded wait |
| P1 | Ordinary objects reread canvas bounds per object; ordinary items reread every element | [object.utils.ts](../../package/src/primitives/object.utils.ts:242), [item.utils.ts](../../package/src/primitives/item.utils.ts:36); share canvas reads first, preserve live transform semantics |
| P1 | DOM repair/input caret scheduling wastes idle work | Browser measurements above; explicit repair policy and exact caret deadlines, with hidden/offscreen/native-only gates |
| P2 | Every visible item uploads vertices/uniforms each render even unchanged | [gpu-item.ts](../../package/src/primitives/gpu-item.ts:159), [item.ts](../../package/src/primitives/item.ts:200); count upload calls/bytes for one moving item among 100 static ones |
| P2 | DOM sorts entries/scans animations each frame; unrelated changes dirty the entire session | [session.ts](../../package/dom/session.ts:133); cache order, classify invalidation and profile unrelated mutation workloads |
| P2 | Eager image uploads and no residency budget | [session.ts](../../package/dom/session.ts:195); measure offscreen admission, retained fallback textures, decoded/uploaded bytes and cancellation |
| P2 | Two-pass WebGPU post allocates two intermediate targets where one suffices | [processor-webgpu.ts](../../package/src/post/processor-webgpu.ts:181); GL already allocates one for two passes; extra 3840×2160 RGBA8 target ≈31.6 MiB (calculation, not measured memory) |
| P2 | Flat WebGPU scenes still allocate depth | [webgpu-engine.ts](../../package/src/engine/webgpu-engine.ts:265); evaluate opt-in 2D target/pipeline contract, not a one-line removal |
| P2 | Input resets backing canvas and redraws/uploads full field for each caret change | [dom-canvas-input.ts](../../examples/dom-canvas-input.ts:60); keep same-sized backing store, update only when required, preserve existing GPU texture reuse |
| P3 | Per-frame uniform packing, post records and state transitions | Profile allocations after larger scheduling/geometry/upload issues; avoid speculative abstractions |

Additional measured **stub-DOM call counts**, not browser timing: actual geometry
helpers for 100 ordinary items ×60 calls performed 6,000 element +60 canvas reads;
100 DOM-backed objects performed 6,000 element +6,000 canvas reads. The DOM adapter
cache is a distinct path from these ordinary primitives.

Existing strengths to preserve: idle rAF termination, resize/DPR tracking,
subscriber ordering cache, refcounted GL programs/GPU pipelines, bind-group caches,
scratch typed arrays, pre-draw culling, image bitmap cleanup, shared DOM texture
resources, and cached particle uniform uploads. Culling currently does not avoid
every DOM read or eager texture load.

## Prioritized execution and guardrails

1. **Bundle retention:** review pure initializers and side effects; add small
   consumer regression builds under Bun and Vite/Rollup. This has demonstrated
   potential and can avoid runtime behavior changes. [Task 12](../agent-tasks/12-bundle-tree-shaking.md).
2. **Scheduling:** explicit engine event/visibility participation, no endless
   pending-attach loop, repair-mode policy, caret deadlines. Keep scroll and
   animation correctness; do not disable safety repair silently to win an idle test.
3. **Geometry and upload dirtiness:** share canvas/DOM reads, migrate input to the
   session, track resource/uniform/vertex revisions; count all helpers.
4. **Resource/post memory:** viewport admission/byte accounting, two-pass target
   count, optional depth/resolution policy with backend parity.
5. **Backend loading and batching:** only after production transfer/runtime traces
   establish payoff. Preserve composition order, shader semantics and simplicity.

Run one bounded engine task at a time. Implementer owns changes; validation agent
owns independent fixtures; reviewer checks semantic safety and measured gains.
No fixed optimization is accepted solely because a microbenchmark improves.

Required gates:

- Zero new browser runtime dependencies. Input/SVG/diagnostics remain optional and
  removable for image-only consumers. No framework/HTML rasterizer added to base.
- Consumer manifest records initial raw/gzip/static closure, emitted lazy code,
  real selected-backend requests, and combined root+DOM deduplication. Establish
  numeric budgets after first tree-shaking fix; fail unexplained growth thereafter.
- Static repair-disabled session: zero owned frames/uploads/rasterization after
  settle over 30s. Repair-enabled cost separately reported. Lab telemetry excluded
  from library totals but reported as page overhead.
- Caret deadlines only; no unchanged uploads or same-size texture/backing-store
  allocations. Offscreen/hidden/native-only inputs produce no caret work.
- Benchmark 1/20/100 plus stress, image/input/icon/mixed, ordinary items/objects,
  1/2/5 post passes and multiple canvases. Record reads, uploads, bytes, targets,
  long tasks, CPU p50/p95 and cadence on both backends.
- Timing regressions must exceed measured run-to-run noise before acceptance is
  judged. Freeze fixture budgets before evaluating a candidate, never afterwards.
- Fifty mount/destroy/source/resize cycles return owned listeners, resources and
  observers to baseline; evaluate retained-heap trends separately from GC timing.
- Verify `bun test package`, `bun run bin/build.ts`, relevant typechecks/builds,
  rendering/input parity, native fallback and loss handling after each fix.

Not measured yet: production network waterfalls, parse/evaluate time, shader compile
latency, GPU timestamps, physical memory/energy, long-run heap, mobile/low-end GPUs,
unrelated-event/offscreen scene traces and WebKit/Firefox. Those remain explicit
audit follow-ups; this report does not claim global optimality.
