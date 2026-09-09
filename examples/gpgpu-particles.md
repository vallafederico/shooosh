# GPGPU mouse particles

65,536 particles simulated with WebGPU compute shaders. Move the mouse or drag a
finger to repel and swirl the field. Springs restore its shape; velocity drives
the blue-green to gold color change. Pause freezes the current state; Reset
restores the grid even while paused. Reduced-motion users start paused.

## Copy and mount

Copy `gpgpu-particles.ts`, `gpgpu-particles-shaders.ts` and `types.ts` (with its
`shaders.d.ts` declaration reference). No external assets or shader compiler
plugin is needed: these are complete WGSL compute/render shader strings.

```ts
import { run } from './gpgpu-particles'
const demo = run(document.querySelector<HTMLElement>('#particles')!)
await demo.ready
// On component removal:
demo.destroy()
```

Give the container explicit dimensions, e.g. `height: 80vh; min-height: 420px`.
The gallery route is `/examples?demo=gpgpu-particles&backend=webgpu`.
WebGL2 shows a readable unsupported message, not a CPU substitute.

## GPU data flow

- A 1 MiB storage buffer holds `vec2f position + vec2f velocity` per particle.
- A 256×256 dispatch with 8×8 workgroups initializes or integrates the state.
  Each invocation owns one element; no neighbor reads or barriers are needed,
  so updating this buffer in place is safe. Add ping-pong buffers if adapting
  the example to interactions that read other particles.
- The vertex shader reads the same buffer to draw 65,536 instanced six-vertex
  quads. There is no CPU particle loop or per-frame readback.
- JavaScript uploads only 48 bytes of control uniforms per frame. Delta time is
  capped at 1/30 second, velocities are limited and damping is exponential.
- Offscreen/hidden or paused simulations stop requesting frames. Visibility,
  pointer input and controls wake the scene. Destruction removes callbacks,
  observers, input listeners and both buffers, including during initialization.
- Canvas resizing updates aspect and point size; the spring gradually adapts the
  field to the new dimensions. DPR is capped at 1.5.

This is an independent-particle force field, not particle-particle collision or
fluid dynamics. Keep it in application/example code: core library imports and
runtime dependencies are unchanged.
