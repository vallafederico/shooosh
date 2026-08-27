import { getDefaultEngine, type EnginePostFrame } from "../engine/engine";
import { ensureWatchableUni, type UniValues, type UniWatchController } from "../engine/uni";
import {
  createBloomComputeShader,
  type BloomEffectOptions,
} from "./bloom";
import { createBlackAndWhiteComputeShader } from "./bw";
import {
  createNoiseComputeShader,
  type NoiseEffectOptions,
} from "./noise";
import { compileProgramAsync, type AsyncProgram } from "../shaders/compile";

// ---------------------------------------------------------------------------
// Orientation contract
// ---------------------------------------------------------------------------
// The scene framebuffer is stored bottom-origin (standard GL: row 0 displays
// at the bottom of the screen). The post chain normalizes this ONCE:
//
//   scene FBO ──(ingest blit, flips)──▶ post space ──(effect passes,
//   orientation-preserving)──▶ ... ──(final blit, flips)──▶ canvas
//
// In "post space" every effect pass is guaranteed the same semantics,
// regardless of its position in the chain or how many effects run:
//   - `uv` is top-origin: (0,0) = top-left of the screen, uv.y grows downward.
//   - `texture(uTexture, uv)` is screen-aligned: it returns the pixel currently
//     displayed at that screen position.
//
// Because effect passes preserve orientation, adding/removing/toggling effects
// can never flip the output — the parity of the chain no longer matters.

/** Orientation-preserving vertex shader used by every effect pass. */
const PASS_VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = aPosition * 0.5 + 0.5;
}`;

/**
 * Y-mirroring vertex shader used by the ingest blit (scene FBO → post space)
 * and the final blit (post space → canvas), which each flip exactly once.
 */
const BLIT_VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = aPosition * vec2(0.5, -0.5) + vec2(0.5, 0.5);
}`;

const COPY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 outColor;
void main() {
  outColor = texture(uTexture, vUv);
}`;

const BW_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uMix;
out vec4 outColor;
void main() {
  vec4 color = texture(uTexture, vUv);
  float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  outColor = vec4(mix(color.rgb, vec3(luma), clamp(uMix, 0.0, 1.0)), color.a);
}`;

const BLOOM_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uIntensity;
uniform float uThreshold;
uniform float uRadius;
out vec4 outColor;
void main() {
  vec2 texel = 1.0 / vec2(textureSize(uTexture, 0));
  vec2 o = texel * max(0.25, uRadius);
  vec3 c0 = texture(uTexture, vUv + vec2(-o.x, -o.y)).rgb;
  vec3 c1 = texture(uTexture, vUv + vec2(0.0, -o.y)).rgb;
  vec3 c2 = texture(uTexture, vUv + vec2(o.x, -o.y)).rgb;
  vec3 c3 = texture(uTexture, vUv + vec2(-o.x, 0.0)).rgb;
  vec3 c4 = texture(uTexture, vUv).rgb;
  vec3 c5 = texture(uTexture, vUv + vec2(o.x, 0.0)).rgb;
  vec3 c6 = texture(uTexture, vUv + vec2(-o.x, o.y)).rgb;
  vec3 c7 = texture(uTexture, vUv + vec2(0.0, o.y)).rgb;
  vec3 c8 = texture(uTexture, vUv + vec2(o.x, o.y)).rgb;
  vec3 blur = (c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8) / 9.0;
  float bright = max(max(blur.r, blur.g), blur.b);
  float mask = smoothstep(uThreshold, 1.0, bright);
  vec3 bloom = blur * mask * max(0.0, uIntensity);
  outColor = vec4(c4 + bloom, 1.0);
}`;

const NOISE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uAmount;
uniform float uScale;
uniform float uTime;
out vec4 outColor;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec4 color = texture(uTexture, vUv);
  vec2 cell = floor(vUv * uScale);
  float cellHash = hash(cell);
  float n = hash(vec2(cellHash, uTime * 1000.0));
  float noise = (n - 0.5) * uAmount;
  vec3 rgb = clamp(color.rgb + noise, 0.0, 1.0);
  outColor = vec4(rgb, color.a);
}`;

