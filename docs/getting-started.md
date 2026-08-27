# Getting started

[Documentation](./README.md)

```shell
pnpm i shooosh
```

```html
<script src="https://unpkg.com/shooosh"></script>
```

IIFE attaches `window.Shooosh`.

## A canvas you own

Dedicated `<canvas>` — fullscreen shader, section hero, or a Solid/React app shell.

```js
import { createScene } from "shooosh"

const scene = createScene(canvas, {
  autoInit: false,
  dpr: { max: 1.5 },
  screen: {
    shaders: {
      fragment: `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  return vec4f(vUv, 0.5 + 0.5 * sin(t), 1.0)
}
`,
    },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})
await scene.init()
```

SSR: `autoInit: false`, then `await scene.init()`. Canvas CSS we always use: `position: fixed; inset: 0; pointer-events: none; z-index: -1`.

## A layer behind the page

Shared refcounted canvas. DOM nodes become GPU quads.

```js
import { acquireLayer, createItem, releaseLayer } from "shooosh"

const engine = await acquireLayer()
if (!engine) return // no GPU — leave the page readable

const item = createItem(element, {
  shaders: { fragment: wgsl },
  onFrame(self, frame) {
    self.setUni({ value1: frame.now * 0.001 })
  },
})

return () => {
  item.destroy()
  releaseLayer()
}
```

`createItem` queues until an engine exists. The element must be transparent where the shader should show. An opaque `body` background hides the layer.

## Shaders

Author **WGSL**. `fn fsMain() -> vec4f`. `vUv` is top-origin.

| JS | WGSL | GLSL |
| --- | --- | --- |
| `setUni({ value1: t })` | `uUni.values0.x` | `uUni[0].x` |

A failed compile keeps the last good program and logs. It does not blank the page.

Full contract: [shader-contract.md](./shader-contract.md). Site recipes: [site-patterns.md](./site-patterns.md).
