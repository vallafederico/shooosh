# GPGPU curl sphere

32,768 particles start on a Fibonacci sphere and flow through animated 3D curl
noise. Move the mouse or drag to disturb the front surface. Pause freezes the
state; Reset recreates the sphere even while paused. WebGPU compute and a lower-count WebGL2 GPGPU fallback are available.

## Copy and mount

Copy `gpgpu-sphere.ts`, `gpgpu-sphere-shaders.ts`, `gpgpu-particles.ts`,
`gpgpu-particles-shaders.ts`, `types.ts` and `shaders.d.ts` together. The field
module provides the shared canvas, input, visibility and resource lifecycle.
Import the sphere directly; unused field shaders are tree-shakeable.

```ts
import { run } from './gpgpu-sphere'
const demo = run(document.querySelector<HTMLElement>('#sphere')!)
await demo.ready
// On component removal:
demo.destroy()
```

Give the target a nonzero size, for example `height: 80vh; min-height: 420px`.
Gallery: `/examples?demo=gpgpu-sphere&backend=webgpu`.

## Simulation

- A 256×128 compute dispatch owns one particle per invocation. A 1 MiB storage
  buffer contains two `vec4f` values per particle: position and velocity.
- The noise is the curl of a three-component vector potential, with independent
  offsets of smooth 3D lattice value noise. `noiseGradient` differentiates its
  quintic interpolation analytically; `curl` combines the partial derivatives.
  Two spatial scales create larger currents and finer disturbances.
- Curl forces are projected onto the local tangent plane. A radial spring keeps
  particles near radius 0.82; pointer forces can lift them from the surface.
  The raw curl field is divergence-free, but projection, damping and confinement
  mean the complete simulation is not an incompressible fluid solver. Particles
  can gather into ribbons; there are no particle-particle collisions.
- The render shader reads that same storage buffer directly and draws instanced
  circular quads. Orthographic projection preserves the sphere on narrow and
  wide canvases; depth-tested particles and depth shading distinguish front/back.
- JavaScript uploads 48 control bytes per frame. No particle loop or readback
  runs on the CPU. The simulation stops requesting frames while hidden,
  offscreen or paused, and starts paused with reduced-motion preferences.

Tune noise scales/amplitudes and the radial spring in `gpgpu-sphere-shaders.ts`.
Keep the compute bounds, initialization count and wrapper dispatch dimensions
consistent if changing particle count. The example adds no core package code or
runtime dependencies. WebGL2 uses transform feedback with 8,192 particles.

## WebGL2 fallback

Also copy `gpgpu-webgl.ts` and `gpgpu-webgl-shaders.ts`, loaded dynamically on
WebGL2. See [the conversion/validation guide](../docs/gpgpu-fallbacks.md) for
execution differences, counts and agent skills. There is no CPU simulation.
