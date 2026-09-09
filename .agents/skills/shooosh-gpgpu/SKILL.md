---
name: shooosh-gpgpu
description: Port shooosh WebGPU compute simulations to a similar WebGL2 GPGPU fallback. Choose transform feedback or ping-pong render targets, preserve GPU state flow, and keep fallback code outside core.
---

# Compute to WebGL2 GPGPU

Use this for compute simulations, not ordinary fragment shaders. WGSL remains
canonical. The fragment converter cannot turn storage writes, workgroups or
barriers into WebGL2 compute: change the execution model deliberately.

Read the repo's `docs/gpgpu-fallbacks.md` and the relevant recipe:
`examples/gpgpu-particles.ts`, `gpgpu-sphere-shaders.ts`, `gpgpu-webgl.ts` and
`gpgpu-webgl-shaders.ts`. Resolve paths from the repository root. Existing shader
translation rules live in `.cursor/skills/wgsl-to-glsl/SKILL.md`.

## Choose the execution model

| Kernel | WebGL2 adaptation |
| --- | --- |
| One independent output record per input particle | Transform feedback vertex pass; ping-pong buffers. Both particle demos use this. |
| Grid/stencil, neighbor reads, diffusion, fluid fields | Fragment pass into float render targets; ping-pong textures and `texelFetch`. |
| Atomics, scatter, workgroup barriers/shared memory | Reformulate as gather/multipass/reduction or explicitly mark unsupported. Do not claim mechanical parity. |

WebGL2 GPGPU is still GPU computation. Do not introduce a CPU particle loop,
per-frame readback, Three.js, a second engine, or a mandatory runtime dependency.
A fallback can reduce count/resolution and quality; benchmark before claiming
that WebGL2 itself is slower. The render/backend label must reflect actual work.

## Port invariants

- Audit canonical state layout, initialization, units, bounds and per-pass reads
  before translating arithmetic. Keep time in seconds and reproduce dt caps,
  damping, coordinates, hash/noise derivatives and force scales.
- For transform feedback, set output varying names/order **before linking**.
  Use separate source and destination buffers, independent update/display VAOs,
  explicit stride/offsets and divisors. Enable rasterizer discard only for the
  update; pair begin/end with the primitive mode used by the draw. Unbind the
  output feedback object before drawing from that buffer, then swap.
- For texture passes, check float color-buffer support and framebuffer
  completeness; use `NEAREST`, no mipmaps, and integer texel coordinates. Do not
  read from an attachment being written. RGBA16F trades range/precision for
  memory; do not silently quantize velocity to unsigned bytes.
- Map vertex/instance IDs, clip depth (WebGPU 0..1; GL -1..1), Y direction and
  projection explicitly. A fallback with fewer particles must initialize from
  its own count and grid dimensions, not reuse WebGPU bounds.
- Compile/link fully before activating the fallback, report actual shader logs,
  and release partial allocations on failure. Restore touched GL state around
  direct draws on the existing engine context; keep GL types out of core APIs.
- Dynamically import fallback code only after backend selection. Share input,
  pause/reset, visibility and disposal logic; guard async import completion after
  unmount. Account for context loss by showing failure/remount behavior rather
  than silently continuing an invalid simulation.

## Finish

Apply `shooosh-gpgpu-validation` in the sibling skill folder. Update the example's
copy set, backend/count table, agent guide and `llms.txt`. State approximation
limits; matching force equations is not evidence of identical pixels or speed.
