# DOM mirroring: gap specification and agent delivery plan

Status: proposed implementation plan, based on a three-agent source audit on
2026-09-08. This document specifies future work; it does not make prototype
behavior a supported package API. [Current API](../dom.md) remains authoritative.

## Outcome

Cross-cutting constraint: [bundle and browser performance audit](../audits/2026-09-08-lightweight-performance.md)
adds measured baselines and a separate [bundle retention task](../agent-tasks/12-bundle-tree-shaking.md).
DOM features must not grow image-only consumers with unused input/SVG code.
Use its consumer-size, total-operation-count and idle gates alongside V11/V12.

Make selected HTML elements the source of layout, content, style, semantics and
interaction, while shooosh paints their supported visuals through WGSL on WebGPU
and WebGL2. A real input handles editing; a GPU material mirrors its current
state. The same principle applies to supported boxes, SVG icons and text.

Success is a reusable optional `shooosh/dom` pipeline, not a collection of
example-specific painters. A supported element must match native paint at zero
effect, remain operable with effects, and restore native paint on failure.

The first release target is **images + boxes + static SVG icons + single-line
text inputs** in an explicit canvas composition region. General display text,
video, transformed regions and browser-native HTML-in-canvas are separate stages.
Every excluded case needs an explicit native fallback and a reason.

## What exists, and what does not

| Area | Current state | Work required |
| --- | --- | --- |
| Optional entry | Built ESM/CJS/types, SSR-safe `shooosh/dom` | Preserve isolation and zero browser runtime dependencies |
| Ownership | Explicit engine; owned/borrowed teardown; image resource generations | Enforce single session/element ownership, shared dynamic-resource lifecycle |
| Activation | Images hide only after submitted draw; restore on failure/loss | Extend equivalent guarantees to boxes, SVG and inputs; submission is not GPU validation success |
| Geometry | Cached root/nested offsets; rectangular clips; live pinned bounds | Canvas validation, containing-block-aware clips, paint containment, fractional/DPR/mobile coverage |
| Scrolling | Render-phase offset sampling | Quantify compositor lag separately; provide optional coordinated integration, never claim native scrolling is frame-locked |
| CSS | Conservative image validator | Typed snapshots, computed colors, per-corner radii, borders/backgrounds, style invalidation, painted-part ownership |
| Images | Current source, fill/cover/contain, percentage position, refcounted URL cache | Retry same URL, complete fit/position cases, visibility/resource policy |
| Inputs | Example-only LTR Canvas2D texture mirror | Reusable binding, supported-style validation, shaping guard, state invalidation, clipping, scheduling and tests |
| SVG | Native save/reset SVG; canvas pencil redrawn by hand | Mirror the actual SVG source and its computed paint; handle source/style/resource invalidation |
| Static text | Existing MSDF primitives, no DOM text adapter | Font/run matching, layout extraction, shaping eligibility and fallback |
| Video | Not in DOM adapter | Frame-driven dynamic uploads and playback/visibility lifecycle |
| Uniforms/effects | WGSL items; texture fit occupies values 5–8 | Internal material data separate from user uniforms; no new package look presets |
| Telemetry | Adapter image bounds counter | Total/per-kind reads, uploads, allocations, frames and fallback reasons |
| Tests | Geometry/resource/paint units; 9 lab and 16 standalone smoke checks | Actual rendered pixels, input editing, clipping, loss/recovery, a11y and measured performance |

Existing passes are a baseline, not proof of full fidelity. In particular,
`state === "active"` does not prove correct clipping or visible pixels, and the
lab's `rectReads === 1` excludes its experimental input painter.

## Release-blocking findings from the source audits

These are source-review findings to reproduce with regression fixtures before
fixing. Distinguish them from behavior already verified in a browser.

