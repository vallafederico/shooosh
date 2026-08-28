/**
 * createParticles — clip-space dots. Runs on both backends.
 *
 * How to use:
 *   createParticles({ positions, size, color, layer })
 * `positions` is `[x,y,…]` in clip space. Recreate on resize if count changes;
 * `setPositions` on scroll is cheaper than destroy/create.
 * WebGL2 draws gl.POINTS; WebGPU draws instanced quads with the same falloff.
 *
 * Docs: docs/site-patterns.md
 */

import { ParticlesManager, type ParticlesOptions } from "./particles";

export type CreateParticlesOptions = ParticlesOptions;
export type ParticlesController = Particles;

export class Particles {
  private manager: ParticlesManager;

  constructor(options: CreateParticlesOptions) {
    this.manager = new ParticlesManager(options);
  }

  setPositions(positions: Float32Array) {
    this.manager.setPositions(positions);
  }

  destroy() {
    this.manager.destroy();
  }
}

export function createParticles(options: CreateParticlesOptions) {
  return new Particles(options);
}
