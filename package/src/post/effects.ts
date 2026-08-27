import type { BloomEffectOptions } from "../post/bloom";
import type { NoiseEffectOptions } from "../post/noise";
import type { PostEffect } from "../post/processor";

export type BloomEffectPreset = BloomEffectOptions & {
  id?: string;
  enabled?: boolean;
};

export type NoiseEffectPreset = NoiseEffectOptions & {
  id?: string;
  enabled?: boolean;
};

export type BlackAndWhiteEffectPreset = {
  id?: string;
  enabled?: boolean;
};

export type CustomFragmentEffectPreset = {
  id?: string;
  enabled?: boolean;
  fragmentShader: string;
  passes?: number;
  textureUniforms?: PostEffect["textureUniforms"];
  uni?: PostEffect["uni"];
};

export type SceneEffectPreset =
  | ({ type: "bloom" } & BloomEffectPreset)
  | ({ type: "bw" } & BlackAndWhiteEffectPreset)
  | ({ type: "noise" } & NoiseEffectPreset)
  | ({ type: "custom" } & CustomFragmentEffectPreset);

export const effects = {
  /** Bright-pass bloom with configurable intensity and threshold. */
  bloom(options: BloomEffectPreset = {}) {
    return { type: "bloom" as const, ...options };
  },
  /** Desaturate the scene toward grayscale. */
  bw(options: BlackAndWhiteEffectPreset = {}) {
    return { type: "bw" as const, ...options };
  },
  /** Film grain noise overlay. */
  noise(options: NoiseEffectPreset = {}) {
    return { type: "noise" as const, ...options };
  },
  /** Custom GLSL fragment effect using applyEffect(color, uv, resolution, uni). */
  custom(options: CustomFragmentEffectPreset) {
    return { type: "custom" as const, ...options };
  },
};
