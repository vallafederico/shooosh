# Agent workflow: DOM, SVG and SDF/MSDF

Use this guide when integrating or repairing page mirroring. Check the installed
exports and declarations first: repository recipes may use unreleased APIs. The
public boundary is [shooosh/dom](../package/dom/index.ts); [DOM reference](./dom.md)
describes supported CSS. Proposals and the DOM lab's input prototype are not
public APIs. Preserve the supplied HTML, design tokens and framework setup.

## Choose the rendering path

| Need | Use | Preparation |
| --- | --- | --- |
| Mirror an existing image or SVG | `dom.media(img)` or `img[data-sh-media]` + `scan()` | Original image URL; SVG raster size follows display size/DPR |
| Solid background with corner radii | `dom.box(element)` or `[data-sh-box]` | Keep content and interaction in native HTML |
| Mirror display text | `dom.text(element)` or `[data-sh-text]` | Bake a matching font family, weight and character set |
| Decorative shader tied to DOM bounds | `dom.bind(element, { shaders })` or `[data-sh-bind]` | WGSL plus generated GLSL; native paint is unchanged |
| Outline/morph a distance-field icon | `createItem` + a copied SDF shader | Bake with `shooosh/msdf`, load with `{ data: true }` |
| Form editing, caret, selection or arbitrary HTML | Native HTML | No public `dom.input()` or general HTML rasterizer |

SVG rasterization and SDF generation are different paths. A normal SVG logo does
not need an SDF atlas just to render sharply. `scan()` registers marked descendants;
it does not discover and mirror every element or create buttons and links.
One element has one binding owner; a second registration returns the existing
binding. Do not put box and text marks on the same element expecting two painters.

## Mount and clean up

Author meaningful `<a>`, `<button>` and `<input>` elements first. Retain their
listeners, labels, focus and editing behavior. The canvas is decorative and must
not intercept events. GPU displacement does not move native hit targets.

```ts
import { createDomLayer } from "shooosh/dom";

export async function mountPage(canvas: HTMLCanvasElement, root: HTMLElement) {
  const dom = await createDomLayer({
    canvas, root,
    fonts: [
      { family: "Archivo", weight: 400, json: "/msdf/archivo.json", texture: "/msdf/archivo.png" },
      { family: "Archivo", weight: 700, json: "/msdf/archivo-bold.json", texture: "/msdf/archivo-bold.png" },
    ],
    onError: ({ element, error }) => console.warn("DOM renderer", element, error),
  });
  if (!dom) return () => {}; // native page remains usable
  if (!root.isConnected) { dom.destroy(); return () => {}; }
  dom.scan({ bind: false }); // built-in image, box and text painters
  return () => dom.destroy();
}
```

Paths above are deployment examples: use actual generated JSON/PNG pairs and the
CSS family names in your project. Mount in the framework's client lifecycle and
call the returned cleanup on route/component removal. If removal happens while
`mountPage` is pending, invoke its cleanup as soon as it resolves. Importing the
adapter is SSR-safe; do not query `document` during server rendering.

