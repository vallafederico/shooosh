---
status: done
---
# Item maps: extra textures per item, filled late

Asked for by the Arge site (`~/ws/arge`, `src/js/modules/gl-media.ts`), where
every product photo is an item. Each photo gets a depth map baked at build
time, used only for a hover effect (relief and a raking light under the
pointer). The page loads the photo first and draws it straight away. The depth
map is fetched and decoded off the main thread later, and the hover effect
turns on once it arrives. That needs a second texture an item can take
**after** it already exists, on both backends, without recompiling.

## Done

- `ItemOptions.maps: Record<string, texture | null>` declares named slots, and
  `item.setMap(name, texture | null)` fills one on the next frame. Unknown
  names warn and are ignored; reserved names (`uTexture`, `uSampler`, `uUni`,
  `vUv`, `fitUv`, non-identifiers) are dropped at creation.
- WebGPU (`gpu-item.ts`): an explicit layout keyed by (textured, map count),
  maps at `@binding(3+)` in name order, sharing `uSampler` (or a per-device
  linear clamp sampler if there's no `uTexture`). An empty slot binds a 1×1
  transparent texture (per device), and `setMap` drops the bind group so the
  next frame rebuilds it.
- WebGL2 (`item.ts`): one texture unit per map after `uTexture`'s, with a 1×1
  transparent texture (per context) while a slot is empty. Units are unbound
  after the draw.
- WGSL wrap (`wgsl-wrap.ts`): declares only the maps the fragment names, and
  declares `uSampler` for maps even without `uTexture`.
  `resolveWgslModule` returns `maps` in binding order.
- WGSL→GLSL (`wgsl-compat.ts`): every texture passed to `textureSample` gets a
  `uniform sampler2D`, so build-time GLSL (`shooosh/build`) works without
  knowing the map names.
- Docs: shader contract "Item maps". Changelog entry. `ItemMaps` type export.

Verify: `bun test package` (new cases in `wgsl-wrap.test.ts` and
`wgsl-compat.test.ts`; the two rig/model failures were already there), and
`harness/maps.html` (and `?backend=webgl2`): two red boxes with a
dark-to-bright ramp. B gets its map by `setMap` a second later.
`?plain` shows a textured item without maps for comparison.

## Not done (the notes below)

Only items take maps. Screens (`createScreen`) and `dom.media()` bindings
don't, and neither path has a caller that needs them yet.