| ID | Finding / source | Required disposition |
| --- | --- | --- |
| H01 | `style.ts` does not account for paint containment, legacy clip, or image outlines | Correct support or explicit native fallback; no false declaration of CSS support |
| H02 | `geometry.ts` applies all overflow clips to fixed descendants | Resolve actual containing block/clip chain; test a viewport-fixed child escaping an overflow ancestor |
| H03 | `session.ts` does not validate the canvas's own geometry/paint CSS | Reject or correctly account for canvas padding, border, transform and hidden/transparent ancestry before takeover |
| H04 | Same-source image error cannot naturally reload because URL equality gates load | Explicit retry contract and regression: failure then success at the same URL |
| H05 | Print restoration can conflict with renderer loss | Loss remains authoritative after printing; never reactivate an unavailable surface |
| H06 | Animated preceding sibling can move cached media without being an animated ancestor | Invalidation contract covers reflow from relevant siblings or requires an explicit tracking scope |
| H07 | Input visual styles/pencil are hand-authored rather than derived from DOM | Snapshot actual supported CSS and SVG; remove duplicated example design data |
| H08 | Input invalidation key omits CSS, font and several native states; RTL regex is incomplete | Property/event/style/font invalidation, computed direction and shaping eligibility guards |
| H09 | Input directly uploads via private GPU/GL seams; GL state lacks exception-safe restoration and errors are swallowed | Backend-neutral dynamic texture contract, structured errors, state restoration and fault tests |
| H10 | Prototype optimized: 530 ms caret edges, offscreen suspension and cached geometry; engine settle bursts remain | See [completed performance pass](../audits/2026-09-08-dom-idle-optimization.md); reusable input integration and one-frame scheduling remain separate |
| H11 | Input bypasses shared geometry/clip/ordering policy and metrics | Register through session, measure once, include all work in telemetry |
| H12 | Unchanged repair scans now avoid render wakes; broad observers and per-frame scans/sorting still add work | Document repair modes, cache ordering, bound observer work and measure idle explicitly |
| H13 | Input helper accepts any input; a dynamic password type could expose `.value` in a texture | Type/state eligibility before reading/rasterizing value; password transition regression blocks API promotion |
| H14 | Session and element ownership are only documented conventions | Reject cross-session ownership collisions; retain same-session idempotence |
| H15 | Image URL-only fetch omits native request semantics | Define credentials/referrer/CORS policy, cache keys and precise fallback diagnostics |
| H16 | Borrowed-engine loss handling can hide unrelated canvas content | Restore binding paint without changing another owner's canvas presentation |

## Required contracts

### 1. DOM ownership and state

- Do not clone interactive controls, replace them with synthetic hit targets, or
  alter values to suit a renderer. Retain labels, forms, names, constraints,
  tab order, selection, focus, input events and native validation.
- Own paint properties individually. Never hide a semantic subtree with
  `visibility:hidden`, `display:none`, `inert` or `aria-hidden`. Image opacity
  takeover cannot simply be applied to a parent containing native descendants.
- Snapshot application values and priorities; restoration must preserve later
  application edits. Validate ownership conflicts before changing anything.
- Every binding moves through preparing → active or fallback → disposed, with
  supported recovery transitions and stable reason codes. `ready` remains a
  first-outcome promise; provide a state subscription for later changes.
- Draw/resource failure, disconnect, printing and renderer loss restore native
  content. Cleanup is idempotent and cancels pending uploads and scheduling.
- Only a canvas owner may hide its canvas on surrender. A borrowed session
  restores its own bindings and reports loss to the owner; it must not change
  canvas visibility for unrelated renderables.
- One canvas cannot interleave arbitrary GPU and native siblings. Registration
  must validate a documented region contract; unsupported overlaps stay native.
- Shader colour effects may preserve hit geometry. Displacement does not update
  native hit targets automatically. Interactive bindings initially permit
  geometry-preserving effects; other effects require explicit application policy.

### 2. Shared frame and resource pipeline

One session owns: invalidate → read → normalize → update resources → draw →
activate. Elements never start private rAF loops or access private backend state.

