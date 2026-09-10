# Optional DOM integration: `shooosh/dom`

Status: staged design. Research date: 2026-09-08. The first adapter slice is now
implemented; [docs/dom.md](../dom.md) is the source for its actual API and supported
subset. The wider CSS, text, video, and composition designs below remain proposed.

The current [gap specification and agent delivery plan](./dom-mirroring-delivery-plan.md)
supersedes the delivery ordering below, including the newer requirement for
native input editing with GPU-mirrored paint.

## Recommendation

Add an optional browser entry that mirrors explicitly selected DOM content into
shooosh's renderer. The browser remains responsible for layout, semantics, focus,
and events. The adapter measures elements, resolves a supported CSS subset, manages
resources, and supplies geometry and material inputs to backend-agnostic primitives.

Start with images and flat boxes in an explicitly managed canvas stacking region.
Add video and opt-in display text separately. Keep effects in `examples/`, authored
as WGSL. Do not build another renderer or promise an arbitrary DOM screenshot.

## What the reference actually does

Sources: [live DOMGL page](https://domgl.jesperlandberg.com/), its publicly served
[application bundle](https://domgl.jesperlandberg.com/_nuxt/Ckk6PTuq.js), and
[shared bundle](https://domgl.jesperlandberg.com/_nuxt/Dee090Kc.js). Bundle names are
deployment-specific. Findings below come from reading that deployment's HTML and
JavaScript, plus checking its DOM/GL switch in the browser; they are not a claim
about an unpublished package's full feature set. No reference implementation code
is incorporated into this repository.

| Concern | Observed implementation |
| --- | --- |
| Application | Nuxt/Vue SSR page, with media/solid wrappers and text registration |
| Backend | Calls `navigator.gpu.requestAdapter`, requests a device, and configures a `webgpu` canvas, despite the WebGL branding |
| DOM ownership | Native markup remains, including the real email input and submit button; GPU rendering replaces selected visual parts |
| Registration | Markers include `data-gl-media`, `data-gl-solid`, `data-gl-ground`, and `data-gl-fallback`; not a generic screenshot of every node |
| Coordinates | Measures `getBoundingClientRect`; caches document-space rectangles and subtracts current scroll; measures live for fixed/sticky elements, nested scrollers, or animation |
| Clipping | Walks ancestors for overflow, intersects clip rectangles, and carries radius data into shaders; this is a constrained clipping model |
| CSS | Reads computed styles for visibility, opacity, color, border/radius, object fit/position, filters, and ordering |
| Invalidation | Root resize observer, font-loading events, class/style mutation observation, transition/animation tracking, and a 500 ms maintenance scan |
| Images/video | Resource caches, responsive image variants, optional KTX2 paths; video uses external textures on WebGPU. A video-frame callback helps detect readiness; draw invalidation also uses a roughly 30 fps check |
| Text placement | Walks text nodes and measures per-code-point DOM ranges, retaining line/word/glyph indices and per-parent colors |
| Text rendering | Loads font JSON plus binary curve data into storage buffers. WGSL evaluates quadratic glyph outlines and coverage; this is not the existing shooosh MSDF atlas path |
| Shader extension | Material definitions with custom uniforms and separate glyph reveal functions; a shared dye texture can affect different primitive types |
| Failure/compare | DOM/GL switch restores native rendering; text stays native when glyphs are missing. Device-loss code attempts rebuilding and invokes surrender/fallback when recovery fails |

The reference initially uses an HTML `has-gpu` class to suppress native visuals.
For shooosh, use successful per-binding activation instead: API presence alone
does not prove that resources, shaders, or a first draw succeeded.

The useful pattern is **DOM measurement → typed visual data → GPU primitives**.
The page-wide effect works because boxes, media, and text participate in GPU
rendering. A post effect on our canvas cannot affect text left in the native DOM.

## Existing shooosh foundation and gaps

| Existing source | Reuse | Missing contract |
| --- | --- | --- |
| [`layer.ts`](../../package/src/layer.ts) | Refcounted shared canvas, backend fallback | Fixed negative z-index; uses global default-engine state and only sets it if absent |
| [`item.ts`](../../package/src/primitives/item.ts) | DOM quad, texture, WGSL, uniforms, numeric layer | Explicit engine binding, readiness/error signal, replaceable texture/geometry inputs |
| [`item.utils.ts`](../../package/src/primitives/item.utils.ts) | CSS-pixel rect to clip-space conversion; canvas rect cached per frame | Each item still measures itself; no ancestor clipping, CSS style model, or rotated geometry |
| [`primitive-lifecycle.ts`](../../package/src/primitives/primitive-lifecycle.ts) | Deferred attachment and cleanup | Attaches to default engine; renderer creation is not proof of a completed valid draw |
| [`texture-loader.ts`](../../package/src/loaders/texture-loader.ts) | Image/canvas uploads, resource destruction, cover/contain/stretch | No video source/update API; no general object-position contract |
| [`msdf-glyphs.ts`](../../package/src/primitives/msdf-glyphs.ts) | Atlas glyph drawing and data updates on both backends | No DOM text layout extraction or public custom glyph shader contract |
| [`settle-loop.ts`](../../package/src/engine/settle-loop.ts) | Dirty-frame scheduling, capture-phase scroll events | Adapter must wake it for resource, layout, and ongoing animation changes |

This is more than a selector wrapper around `createItem`. In particular, acquiring
a layer does not ensure subsequent items attach to it if another default engine
already exists. Resolve ownership before offering a separate module.

## Module boundary

Proposed source layout:

```text
package/dom/index.ts        public browser adapter entry
package/dom/session.ts      engine ownership, registry, lifecycle
package/dom/measure.ts      read phase and geometry snapshots
package/dom/style.ts        supported CSS normalization
package/dom/observe.ts      invalidation and active-animation tracking
package/dom/media.ts        image selection and resource ownership
package/dom/fallback.ts     visual activation and restoration
```

Add `./dom` to package exports with built ESM/CJS and declarations, build checks,
and a harness subpath alias. Do not export it from `package/index.ts`. Imports must
be SSR-safe: no document access, observers, GPU work, or injected CSS until mount.
No framework dependency. Wrappers for React/Vue/Astro can follow as examples.

The adapter owns CSS interpretation and DOM policy. The engine owns shader
compilation, GPU resources, rendering, and backend parity. Narrow internal seams
should accept an explicit engine, a measured rectangle/clip snapshot, texture
updates, and draw/error status. Avoid mutating the global default engine or making
fake HTMLElements to smuggle cached measurements into `createItem`.

## Proposed API shape

Illustrative target API; consult [docs/dom.md](../dom.md) for the implemented subset:

```ts
import { createDomLayer } from "shooosh/dom";
import { imageShader } from "./shaders/image";

const dom = await createDomLayer({
  root: document.querySelector("[data-gallery]")!,
  canvas: document.querySelector<HTMLCanvasElement>("[data-gallery-canvas]")!,
  backend: "auto",
  onError: ({ element, phase, error }) => console.warn(element, phase, error),
});

if (dom) {
  const image = dom.media(document.querySelector<HTMLImageElement>("[data-photo]")!, {
    shaders: { fragment: imageShader },
    uni: { value1: 0 },
  });

  image.setUni({ value1: 0.4 });
  // After an application-owned layout change:
  dom.invalidate();
  // During an externally driven transform animation:
  const stopTracking = dom.trackLayout();
  // On completion: stopTracking(); on unmount: dom.destroy();
}
```

`createDomLayer` should return `null` when no backend is available. Accept an
existing engine as an alternative to creating one from a supplied canvas, with
mutually exclusive options and explicit ownership. Destroy only owned engines.
Root scopes discovery; it does not imply that arbitrary overflow or stacking is
automatically reproduced.

Manual binding comes first; `scan()` is the attribute convenience layer for the
current `media` / `bind` subset, using application-owned shader maps. No shader
lookup from arbitrary remote attributes. Box, input, SVG and text markers wait
on those bindings.

## Integration pipeline

1. **Register.** Validate the supported element/style subset. Keep native content
   visible and record only the visual properties the adapter will own.
2. **Prepare.** Obtain the actual backend, decode the selected image, upload its
   texture, and compile the material. Retain independent fallback per binding.
3. **Measure.** Batch all DOM reads before rendering or style writes. Produce
   immutable CSS-pixel snapshots: bounds, content box, clip, radii, visibility,
   opacity, image fit/position, order, and local pointer position when requested.
4. **Normalize.** Convert snapshots to backend-independent geometry and material
   inputs. CSS layout stays in CSS pixels; DPR only changes framebuffer dimensions.
5. **Render.** Feed snapshots to existing renderer machinery. Cull against both
   canvas bounds and supported ancestor clips. Preserve full quad dimensions;
   clipping must not squeeze UVs.
6. **Activate.** Only after a valid drawable is ready and a draw has been submitted
   successfully, suppress the corresponding native visual. Engine status must
   distinguish compilation pending/failure from drawing. Restore immediately if
   later validation or device/context errors make rendering unavailable.
7. **Update.** Coalesce resource/layout/style changes into the next frame. Keep
   the last valid shader on replacement failure. For changed image sources, use
   generation tokens so stale loads cannot replace newer content or revive a
   destroyed binding; show the current native image while its GPU replacement loads.
8. **Release.** Cancel subscriptions and pending work, release reference-counted
   resources, restore adapter-owned styles, then release the owned renderer.

For element left/top relative to canvas `(x, y)` and canvas CSS size `(W, H)`:

```text
leftNdc = 2*x/W - 1           topNdc = 1 - 2*y/H
rightNdc = 2*(x+width)/W - 1   bottomNdc = 1 - 2*(y+height)/H
```

This is already the principle in `getElementClipData`. The adapter should reuse
that math with supplied measurements. Translation and axis-aligned scaling fit
the rectangle model; a rotated element's bounding box is not its four corners.
Keep rotation, skew, and perspective native until a real quad/matrix path exists.

## CSS, composition, and scheduling contracts

- **First supported set:** image content boxes, `cover`/`contain`/`fill`, percentage
  object-position, solid backgrounds, uniform solid borders, circular corner
  radii, visibility, and rectangular axis-aligned ancestor overflow clips.
  Translate CSS `fill` to the existing `stretch` concept. Unsupported style values
  stay native with a reason; do not silently approximate a promised match.
- **Composition:** one canvas has one place in the DOM stacking tree. Its numeric
  draw layers cannot interleave with arbitrary native siblings or reproduce all
  stacking contexts. Start with an explicit canvas/host CSS recipe: root background,
  GPU plane, native interactive/text foreground. Preserve native focus outlines.
  Do not automatically rewrite body backgrounds. Multiple canvas regions are a
  later option, not a promise of CSS paint-order emulation.
- **Opacity:** single image opacity is simple; group opacity across overlapping
  descendants needs group compositing. Either render that group offscreen later
  or keep it native. Multiplying ancestor opacity into every child is not general
  CSS equivalence.
- **Clipping:** intersect overflow padding boxes, respecting overflow axes and
  scrollbars. Rounded nested clips require a clip stack/mask; initially keep those
  cases native. Unsupported filters, masks, blend modes, pseudo-elements, shadows,
  and complex borders also remain native.
- **Invalidation:** observe bound sizes and relevant root changes; capture nested
  scrolling; react to fonts, image load/currentSrc changes, viewport changes,
  stylesheet-driven restyles, focus/hover, and transition/animation lifecycle.
  MutationObserver alone misses computed changes and positional shifts from
  siblings. Keep explicit `invalidate()` plus a bounded repair scan for otherwise
  unobservable changes, measuring only while visible where possible.
- **Active motion:** hold continuous tracking during CSS/Web Animations or an
  application's `trackLayout()` lease. Read after a smooth-scroll library updates
  DOM transforms. Default to actual browser rectangles; do not subtract synthetic
  scroll again. Cached document-space geometry is a later measured optimization.
- **Native behavior:** canvas uses `pointer-events:none` and `aria-hidden=true`.
  Keep real links, controls, text, alt attributes, and layout. Hide only the visual
  being replaced, never a whole semantic subtree. Track owned style changes and
  avoid overwriting newer application edits during restoration.
- **Motion preference:** retain static rendering or native fallback under reduced
  motion unless explicitly opted in; pause animation/video upload work when hidden.

CSS normalization needs more data than the public 16 user floats. Keep internal
geometry/style metadata separate from user uniforms. Existing texture fit owns
`value5–8`; reserve that behavior until a deliberate compatible material-input
change lands. The adapter must not overwrite arbitrary user slots for CSS state.

## Text and video follow-up

Use the existing MSDF pipeline for a first text experiment. Resolve font assets at
build time via `shooosh/msdf`; measure native text after fonts load; upload placement
data only after reflow/content changes. Browser ranges supply positions, but
per-code-point measurement does not solve ligatures, shaping, bidi, grapheme
clusters, emoji, or mixed fallback fonts. Begin with declared supported display
text and keep the entire run native when fidelity cannot be guaranteed. Editable
controls remain native. Selection and accessibility require browser checks.

Custom glyph motion needs an explicit extension to today's glyph primitive; do
not advertise item fragment shaders as interchangeable with glyph shaders. Vector
outline fonts like the reference use deserve separate research: their storage
buffer design does not transfer directly to our WebGL2 path.

Video needs a backend-agnostic updatable texture contract, using external/copy
paths on WebGPU and texture updates on WebGL2. Prefer the existing native video
element as the source. Preserve playback state, poster, controls, and autoplay
failure fallback. Upload on decoded frames, with a fallback cadence; stop when
paused, hidden, or offscreen. A still-image loader is insufficient.

## Delivery and acceptance

This proposal does not alter the engine task queue. Turn each stage into one
bounded task when scheduled, preserving the repo's one-engine-task-per-run rule.

1. **Ownership and activation seams:** explicit engine attachment, supplied
   geometry snapshots, per-item readiness/error reporting, loss fallback.
2. **First usable `shooosh/dom`:** explicit image bindings and supported flat boxes,
   managed composition recipe, native fallback, resource cleanup, and harness demo.
3. **CSS and motion coverage:** expand clipping/fit/style support, animation
   invalidation, responsive media updates, then selector convenience.
4. **Video**, then **display text** as separate bounded additions.

For each implementation task run `bun test package` and `bun run bin/build.ts`.
Use the Vite harness on forced WebGPU, forced WebGL2, and no-GPU modes. Include a
DOM/GPU comparison toggle and bound/clip overlays as demo tools.

Acceptance cases: alignment within one CSS pixel for supported geometry across
scroll, resize, DPR, nested scrollers, sticky elements, sibling reflow, and active
transforms; visual fit/radius/alpha agreement; responsive image replacement;
keyboard focus and native events; unsupported styles remaining native; missing
textures, bad shaders, and device loss never removing readable content; teardown
during load and repeated mount/unmount leaving no duplicate canvas or observers.
Profile 1/20/100 bindings for DOM-read count, upload frequency, and frame cost.
Static scenes should return to idle; report measured results before claiming a
performance target. Text adds wrapping, late fonts, ligatures, RTL, selection,
and missing-glyph fallback cases before it becomes a supported feature.
