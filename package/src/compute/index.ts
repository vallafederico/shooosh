/**
 * WebGPU compute — generic session for sims (fluids, RD, particles).
 *
 * How to use: createCompute(engine) then pipelines / ping-pong / setOnCompute.
 * Example fluids: examples/fluid-sim.ts + fluid-shaders.ts.
 */

export {
  createCompute,
  type ComputeDisplayContext,
  type ComputePingPong,
  type ComputeSession,
  type ComputeTickContext,
  type CreateComputeOptions,
} from "./compute";
