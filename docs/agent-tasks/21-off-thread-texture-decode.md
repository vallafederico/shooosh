---
status: todo
---
# Texture fetch and decode off the main thread

Follows [20 — item maps](./20-item-maps.md). On Arge, the depth maps for the
product photos load after the photos, while the page is busy animating.
Fetching, decoding and resizing them must not cost main-thread frames, and
the GPU upload should be the only work left on the main thread.

## Shape

- `loadTexture(url, { decode: "worker" })`, or a separate export
  `decodeTexture(url, options)`, fetches in a small shared worker
  (module worker, created lazily, one per page), runs
  `createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" })`
  there for data maps (depth, masks are numbers, not colour), and transfers
  the `ImageBitmap` back. `loadTexture(bitmap, { data: true })` already
  accepts the bitmap.
- Abortable (`signal`): a page change cancels queued maps.
- Priority and concurrency: at most N decodes at a time (2–4), and a
  `priority` so visible items load before off-screen ones.
- Fallback: no `Worker` / `OffscreenCanvas`, or a CSP that blocks blob
  workers, falls back to `fetch` + `createImageBitmap` on the main thread
  (decoding there is already off the main thread in Chromium and WebKit;
  the fetch is async). Same result type either way.
- Optional, for single-channel maps: `format: "r8unorm"` uploads one channel
  (a quarter of the memory of RGBA). The WebGL2 upload needs `R8` + `RED`.

## Arge, for context (not shooosh work)

- `pnpm depth` bakes `<shot>.depth.webp` next to each photo (Depth Anything
  V2 Small, about 800px, greyscale, at the photo's aspect ratio).
- `gl-media` creates each image item with `maps: { uDepth: null }`. When the
  item has settled and the device can hover (`(hover: hover)`), it queues the
  depth map at idle priority, calls `setMap`, and eases a "depth ready"
  uniform from 0 to 1 so the hover relief fades in rather than popping.
- No depth map (a 404, a phone, reduced motion): nothing changes; the hover
  keeps today's zoom and lens.

## Also noticed (separate, small)

- On WebGL2, a textured item with no fragment of its own gets the
  *untextured* default (white, from `value1`), while WebGPU uses the textured
  default (`defaultTextureWgslFragment`). `resolveGlslShaderSource` in
  `item.ts` isn't passed `hasTexture`. Seen in `harness/maps.html?plain`.

## Learned on Arge (2026-10-09)

Arge ships its own worker for now (`src/js/gl/maps.ts`), which is what this
task would move into shooosh:

- `loadTexture(bitmap, { data: true })` re-wraps the bitmap through
  `createImageBitmap` on the main thread, a copy of a bitmap the worker
  already decoded as data. Arge passes the bitmap without `data`. The fix
  here: skip the re-wrap when the caller says the bitmap is already data
  (`{ data: "decoded" }`, or never re-wrap without `flipY`).
- 8-bit depth (and lossy WebP) steps into rings once a shader reads its
  slope. Arge bakes 10 bits over red (high) and green (low) of a lossless
  WebP; `dot(rg, vec2(65280, 255) / 65535)` puts it back, and bilinear
  filtering stays correct because the sum is linear. An `r16unorm` /
  `rg8` upload option would make that first-class.
- Feature detection: there's no runtime way to tell a shooosh with maps
  apart before an item exists (Arge probes `typeof item.setMap`). A
  `features` export (or `VERSION`) would help sites span releases.