Snapshots contain stable IDs, CSS-pixel geometry, content/padding/border boxes,
clip chain, supported paint, resource revision, visibility and interaction state.
User uniforms remain independent of adapter material metadata.

Geometry/registry identity must accept `Element`, including `SVGElement`;
type-specific readers and paint leases must not assume every target has HTML
input properties or HTML box metrics. Establish this boundary before SVG work.

- Cache bounds and scroll offsets per read phase. Sticky/fixed exceptions and
  active layout tracking are counted. Never measure inside individual draw calls.
- Coalesce changes and sample native state after application updates. Provide
  `binding.invalidate()` for programmatic `.value`/CSSOM changes that emit no
  observable event. Do not monkey-patch global input setters.
- Define an engine-owned dynamic texture operation: update same-size pixels
  without reallocating; resize through generation-safe replacement; atomically
  switch after valid preparation. Keep the last valid resource until replacement
  or native fallback is ready. Exact API naming is decided in stage B.
- Define premultiplied alpha, top-origin UV, colour-space policy, size/DPR limits,
  upload revision ordering, destroyed-resource errors and texture ownership.
- WebGL restores touched state in `finally`; WebGPU scopes asynchronous validation
  errors and associates them with the relevant resource/binding. Avoid per-frame
  queue completion waits or synchronous GPU readback in the runtime.
- Dispose stale upload results. Surface errors with element, phase, code and
  recoverability. Do not mark a failed update successful or suppress its reason.
- Expose upload/allocation/read counters. Polling and repair work must be visible,
  including helper, clipping, font and canvas reads.
- Specify image loading semantics: preserve supported CORS/credentials/referrer
  behavior or decline takeover. Cache keys include relevant request policy, not
  only URL. Do not assume a native image's successful load grants readable pixels.
  Stage B owns this policy and explicit same-source retry; no unbounded retries.

### 3. CSS boxes and clipping

Initial supported subset: solid fill, uniform solid border, four elliptical
corner pairs, transparent interiors, opaque ancestry, axis-aligned rectangular
layout. Normalize radii with the CSS shared reduction factor, not per-corner
clamps. Derive inner radii for padding-box clips. Preserve background-clip and
premultiplied border-over-background behavior.

Validate canvas presentation at mount and on runtime changes. Partial canvas
coverage is valid only when it covers the element's complete native-visible
clipped region; otherwise decline whole-element takeover. Do not hide native
pixels outside the canvas merely because the intersecting part drew successfully.

Decode computed CSS colour into the documented renderer colour space. Include
transparent, rgb/rgba, modern colour syntax and out-of-gamut policy in fixtures;
unsupported conversions stay native. Do not assume all computed values are rgb.

Stage C adds rounded ancestor clips with an explicit, bounded clip stack on both
backends. Respect independent overflow axes, scrollbar insets, containing blocks,
fractional sizes, paint containment and viewport clips. Reject excess depth with
a reason rather than truncating the stack.

Gradients, shadows, pseudo-elements, nonuniform/dashed borders, filters, masks,
group opacity, blending, backdrop effects and perspective are tracked later work.
Do not silently accept them while painting only part of their appearance.

### 4. Input mirror

Proposed addition: `dom.input(input, options)` using the common binding lifecycle.
Do not publish this until stage D passes. The first control is a single-line
`type=text` input with supported LTR styling. Other input types, password fields,
textarea, contenteditable and custom widgets remain native.

Composition is explicit: `dom.input(input)` owns only that input's paint;
`dom.box(wrapper)` owns only the wrapper's box paint; `dom.svg(icon)` owns the
specified SVG. An example-owned field recipe declares these members as a paint
group. It does not discover or claim arbitrary ancestors/siblings. Initial group
policy is all-native on any member's unsupported state, IME/forced-colour handover
or failure; all-GPU only after every member is ready. Stage C supplies shared
paint-group coordination; D uses box+input, E adds SVG. Test restoration without
missing/duplicate background, border, icon, text or focus paint.

