# DOM rendering regression check — 2026-09-10

## Reproduced and corrected

- The Astro shared stylesheet painted an opaque background on `body`. The
  `acquireLayer` canvas uses z-index -1, so textured items, MSDF text and SDF icons
  were rendering behind that background. Keep the grey on `html`, with a
  transparent body and the existing minimum viewport height.
- The homepage cleared its transparent post-processing canvas with RGB 0.827 and
  alpha 0. That is not a valid transparent premultiplied colour. Filtering and
  compositing produced white fringes and washed-out coverage. Clear to (0,0,0,0).
- DOM MSDF layout stretched each complete atlas tile into its character's DOM
  advance rectangle. Tiles include padding and bearings. Placement now uses the
  baked font size, x/y offsets, baseline and browser font ascent. DOM ranges still
  determine character positions and line breaks. Atlases without these metrics
  retain native text. A unit test covers bearings, padding and baseline scaling.
- The new rounded-box shader used `half`, a reserved GLSL identifier. Renamed it
  in WGSL and regenerated the prepared shader pair. Confirmed WebGL2 takeover
  (native button backgrounds become transparent while their GPU paint remains).
- Homepage install labels were divs, and GitHub/npm labels had no links. Install
  controls are now native buttons with copy handlers; GitHub/npm are native
  anchors. Existing layout classes and data-sh markers remain.

## Browser checks

In the Astro site, visually checked textured-item, msdf-text and sdf-icons on
forced WebGPU and WebGL2. All render again. The procedural MSDF example is its
existing atlas recipe, not a proof of arbitrary DOM text fidelity.

Checked homepage composition on both backends, including disappearance of white
SVG fringes, corrected text proportions, native button semantics and copy status.
The homepage accepts `?backend=webgpu` / `?backend=webgl2` for repeatable checks.

## Remaining scope

### Follow-up: thin text

The baked SDF PNGs also stored the distance value in alpha. Ordinary premultiplied
texture uploads squared the RGB distance, shifting the 0.5 contour inward and
making glyphs visibly thinner. Existing homepage atlases now have their alpha
channel removed, preserving RGB. Font generation does the same normalization,
with an integration test asserting opaque output. GPU/DOM comparisons on `/dom`
confirmed restored stroke weight on WebGPU and WebGL2.

Coverage now uses framebuffer derivatives to account for pixel density, following
the [msdfgen screen-space coverage method](https://github.com/Chlumsky/msdfgen#using-a-multi-channel-distance-field).
This corrects antialias scaling; it does not synthesize a heavier font weight.

This repair does not establish parity with the reference described in
[DOM integration research](../proposals/dom-integration.md). The adapter still
mirrors an explicit supported subset. General input/caret/selection painting,
video, transforms, richer CSS clipping and complete text shaping are separate
work. The native DOM must continue to own links, buttons, focus and editing;
`data-sh-*` attributes do not create those semantics.

Social labels without configured destinations remain labels. No profile URLs
were invented. Font coverage and layout support should be checked before treating
MSDF takeover as a replacement for native text in arbitrary content.

## Library hardening

- Added data-preserving texture uploads for SDF/MSDF; corrected WebGPU double Y
  flipping and premultiplied clear colors on both backends.
- Native text takeover waits for glyph draws. Pipeline/import failures propagate
  to fallback. Explicit engines receive glyph updates and lazy-renderer wakeups.
- Font requests validate atlas metrics, bounds and texture dimensions. Exact
  family/weight matching prevents regular-for-bold substitution. Pending font
  resources are released on disposal, and late completion cannot hide DOM text.
- Unsupported text paint remains native; the periodic repair pass also detects
  changes to box/text styles. Text layout/validation stays behind a lazy import.
- `harness/dom-regressions.html` passes on WebGPU and WebGL2, including real GPU
  texture readback for alpha preservation and one-time flipping, SVG dimensions,
  delayed takeover, invalid/unmatched font fallback and pending disposal.

Final validation: `bun test package` (190 pass), `bun run bin/build.ts`
(including consumer tree-shaking budgets, unchanged in this hardening pass), and
`pnpm --filter web build` pass. Browser checks cover the DOM preview and the
textured-item, MSDF text and SDF icon examples, plus the regression harness on
both renderers.

## Fine-detail follow-up

The homepage still capped DPR at 2, undersampling browser zoom and tiny UI through
post-processing. Added optional `dpr.scale` with backend dimension limits and
zoom/cap tests. The homepage uses scale 2 and a CSS-sized bulge radius, and
`?render=native` provides a comparison without changing its markup or type scale.
At DPR 2 the 1265×720 canvas now renders 5060×2880 on both backends. This costs
four times the framebuffer pixels; it is not a claim of native font hinting.

## Fixed text during scrolling

Reproduced native/GPU paint switching when repeated layout invalidation destroyed
unchanged glyph renderers. Scroll-related ancestor class changes can trigger this
path. The DOM adapter now compares the relative glyph layout, atlas and text paint
before rebuilding, preserving ready renderers for unchanged text. Unchanged box
paint also retains its renderer. Geometry still updates every frame; genuine
layout/content/style changes and missing-glyph fallback are not suppressed.

The browser regression reproduces the failure before the fix, then checks twelve
consecutive invalidated frames with no native-paint exposure on both backends.
A subsequent content change verifies that missing glyphs still restore native text.

## Homepage stacking and backend selection

Nav/HUD use Tailwind `z-10`. DOM painters now sort by the supported positioned,
fixed/sticky, flex/grid z-index and isolation context hierarchy; nested high-z
children cannot escape a lower parent context. Equal levels retain DOM order.
Ordering is reused until style/layout invalidation, and the repair pass compares
that same order. This does not provide arbitrary native/GPU interleaving through
one canvas.

Browser pixel readback verifies ancestor z-10 against a later lower-context z-999
child and then verifies a live z-index change on both backends. Unit tests cover
nested contexts, DOM ties, negative levels and static versus grid-item z-index.
The homepage and example selector accept `backend=webgl` as a WebGL2 alias;
`backend=webgpu` and the existing `backend=webgl2` remain available.
