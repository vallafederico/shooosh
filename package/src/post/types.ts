/**
 * Shared post types + effect helpers. Not a public import.
 *
 * How to use: processor.ts owns the effect list and the public API; the backend
 * chunks (processor-webgl2 / processor-webgpu) implement PostBackend and receive
 * the resolved effect list once per frame.
 *
 * Looks (bloom, FXAA, grain, …) live in examples/post-shaders.ts — not here.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post
 */

import type { EnginePostFrame } from "../engine/engine";
import { ensureWatchableUni, type UniValues, type UniWatchController } from "../engine/uni";

/** Only author-supplied `applyEffect` snippets — no named package presets. */
export type PostEffectKind = "fragment";

export type PostEffect = {
  id: string;
  enabled: boolean;
  kind?: PostEffectKind;
  /** Reserved for site tuning; fragment effects ignore this. */
  params?: Record<string, number>;
  /** @deprecated Ignored — use fragmentShader / fragmentShaderWgsl. */
  computeShader?: string;
  /** GLSL `applyEffect` — WebGL2. */
  fragmentShader?: string;
  /** WGSL `applyEffect` — WebGPU. */
  fragmentShaderWgsl?: string;
  passes?: number;
  /**
   * Extra named samplers (WebGL2 post only today). Return a texture handle
   * from `loadTexture` (or anything with `{ texture, gl }`); the WebGPU chain
   * warns and skips binding these.
   */
  textureUniforms?: Record<
    string,
    () => { texture: unknown; gl?: unknown } | null
  >;
  uni?: UniValues;
};

export type InternalEffect = Omit<PostEffect, "kind" | "params"> & {
  kind: PostEffectKind | null;
  params: Record<string, number>;
  uniWatch: UniWatchController;
  uniUnsubscribe: (() => void) | null;
};

/** One backend's post chain. Loaded on demand by the PostProcessor facade. */
export type PostBackend = {
  render: (frame: EnginePostFrame, effects: InternalEffect[]) => void;
  /** Drop cached programs for an effect whose shader changed or was removed. */
  invalidate: (id: string) => void;
  destroy: () => void;
};

export function createEffectId() {
  return `post_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInternalEffect(
  options: Partial<Omit<PostEffect, "id">> & { id?: string } = {},
): InternalEffect {
  const hasFragment =
    Boolean(options.fragmentShader?.trim()) ||
    Boolean(options.fragmentShaderWgsl?.trim());
  const effect: InternalEffect = {
    id: options.id ?? createEffectId(),
    enabled: options.enabled ?? true,
    kind: hasFragment || options.kind === "fragment" ? "fragment" : null,
    params: options.params ?? {},
    computeShader: options.computeShader,
    fragmentShader: options.fragmentShader,
    fragmentShaderWgsl: options.fragmentShaderWgsl,
    passes: Math.max(1, Math.floor(options.passes ?? 1)),
    textureUniforms: options.textureUniforms,
    uni: options.uni,
    uniWatch: ensureWatchableUni(options.uni ?? {}),
    uniUnsubscribe: null,
  };
  effect.uniUnsubscribe = effect.uniWatch.subscribe(() => {});
  return effect;
}
