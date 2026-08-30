/**
 * WebGL2 post chain. Not a public import — loaded by createPostProcessor.
 *
 * How to use: PostProcessor dynamic-imports this when `frame.backend` is
 * `"webgl2"`. Effects are GLSL `applyEffect(color, uv, resolution, uni[4])`.
 * Injected: uTexture (scene), uResolution, uTime, uDelta, uPassIndex, uUni[4].
 *
 * Compile failures disable that one effect and log — the chain keeps presenting.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post · examples/post-shaders.ts
 */

import type { EnginePostFrame } from "../engine/engine";
import { compileProgramAsync, type AsyncProgram } from "../shaders/compile";
import { createFullscreenTriangle, createProgram, FULLSCREEN_VERTEX_SOURCE } from "./gl-util";
import type { InternalEffect, PostBackend } from "./types";

// ---------------------------------------------------------------------------
// Orientation contract
// ---------------------------------------------------------------------------
// The scene framebuffer is stored bottom-origin (standard GL: row 0 displays
// at the bottom of the screen); intermediate targets hold top-origin "post
// space". Instead of dedicated ingest/present blits, the flips are folded into
// the effect passes themselves, so a chain of N passes costs exactly N
// fullscreen draws:
//
//   1 pass:   scene ──(upright)──▶ canvas          (both bottom-origin)
//   ≥2 pass:  scene ──(mirror)──▶ post space ──(upright passes)──▶
//             post space ──(mirror)──▶ canvas
//
// The number of mirrors is always even (0 or 2), so pass-count parity can
// never flip the output. For every pass `texture(uTexture, uv)` stays
// screen-aligned: it returns the pixel currently displayed at that screen
// position. Passes that read post space see the documented top-origin `uv`
// ((0,0) = top-left); the pass that reads the scene FBO directly (and the
// single-pass layout) sees a bottom-origin `uv` — screen-symmetric and purely
// color-based effects are unaffected.

/** Orientation-preserving vertex shader used by post-space effect passes. */
const PASS_VERTEX_SOURCE = FULLSCREEN_VERTEX_SOURCE;

/**
 * Y-mirroring vertex shader for the passes that cross between bottom-origin
 * (scene FBO / canvas) and top-origin post space — each chain flips 0 or 2
 * times, never an odd number.
 */
const BLIT_VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 aPosition;
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

type CorePrograms = {
  blitUpright: WebGLProgram | null;
};

type GlTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  destroy: () => void;
};

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

class WebGl2PostBackend implements PostBackend {
  private targets: GlTarget[] = [];
  private programs: CorePrograms | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private programGl: WebGL2RenderingContext | null = null;
  private warnedOnce = new Set<string>();
  /** Per-effect programs with the orientation-preserving vertex shader. */
  private customPrograms = new Map<string, WebGLProgram>();
  /**
   * Per-effect programs with the mirroring vertex shader — used by the pass
   * that reads the scene FBO directly and by the final pass onto the canvas.
   */
  private customMirrorPrograms = new Map<string, WebGLProgram>();
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

  invalidate(id: string) {
    this.failedEffects.delete(id);
    for (const map of [this.customPrograms, this.customMirrorPrograms]) {
      const program = map.get(id);
      if (program && this.programGl) {
        this.programGl.deleteProgram(program);
        this.forgetProgramLocations(program);
      }
      map.delete(id);
    }
  }

