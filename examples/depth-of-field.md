# Depth of field, distance darkening, haze and grade for object scenes

A post effect for `createObject` scenes: a depth-of-field blur, darkening and haze
that grow with distance from the camera, a neutral grade and film grain. All of it
runs in one effect of three passes on both backends. Copy
[`depth-of-field.ts`](./depth-of-field.ts).

It was built for a floating cluster of baked objects (the unisn.co `/webgl` page)
and measured there. It is a recipe, not a package export.

## Depth without a depth buffer

Post effects can't read the depth buffer. On WebGPU the scene depth is
`RENDER_ATTACHMENT` only and discarded; on WebGL2 it's a renderbuffer. So the
objects carry depth themselves, in **alpha**. Objects draw unblended, which makes
alpha a free channel when a post effect is active.

```wgsl
// In each object's fsMain (DEPTH_ALPHA_WGSL in the copy set):
return vec4f(colour, depthAlpha(near, range));
```

- `near` is metres in front of the scene's centre; `range` is the span alpha
  covers, ±1 m by default.
- **Per pixel** needs the fragment's world position. Object shaders don't get it
  yet; see [the proposal](../docs/proposals/object-scenes.md) §1. With it,
  `near = nearOf(vPosition, cameraDistance)`.
- **Per object** works on stock shooosh: compute each object's centre distance in
  JS and pass it through a spare uniform. Large objects then blur evenly across
  their whole surface.
- Clear the scene with **alpha 0**: that marks the background. The effect never
  grades, hazes or darkens it, and writes alpha 1 on its last pass.

```ts
import { createDepthOfField, DEFAULT_DEPTH_LOOK } from "./depth-of-field"

const scene = createCanvasScene(canvas, { clearColor: { r: 0.07, g: 0.075, b: 0.082, a: 0 } })
await scene.init()
const dof = createDepthOfField(DEFAULT_DEPTH_LOOK, [0.0706, 0.0745, 0.0824])
scene.retain(dof.post)
// Live tuning: dof.set({ ...DEFAULT_DEPTH_LOOK, radius: 8 })
```

## What each pass does

1. **Prepare**, once per pixel:
   - grade (saturation, and contrast as a curve that keeps black at black);
   - haze toward the background colour, growing with distance from the camera;
   - darken by depth (`exp((z − bright) · fade)`, clamped).

   Only objects; the background stays exactly as cleared. Darkening is applied
   to the colour before the blur, so a dark, far object never leaves a bright
   fringe on the background beside it.
2. **Blur across** and 3. **blur down**: a separable gaussian of the pixel's own
   blur, which runs from the focus distance through `sharp` to `ramp`.
   - **Adaptive taps.** Each pixel takes only the taps its blur needs, so
     in-focus pixels take none.
   - **Gather as scatter.** A neighbour contributes only as far as its *own* blur
     spreads it, so sharp objects never halo onto the background.
   - **Objects never gather the background.** Otherwise thin things, like cables,
     hollow out into outlines.
   - Film grain on the last pass.

## Lessons (measured)

- **Keep per-pixel work out of the tap loop.** The first version graded and
  darkened every tap (17 per pixel per pass). At 5K that was the whole frame:
  15.7 ms against 8.3 ms with no post. Moving it into a prepare pass by
  `passIndex` brought it back to 8.3 ms. An effect runs one shader for all its
  passes, so branch on `passIndex`.
- **A disc gather looked fake and grainy** at small radii (32 spiral samples).
  The separable gaussian reads as optical.
- **Halos.** Gathering "background as fully blurred" painted pale rims around
  sharp objects. The fix is the gather-as-scatter weight above.
- **Keep it subtle.** At these scales: 5 CSS px at most, sharp within 4 cm of the
  focus, fully blurred 45 cm beyond.
- **No MSAA with post active.** Expect slightly harder edges.

## Limits

- The haze colour must match the clear colour; it's written into the shader at
  creation (`background`), since the effect's 16 uniforms are all used.
- Alpha is spent on depth: no transparent objects. They don't blend anyway.
- WebGL2 takes the `fragmentShader` (GLSL) variant and WebGPU the
  `fragmentShaderWgsl` one; both are in the copy set. The post chain is not
  translated.
