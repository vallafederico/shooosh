# Setups

How to *mount* the engine. The shaders — each a `createScene` / `createItem` file — are in `examples/` (plasma, noise, SDF, …).

| File | When |
| --- | --- |
| [webflow-embed.html](./webflow-embed.html) | IIFE / Designer, no bundler |
| [bake-msdf.ts](./bake-msdf.ts) | Node/Bun font + icon atlas |
| [framework-wrappers.ts](./framework-wrappers.ts) | Solid / React lifecycle |

Docs: [getting started](../../docs/getting-started.md) · [site patterns](../../docs/site-patterns.md).

These are mount recipes, not complete visual demos. Select a shader and its
helpers from the [agent copy guide](../agent-guide.md).

- **Webflow:** the script uses `window.Shooosh` from the root IIFE, which does not
  expose optional DOM/utility entries. Pin a tested package version when shipping.
  Keep a scene reference and call `scene.destroy()` on page teardown.
- **Framework wrappers:** call `mountCanvas` only after a client canvas exists,
  then mount items. The module owns one shared scene; it is not a per-component
  scene factory. Call `unmountCanvas` when that owning shell is removed; dispose
  item handles first. Wire your framework's cleanup/HMR hooks explicitly.
- **MSDF baking:** run with Node/Bun during asset preparation. Copy generated
  files to your app's public assets and load them in the browser; do not bundle
  the generator or its optional native dependencies.