  destroy() {
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
      for (const program of this.customMirrorPrograms.values()) {
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
    this.customMirrorPrograms.clear();
    this.failedEffects.clear();
    this.warnedOnce.clear();
    this.compileState = "idle";
    this.clearAllLocations();
  }

  private forgetProgramLocations(program: WebGLProgram) {
    this.uTextureLocs.delete(program);
    this.uUniLocs.delete(program);
    this.uPassLocs.delete(program);
    this.uResLocs.delete(program);
    this.uTimeLocs.delete(program);
    this.uDeltaLocs.delete(program);
    this.uNamedLocs.delete(program);
  }

  private clearAllLocations() {
    this.uTextureLocs.clear();
    this.uUniLocs.clear();
    this.uPassLocs.clear();
    this.uResLocs.clear();
    this.uTimeLocs.clear();
    this.uDeltaLocs.clear();
    this.uNamedLocs.clear();
  }

  /**
   * Submit blit programs + every registered fragment effect for non-blocking
   * compilation. Poll readiness with pollCompile().
   */
  private beginCompile(gl: WebGL2RenderingContext, effects: InternalEffect[]) {
    this.programGl = gl;
    this.compileState = "compiling";
    this.pendingAsync.set(
      "blitUpright",
      compileProgramAsync(gl, PASS_VERTEX_SOURCE, COPY_FRAGMENT_SOURCE, "post:blitUpright"),
    );
    for (const effect of effects) {
      const source = this.getEffectSource(effect);
      if (effect.kind === "fragment" && source) {
        const fragment = this.toFragmentShaderSource(source, effect);
        this.pendingAsync.set(
          `effect:${effect.id}`,
          compileProgramAsync(gl, PASS_VERTEX_SOURCE, fragment, `post:${effect.id}`),
        );
        // Mirror variant for chain-edge passes (scene ingest / canvas present).
        this.pendingAsync.set(
          `mirror:${effect.id}`,
          compileProgramAsync(gl, BLIT_VERTEX_SOURCE, fragment, `post:${effect.id}:mirror`),
        );
      }
    }
  }

  /**
   * Returns true once every submitted program settled (linked or failed).
   * Failed effect programs disable only that effect; failed core programs are
   * logged and the processor degrades to presenting the raw scene.
   */
  private pollCompile(gl: WebGL2RenderingContext, effects: InternalEffect[]): boolean {
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
      blitUpright: take("blitUpright"),
    };
    for (const effect of effects) {
      const entry = this.pendingAsync.get(`effect:${effect.id}`);
      if (!entry) continue;
      const program = entry.poll();
      const mirrorProgram = this.pendingAsync.get(`mirror:${effect.id}`)?.poll() ?? null;
      if (program && mirrorProgram) {
        this.customPrograms.set(effect.id, program);
        this.customMirrorPrograms.set(effect.id, mirrorProgram);
      } else {
        if (program) gl.deleteProgram(program);
        if (mirrorProgram) gl.deleteProgram(mirrorProgram);
        this.failedEffects.add(effect.id);
        console.error(
          `[post] Effect "${effect.id}" shader failed to compile and was disabled. See shader log above.`,
        );
      }
    }
    this.pendingAsync.clear();

    const { vao, buffer } = createFullscreenTriangle(gl);
    this.quadVao = vao;
    this.quadBuffer = buffer;

    this.compileState = "ready";
    return true;
  }

