/** GPU sphere: analytic curl noise, radial confinement, pointer forces and depth-tested particles.
 * Copy this module, gpgpu-sphere-shaders.ts, gpgpu-particles.ts, its shader file,
 * both gpgpu-webgl modules and types.ts.
 */
import { runParticleSimulation, fragment } from "./gpgpu-particles"
import { computeShader, displayShader, shadowShader } from "./gpgpu-sphere-shaders"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"
export { fragment }
export function run(target: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  return runParticleSimulation(target, options, {
    compute: computeShader, display: displayShader, shadow: shadowShader, height: 128, stride: 32, depth: true, webgl: "sphere",
    title: "GPGPU / curl sphere",
    description: "32,768 particles · orbiting light · particle shadows · move your mouse to disturb",
  })
}
export const gpgpuSphere: ExampleSpec = {
  id: "gpgpu-sphere", label: "GPGPU · curl sphere", kind: "view", fragment,
  copy: "A particle sphere flowing through analytic 3D curl noise, with mouse disturbance. WebGPU compute / WebGL2 GPGPU.", run,
}
