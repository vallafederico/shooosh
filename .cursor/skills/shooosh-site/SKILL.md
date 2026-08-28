---
name: shooosh-site
description: Mount shooosh on a marketing or product site — app-shell canvas vs acquireLayer, SSR init, canvas CSS, DPR, teardown. Use when adding a page-behind GPU layer, a hero canvas, or a Webflow/Solid/Astro embed.
---

# Mount shooosh on a site

Read [docs/site-patterns.md](../../../docs/site-patterns.md) and [docs/api.md](../../../docs/api.md) first.

## Choose

- **App shell** (layout owns one canvas): `createScene` on a fixed, `pointer-events: none`, `z-index: -1`, `aria-hidden` canvas. aiuis does this.
- **Isolated module / Webflow**: `await acquireLayer()` then `createItem`. Page background must be transparent.
- **Section hero**: `createScene` on that section’s canvas only.

## Init (SSR-safe)

```js
const scene = createScene(canvas, {
  autoInit: false,
  dpr: { max: 1.5 },
  clearColor: { r, g, b, a: 1 }, // match page paper if opaque
  onInitError: (e) => console.error("[shooosh]", e),
})
await scene.init()
```

`createItem` may be called before init — it queues. Still wait for init (or a `loaded` store) before post, textures, particles, or MSDF.

## Always

- Cap DPR at 1.5–2 on marketing pages.
- Pair `acquireLayer` with `releaseLayer` (Webflow page transitions leak otherwise).
- `scene.destroy()` on unmount.
- Author WGSL `fn fsMain`. Do not require `frame.gl`.
- Do not add Three or a second scene API.

## Next

Copy a setup: skill `shooosh-examples` / [`examples/`](../../../examples/README.md). DOM quads: skill `shooosh-item`. Custom magnify/grain: skill `shooosh-post` (WebGL2). Shader language ports: `wgsl-to-glsl` / `glsl-to-wgsl`.