  /**
   * Ping-pong targets for chains with ≥2 passes: a 2-pass chain needs one
   * intermediate, longer chains alternate between two.
   */
  private ensureTargets(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    count: 1 | 2,
  ) {
    if (
      this.targets.length > 0 &&
      (this.targets[0]?.width !== width || this.targets[0]?.height !== height)
    ) {
      for (const target of this.targets) {
        target.destroy();
      }
      this.targets = [];
    }
    while (this.targets.length < count) {
      this.targets.push(createTarget(gl, width, height));
    }
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
        gl.bindTexture(gl.TEXTURE_2D, handle.texture as WebGLTexture);
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

  /** GLSL source for this effect, ignoring the WGSL-only variant. */
  private getEffectSource(effect: InternalEffect) {
    const source = effect.fragmentShader?.trim();
    if (source) return source;
    if (effect.fragmentShaderWgsl?.trim()) {
      this.warnOnce(
        `wgsl-only:${effect.id}`,
        `[post] Effect "${effect.id}" only ships a WGSL applyEffect; add fragmentShader (GLSL) for the WebGL2 fallback.`,
      );
    }
    return null;
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
  private resolveFragmentProgram(
    gl: WebGL2RenderingContext,
    effect: InternalEffect,
    mirror: boolean,
  ) {
    const map = mirror ? this.customMirrorPrograms : this.customPrograms;
    const existing = map.get(effect.id);
    if (existing) return existing;
    if (this.failedEffects.has(effect.id)) return null;
    const source = this.getEffectSource(effect);
    if (!source) return null;
    try {
      const program = createProgram(
        gl,
        mirror ? BLIT_VERTEX_SOURCE : PASS_VERTEX_SOURCE,
        this.toFragmentShaderSource(source, effect),
      );
      map.set(effect.id, program);
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
  private getRenderableEffects(effects: InternalEffect[]) {
    return effects.filter((effect) => {
      if (!effect.enabled || this.failedEffects.has(effect.id)) return false;
      if (effect.kind !== "fragment") {
        this.warnOnce(
          `unsupported:${effect.id}`,
          `[post] Effect "${effect.id}" needs fragmentShader (no named package presets) and was skipped.`,
        );
        return false;
      }
      return true;
    });
  }

  render(frame: EnginePostFrame, effects: InternalEffect[]) {
    const gl = frame.gl;
    const input = frame.inputTexture;
    if (!gl || input.backend !== "webgl2") return;
    const inputTexture = input.texture;
    if (!inputTexture) return;

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
      this.clearAllLocations();
    }
    if (this.compileState === "idle") {
      this.beginCompile(gl, effects);
      return;
    }
    if (this.compileState === "compiling") {
      if (!this.pollCompile(gl, effects)) return;
      // pollCompile transitioned to 'ready'; fall through to render.
    }

    const renderable = this.getRenderableEffects(effects);
    const presentRawScene = () => {
      const blit = this.programs?.blitUpright;
      if (blit) {
        this.drawPass(gl, blit, inputTexture, null, width, height);
      }
    };

    // Flatten the chain into passes, resolving the orientation-preserving
    // program for every effect up front (drops effects that fail to compile).
    type PassEntry = { effect: InternalEffect; passIndex: number; uniValues: Float32Array };
    const passes: PassEntry[] = [];
    for (const effect of renderable) {
      if (!this.resolveFragmentProgram(gl, effect, false)) continue;
      const uniValues = effect.uniWatch.toFloat32(16);
      const passCount = Math.max(1, Math.floor(effect.passes ?? 1));
      for (let pass = 0; pass < passCount; pass++) {
        passes.push({ effect, passIndex: pass, uniValues });
      }
    }

    // No effects to run: present the raw scene with an orientation-preserving
    // copy — never leave the canvas black.
    if (passes.length === 0) {
      presentRawScene();
      return;
    }

    // Single pass: bottom-origin scene straight onto the bottom-origin canvas
    // with the upright program — one fullscreen draw, no intermediate targets.
    if (passes.length === 1) {
      const only = passes[0]!;
      const program = this.resolveFragmentProgram(gl, only.effect, false)!;
      this.drawFragmentPass(
        gl,
        program,
        inputTexture,
        null,
        width,
        height,
        frame,
        only.passIndex,
        only.uniValues,
        only.effect,
      );
      return;
    }

    // ≥2 passes: the first pass mirrors the scene FBO into top-origin post
    // space, middle passes preserve orientation, and the last pass mirrors
    // back onto the canvas — no dedicated ingest/present blits.
    const firstEffect = passes[0]!.effect;
    const lastEffect = passes[passes.length - 1]!.effect;
    if (
      !this.resolveFragmentProgram(gl, firstEffect, true) ||
      !this.resolveFragmentProgram(gl, lastEffect, true)
    ) {
      // A mirror variant failed to compile (the effect is now disabled) —
      // degrade to the raw scene this frame; the next frame re-filters.
      presentRawScene();
      return;
    }

    this.ensureTargets(gl, width, height, passes.length === 2 ? 1 : 2);
    let sourceTexture = inputTexture;
    let writeIndex = 0;
    for (let index = 0; index < passes.length; index++) {
      const entry = passes[index]!;
      const isFirst = index === 0;
      const isLast = index === passes.length - 1;
      const program = this.resolveFragmentProgram(gl, entry.effect, isFirst || isLast)!;
      const target = isLast ? null : this.targets[writeIndex % this.targets.length]!;
      this.drawFragmentPass(
        gl,
        program,
        sourceTexture,
        target?.framebuffer ?? null,
        width,
        height,
        frame,
        entry.passIndex,
        entry.uniValues,
        entry.effect,
      );
      if (target) {
        sourceTexture = target.texture;
        writeIndex += 1;
      }
    }
  }
}

export function createWebGl2PostBackend(): PostBackend {
  return new WebGl2PostBackend();
}
