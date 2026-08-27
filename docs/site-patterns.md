# Site patterns

[Documentation](./README.md)

How we actually use this engine on marketing and product sites. Source of the recipes: **aiuis** (`@ssscript/webgl` — `Canvas`, `GlItem`, `SdfImage`, `MsdfText`, `MouseDistortion`, `ParticleGrid`), plus Webflow IIFE embeds and slider sync (smooothy).

Author shaders as WGSL `fn fsMain`. See [shader-contract.md](./shader-contract.md). Copy-paste setups: [examples/](../examples/README.md).

## Pick a mount

| Situation | Use |
| --- | --- |
| App shell (Solid/React/Astro layout) owns one GPU canvas | `createScene` on a `fixed inset-0 -z-10` `<canvas>` |
| Isolated widget / Webflow embed / several modules on one page | `await acquireLayer()` then `createItem` |
| Section-scoped hero on its own canvas | `createScene` on that section’s `<canvas>` |

aiuis uses the **app-shell canvas**: one `createScene`, then `createItem` / `createParticles` / `createPostProcessor` against the default engine. `acquireLayer` is the same idea without a scene object — refcounted, no post unless you add it yourself.

Do not invent a second scene graph. Do not pull in Three.

## App-shell canvas (aiuis `Canvas`)

```js
const scene = createScene(canvas, {
  autoInit: false,          // SSR: don't touch GPU in the constructor
  dpr: { max: 1.5 },        // marketing sites do not need full device DPR
  clearColor: { r, g, b, a: 1 }, // match the page paper if the canvas is opaque
  onInitError: (error) => console.error("[shooosh]", error),
})
await scene.init()
// now createItem / createParticles / post are safe
```

Canvas CSS we always use:

- `position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1`
- `aria-hidden="true"` — decorative
- If you use `acquireLayer` instead, the **page background must be transparent** or the layer is invisible

Teardown: `scene.destroy()` (or `item.destroy()` + `releaseLayer()`). Pair every acquire with a release.

## Items queue until the engine exists

`createItem(el, options)` is safe to call before `init` finishes. The item sits on a raf queue until `getDefaultEngine()` is set. Mount order does not matter — aiuis `GlItem` relies on this.

```js
const item = createItem(el, {
  shaders: { fragment: wgsl },
  uni: { value1: 0 },
  onFrame(self, frame) {
    self.setUni({ value1: frame.now * 0.001 })
  },
})
item.destroy()
```

The quad tracks `el.getBoundingClientRect()` against the canvas. Keep the DOM node transparent where the GPU should show through.

## Do not wake the settle loop for nothing

The engine stays hot for 250ms after `setUni` / scroll / pointer. If you lerp toward a target, **skip `setUni` once you have snapped** — aiuis `MouseDistortion` does this so the page can idle.

```js
if (currentX === targetX && currentY === targetY) return
self.setUni({ value1: currentX, value2: currentY })
```

## Brand color → uniforms

Sites read a CSS custom property and pack it into `valueN`:

```js
const [r, g, b] = readCssColor("--color-key") // 0..1
item.setUni({ value4: r, value5: g, value6: b })
```

Keep that helper on the site. The engine does not parse CSS.

## Custom post (WebGL2 today)

`effects.custom` / `createPostProcessor().addFragmentEffect` wrap a snippet as:

```glsl
vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  return texture(uTexture, uv);
}
```

Injected: `uTexture` (scene), `uResolution`, `uTime`, `uDelta`, `uUni[4]`. This is a **different contract** from `fsMain`. Post is skipped on WebGPU until that port exists.

aiuis mouse-magnify: lerp pointer to UV, write radius/strength into `uUni[0]`, sample `uTexture` with a zoomed UV.

## Particles as dots (WebGL2 today)

`createParticles({ positions, size, color, layer })` — `positions` is clip-space `Float32Array` `[x,y,…]`. aiuis `GlDot` recomputes one point from a DOM rect on scroll; `ParticleGrid` is a static clip-space grid. Recreate on resize if size changes. `setPositions` on scroll is cheaper than destroy/create.

## SDF / MSDF (WebGL2 today)

`createItem` + `loadTexture` (or `createMsdfGlyphs`). The quad still tracks a DOM box; the fragment samples an atlas. aiuis `SdfImage` / `MsdfText` set `value2`/`value4` to CSS pixel size on resize. This path is why textures and MSDF are on the follow-up GPU checklist.

Bake the atlases with `shooosh/msdf` (Node/Bun — not the site bundle):

```shell
pnpm add -D sharp msdf-bmfont-xml
pnpm msdf -- fonts/Inter.ttf icons/logo.svg --out public/msdf
```

Fonts default to `fieldType: "sdf"` (hairline faces want `fontSize: 256`). Icons: SVG raster 1024 / spread 64; PNG spread 8. See [msdf.md](./msdf.md).

## Webflow / IIFE

```html
<script src="https://unpkg.com/shooosh"></script>
<canvas data-shooosh data-dpr-max="1.5"></canvas>
```

```js
const { createScene, parseSceneDataset, acquireLayer, createItem } = window.Shooosh
const canvas = document.querySelector("[data-shooosh]")
createScene(canvas, parseSceneDataset(canvas.dataset))
```

One shared layer per page. Modules must `releaseLayer()` on teardown or the canvas leaks across Webflow page transitions.

## Framework wrapper shape (Solid, same idea in React)

1. Root `Canvas` — `autoInit: false`, `await init()`, set a `loaded` flag.
2. `GlItem` — `createItem(ref)` on mount, `destroy()` on cleanup. Options + `onItem` callback.
3. Keep the `Scene` handle in a store **outside** the canvas component so HMR does not remount the engine.

## What we do not do on sites

- Three, R3F, Dawn, tensors
- A `frame.pass` graph
- Requiring `frame.gl` from page code
- Full-DPR retina canvases on marketing pages (`dpr.max` 1.5–2)
- Leaving an opaque `body` background over `acquireLayer`
