# Raymarching recipes

Two fullscreen WGSL examples using `createCanvasScene`. The default backend is
`auto`: WebGPU first, with prepared GLSL for WebGL2. No compute passes, textures,
post stack, external assets or additional dependencies are needed.

| Demo | Technique | Work per pixel (upper bound) |
| --- | --- | --- |
| `raymarch-clouds` | Front-to-back volume integration, procedural 3D noise, short sun visibility march | 80 density steps; 4 additional density samples per occupied step. Each density sample uses 3 noise octaves. |
| `raymarch-lights` | Sphere tracing of a plane, sphere and standing torus; two moving point lights | 96 primary steps; up to 32 shadow steps per light, 6 normal samples and 4 AO samples on a hit. |

Open the harness with `/?demo=raymarch-clouds&backend=webgpu` or
`/?demo=raymarch-lights&backend=webgpu`. Use `backend=webgl2` to check fallback.

Copy the selected `.ts` and `.wgsl`, plus `handle.ts`, `types.ts` and
`shaders.d.ts`. Enable `shoooshShaders` from `shooosh/build` in the bundler, then
call `run(canvas, { backend: "auto" })`. Handle the returned `ready` promise and
call `destroy()` at unmount. The canvas needs explicit, nonzero CSS dimensions;
keep semantic page content in HTML. See the [copy guide](./agent-guide.md).

Both recipes write `value1` = elapsed seconds and `value2` = framebuffer aspect.
They cap DPR at 1 to bound pixel cost and clamp animation deltas after suspension.
Reduced motion renders the time-zero composition; it does not stop the render loop.

Cloud density comes from a vertically bounded noise field. The camera flies forward inside the layer at 0.9 world units per second, with gentle lateral and altitude drift. Change `t * 0.9` in the camera origin to adjust flight speed. Quadratic ray spacing concentrates samples near the camera. Change the `0.54`
threshold for coverage, the `7.0` multiplier for density, and the sun direction for
lighting. Stable spatial jitter softens integration bands; fine grain and some
horizon undersampling remain at the fixed 80-step budget. This is a stylized
single-scattering approximation without temporal accumulation or multiple scattering.

The lighting scene combines exact distance functions with soft shadow and local
ambient-occlusion approximations. Edit the two lamp positions/colors in `fsMain`.
There are no reflections, indirect light bounces or physically based area lights.
The finite step limits trade accuracy for cost, especially near grazing surfaces.
These are heavier than the 2D noise recipes: measure at the intended canvas size
on target hardware before using them as a fullscreen background.
