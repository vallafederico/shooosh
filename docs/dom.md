# DOM integration

[Documentation](./README.md) · [Design and later stages](./proposals/dom-integration.md)

[Gap specification and subagent delivery plan](./proposals/dom-mirroring-delivery-plan.md)
tracks remaining work and its acceptance gates; it is not a list of supported APIs.

`shooosh/dom` is an optional browser entry for cached DOM-tracked shader quads and
image enhancement. It uses the existing shooosh engine: WebGPU → WebGL2 → native
content. Importing it is safe during SSR; mounting without a document returns null.

```ts
import { createDomLayer } from "shooosh/dom";

const dom = await createDomLayer({
  canvas: document.querySelector<HTMLCanvasElement>("#gpu")!,
  root: document.querySelector<HTMLElement>("#gallery")!,
  onError: ({ element, error }) => console.warn(element, error),
});

if (dom) {
  const image = dom.media(document.querySelector<HTMLImageElement>("#photo")!);
  console.log(await image.ready); // active, fallback, or disposed
  // After an application-owned layout or stylesheet change:
  dom.invalidate();
  // On route/component cleanup:
  // dom.destroy();
}
```

Image enhancement retains the original `<img>`, alt text, and surrounding link.
It suppresses only the image's paint, using reversible opacity after a frame with
the compiled item has been submitted. It never sets `visibility:hidden`, changes
focus semantics, inserts hit targets, or moves elements. The original image is
restored on unsupported CSS, shader/upload failure, renderer loss, printing, or
disposal. Device loss falls back to DOM; remount explicitly to retry. After actual
WebGL context loss, supply a fresh canvas. Normal adapter destruction supports
remounting on the same canvas.

## Canvas composition

Supply a canvas and intentionally choose its stacking position. For a gallery
whose GPU images sit over native image paint and below its interactive foreground:

```css
#gpu { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 2; }
.gallery-controls { position: relative; z-index: 3; }
```

The adapter applies `pointer-events:none` and `aria-hidden=true` to the canvas,
restoring prior values on destruction. It does not rewrite page backgrounds or
infer CSS stacking contexts. The canvas remains your DOM node after destruction.
Only use this arrangement where a single canvas plane correctly composes with
your native content. GPU bindings draw in DOM order, interleaving images and
decorative quads; CSS z-index and native/GPU interleaving are not emulated.

Alternatively pass `{ engine, root }`. This does not start, stop, or destroy the
borrowed engine; its owner must start it or render frames. A canvas-owned session
starts and destroys its own engine, retaining a WebGL canvas context so the same canvas can be remounted. Neither route changes the default engine.
Use one adapter session per canvas and one binding owner per element.

## Shaders and bindings

```ts
const decoration = dom.bind(element, {
  shaders: { fragment: `fn fsMain() -> vec4f {
    return vec4f(vUv, uUni.values0.x, 1.0);
  }` },
  uni: { value1: 0.5 },
});
decoration.setUni({ value1: 0.7 });

const image = dom.media(img, {
  shaders: { fragment: `fn fsMain() -> vec4f {
    return textureSample(uTexture, uSampler, fitUv(vUv));
  }` },
});
```

`bind()` draws a decorative quad and leaves native paint unchanged. Make the
target transparent where you want a canvas behind it to show. `media()` owns image
loading and native image takeover. Focused images retain native paint for their focus outline. Both use the existing WGSL `fsMain` contract.
Image texture fitting reserves `value5–8`; other user slots remain available.
The default image shader makes samples outside fitted UV bounds transparent for
`contain`. Custom image shaders should do the same if they use that fit mode.

A binding exposes `element`, `state`, `reason`, `ready`, `setUni()`, and idempotent
`destroy()`. `ready` resolves on the **first** activation, fallback, or disposal;
inspect `state` for subsequent changes. Offscreen elements remain preparing until
drawn. Registering the same element again returns its existing binding; destroy
and rebind to replace options/shaders. Failed initial shaders leave native content;
shader hot swapping is a separate engine task.

## Supported first-release subset

