---
name: shooosh-item
description: Add a DOM-tracked shooosh quad (createItem) that follows a page element. Use when the user wants a GPU fill behind a card, logo, text box, or any getBoundingClientRect-tracked rect.
---

# DOM-tracked item

Read [docs/site-patterns.md](../../../docs/site-patterns.md) and [docs/shader-contract.md](../../../docs/shader-contract.md).

A default engine must exist (`createScene` or `await acquireLayer()`). `createItem` queues if the engine is not ready yet.

```js
const item = createItem(element, {
  shaders: { fragment: wgsl }, // fn fsMain() -> vec4f
  uni: { value1: 0 },
  onFrame(self, frame) {
    self.setUni({ value1: frame.now * 0.001 })
  },
})
// teardown
item.destroy()
```

## Rules

- The DOM node must be transparent where the shader should show. An opaque background hides the quad.
- `vUv` is top-origin on the **element**, not the page.
- `setUni({ value1 })` → `uUni.values0.x`. Skip `setUni` when values did not change (settle loop).
- Brand colors: read CSS (`--color-key`) on the site and pack into `valueN`. The engine does not parse CSS.
- Textures / MSDF / SDF (`loadTexture`, `createMsdfGlyphs`) run on both backends. Load after the engine resolves — `loadTexture` picks the backend, and a WebGL2 handle is ignored on WebGPU. Bake atlases with skill `shooosh-msdf` (`shooosh/msdf`) — Node/Bun, not the site bundle.
- With `{ texture }`, sample `fitUv(vUv)` for CSS-like cover/contain (`textureFit`, default `"cover"`). The engine packs value5–8 each frame.
- Do not pass `#version 300 es` unless this is a legacy escape hatch — prefer WGSL so WebGPU can run it.

## Wrapper shape (Solid / React)

`onMount` → `createItem(ref, options)`; `onCleanup` → `destroy()`. Optional `onItem(item)` so the parent can `setUni` from scroll or a slider.
