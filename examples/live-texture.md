# Video and live canvases on objects

A screen, TV or phone showing a video or an animated canvas, on a `createObject`.
Copy [`live-texture.ts`](./live-texture.ts).

`loadTexture` snapshots its source, and objects can't swap maps after creation.
The handle's texture is public and writable, though, so `LiveTexture` draws each
frame into a fixed-size canvas and writes it into the **same** texture:
- **WebGPU:** `queue.copyExternalImageToTexture`, with the device from
  `createCompute(scene.getEngine())`.
- **WebGL2:** `texSubImage2D` on `handle.gl`.

```ts
import { LiveTexture, videoSource } from "./live-texture"

await scene.init()
const feed = await LiveTexture.create(scene, 640, 480)
const screen = createObject(null, { shape, shaders: screenShader, maskMap: feed.texture, envMap })
feed.set(videoSource("/reel.mp4")) // or any canvas: feed.set(myCanvas)
// every frame you draw:
feed.update()
```

## The screen shader

A convincing CRT or phone glass, in one `fsMain`:
- **UVs across the glass:** rewrite the glass's UVs to run 0–1 across its face
  (from its bounds) if the model's UVs point into an atlas.
- **Bulge and vignette:** pull the content toward the edges by
  `uv · (1 + k·|uv|²)` and darken outside the picture.
- **Scanlines and flicker**, faint.
- **Fake reflections on top:** the environment's sharp band along the reflected
  view ray, times a fresnel term. See
  [procedural-environment.md](./procedural-environment.md).
- **Nothing playing:** a procedural fallback (a terminal of typed glyph blocks)
  keeps the screen alive with no texture at all.

## Limits

- **No mipmaps:** re-uploading level 0 doesn't refresh them, so keep the feed's
  canvas near its on-screen size.
- **Keep the loop awake while something plays:** Shooosh idles when nothing
  changes.
- **Cross-origin video** needs CORS headers.
- **Proposed upstream:** updatable textures (`handle.update()`, video sources) and
  swappable object maps ([proposal](../docs/proposals/object-scenes.md) §3).
