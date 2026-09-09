# Physics, utils and lightweight-consumer audit

Date: 2026-09-09. Scope: current uncommitted workspace following 0.0.5, including
three Rapier recipes, object position fields and `shooosh/utils`. No release made.

The new optional utilities and physics packages remain isolated from simple DOM
consumers. No sustained idle rendering was found in the physics samples. The
largest cost is the optional WASM download, followed by per-object rendering when
scaling beyond these small demos. These findings are desktop measurements, not a
mobile performance guarantee or a GPU execution-time measurement.

## Reproducible checks

- `bun test package`: 121 pass, one optional font-generation skip.
- `bun run bin/build.ts`: 11 package-artifact checks, 58 Bun/Vite consumer checks,
  nine example tests pass.
- `bun run bin/audit-bundle.ts`: emitted-JS fingerprint and five consumer graphs.
- `pnpm --filter harness build:perf`: production audit build passes.
- Serve `harness/dist/perf` with Vite preview, then open
  `/perf.html?backend=webgl2&scenario=physics`; repeat with `webgpu`.
- `scenario=baseline` runs the engine, glass, WIP materials/compute, DOM and input
  scenarios. `scenario=wip` still selects only the three original WIP demos.

The harness now covers active/paused/sleeping states for each physics recipe,
records initialization time, waits for genuine Rapier sleep, and holds its fixture
in view even when result rows grow. Active tests apply an impulse every 800 ms.
Paused/sleeping states assert zero frames when there are no external wake events.
One active sample per scenario: 1.5 s warm-up, 2 s capture. Baselines use 1 s capture.
The pendulum can take about 35 s to sleep; the test allows 60 s before failing.

## Bundle findings

Vite production ESM consumers; gzip-9 bytes of the initial static closure:

| Consumer | Current | 0.0.5 release build | Difference |
| --- | ---: | ---: | ---: |
| Renderer probe | 308 | 308 | 0 |
| Item + shared layer | 8,153 | 8,157 | -4 |
| DOM layer | 13,485 | 13,485 | 0 |
| Scene | 15,237 | 15,137 | +100 |
| Pose utility | 268 | absent | optional |
| Vector utility | 175 | absent | optional |

Baseline numbers come from the saved 0.0.5 release build log in this session.
The 100-byte scene increase is consistent with the new mesh-position API; it
is not a regression in the DOM path. Tiny minifier differences are not savings
worth pursuing. Unused utils emit only the 44-byte gzip fixture assignment:
no utility code remains. Vector-only imports remove Euler conversion.

The selected 3D recipe initially loads 17,656 gzip bytes with Vite, while all
emitted code (including WASM and lazy renderer branches) totals 1,126,238 bytes.
The 2D pile starts at 17,150 and totals 836,307. A full gallery naturally emits
both physics packages, but they remain independent dynamic imports. Neither is
in the published package, root browser API, DOM graph or flat item/layer graph.

The full utils ESM file is 554 bytes gzip before selecting exports. The root CJS
file is 43,678 bytes gzip and global IIFE 43,437; these intentionally include lazy
backend implementations in a single file. Browser applications should use ESM
for the tested tree-shaking/code-splitting behavior. Entry-file bytes alone are
not total transfer: ESM entries can statically import shared chunks.

The local pack dry run, taken before adding this audit report, contains 129 files: 611,255 bytes compressed, 2,210,424
unpacked. Source maps account for 1,432,966 unpacked bytes (about 65%). This is
installation/debugging footprint, not automatic browser transfer. Keep maps
unless package-install size is a priority; removing them would sacrifice debugging.
There are no runtime dependencies and no Rapier files in the tarball. The
manifest's Rapier entries are development dependencies for repository examples.
The package version is still 0.0.5; this dry-run artifact is not a published release.

## Browser physics results

Chrome 152, macOS arm64 host, DPR 2, viewport 1280×720, fixed 600×360 CSS fixture.
Runs were sequential with no recorded visibility interruptions or external wake
events. CPU spans measure registered render callbacks, including physics and
render submission, excluding asynchronous GPU execution and compositor work.

| Active recipe | WebGL2 frames / 2 s | WebGL2 CPU p50 / p95 ms | WebGPU frames / 2 s | WebGPU CPU p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Falling blocks | 121 | 0.4 / 0.8 | 120 | 0.2 / 0.3 |
| Pendulum | 121 | 0.2 / 0.3 | 120 | 0.2 / 0.3 |
| 3D cubes | 120 | 0.5 / 0.8 | 120 | 0.5 / 0.8 |

All six paused/sleeping samples per backend: **0 frames, 0 frame requests,
0 bounds reads, 0 style reads**. All active physics samples also made zero explicit
bounds/style reads. The observed ~60 fps is the sampled callback rate, not an
independently measured presentation rate.