export type PostEffectKind = "bloom" | "bw" | "noise" | "fragment";

export type PostEffect = {
  id: string;
  enabled: boolean;
  /** Resolved effect kind. Set explicitly by the addXxxEffect helpers, or inferred from computeShader/fragmentShader by addEffect. */
  kind?: PostEffectKind;
  /** Numeric tuning for built-in effects (e.g. bloom threshold/radius). */
  params?: Record<string, number>;
  /** Legacy WGSL-style compute snippet, only used to infer `kind`. */
  computeShader?: string;
  fragmentShader?: string;
  passes?: number;
  textureUniforms?: Record<string, () => { texture: WebGLTexture; gl: WebGL2RenderingContext } | null>;
  uni?: UniValues;
};

export type PostProcessorOptions = {
  /** Called at the start of every post frame; the return value is ignored. */
  onFrame?: (post: PostProcessor, frame: EnginePostFrame) => unknown;
};

type InternalEffect = Omit<PostEffect, "kind" | "params"> & {
  kind: PostEffectKind | null;
  params: Record<string, number>;
  uniWatch: UniWatchController;
  uniUnsubscribe: (() => void) | null;
};

type CorePrograms = {
  blitMirror: WebGLProgram | null;
  blitUpright: WebGLProgram | null;
  bw: WebGLProgram | null;
  bloom: WebGLProgram | null;
  noise: WebGLProgram | null;
};

type GlTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  destroy: () => void;
};

function createId() {
  return `post_${Math.random().toString(36).slice(2, 10)}`;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program.");
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number): GlTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    throw new Error("Failed to create WebGL post-processing target.");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    texture,
    framebuffer,
    width,
    height,
    destroy() {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    },
  };
}

/** Infers the effect kind from legacy computeShader snippets. */
function inferEffectKind(effect: Pick<PostEffect, "computeShader" | "fragmentShader">): PostEffectKind | null {
  if (effect.fragmentShader?.trim()) return "fragment";
  const shader = effect.computeShader ?? "";
  if (!shader.trim()) return null;
  if (shader.includes("let luma = dot")) return "bw";
  if (shader.includes("let bloom = blur")) return "bloom";
  if (shader.includes("noiseAdd")) return "noise";
  return null;
}

/** Extracts bloom tuning from a legacy compute shader snippet. */
function parseBloomTuning(shader: string | undefined) {
  const src = shader ?? "";
  const thresholdMatch = /let threshold = ([0-9.]+)/.exec(src);
  const radiusMatch = /let r = ([0-9.]+)/.exec(src);
  return {
    threshold: Number.parseFloat(thresholdMatch?.[1] ?? "0.72") || 0.72,
    radius: Number.parseFloat(radiusMatch?.[1] ?? "1.5") || 1.5,
  };
}

export class PostProcessor {
  private effects: InternalEffect[] = [];
  private unsubscribe: (() => void) | null = null;
  private options: PostProcessorOptions;
  private targets: GlTarget[] = [];
  private programs: CorePrograms | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private programGl: WebGL2RenderingContext | null = null;
  private warnedOnce = new Set<string>();
  private customPrograms = new Map<string, WebGLProgram>();
  /** Effects whose shader failed to compile — skipped, never retried. */
  private failedEffects = new Set<string>();

