/**
 * createPostProcessor — backend-agnostic post chain. Looks live in examples/.
 *
 * How to use:
 *   const post = createPostProcessor()
 *   post.addFragmentEffect({
 *     fragmentShader: bloomEffect,        // GLSL applyEffect (WebGL2)
 *     fragmentShaderWgsl: bloomEffectWgsl, // WGSL applyEffect (WebGPU)
 *     uni: { value1: 0.75 },
 *   })
 *
 * Custom post is a **different contract** from `fsMain`:
 *   WebGL2  vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4])
 *   WebGPU  fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f
 * Injected: the scene texture (uTexture), resolution, time, delta, pass index, uni.
 *
 * No named package presets (bloom/bw/noise). Copy shaders from
 * examples/post-shaders.ts. `effects.custom` + createScene({ post }) is thin
 * sugar for the same author-supplied snippets.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post · examples/grain-bloom.ts
 */

import { getDefaultEngine, type EnginePostFrame } from "../engine/engine";
import type { RendererKind } from "../engine/capabilities";
import type { UniValues } from "../engine/uni";
import {
  createInternalEffect,
  type InternalEffect,
  type PostBackend,
  type PostEffect,
  type PostEffectKind,
} from "./types";

export type { PostEffect, PostEffectKind } from "./types";

export type PostProcessorOptions = {
  /** Called at the start of every post frame; the return value is ignored. */
  onFrame?: (post: PostProcessor, frame: EnginePostFrame) => unknown;
};

export type FragmentEffectOptions = {
  id?: string;
  enabled?: boolean;
  /** GLSL `applyEffect` — used on the WebGL2 backend. */
  fragmentShader?: string;
  /** WGSL `applyEffect` — used on the WebGPU backend. */
  fragmentShaderWgsl?: string;
  passes?: number;
  textureUniforms?: PostEffect["textureUniforms"];
  uni?: UniValues;
};

export class PostProcessor {
  private effects: InternalEffect[] = [];
  private unsubscribe: (() => void) | null = null;
  private options: PostProcessorOptions;
  private backend: PostBackend | null = null;
  private backendKind: RendererKind | null = null;
  private loadingBackend: RendererKind | null = null;
  private failedBackends = new Set<RendererKind>();
  private destroyed = false;

  constructor(options: PostProcessorOptions = {}) {
    this.options = options;
    const engine = getDefaultEngine();
    if (!engine) {
      throw new Error(
        "PostProcessor requires an initialized engine. Create a Scene (or call initEngine) before adding post-processing.",
      );
    }
    this.unsubscribe = engine.onPostRender((frame) => this.onPostRender(frame));
  }

  addEffect(options: Partial<Omit<PostEffect, "id">> & { id?: string } = {}) {
    const effect = createInternalEffect(options);
    this.effects.push(effect);
    return effect.id;
  }

  addFragmentEffect(options: FragmentEffectOptions) {
    if (!options.fragmentShader?.trim() && !options.fragmentShaderWgsl?.trim()) {
      console.warn(
        "[post] addFragmentEffect needs fragmentShader (GLSL) and/or fragmentShaderWgsl (WGSL).",
      );
    }
    return this.addEffect({
      id: options.id,
      enabled: options.enabled ?? true,
      kind: "fragment",
      fragmentShader: options.fragmentShader,
      fragmentShaderWgsl: options.fragmentShaderWgsl,
      passes: options.passes ?? 1,
      textureUniforms: options.textureUniforms,
      uni: options.uni,
    });
  }

  updateEffect(id: string, next: Partial<Omit<PostEffect, "id">>) {
    const effect = this.effects.find((entry) => entry.id === id);
    if (!effect) return;
    effect.enabled = next.enabled ?? effect.enabled;
    if (next.uni) {
      effect.uniWatch.set(next.uni);
    }
    if (next.params) {
      effect.params = { ...effect.params, ...next.params };
    }
    let shaderChanged = false;
    if (typeof next.fragmentShader !== "undefined") {
      effect.fragmentShader = next.fragmentShader;
      shaderChanged = true;
    }
    if (typeof next.fragmentShaderWgsl !== "undefined") {
      effect.fragmentShaderWgsl = next.fragmentShaderWgsl;
      shaderChanged = true;
    }
    if (shaderChanged) {
      const hasFragment =
        Boolean(effect.fragmentShader?.trim()) ||
        Boolean(effect.fragmentShaderWgsl?.trim());
      effect.kind = hasFragment ? "fragment" : null;
      this.backend?.invalidate(effect.id);
    }
    if (typeof next.passes === "number") {
      effect.passes = Math.max(1, Math.floor(next.passes));
    }
    if (typeof next.textureUniforms !== "undefined") {
      effect.textureUniforms = next.textureUniforms;
      this.backend?.invalidate(effect.id);
    }
    getDefaultEngine()?.requestFrame();
  }

  setEffectUni(id: string, next: Partial<UniValues>) {
    const effect = this.effects.find((entry) => entry.id === id);
    if (!effect) return;
    effect.uniWatch.set(next);
  }

  removeEffect(id: string) {
    this.effects = this.effects.filter((entry) => {
      if (entry.id !== id) return true;
      entry.uniUnsubscribe?.();
      return false;
    });
    this.backend?.invalidate(id);
  }

  clearEffects() {
    this.effects.forEach((effect) => {
      effect.uniUnsubscribe?.();
      this.backend?.invalidate(effect.id);
    });
    this.effects = [];
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.effects.forEach((effect) => {
      effect.uniUnsubscribe?.();
    });
    this.effects = [];
    this.backend?.destroy();
    this.backend = null;
    this.backendKind = null;
  }

  /**
   * Loads the chain for the active backend. Returns null while the chunk is in
   * flight; the resolved import requests another frame.
   */
  private ensureBackend(kind: RendererKind): PostBackend | null {
    if (this.backend && this.backendKind === kind) return this.backend;
    if (this.loadingBackend === kind || this.failedBackends.has(kind)) return null;

    if (this.backend) {
      this.backend.destroy();
      this.backend = null;
      this.backendKind = null;
    }
    this.loadingBackend = kind;
    const load =
      kind === "webgpu"
        ? import("./processor-webgpu").then((module) => module.createWebGpuPostBackend())
        : import("./processor-webgl2").then((module) => module.createWebGl2PostBackend());

    void load
      .then((backend) => {
        this.loadingBackend = null;
        if (this.destroyed) {
          backend.destroy();
          return;
        }
        this.backend = backend;
        this.backendKind = kind;
        getDefaultEngine()?.requestFrame();
      })
      .catch((error) => {
        this.loadingBackend = null;
        this.failedBackends.add(kind);
        console.warn(`[post] Failed to load the ${kind} post chain:`, error);
      });
    return null;
  }

  private onPostRender(frame: EnginePostFrame) {
    this.options.onFrame?.(this, frame);
    const backend = this.ensureBackend(frame.backend);
    if (!backend) return;
    backend.render(frame, this.effects);
  }
}

export function createPostProcessor(options: PostProcessorOptions = {}) {
  return new PostProcessor(options);
}