The DOM supplies value, placeholder, selection range/direction, focus-visible,
horizontal scroll, disabled/readOnly/required/invalid state, direction, font,
line-height, padding, border, radius, colours and supported text decoration.
The mirror derives its pixels from those snapshots; no hard-coded theme or icon.

Eligibility is checked before extracting paint data on each relevant revision.
Test `text → password → text`: no raw password may be rasterized/uploaded, and
the prior editable-text mirror is surrendered immediately. Include inherited
`dir=rtl` with Latin values and an RTL placeholder while value is empty.

Required interactions: pointer caret placement, drag selection and selection
outside the field, Shift/arrows/Home/End, select all, deletion, undo/redo,
copy/cut/paste, Tab/Shift-Tab, form Enter submission, reset and validation.
Changing renderer mode, source styles, DPR or dimensions preserves native state.

IME composition remains native for the complete composition lifetime, restoring
GPU paint only after the final value and valid texture are ready. Candidate
windows must retain correct anchors. Test real OS IME; synthetic events alone do
not establish support. RTL, bidi controls, vertical writing, unsupported font
shaping and forced-colour modes get explicit native fallback until validated.

Measuring prefix widths is not sufficient proof of caret placement for ligatures,
kerning or complex scripts. Define and validate a shaping-safe subset; do not
change the original input's typography to make a test pass. Accessibility and
native input state must remain correct even when the visual renderer declines.

Before D implementation, freeze an eligibility table and reference fixtures for
kerning pairs, ligatures, combining marks, emoji/grapheme clusters, letter spacing
and font variants. Each case is either supported with evidence or native-only;
the prototype's Unicode-range heuristic is not an eligibility algorithm.

Caret scheduling wakes on state changes and blink deadlines, not a permanent
100 ms interval that keeps the whole scene hot. No caret uploads while unfocused,
hidden, offscreen, native-only, or during a nonempty selection. Same-size edits
must not allocate GPU textures. Restore the native input on upload/compile loss.

### 5. SVG icons

Proposed addition: `dom.svg(svgElement, options)`. Source is the actual SVG,
including viewBox, preserveAspectRatio, supported shapes, fill/stroke,
stroke-width, opacity and computed `currentColor`. SVG labels/roles and pointer
behavior remain owned by the original DOM. No independently drawn replacement
path such as the prototype pencil.

First path: serialize a validated, self-contained computed-style snapshot,
rasterize only when its content/style/size/DPR changes, then upload through stage
B. This is per-element SVG rasterization, not a whole-page screenshot. A future
SDF/vector path can preserve path-level effects without changing DOM ownership.

Support inline static icons first. External `<use>`, external images/fonts,
scripts, `foreignObject`, animation, filters and masks require explicit resource
and rendering policies or native fallback. Never execute serialized content or
fetch an unvalidated embedded URL. A tainted/failed raster must not hide native
SVG. Include currentColor on hover/focus and resizing without stale textures.

For the first release, local `<use>` and `url(#...)` paint references are also
native-only unless a validated dependency-closure resolver is implemented and
tested in E. Referenced definitions outside the selected SVG cannot be silently
omitted. Cover nested forbidden content, CSS URL references, stale raster results
after destruction, and reference cycles explicitly.

### 6. Scrolling, performance and observability

Native scrolling remains the default. Frame-phase geometry error and compositor
presentation lag are different measurements. Require ≤1 CSS pixel geometry drift
for the declared subset at sampled render times; do not claim that a main-thread
overlay has zero visual delay relative to compositor scrolling.

Later scrolling work evaluates an explicit before-render scroll-driver hook and
content-attached canvas regions. Keep third-party scroll libraries optional and
example-owned; no implicit wheel/touch interception. Large scrolled canvases must
have documented size/memory bounds. Transform support requires proper matrices,
not double-subtracting a synthetic scroll value from transformed DOMRects.

