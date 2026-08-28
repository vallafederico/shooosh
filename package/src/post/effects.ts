/**
 * effects.custom — thin sugar for createScene({ post }). Prefer createPostProcessor.
 *
 * How to use (sugar):
 *   post: [effects.custom({
 *     fragmentShader: bloomEffect,          // GLSL applyEffect (WebGL2)
 *     fragmentShaderWgsl: bloomEffectWgsl,  // WGSL applyEffect (WebGPU)
 *     uni: { value1: 0.75 },
 *   })]
 *
 * Preferred (examples):
 *   createPostProcessor().addFragmentEffect({ fragmentShader: bloomEffect, uni: … })
 *
 * `applyEffect` contract — not fsMain. Looks (bloom, grain, …) live in examples/.
 * Ship both variants to cover both backends; a single-language effect is skipped
 * (with a log) on the other one.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post · examples/post-shaders.ts
 */

import type { PostEffect } from "../post/processor";

export type CustomFragmentEffectPreset = {
  type?: "custom";
  id?: string;
  enabled?: boolean;
  /** GLSL `applyEffect` — WebGL2 backend. */
  fragmentShader?: string;
  /** WGSL `applyEffect` — WebGPU backend. */
  fragmentShaderWgsl?: string;
  passes?: number;
  textureUniforms?: PostEffect["textureUniforms"];
  uni?: PostEffect["uni"];
};

/** Only custom applyEffect presets — no named bloom/bw/noise package looks. */
export type SceneEffectPreset = { type: "custom" } & CustomFragmentEffectPreset;

export const effects = {
  /** Custom GLSL fragment using applyEffect(color, uv, resolution, uni). */
  custom(options: CustomFragmentEffectPreset) {
    return { type: "custom" as const, ...options };
  },
};