A canvas-owned layer starts its engine. With `{ engine, root }`, the caller owns
starting and destroying that engine. Pass that same explicit engine to standalone
`loadTexture`/glyph calls; do not accidentally upload to another default engine.
Use one DOM layer per canvas. See [composition](./dom.md#canvas-composition) before
choosing stacking: an opaque body can cover a negative-z canvas. For a page-behind
layer, put the light gray paper on `html` and keep intervening backgrounds
transparent where GPU content must show. Do not impose this on unrelated layouts.

## Prepare shaders and assets

Custom shaders must work on both backends. Configure the
[build plugin](./shader-build.md), author `effect.wgsl`, then:

```ts
import effect from "./effect.wgsl"; // generated { fragment, fragmentGlsl }
// In the client mount, after dom is available:
dom.scan({ shaders: { bind: effect } });
```

For intentionally dynamic WGSL strings, use `compileShader` from the optional
`shooosh/compiler` entry. A raw WGSL string alone is not a dual-backend shader.
Built-in media, box and glyph shaders are already prepared.

Bake fonts/icons on Node/Bun with [the MSDF pipeline](./msdf.md). Keep `sharp`,
`msdf-bmfont-xml` and `shooosh/msdf` out of browser imports. Match the real font
weight and required characters; ASCII defaults do not cover arbitrary content.
Do not stretch padded glyph tiles to character advance widths or compensate for
bad atlas data with an artificial boldness bias.

For standalone numeric atlases:

```ts
const atlas = await loadTexture(atlasUrl, { engine, data: true });
// Supply atlas to the copied glyph/icon recipe; destroy it after its consumers.
```

Import `loadTexture` from `shooosh`. The DOM layer applies `data: true` to its font
atlases automatically. Generated font PNGs are opaque; for legacy PNGs with
alpha, the data upload preserves numeric RGB. Already damaged RGB cannot be
recovered from a premultiplied canvas/bitmap. Ordinary color artwork uses the
default upload. UVs are top-origin; use `flipY` only when the asset requires it.

`media()` sizes `.svg` and SVG data URLs automatically. For extensionless SVG
URLs, explicitly prepare a texture with `loadTexture(url, { engine,
svgRasterSize: 256 })` and use a standalone item recipe; `media()` has no prepared
texture parameter. Choose the raster size from displayed size/DPR (max 4096).

## Diagnose before changing appearance

| Symptom | Inspect first |
| --- | --- |
| Empty example | Exact demo ID (no trailing punctuation), backend/logs, canvas bounds and stacking/backgrounds |
| Blurry SVG | Intrinsic size versus raster size, canvas backing resolution and CSS scaling |
| Thin text | Exact font/weight, atlas RGB/alpha, glyph bearings/baseline and distance range |
| White fringe | Premultiplied shader output and transparent clear; avoid double premultiplication |
| Missing or incorrect text | `binding.state`/`reason`, atlas metrics/texture dimensions, character coverage and supported CSS |
| Buttons cannot be used | Native element semantics, canvas pointer events, CSS stacking and event handlers |

Do not manually hide native content while assets compile or load. The adapter
hides text after all glyph groups draw; invalid fonts, unsupported paint and
renderer errors retain/restore DOM. `ready` settles once (`active`, `fallback` or
`disposed`); inspect current `state` afterward. Offscreen bindings can remain
preparing until drawn. Do not block the page waiting for every offscreen binding.
Use `dom.invalidate()` after application-owned layout/style changes. Destroy
bindings/layers to release GPU resources and restore owned styles. After renderer
loss, remount; actual WebGL context loss requires a fresh canvas.

The current text path does not provide general shaping, transformed text or
arbitrary clipping. Keep unsupported content native. Do not describe the
source-only input prototype as DOMGL parity or a production input API.

## Verify the result

For a site adaptation, compare native/GPU appearance at small and large sizes,
resize and scroll, use controls by keyboard, and destroy/remount. Check forced
WebGPU and WebGL2, a readable native failure path, and logs. A build pass alone
is not visual evidence.

For library changes, run sequentially from the checkout root:

```sh
bun test package
bun run bin/build.ts
pnpm --filter harness dev
```

Do not run package tests concurrently with the build: the build replaces `dist`.
Open `/dom-regressions.html?backend=webgpu` and `?backend=webgl2` in the harness;
all checks must pass. They exercise actual texture readback, one-time flipping,
SVG resolution, text takeover, font fallback and disposal during loading. Also
use `/dom.html` for scrolling/interaction, and catalog demos `textured-item`,
`msdf-text`, `sdf-icons`. Build `web` or `harness` when changing those surfaces.
Preserve optional-entry isolation and existing consumer bundle budgets.
Report exactly which backends and failure paths were checked, plus remaining
limitations. [Regression audit](./audits/2026-09-10-dom-rendering-regressions.md).

For fine UI, check effective canvas density before increasing atlas resolution.
A fixed `dpr.max` can undersample browser zoom. `dpr: { scale: 2 }` enables
supersampling on both backends, at roughly 4× pixel cost, within hardware limits.
It improves edge sampling but does not reproduce browser font hinting at tiny
sizes. Compare native text at the same CSS size; do not silently enlarge the
supplied typography or replace real controls to hide rendering differences.

If fixed mirrored text flickers during scrolling, check renderer churn as well as
geometry. Scroll-related ancestor class mutations may invalidate styles without
changing glyph layout. Preserve ready glyph/box renderers when their layout and
paint are unchanged; do not suppress legitimate content/font/style updates.
The regression harness checks unchanged fixed text across repeated invalidations
and verifies that a subsequent missing-glyph update still returns to native paint.


For layered page UI, set z-index on the positioned nav/HUD ancestors. The DOM
adapter orders supported GPU painters by their CSS context hierarchy, not just
source order or the largest descendant z-index. Keep the canvas's own browser
stacking position separate from that internal draw order. Native elements outside
the canvas cannot be arbitrarily interleaved among GPU draws.