| Supported | Remains native / deferred |
| --- | --- |
| Untransformed rectangular DOM bounds | CSS transforms, zoom, perspective |
| Native root scrolling and fixed/sticky positioning | Transform-based smooth-scrolling adapters |
| Rectangular ancestor overflow clips and nested scrolling | Rounded clips, masks, complex clip paths |
| Existing `<img>`, browser-selected currentSrc, source changes | Video, CSS background images |
| `object-fit:fill/contain/cover`, two percentage object positions | `none`, `scale-down`, pixel/edge-offset positions |
| Borderless, padding-free, square-corner images | Image borders, backgrounds, padding, radii, shadows, opacity transitions |
| Opaque, unfiltered ancestry | Opacity groups, filters, blend modes |
| User-authored decorative WGSL quads | Automatic CSS box painting, text/glyph layout |

Image resources are shared per URL within a session, refcounted, and released
after the last binding. Pending uploads cannot reactivate a disposed binding;
orphaned upload results are destroyed. Native image loading attributes remain
intact, but this first adapter loads supported registered sources eagerly. Use
manual registration near the viewport for large galleries. No KTX2, LRU budget,
or texture streaming is included yet.

## Measurement and animation

Normal geometry is measured into document coordinates and shifted by current root
and ancestor scroll offsets, sampled in the render phase. Scroll events wake the
loop but do not gate geometry freshness. Normal and nested scrolling require no
new element bounds reads. Each clip moves with its outer scrollers while retaining
its own viewport. A frame-local cache shares bounds and scroll-offset reads across
bindings; sticky/fixed elements still measure on each rendered frame.

A viewport canvas and native scrolling are separate compositor surfaces. During
fast scrolling, the browser can move native content before JavaScript/GPU drawing
catches up. Current-offset sampling avoids stale application geometry, but does
not guarantee compositor lockstep. Exact synchronization requires a composition
where the canvas scrolls with its content, or an explicitly coordinated scroll
controller. The adapter does not intercept wheel or touch input.

Resize, font load, content/class/style/source changes, and interaction/animation
events invalidate measurements. DOM reads are batched before drawing. Before
restyling active images, owned opacity is restored in one batch so computed
styles reflect the application's CSS; it is reapplied after submitted draws.
The adapter ignores its own style mutations and preserves newer application edits.

By default a 500 ms repair scan handles changes that observers cannot see. It
compares style, source, geometry, clip-chain and ordering state before requesting
a frame; unchanged scans retain their DOM-read cost but do not wake rendering. Set
`repairInterval:0` for fully event-driven idle behavior and call `invalidate()`
after changes such as programmatic stylesheet edits. The engine's existing settle
window still applies. `stats` exposes bindings, active bindings, and bounds reads
in the last rendered frame; it is not a benchmark or a performance guarantee.

CSS/Web Animations on bound elements or ancestors hold layout tracking while
running. For application-driven layout changes:

```ts
const release = dom.trackLayout();
// Make layout updates; call release() when the animation completes or cancels.
```

The adapter does not add animation itself. Respect `prefers-reduced-motion` in
your authored effects and release tracking when motion stops. It does not promise
that a GPU-displaced visual has a correspondingly displaced DOM hit target.

## Verification

The [DOM integration example](../examples/dom-integration.ts) provides a visual
testing surface in the examples catalog: open `/?demo=dom-integration` in the
Vite harness. It includes shader mixing, source swapping, image fitting,
native/GPU comparison, rounded-style fallback, nested scrolling, live bounds-read
counts and nine executable lifecycle checks. Select either backend in the rail.
Its poster editor includes an experimental GPU-painted input: a real HTML input
owns editing while an authored texture mirrors the field, text, caret and selection.
The shader mix applies to that texture. See [the example helper](../examples/dom-canvas-input.ts).
This is an LTR prototype using internal engine seams, not generic HTML capture
or a new public binding type. IME composition and RTL text retain native paint.
Save/reset buttons remain native SVG controls. The footer's bounds counts cover
adapter image bindings, not the experimental input's additional measurements.

Run `bun test package`, `bun run bin/build.ts`, then start the Vite harness and open
`/dom.html?backend=webgpu` or `/dom.html?backend=webgl2`. The fixture includes native
comparison, nested scrolling, unsupported style fallback, resource replacement,
renderer loss, and executable lifecycle checks. `?backend=none` previews native
content; the lifecycle checks separately exercise a failed backend initialization.

Later work: supported CSS box materials and exact rounded geometry, richer clips,
text via existing MSDF tooling, video uploads, then measured batching/streaming.
These are intentionally not advertised as supported by this first entry.