Measure 1/20/100 bindings, then a stress tier; separate images, inputs and icons.
Report total bounds/style reads, resource uploads/bytes, allocations, draw calls,
CPU p50/p95, frame cadence and idle wakeups, with hardware/browser/DPR recorded.
Set relative regression budgets from measured baselines. The old proposal's six
draw calls, 1.5 ms and 120 ms targets are aspirations, not established guarantees.

## Implementation stages and subagent ownership

Stages are sequential gates, not authorization to run the entire roadmap in one
engine turn. Follow `agents.md`: one bounded engine task per run. The user selected
this DOM roadmap; unrelated tasks 02–07 remain unchanged. Promote only the next
stage to a numbered task after its predecessor passes.

Four slots maximum: lead + implementation agent + validation agent + independent
review agent. During discovery all three agents may audit in parallel. During
implementation, independent test/fixture work runs beside code work; shared engine
and API edits have one owner. Never have competing writers in a shared file.

| Stage | Single implementation owner / allowed files | Parallel work | Exit gate |
| --- | --- | --- | --- |
| A: harden existing subset | Adapter agent: `package/dom/session.ts`, `style.ts`, `geometry.ts`, `paint.ts`; lead owns integration | Validation agent adds reproductions and truthful telemetry fixtures; reviewer verifies safety contracts | H01–H03/H05/H06/H14/H16 resolved by correct support or documented fallback; input metrics explicitly excluded until D; both backend regressions and build pass |
| B: dynamic material resources | Engine agent: loader/upload modules, narrow item integration seams, and example input upload migration | Validation agent tests updates, resize races, loss and alpha; reviewer checks API/types/SSR | One reusable update/lifecycle contract; H04/H09/H15 resolved; no private GL/GPU calls in example input; no per-edit allocation |
| C: shared CSS boxes/clips | DOM materials agent: normalized style/snapshot/box/clip modules | Validation agent builds zero-effect DOM comparison fixtures; reviewer checks CSS math | Declared fill/border/radius/clip subset matches both backends; per-part paint restoration |
| D: packaged input mirror | Input agent: new `package/dom/input*` and prototype migration | Validation agent owns editing/selection/fallback browser fixtures; reviewer checks semantics and shaping limits | Section 4 input contract passes; H08/H10/H11/H13 resolved; same real input/state through resize, mode switch, remount, failure and print |
| E: actual SVG mirroring | SVG agent: new `package/dom/svg*` and resource adapter | Validation agent covers currentColor, source edits and unsafe/unsupported content; reviewer checks resource policy | Original SVG source supplies pixels; versioned uploads, fallback and cleanup pass |
| F: integrated release gate | Lead integrates APIs/docs/examples and resolves cross-feature findings | Independent reviewer audits finished diff; validation agent runs complete matrix on frozen candidate | No open release blockers; evidence report, reproducible commands and explicit unsupported list |

H07 closes across C/D/E as duplicated styling and SVG paint leave the prototype.
H12's measurement/repair-mode documentation is required in A/F; broad-observer
and batching optimizations are profiled backlog in J. First-release idle gates
use the declared repair mode and include its actual cost, rather than promising
indefinite idle with periodic scans enabled. Full H11 closes in D, not A.

F is a verification/integration run, not a catch-all implementation stage. If it
finds a blocker, return a bounded fix to its owner, freeze a new candidate and
rerun affected gates. Do not silently finish unrelated backlog during review.

Stages A and B may need splitting if reproductions reveal multiple unrelated
engine changes. Split into additional numbered bounded tasks; do not weaken their
gates or mark an unfinished stage complete. A failed gate returns to that stage.

For each stage the lead supplies: objective, dependency commits/working-tree
baseline, allowed files, API invariants, acceptance IDs and stop conditions.
Implementation agent returns changed files and reasoning; validation agent
returns commands, results and artifacts; reviewer returns severity-ranked
findings independently. Lead resolves conflicts and records final evidence.

