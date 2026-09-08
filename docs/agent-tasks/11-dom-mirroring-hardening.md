---
id: 11
status: todo
title: Harden DOM takeover and establish regression fixtures
---

# 11 — Harden DOM takeover and establish regression fixtures

First executable stage of the user-selected
[DOM mirroring plan](../proposals/dom-mirroring-delivery-plan.md), stage A.
This is queued work, not completed implementation. Do not start stage B in this
run. Existing unrelated tasks 02–07 are neither completed nor reordered by this
packet; this task applies when continuing the selected DOM roadmap.

## Objective

Make the current supported image/quad subset decline unsafe takeover reliably,
and replace broad smoke-test claims with reproducible correctness evidence before
adding reusable input/SVG features.

## Scope

1. Reproduce and resolve plan findings H01–H03: paint containment/legacy clips,
   image outlines, actual fixed-position clip chains, canvas presentation and
   partial coverage. Accurate implementation or explicit native fallback is
   acceptable; silently approximate CSS is not.
2. Resolve H05: print and renderer-loss ordering cannot revive failed GPU paint.
3. Resolve H06: specify/reproduce sibling-driven layout animation; implement
   tracking or require a documented explicit tracking lease for this case.
4. Resolve H14/H16: reject conflicting canvas/element owners; preserve same-session
   idempotence; borrowed sessions restore their own paint without hiding another
   owner's canvas.
5. Establish named deterministic browser fixtures and a threshold manifest for
   pixel/geometry/performance evidence. Label existing input prototype work as
   excluded from adapter-only counters; do not claim total-scene one-read frames.

Do not implement input packaging, SVG capture, rounded boxes, video, general
transforms, or the dynamic texture API in this task. Same-source retry/request
policy belongs to B; input performance/integration belongs to D.

## Delegation packet

- **Lead:** freezes baseline and allowed-file ownership; owns shared integration
  edits, docs and final verification. Preserves existing uncommitted user work.
- **Implementation agent:** `package/dom/session.ts`, `style.ts`, `geometry.ts`,
  `paint.ts`, and a small ownership helper if needed. No test/fixture edits unless
  ownership is explicitly reassigned.
- **Validation agent:** new style/session regressions and named harness fixtures,
  manifest, reset controls and failure evidence. Owns new test files; coordinates
  any edits to existing tests or harness with lead before writing.
- **Independent reviewer:** read-only final-diff review of safety, CSS eligibility,
  ownership, browser evidence and docs claims. Must not approve solely from the
  implementer's test summary.

All four may operate in one bounded task. Only one agent operates the browser at
a time. If findings require unrelated engine changes, split a follow-up task and
record a safe native fallback rather than silently expanding this task.

## Acceptance and evidence

- Regression fixtures fail against the relevant old behavior and pass after fix.
- Native reference and forced WebGPU/WebGL2 agree within the fixture's frozen
  tolerance, or unsupported cases remain fully native with a reason.
- Test unavailable backend, late resource completion after disposal, ownership
  collisions, borrowed-engine survival, and loss between before/afterprint.
- Test runtime canvas CSS changes and partial native-visible coverage; no blank
  image or hidden native pixels outside the canvas.
- Test sibling animation with repair scans disabled, including explicit tracking
  if required by the supported contract.
- Run `bun test package`, `bun run bin/build.ts`, targeted strict typecheck and
  harness build. Run web build if its integration changes. Retain existing image
  and example smoke checks; do not rename them as pixel or accessibility tests.
- Deliver exact fixture URLs, browser/backend/DPR, assertions, screenshots/diffs,
  baseline counters, missing environments and independent review findings.

Only mark `done` after the final integrated candidate passes. Then prepare stage
B as the next bounded packet; do not begin it automatically in this engine run.