Initialization (engine + module init + world/mesh construction, not first pixels)
for the first 3D mount in each run was 95.3 ms on WebGL2 and 27.9 ms on WebGPU;
subsequent 3D mounts were 10.5/10.6 ms and 4.5/10.4 ms respectively. Browser/module
cache state differs, so this does not establish a cold-load backend comparison.
The compatibility WASM is already packed into its JS download: approximately
792 KB gzip for 2D or 1.08 MB for 3D. Actual network/cache behavior on a deployed
site remains separate from these local transfer estimates.

## Ordinary DOM and input regression samples

Both backends completed all 15 ordinary baseline scenarios without external
wake events or visibility interruption. The WebGL2 script-resource list contains
no Rapier chunk: a gallery/harness import alone did not trigger its download.

| Scenario (one second) | Frames GL2 / GPU | Bounds GL2 / GPU | Style reads GL2 / GPU |
| --- | ---: | ---: | ---: |
| Engine, glass, three WIP demos idle | 0 / 0 | 0 / 0 | 0 / 0 |
| 20 images idle, repair disabled | 0 / 0 | 0 / 0 | 0 / 0 |
| 20 images idle, 500 ms repair | 0 / 0 | 42 / 42 | 48 / 48 |
| 100 images forced active | 60 / 60 | 60 / 60 | 0 / 0 |
| Input idle | 0 / 0 | 4 / 4 | 7 / 7 |
| Input focused | 32 / 32 | 4 / 4 | 7 / 7 |

The 100-image active callback CPU p95 was 0.8 ms WebGL2 / 0.4 ms WebGPU. These
reads are shared canvas tracking, not one read per ordinary image. The repair
polling work remains at idle but makes no frame requests when nothing changes.
CSSOM-only image/input changes each triggered one request and a 16-frame settle
window. Focused input triggered two requests for caret updates and finite settle
windows; it did not render continuously. SSS/SSAO on WebGL2 remain explicit
fallbacks, so their zero idle cost is not evidence of effect parity.

The initial WebGL2 baseline used a fixed ancestor, accidentally exercising the
pinned path. That result is retained separately: 100 active images made 6,060
bounds reads, and focused input made 100. Re-running the same backend with an
absolute-positioned fixture restored 60 and 4 respectively. Physics samples have
no DOM bindings and measured zero reads even in the fixed fixture.

Evidence: [ordinary WebGL2](./2026-09-09-baseline-webgl2.json),
[ordinary WebGPU](./2026-09-09-baseline-webgpu.json),
[pinned WebGL2](./2026-09-09-baseline-pinned-webgl2.json).

## Findings to prioritize

1. **Optional physics transfer is the biggest cost.** Retain dynamic imports and
   load on user intent/visibility. A separate `.wasm` distribution could avoid
   embedded base64, but must be measured before adopting; this audit does not
   establish a concrete saving for that alternative.
2. **Geometry duplication limits scaling.** The rounded-box generator uses 726
   vertices / 1,200 triangles / 24,624 geometry bytes per mesh. The 3D recipe has
   23 meshes, 27,600 triangles and ~566 KB of geometry data before uniforms,
   driver overhead or backend repacking. Eighteen identical cubes alone duplicate
   ~443 KB. Shared geometry or instancing is a plausible next step for much larger
   scenes; current measured callback costs do not justify an engine rewrite.
3. **Frame-request bookkeeping repeats per body.** Active 3D samples issued
   1,851 WebGL2 / 2,031 WebGPU requests over 120 frames. Setters and the physics
   loop each mark dirty. They coalesce rather than scheduling that many draws.
   Consider batching only if profiling larger scenes identifies measurable cost.
4. **Pinned DOM tracking has a per-element measurement cost.** A fixed-ancestor
   sample with 100 active images made 6,060 bounds reads/s; the ordinary WebGPU
   path made 60. This follows the fixed/sticky positioning contract, not the
   new physics/utils imports. Avoid assuming cached document offsets cover
   pinned or animated layouts. The extra reads alone do not establish forced
   reflow cost; that requires a browser trace.
5. **Testing still has an unrelated TypeScript gap.** Full harness `tsc --noEmit`
   reports the existing FXAA post-tag mismatch and nullable stage/nav variables.
   Package/build checks pass; no new physics/utils diagnostics were observed.

## Limits

No Chrome DevTools trace server is installed in this session, so this report does
not claim GPU timings, Core Web Vitals, long-task attribution, mobile throttling,
heap/VRAM leak freedom, or comprehensive cold-cache download measurements. The
available Web Performance skill requires that trace server; this audit instead
uses the repository's browser instrumentation and emitted-bundle checks. Each
scenario mounts/destroys resources, but those cycles alone are not a heap leak test.

Raw evidence: [consumer graphs](./2026-09-09-consumer-bundles.json),
[build fingerprint](./2026-09-09-bundle.json), [package sizes](./2026-09-09-artifact-sizes.json),
[WebGL2 physics](./2026-09-09-physics-webgl2.json),
[WebGPU physics](./2026-09-09-physics-webgpu.json).