Only parallelize truly independent work. Test authors may write new fixtures
while implementation proceeds, but they must independently assert behavior rather
than encode the implementation. Reviewer must inspect the final integrated diff,
not only an earlier intermediate version. One agent owns the shared browser at a
time; others inspect artifacts. Preserve unrelated uncommitted changes.

## Complete later backlog, outside the first release

| Stage | Work | Prerequisite / completion evidence |
| --- | --- | --- |
| G: DOM display text | Existing MSDF tooling, font assets, run/layout extraction, selection/find accessibility, missing glyph fallback | B/C/F; verified supported fonts/scripts and wrapping, no code-point/ligature assumptions |
| H: video/resources | Native video source, frame callbacks, same-size updates, paused/offscreen/hidden policy, responsive/lazy images, LRU/memory budget | B/F; decoded-frame upload counts, playback preservation, budget/loss tests |
| I: richer composition | Matrices/axis-aligned transforms first, coordinated scroll integration, explicit multiple regions, group opacity and complex clips | A/C/F; correct hit geometry and bounded memory; never equate numeric draw order with CSS stacking |
| J: scale and batching | Order-safe instancing, shared materials, clip tables, typed instance data, WebGL2 equivalents | Profile before optimizing; stress traces and parity tests, no unsupported storage-buffer assumptions |
| K: optional browser-native HTML capture | Feature-probed HTML-in-canvas adapter, native geometry/hit synchronization and fallback | Separate experimental path; supported browser/flag/version documented, never required for stable DOM mirroring |
| L: DX and integrations | Per-binding debug overlays/reasons, framework/scroll-driver recipes, hot-swap compatibility. `scan()` for current `media`/`bind` marks is available; extend it when box/input/text ship | Stable core API first; no global shader lookup or named effect presets |

## Final verification matrix

Before implementation changes are judged, validation freezes a fixture manifest:
scenario ID, setup/reset, native reference, browser/OS/DPR/font assets, numeric
interior and edge tolerances, geometry tolerance, performance baseline and allowed
regression. Geometry tolerance is at most 1 CSS pixel. A establishes calibration;
each later stage selects its new thresholds from repeated native/reference captures
and freezes them before evaluating its candidate. An uncalibrated fixture cannot
pass. Budget changes require a recorded rationale
and independent review, never a silent relaxation to make a failed candidate pass.

Each stage ships deterministic named browser scenarios under the harness with
exact launch URL, controls/steps, expected assertions and failure screenshots or
traces. Suggested entry: `/dom-checks.html?scenario=<id>&backend=<mode>`, with
`all` for a complete stage. This fixture entry does not exist yet; validation in A
owns adding it and a manifest/README. A CI runner may follow, but reproducible
scenarios are required now. Avoid page-mutation scripts as the sole test interface.

| ID | Tests / evidence | Pass condition |
| --- | --- | --- |
| V01 | Unit: snapshots, CSS eligibility, colour/radius/clip math, source revisions and paint leases | Deterministic expected values; regression tests fail on the pre-fix implementation |
| V02 | Backend: forced WebGPU, forced WebGL2, forced unavailable, auto with WebGPU initialization failure | Both renderers actually active when required; fallback separately asserted, never silently counted as parity |
| V03 | Pixel: zero-effect DOM reference vs GPU, frozen fonts/assets/caret and recorded DPR | Geometry within 1 CSS px; declared fill/interior match under fixed colour policy; bounded AA edge tolerance, no broad masks hiding failures |
| V04 | Layout: root/nested/programmatic hidden-overflow scrolling, sticky/fixed, sibling reflow/animation, resize, zoom/DPR, visual viewport | Correct quad and clip snapshots plus rendered pixels; reported temporal lag kept separate |
| V05 | Input: typing, clicking, selection/drag, keyboard, clipboard, undo/reset/validation, mode/remount | Same DOM value/focus/selection/form behavior; visible GPU caret/selection verified, not just `active` state |
| V06 | Native fallback: unsupported style/text, IME, RTL, forced colours, print | Whole unsupported visual readable and interactive; application styles restored without loss |
| V07 | SVG: original path edits, currentColor, sizing, source races, external/unsupported nodes | Actual SVG mirrored or explained fallback; no stale render or unexpected resource execution |
| V08 | Faults: decode/upload/compile/draw validation, same-source retry, destroy during load, resize race, GPU/context loss including during print | No blank controls/page, no unhandled rejection, no disposed resource revival; recovery policy exercised |
| V09 | Ownership: two independent regions, borrowed engine, duplicate registration, reordered/removed DOM, repeated mount/unmount | No global engine mutation, duplicate event handlers/canvases, retained observers or leaked GPU resources |
| V10 | Accessibility: names/roles/labels, tab order, screen-reader smoke, focus rings, AX comparison and automated audit | Native semantics preserved; no new violations; browser/OS manual cases recorded explicitly |
| V11 | Performance: 1/20/100 + stress; idle, focus/caret, native-only, hidden/offscreen, active scroll | Full counters/traces; same-size edits allocate no new textures; no permanent focus-driven full-rate loop; baseline-relative budgets met |
| V12 | Packaging: package tests/build, consumer ESM/CJS/types, SSR import, harness/web build, dependency/entry check | All mandatory commands pass; no Node tooling or new runtime dependency in browser entry; examples use supported seams |

