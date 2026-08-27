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
