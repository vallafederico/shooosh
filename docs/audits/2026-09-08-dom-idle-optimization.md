# DOM idle optimization: completed pass

This closes the geometry/repair follow-up from the [example audit](./2026-09-08-examples-performance.md).
It does not complete the broader DOM hardening/input product roadmap.

## Changes

- The input prototype reuses `RectTracker` snapshots for bitmap layout and GPU
  placement. Scroll offsets update cached geometry without repeating five bounds
  reads per render. Resize, mutations, focus, load, fonts and interaction invalidate
  layout. Fixed/sticky maintenance compares against the last rendered snapshot.
- A one-second check-only input repair detects unobserved CSSOM position/font/clip
  changes. It wakes rendering only if something differs. Application-driven layout
  animations must call the prototype's `invalidate()` hook while changing layout.
- Input attribute observation compares the first old value with the final value
  of a mutation batch. Net-zero opacity changes during image maintenance no longer
  invalidate the input or reopen render bursts in a combined scene.
- Offscreen and hidden inputs stop caret timers; offscreen input maintenance also
  pauses. The bitmap backing allocation is reused until its dimensions change.
- DOM image repair still checks native styles and geometry every 500 ms by default,
  but unchanged scans no longer request frames. Sources, clipping ancestry,
  fixed/sticky status, geometry and ordering are compared. Native opacity is
  restored/reapplied synchronously for style inspection, before the task ends.

No new browser dependencies or public engine scheduling APIs were added. The
prototype still uses internal item/texture seams; this is not input packaging.

## Evidence

The performance harness now records explicit frame requests and global pointer,
resize, scroll and focus events. It includes combined image/input idle, image
CSSOM repair and input CSSOM repair. An unchanged maintenance scan must not request
frames when there are no external wake events; a CSSOM change must request one.

Final production WebGPU run: Chrome 152, DPR 2, 921×879 viewport, one-second windows
following 1.5 seconds warm-up. No external wake events or hidden-document intervals
were recorded in this run.

| Scenario | Rendered frames | Bounds / style reads | Explicit frame requests |
| --- | ---: | ---: | ---: |
| Engine idle | 0 | 0 / 0 | 0 |
| Glass idle | 0 | 0 / 0 | 0 |
| 20 images, repair disabled | 0 | 0 / 0 | 0 |
| 20 images, repair 500 ms | 0 | 42 / 48 | 0 |
| One image + input idle, image repair enabled | 0 | 8 / 17 | 0 |
| Input idle | 0 | 4 / 7 | 0 |
| Input focused | 31 | 4 / 7 | 2 |
| Image CSSOM position change | 16 | 21 / 15 | 1 |
| Input CSSOM position change | 15 | 8 / 14 | 1 |

The final frozen-build WebGL2 run at the same viewport also passed all twelve
scenarios without external wake events: the same idle/read/request counts, 32
focused-input frames, and 16 frames for each CSSOM repair. WebGPU recorded 31
focused-input frames and 15 for input repair; this frame-boundary variation does
not change the operation-count result.

The original focused-input sample was 60 frames and 300 bounds reads per second.
The first caret-only optimization brought that to 32 frames and 160 bounds reads;
the completed cache reduces the reads to four low-frequency maintenance reads.
Unchanged image repair previously rendered roughly 30 frames per second; now it
performs its scan without submitting frames.

One blink request still opens the existing 250 ms settle window. This deliberately
preserves engine scheduling semantics; the input is not claiming one GPU frame per
blink. Maintenance is not free CPU work. The counters include scan reads even when
there are no render callbacks; callback timings therefore do not measure that scan
cost, full browser CPU, GPU execution or compositor latency.

The earlier unexplained WebGPU idle samples did not recur in the clean frozen
build. Event attribution also caught real pointer input in an intermediate run;
that disturbed sample is excluded from the final comparison. Dev-server reloads
interrupted other runs, so final measurements use a production build.

## Reproduce

```sh
bun run --cwd harness build:perf
bun run --cwd harness preview --outDir dist/perf --port 5175
```

Open `/perf.html?backend=webgpu` or `backend=webgl2`, keep the tab visible and the
pointer still, then click Run audit. To isolate a case, append e.g.
`&scenario=input%20CSSOM%20change%20repaired`. The page exposes the full JSON report.

Independent review found and verified fixes for stale CSSOM/pinned geometry and
combined-scene observer wakeups. Package tests: 114 passed, one optional font test
skipped. Package build, 36 current consumer checks and the production harness/perf
builds passed. Existing harness TypeScript errors in FXAA metadata and nullable
main-page elements remain outside this pass.

DOM ESM consumer startup grew by approximately 350 gzip bytes for change-aware
maintenance (Vite fixture: 13,485 bytes). The existing 15,500-byte ceiling passes;
small root/utility consumers do not retain this optional code. Browser frame
savings are not presented as a reduction in bundle bytes.

The WebGPU DOM lab was visually checked after typing and submission: the rounded
GPU field stayed aligned with native editing after scrolling into view.