V05 includes idle `.value`/selection updates followed by explicit invalidation,
form reset after settling, same-size CSS/webfont changes, password type transitions,
inherited direction and empty-value placeholder cases. V07 includes local SVG
references and stale async results. V09 distinguishes same-session idempotence
from duplicate sessions on one canvas and cross-session ownership of one element.

Browser coverage: both GPU backends in Chromium; WebGL2/native fallback on Firefox
and Safari where available; mobile keyboard/visual-viewport and OS IME manually.
Record unavailable environments as **not run**, never as passes. A release claim
must be limited to the tested support matrix.

Every applicable mandatory case must pass in every declared supported environment.
An unavailable environment blocks that support claim or is explicitly excluded
before release. Required real-IME/screen-reader cases cannot be replaced by
synthetic events or accessibility-tree smoke checks.

Mandatory commands: `bun test package`, `bun run bin/build.ts`, harness build,
targeted strict TypeScript checks, and web build when its integration changes.
Record repository-wide typecheck failures separately from new regressions; do not
silently ignore diagnostics because they predate this work.

Existing browser tools must be used for live verification in this session. A
future CI browser runner can use dev-only automation/image-diff dependencies;
do not add them to the published browser runtime. OS clipboard/IME and screen
reader tests need deliberate fixtures and must not expose personal user data.

The final verifier receives a frozen candidate and writes an evidence report with
revision/worktree fingerprint, command output, browser/backend/DPR, screenshots,
pixel differences, performance summaries, manual checks, missing environments,
open issues and supported scope. Fixes after that review invalidate affected
results; rerun the corresponding gates and the mandatory package checks.

## Definition of done and starting point

Stages A–E implemented and independently reviewed; V01–V12 completed for the
declared first-release matrix; no unresolved correctness, data-loss, blank-page,
interaction or resource-lifecycle blockers. Docs and examples describe actual
support. Later work is explicitly deferred rather than advertised as complete.

Start with [task 11](../agent-tasks/11-dom-mirroring-hardening.md). This planning
turn commissions audits and prepares execution; it does not implement the roadmap
or mark the new stage complete.

## Corrections to the original supplied plan

The Downloads implementation plan is design input, not an instruction override.
Keep its DOM-as-source principle, but discard `visibility:hidden` takeover and
duplicate hit layers. Do not claim hidden elements retain ordinary focus/AX
behavior. Per-element raster textures can be shader inputs; their limitation is
loss of glyph/path identity, not inability to run a shader. Preserve existing
engine/build/test conventions rather than introduce a parallel renderer or test
stack by default. Arbitrary CSS parity, compositor lockstep, full shaping and
fixed performance numbers require evidence and cannot be assumed from a clone.