  // Per-program cached uniform locations.
  private uTextureLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uUniLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uPassLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uResLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uTimeLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uDeltaLocs = new Map<WebGLProgram, WebGLUniformLocation | null>();
  private uNamedLocs = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  // Non-blocking shader compilation state.
  // 'idle' → nothing submitted; 'compiling' → submitted, polling each frame;
  // 'ready' → every program settled (linked or failed) and assigned.
  private compileState: "idle" | "compiling" | "ready" = "idle";
  private pendingAsync = new Map<string, AsyncProgram>();

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
    const kind = options.kind ?? inferEffectKind(options);
    let params = options.params ?? {};
    if (kind === "bloom" && options.params == null) {
      params = parseBloomTuning(options.computeShader);
    }
    const effect: InternalEffect = {
      id: options.id ?? createId(),
      enabled: options.enabled ?? true,
      kind,
      params,
      computeShader: options.computeShader,
      fragmentShader: options.fragmentShader,
      passes: Math.max(1, Math.floor(options.passes ?? 1)),
      textureUniforms: options.textureUniforms,
      uni: options.uni,
      uniWatch: ensureWatchableUni(options.uni ?? {}),
      uniUnsubscribe: null,
    };
    effect.uniUnsubscribe = effect.uniWatch.subscribe(() => {});
    this.effects.push(effect);
    return effect.id;
  }

  addBloomEffect(options: BloomEffectOptions & { id?: string; enabled?: boolean } = {}) {
    return this.addEffect({
      id: options.id,
      enabled: options.enabled ?? true,
      kind: "bloom",
      params: {
        threshold: options.threshold ?? 0.72,
        radius: options.radius ?? 1.5,
      },
      passes: 1,
      uni: { intensity: options.intensity ?? 0.85 },
    });
  }

  addBlackAndWhiteEffect(options: { id?: string; enabled?: boolean } = {}) {
    return this.addEffect({
      id: options.id,
      enabled: options.enabled ?? true,
      kind: "bw",
      passes: 1,
      uni: { mix: 1 },
    });
  }

  addNoiseEffect(
    options: NoiseEffectOptions & { id?: string; enabled?: boolean } = {},
  ) {
    return this.addEffect({
      id: options.id,
      enabled: options.enabled ?? true,
      kind: "noise",
      passes: 1,
      uni: {
        amount: options.amount ?? 0.03,
        scale: options.scale ?? 520,
      },
    });
  }

  addFragmentEffect(
    options: {
      id?: string;
      enabled?: boolean;
      fragmentShader: string;
      passes?: number;
      textureUniforms?: Record<
        string,
        () => { texture: WebGLTexture; gl: WebGL2RenderingContext } | null
      >;
      uni?: UniValues;
    },
  ) {
    return this.addEffect({
      id: options.id,
      enabled: options.enabled ?? true,
      kind: "fragment",
      fragmentShader: options.fragmentShader,
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
    if (typeof next.computeShader !== "undefined") {
      effect.computeShader = next.computeShader;
      effect.kind = next.kind ?? inferEffectKind(effect);
      if (effect.kind === "bloom" && next.params == null) {
        effect.params = parseBloomTuning(effect.computeShader);
      }
    }
    if (typeof next.fragmentShader !== "undefined") {
      effect.fragmentShader = next.fragmentShader;
      effect.kind = next.kind ?? inferEffectKind(effect);
      this.failedEffects.delete(effect.id);
      const program = this.customPrograms.get(effect.id);
      if (program && this.programGl) {
        this.programGl.deleteProgram(program);
        this.uTextureLocs.delete(program);
        this.uUniLocs.delete(program);
        this.uPassLocs.delete(program);
        this.uResLocs.delete(program);
        this.uTimeLocs.delete(program);
        this.uDeltaLocs.delete(program);
        this.uNamedLocs.delete(program);
      }
      this.customPrograms.delete(effect.id);
    }
    if (typeof next.passes === "number") {
      effect.passes = Math.max(1, Math.floor(next.passes));
    }
    if (typeof next.textureUniforms !== "undefined") {
      effect.textureUniforms = next.textureUniforms;
    }
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
    this.failedEffects.delete(id);
    const program = this.customPrograms.get(id);
    if (program && this.programGl) {
      this.programGl.deleteProgram(program);
      this.uTextureLocs.delete(program);
      this.uUniLocs.delete(program);
      this.uPassLocs.delete(program);
      this.uResLocs.delete(program);
      this.uTimeLocs.delete(program);
      this.uDeltaLocs.delete(program);
      this.uNamedLocs.delete(program);
    }
    this.customPrograms.delete(id);
  }

  clearEffects() {
    this.effects.forEach((effect) => {
      effect.uniUnsubscribe?.();
    });
    this.effects = [];
    this.failedEffects.clear();
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.effects.forEach((effect) => {
      effect.uniUnsubscribe?.();
    });
    for (const target of this.targets) {
      target.destroy();
    }
    this.targets = [];
    if (this.programGl) {
      const gl = this.programGl;
      if (this.programs) {
        for (const program of Object.values(this.programs)) {
          if (program) gl.deleteProgram(program);
        }
      }
      this.quadVao && gl.deleteVertexArray(this.quadVao);
      this.quadBuffer && gl.deleteBuffer(this.quadBuffer);
      for (const program of this.customPrograms.values()) {
        gl.deleteProgram(program);
      }
    }
    for (const pending of this.pendingAsync.values()) {
      pending.destroy();
    }
    this.pendingAsync.clear();
    this.programs = null;
    this.quadVao = null;
    this.quadBuffer = null;
    this.programGl = null;
    this.customPrograms.clear();
    this.failedEffects.clear();
    this.warnedOnce.clear();
    this.compileState = "idle";
    this.uTextureLocs.clear();
    this.uUniLocs.clear();
    this.uPassLocs.clear();
    this.uResLocs.clear();
    this.uTimeLocs.clear();
    this.uDeltaLocs.clear();
    this.uNamedLocs.clear();
  }

  /**
   * Submit all programs (5 core + every registered fragment effect) to the GPU
   * for non-blocking compilation. Poll readiness with pollCompile().
   */
  private beginCompile(gl: WebGL2RenderingContext) {
    this.programGl = gl;
    this.compileState = "compiling";
    this.pendingAsync.set(
      "blitMirror",
      compileProgramAsync(gl, BLIT_VERTEX_SOURCE, COPY_FRAGMENT_SOURCE, "post:blitMirror"),
    );
    this.pendingAsync.set(
      "blitUpright",
      compileProgramAsync(gl, PASS_VERTEX_SOURCE, COPY_FRAGMENT_SOURCE, "post:blitUpright"),
    );
    this.pendingAsync.set(
      "bw",
      compileProgramAsync(gl, PASS_VERTEX_SOURCE, BW_FRAGMENT_SOURCE, "post:bw"),
    );
    this.pendingAsync.set(
      "bloom",
      compileProgramAsync(gl, PASS_VERTEX_SOURCE, BLOOM_FRAGMENT_SOURCE, "post:bloom"),
    );
    this.pendingAsync.set(
      "noise",
      compileProgramAsync(gl, PASS_VERTEX_SOURCE, NOISE_FRAGMENT_SOURCE, "post:noise"),
    );
    for (const effect of this.effects) {
      if (effect.kind === "fragment" && effect.fragmentShader?.trim()) {
        this.pendingAsync.set(
          `effect:${effect.id}`,
          compileProgramAsync(
            gl,
            PASS_VERTEX_SOURCE,
            this.toFragmentShaderSource(effect.fragmentShader, effect),
            `post:${effect.id}`,
          ),
        );
      }
    }
  }

  /**
   * Returns true once every submitted program settled (linked or failed).
   * Failed effect programs disable only that effect; failed core programs are
   * logged and the processor degrades to presenting the raw scene.
   */
  private pollCompile(gl: WebGL2RenderingContext): boolean {
    for (const async of this.pendingAsync.values()) {
      async.poll();
      if (async.status() === "compiling") return false;
    }

    // All settled — assign (failed programs become null / disabled effects).
    const take = (key: string): WebGLProgram | null => {
      const entry = this.pendingAsync.get(key);
      if (!entry) return null;
      const program = entry.poll();
      if (!program) {
        console.error(
          `[post] Core program "${key}" failed to compile; post-processing degrades to a raw scene copy.`,
        );
      }
      return program;
    };
    this.programs = {
      blitMirror: take("blitMirror"),
      blitUpright: take("blitUpright"),
      bw: take("bw"),
      bloom: take("bloom"),
      noise: take("noise"),
    };
    for (const effect of this.effects) {
      const entry = this.pendingAsync.get(`effect:${effect.id}`);
      if (!entry) continue;
      const program = entry.poll();
      if (program) {
        this.customPrograms.set(effect.id, program);
      } else {
        this.failedEffects.add(effect.id);
        console.error(
          `[post] Effect "${effect.id}" shader failed to compile and was disabled. See shader log above.`,
        );
      }
    }
    this.pendingAsync.clear();

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) {
      throw new Error("Failed to create WebGL post-process geometry.");
    }
    this.quadVao = vao;
    this.quadBuffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.compileState = "ready";
    return true;
  }

  private ensureTargets(gl: WebGL2RenderingContext, width: number, height: number) {
    if (
      this.targets.length === 2 &&
      this.targets[0]?.width === width &&
      this.targets[0]?.height === height
    ) {
      return;
    }
    for (const target of this.targets) {
      target.destroy();
    }
    this.targets = [createTarget(gl, width, height), createTarget(gl, width, height)];
  }

  private warnOnce(key: string, message: string) {
    if (this.warnedOnce.has(key)) return;
    this.warnedOnce.add(key);
    console.warn(message);
  }

  private drawPass(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    inputTexture: WebGLTexture,
    outputFramebuffer: WebGLFramebuffer | null,
    width: number,
    height: number,
    uniforms: Record<string, number> = {},
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    if (!this.uTextureLocs.has(program)) {
      this.uTextureLocs.set(program, gl.getUniformLocation(program, "uTexture"));
    }
    const texLoc = this.uTextureLocs.get(program)!;
    if (texLoc != null) {
      gl.uniform1i(texLoc, 0);
    }
    if (!this.uNamedLocs.has(program)) {
      this.uNamedLocs.set(program, new Map());
    }
    const namedMap = this.uNamedLocs.get(program)!;
    Object.entries(uniforms).forEach(([name, value]) => {
      if (!namedMap.has(name)) {
        namedMap.set(name, gl.getUniformLocation(program, name));
      }
      const loc = namedMap.get(name)!;
      if (loc != null) {
        gl.uniform1f(loc, value);
      }
    });
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private drawFragmentPass(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    inputTexture: WebGLTexture,
    outputFramebuffer: WebGLFramebuffer | null,
    width: number,
    height: number,
    frame: EnginePostFrame,
    passIndex: number,
    uniValues: Float32Array,
    effect: InternalEffect,
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);

    if (!this.uTextureLocs.has(program)) {
      this.uTextureLocs.set(program, gl.getUniformLocation(program, "uTexture"));
    }
    const texLoc = this.uTextureLocs.get(program)!;
    if (texLoc != null) gl.uniform1i(texLoc, 0);
    let unit = 1;
    if (effect.textureUniforms) {
      if (!this.uNamedLocs.has(program)) {
        this.uNamedLocs.set(program, new Map());
      }
      const namedMap = this.uNamedLocs.get(program)!;
      for (const [uniformName, resolver] of Object.entries(effect.textureUniforms)) {
        const handle = resolver();
        if (!handle || handle.gl !== gl) continue;
        if (!namedMap.has(uniformName)) {
          namedMap.set(uniformName, gl.getUniformLocation(program, uniformName));
        }
        const uniformLoc = namedMap.get(uniformName)!;
        if (uniformLoc == null) continue;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, handle.texture);
        gl.uniform1i(uniformLoc, unit);
        unit += 1;
      }
    }
    if (!this.uResLocs.has(program)) {
      this.uResLocs.set(program, gl.getUniformLocation(program, "uResolution"));
    }
    const resolutionLoc = this.uResLocs.get(program)!;
    if (resolutionLoc != null) gl.uniform2f(resolutionLoc, width, height);
    if (!this.uTimeLocs.has(program)) {
      this.uTimeLocs.set(program, gl.getUniformLocation(program, "uTime"));
    }
    const timeLoc = this.uTimeLocs.get(program)!;
    if (timeLoc != null) gl.uniform1f(timeLoc, frame.now * 0.001);
    if (!this.uDeltaLocs.has(program)) {
      this.uDeltaLocs.set(program, gl.getUniformLocation(program, "uDelta"));
    }
    const deltaLoc = this.uDeltaLocs.get(program)!;
    if (deltaLoc != null) gl.uniform1f(deltaLoc, frame.delta * 0.001);
    if (!this.uPassLocs.has(program)) {
      this.uPassLocs.set(program, gl.getUniformLocation(program, "uPassIndex"));
    }
    const passLoc = this.uPassLocs.get(program)!;
    if (passLoc != null) gl.uniform1f(passLoc, passIndex);
    if (!this.uUniLocs.has(program)) {
      this.uUniLocs.set(program, gl.getUniformLocation(program, "uUni"));
    }
    const uniLoc = this.uUniLocs.get(program)!;
    if (uniLoc != null) gl.uniform4fv(uniLoc, uniValues);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    while (unit > 1) {
      unit -= 1;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private toFragmentShaderSource(source: string, effect: InternalEffect) {
    if (source.includes("#version")) return source;
    const extraTextureUniforms = Object.keys(effect.textureUniforms ?? {})
      .map((name) => `uniform sampler2D ${name};`)
      .join("\n");
    return `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
${extraTextureUniforms}
uniform vec2 uResolution;
uniform float uTime;
uniform float uDelta;
uniform float uPassIndex;
uniform vec4 uUni[4];
out vec4 outColor;

${source}

void main() {
  vec4 color = texture(uTexture, vUv);
  outColor = applyEffect(color, vUv, uResolution, uUni);
}`;
  }

  /**
   * Returns the compiled program for a fragment effect, compiling synchronously
   * for effects registered after the initial async compile finished. Failures
   * disable the effect instead of breaking the chain.
   */
  private resolveFragmentProgram(gl: WebGL2RenderingContext, effect: InternalEffect) {
    const existing = this.customPrograms.get(effect.id);
    if (existing) return existing;
    if (!effect.fragmentShader || this.failedEffects.has(effect.id)) return null;
    try {
      const program = createProgram(
        gl,
        PASS_VERTEX_SOURCE,
        this.toFragmentShaderSource(effect.fragmentShader, effect),
      );
      this.customPrograms.set(effect.id, program);
      return program;
    } catch (error) {
      this.failedEffects.add(effect.id);
      console.error(
        `[post] Effect "${effect.id}" shader failed to compile and was disabled.`,
        error,
      );
      return null;
    }
  }

  /** Effects that will actually draw this frame. */
  private getRenderableEffects() {
    return this.effects.filter((effect) => {
      if (!effect.enabled || this.failedEffects.has(effect.id)) return false;
      if (effect.kind == null) {
        this.warnOnce(
          `unsupported:${effect.id}`,
          `[post] Effect "${effect.id}" has no recognizable shader (expected fragmentShader or a built-in preset) and was skipped.`,
        );
        return false;
      }
      const coreProgram =
        effect.kind === "fragment" ? true : this.programs?.[effect.kind];
      if (!coreProgram) {
        this.warnOnce(
          `no-program:${effect.id}`,
          `[post] Effect "${effect.id}" (${effect.kind}) has no compiled program and was skipped.`,
        );
        return false;
      }
      return true;
    });
  }

  private onPostRender(frame: EnginePostFrame) {
    this.options.onFrame?.(this, frame);
    const gl = frame.gl;
    const inputTexture = frame.inputTexture.texture;
    if (!gl || !inputTexture) return;

    const width = Math.max(1, frame.canvas.width);
    const height = Math.max(1, frame.canvas.height);

    // Compile shaders without blocking the main thread. Until every program is
    // ready we draw nothing to the canvas (it stays black), keeping the page
    // fully responsive instead of freezing on a synchronous compile.
    if (this.programGl !== gl) {
      // First run, or the WebGL context changed under us — (re)start compile.
      for (const pending of this.pendingAsync.values()) {
        pending.destroy();
      }
      this.pendingAsync.clear();
      this.customPrograms.clear();
      this.failedEffects.clear();
      this.compileState = "idle";
      this.uTextureLocs.clear();
      this.uUniLocs.clear();
      this.uPassLocs.clear();
      this.uResLocs.clear();
      this.uTimeLocs.clear();
      this.uDeltaLocs.clear();
      this.uNamedLocs.clear();
    }
    if (this.compileState === "idle") {
      this.beginCompile(gl);
      return;
    }
    if (this.compileState === "compiling") {
      if (!this.pollCompile(gl)) return;
      // pollCompile transitioned to 'ready'; fall through to render.
    }

    const renderable = this.getRenderableEffects();

    // No effects to run (or the ingest blit failed): present the raw scene
    // with an orientation-preserving copy — never leave the canvas black.
    if (renderable.length === 0 || !this.programs?.blitMirror) {
      const blit = this.programs?.blitUpright ?? this.programs?.blitMirror;
      if (blit) {
        this.drawPass(gl, blit, inputTexture, null, width, height);
      }
      return;
    }

    this.ensureTargets(gl, width, height);

    // Ingest: flip the bottom-origin scene FBO into top-origin post space so
    // every effect pass sees the same uv/sampling contract (see header).
    let writeIndex = 0;
    const ingestTarget = this.targets[writeIndex % 2];
    this.drawPass(
      gl,
      this.programs.blitMirror,
      inputTexture,
      ingestTarget.framebuffer,
      width,
      height,
    );
    let sourceTexture = ingestTarget.texture;
    writeIndex += 1;

    for (const effect of renderable) {
      const kind = effect.kind;
      if (kind == null) continue;
      const uniValues = effect.uniWatch.toFloat32(16);
      const passCount = Math.max(1, Math.floor(effect.passes ?? 1));

      if (kind === "fragment") {
        const program = this.resolveFragmentProgram(gl, effect);
        if (!program) continue;
        for (let pass = 0; pass < passCount; pass++) {
          const target = this.targets[writeIndex % 2];
          this.drawFragmentPass(
            gl,
            program,
            sourceTexture,
            target.framebuffer,
            width,
            height,
            frame,
            pass,
            uniValues,
            effect,
          );
          sourceTexture = target.texture;
          writeIndex += 1;
        }
      } else {
        const program = this.programs[kind];
        if (!program) continue;
        const uniforms: Record<string, number> =
          kind === "bw"
            ? { uMix: uniValues[0] ?? 1 }
            : kind === "noise"
              ? {
                  uAmount: uniValues[0] ?? 0.03,
                  uScale: uniValues[1] ?? 520,
                  uTime: frame.now * 0.001,
                }
              : {
                  uIntensity: uniValues[0] ?? 0.85,
                  uThreshold: effect.params.threshold ?? 0.72,
                  uRadius: effect.params.radius ?? 1.5,
                };
        const target = this.targets[writeIndex % 2];
        this.drawPass(
          gl,
          program,
          sourceTexture,
          target.framebuffer,
          width,
          height,
          uniforms,
        );
        sourceTexture = target.texture;
        writeIndex += 1;
      }
    }

    // Present: flip top-origin post space back to the bottom-origin canvas.
    // Effect passes preserve orientation, so this is always a single mirror —
    // pass count parity can never flip the output.
    this.drawPass(gl, this.programs.blitMirror, sourceTexture, null, width, height);
  }
}

export { createBloomComputeShader, createBlackAndWhiteComputeShader, createNoiseComputeShader };

export function createPostProcessor(options: PostProcessorOptions = {}) {
  return new PostProcessor(options);
}
