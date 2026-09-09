# WebGPU compute → WebGL2 GPGPU

Both particle examples run entirely on the GPU on both backends. WebGPU uses
storage-buffer compute; WebGL2 uses a vertex update pass with transform feedback.
No simulation state is read back or integrated on the CPU during animation.

| Example | WebGPU | WebGL2 fallback |
| --- | --- | --- |
| Mouse field | 65,536 particles | 16,384 particles |
| Curl sphere | 32,768 particles | 8,192 particles |

The fallback uses fewer particles and slightly larger dots to preserve a similar
look on constrained devices. It uses the same forces, damping, dt cap and curl
noise equations. Count and floating-point differences mean trajectories and
images are not identical. No universal WebGL2/WebGPU speed ratio is claimed.

## Agent skills

- [Port compute to GPGPU](../.agents/skills/shooosh-gpgpu/SKILL.md): choose an execution model and preserve its invariants.
- [Validate the port](../.agents/skills/shooosh-gpgpu-validation/SKILL.md): real GPU execution, lifecycle, parity and bundle isolation.

These are repository-local skills. In a checkout, agents can discover `.agents/skills`;
They are included in package files for future releases;
other agents can follow the links in `agents.md` or `llms.txt`.

## Reference implementation

`examples/gpgpu-particles.ts` owns the shared scene, input, pause/reset,
visibility and teardown. Only after selecting WebGL2 does it dynamically import
`gpgpu-webgl.ts`, which uses the existing shooosh context and frame callback.
`gpgpu-webgl-shaders.ts` contains GLSL 300 es counterparts of the canonical WGSL.
No changes to the core API or dependencies are needed.

Each GL particle is two vec4s (32 bytes). An update VAO reads buffer A with divisor
0; transform feedback captures position/velocity into B. After ending/unbinding
feedback, a display VAO reads B with divisor 1 and draws six-vertex quads. The
next update reverses A/B. The field uses 128×128 records; the sphere uses 128×64.
Sphere initialization uses the fallback count. The draw restores the GL state it
touches, including depth, blend, culling, rasterizer discard, program and VAO.

Transform feedback needs no float-texture extension. It suits independent
particle updates. Neighbor-sampling grids generally need fragment shaders with
ping-pong float render targets and capability checks. Atomics, scatter, shared
memory and workgroup barriers need algorithmic redesign; the ordinary WGSL
fragment converter cannot supply those semantics.

Failures retain readable controls/status text. WebGL context loss requires a
remount after the context is available; automatic simulation state recovery is
not implemented. The higher-count WebGPU route remains unchanged.

## Reproduce validation

Run `pnpm --filter harness dev`, then open `/gpgpu-verify.html`. This standalone
WebGL2 harness runs both actual GLSL kernels and reads back state only for tests:
initial bounds, 120 updates, finite values, mouse effect, pause, deterministic
reset, GL state restoration, resource deletion and injected allocation/compilation failures.
The displayed result must say `ALL CHECKS PASSED`; browser GPU support is needed.

The curl sphere also uses a depth shadow pass on both backends. See [lighting details](../examples/gpgpu-sphere.md#light-and-self-shadowing); the validation harness includes a rendered shadow-on/off occlusion comparison.
