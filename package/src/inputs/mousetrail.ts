/**
 * createMouseTrail — GPU trail texture. Runs on both backends.
 *
 * How to use:
 *   const trail = createMouseTrail()
 *   createItem(el, { texture: trail.getTextureHandle()!, shaders: { fragment } })
 * `getTextureHandle()` is shaped like a loadTexture() result, so it drops
 * straight into createItem / createScreen / a custom post pass. Narrow on
 * `handle.texture.backend` before touching the raw texture.
 *
 * WebGL2 paints in an onPostRender hook; WebGPU paints in the engine pre-render
 * hook (gpu-mousetrail.ts), so the trail never forces the offscreen post path.
 *
 * Docs: docs/api.md
 */

import { getDefaultEngine, type EnginePostFrame, type WebGLEngine } from "../engine/engine";
import { getGpuInternals } from "../engine/gpu-internals";
import type { TextureHandle } from "../loaders/texture-loader";
import {
  createFullscreenTriangle,
  createProgram,
  FULLSCREEN_VERTEX_SOURCE,
  GLSL_NOISE,
} from "../post/gl-util";

type TrailTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  destroy: () => void;
};

type PaintLocs = {
  uPrev: WebGLUniformLocation | null;
  uFade: WebGLUniformLocation | null;
  uRadius: WebGLUniformLocation | null;
  uStrength: WebGLUniformLocation | null;
  uCutoff: WebGLUniformLocation | null;
  uSpeed: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uSize: WebGLUniformLocation | null;
  uMouse: WebGLUniformLocation | null;
  uMousePrev: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
};

type GrowLocs = {
  uPrev: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uGrow: WebGLUniformLocation | null;
  uDissipate: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uCutoff: WebGLUniformLocation | null;
};

type TrailProgramBundle = {
  paintProgram: WebGLProgram;
  growProgram: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  paintLocs: PaintLocs;
  growLocs: GrowLocs;
};

/**
 * Backend-agnostic trail texture, shaped like a loadTexture() result so it can
 * be passed as `texture` to createItem / createScreen. The trail owns the
 * texture; `handle.texture.destroy()` is a no-op — call `trail.destroy()`.
 *
 * The trail reallocates with the canvas, so re-read the handle (and rebuild the
 * consumer) after a resize instead of holding one forever.
 */
export type MouseTrailTextureHandle = {
  texture: TextureHandle;
  /** GPUTextureView on WebGPU; the handle itself on WebGL2. */
  view: unknown;
  /** GPUSampler on WebGPU; null on WebGL2. */
  sampler: unknown | null;
  width: number;
  height: number;
  aspect: number;
};

type GpuTrailModule = typeof import("./gpu-mousetrail");

export type CreateMouseTrailOptions = {
  /** UV reference space. Defaults to window. */
  element?: Window | HTMLElement;
  /** Pointer event source. Defaults to element. */
  eventElement?: Window | HTMLElement;
  /** Internal texture scale against canvas resolution. */
  resolutionScale?: number;
  /** Frame fade multiplier for trail persistence. */
  fade?: number;
  /** Brush radius in UV units. */
  radius?: number;
  /** Brush strength multiplier. */
  strength?: number;
  /** Minimum value under which trail is discarded to zero. */
  cutoff?: number;
  /** How much trail expands each frame (0..1). */
  growth?: number;
  /** Dissipation factor after growth pass (0..1). */
  dissipate?: number;
};

export class MouseTrail {
  private readonly element: Window | HTMLElement;
  private readonly eventElement: Window | HTMLElement;
  private readonly resolutionScale: number;
  private readonly fade: number;
  private readonly radius: number;
  private readonly strength: number;
  private readonly cutoff: number;
  private readonly growth: number;
  private readonly dissipate: number;
  private unsubscribe: (() => void) | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private bundle: TrailProgramBundle | null = null;
  private targets: TrailTarget[] = [];
  private readIndex = 0;
  private gpuTrail: import("./gpu-mousetrail").GpuMouseTrail | null = null;
  private destroyed = false;
  private pointer = { x: 0.5, y: 0.5 };
  private prevPointer = { x: 0.5, y: 0.5 };
  private speed = 0;
  private smoothedSize = 0;
  private hasPointer = false;
  private lastPointerAt = 0;
  /**
   * Trail-energy model: frames of rendering still owed after the last ink
   * deposit. Refilled on pointer movement, decremented once per painted frame;
   * when it reaches zero the trail has faded below the cutoff and the loop can
   * settle — a merely hovering pointer deposits no ink and stops the loop.
   */
  private inkFrames = 0;
  private readonly inkFrameBudget: number;
  private readonly onPointerMove = (event: PointerEvent) => {
    const now = performance.now();
    const next = this.resolveUv(event);
    const dt = Math.max(1, now - this.lastPointerAt);
    const dx = next.x - this.pointer.x;
    const dy = next.y - this.pointer.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / (dt / 1000);
    this.prevPointer.x = this.pointer.x;
    this.prevPointer.y = this.pointer.y;
    this.pointer.x = next.x;
    this.pointer.y = next.y;
    this.speed = Math.max(this.speed * 0.5, velocity);
    this.hasPointer = true;
    this.lastPointerAt = now;
    // Movement deposits ink — the trail needs this many frames to fade out.
    this.inkFrames = this.inkFrameBudget;
  };
  private readonly onPointerLeave = () => {
    this.hasPointer = false;
  };

  constructor(options: CreateMouseTrailOptions = {}) {
    if (!options.element && typeof window === "undefined") {
      throw new Error("MouseTrail requires a browser element or window.");
    }
    this.element = options.element ?? window;
    this.eventElement = options.eventElement ?? this.element;
    this.resolutionScale = clamp(options.resolutionScale ?? 0.75, 0.125, 1);
    this.fade = clamp(options.fade ?? 0.986, 0.75, 0.995);
    this.radius = clamp(options.radius ?? 0.012, 0.002, 0.35);
    this.strength = clamp(options.strength ?? 0.9, 0.05, 4);
    this.cutoff = clamp(options.cutoff ?? 0.0025, 0.0001, 0.25);
    this.growth = clamp(options.growth ?? 0.24, 0, 1);
    this.dissipate = clamp(options.dissipate ?? 0.992, 0.8, 1);
    // Frames for a full-strength deposit to decay below the cutoff: the trail
    // fades geometrically by fade × dissipate per frame and loses ~1.6 × cutoff
    // linearly (both passes subtract a cutoff) — whichever bound is tighter.
    const perFrame = this.fade * this.dissipate;
    const geometric =
      perFrame < 1 ? Math.log(this.cutoff) / Math.log(perFrame) : Infinity;
    const linear = 1 / (this.cutoff * 1.6);
    this.inkFrameBudget = Math.ceil(Math.min(geometric, linear)) + 8;
    this.eventElement.addEventListener("pointermove", this.onPointerMove as EventListener);
    this.eventElement.addEventListener("pointerleave", this.onPointerLeave as EventListener);

    const engine = getDefaultEngine();
    if (!engine) {
      throw new Error(
        "MouseTrail needs a default engine. Await createScene() / acquireLayer() first.",
      );
    }
    if (engine.backend === "webgpu") {
      this.attachWebGpu(engine);
    } else {
      this.unsubscribe = engine.onPostRender((frame) => this.onPostRender(frame));
    }
  }

  getTextureHandle(): MouseTrailTextureHandle | null {
    if (this.gpuTrail) {
      const target = this.gpuTrail.getTarget();
      if (!target) return null;
      return {
        texture: {
          backend: "webgpu",
          texture: target.texture,
          width: target.width,
          height: target.height,
          createView: () => target.view,
          destroy: () => {},
        },
        view: target.view,
        sampler: this.gpuTrail.getSampler(),
        width: target.width,
        height: target.height,
        aspect: target.width / Math.max(1, target.height),
      };
    }

    if (!this.gl || this.targets.length !== 2) return null;
    const current = this.targets[this.readIndex];
    if (!current) return null;
    const gl = this.gl;
    const handle: TextureHandle = {
      backend: "webgl2",
      texture: current.texture,
      gl,
      width: current.width,
      height: current.height,
      createView() {
        return this;
      },
      destroy() {},
    };
    return {
      texture: handle,
      view: handle,
      sampler: null,
      width: current.width,
      height: current.height,
      aspect: current.width / Math.max(1, current.height),
    };
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventElement.removeEventListener("pointermove", this.onPointerMove as EventListener);
    this.eventElement.removeEventListener("pointerleave", this.onPointerLeave as EventListener);
    this.gpuTrail?.destroy();
    this.gpuTrail = null;
    this.disposeGpuResources();
  }

  /**
   * WebGPU paints from the pre-render hook: onPostRender there would switch the
   * engine into its offscreen post path with nobody to present the result.
   */
  private attachWebGpu(engine: WebGLEngine) {
    const internals = getGpuInternals(engine);
    if (!internals) {
      console.warn("shooosh: createMouseTrail could not reach the WebGPU device.");
      return;
    }

    let module: GpuTrailModule | null = null;
    void import("./gpu-mousetrail")
      .then((loaded) => {
        module = loaded;
        engine.requestFrame();
      })
      .catch((error) => {
        console.warn("shooosh: failed to load the WebGPU mouse trail:", error);
      });

    this.unsubscribe = internals.onPreRender((ctx) => {
      if (this.destroyed || !module) return;
      if (!this.gpuTrail) {
        this.gpuTrail = module.createGpuMouseTrail(ctx.device, {
          resolutionScale: this.resolutionScale,
          fade: this.fade,
          radius: this.radius,
          strength: this.strength,
          cutoff: this.cutoff,
          growth: this.growth,
          dissipate: this.dissipate,
        });
      }

      this.advanceSmoothedSize(ctx.delta);
      this.gpuTrail.update(ctx.device, ctx.encoder, ctx.canvas, {
        mouseX: this.pointer.x,
        mouseY: this.pointer.y,
        prevX: this.prevPointer.x,
        prevY: this.prevPointer.y,
        speed: this.hasPointer ? this.speed : 0,
        size: this.smoothedSize,
        timeSeconds: ctx.now * 0.001,
      });
      this.settlePointer();
      // Keep requesting frames only while ink remains (or the brush is still
      // moving/shrinking) — an idle hovering pointer lets the loop settle.
      if (this.inkFrames > 0) this.inkFrames -= 1;
      if (this.inkFrames > 0 || this.speed > 0 || this.smoothedSize > 0) {
        engine.requestFrame();
      }
    });
  }

  /** Exponential ease toward the speed-driven brush size. Shared by both backends. */
  private advanceSmoothedSize(deltaMs: number) {
    const dtSec = Math.max(0.001, deltaMs * 0.001);
    const targetSize = clamp((this.hasPointer ? this.speed : 0) * 0.02, 0, 1);
    const rate = targetSize > this.smoothedSize ? 8 : 4;
    const alpha = 1 - Math.exp(-rate * dtSec);
    this.smoothedSize += (targetSize - this.smoothedSize) * alpha;
    if (Math.abs(targetSize - this.smoothedSize) < 0.0005) this.smoothedSize = targetSize;
  }

  private settlePointer() {
    this.prevPointer.x = this.pointer.x;
    this.prevPointer.y = this.pointer.y;
    this.speed *= 0.9;
    if (this.speed < 0.0005) this.speed = 0;
  }

  private onPostRender(frame: EnginePostFrame) {
    const gl = frame.gl;
    if (!gl) return;

    this.ensureResources(gl, frame.canvas.width, frame.canvas.height);
    if (!this.bundle || this.targets.length !== 2) return;

    const readTarget = this.targets[this.readIndex]!;
    const writeTarget = this.targets[(this.readIndex + 1) % 2]!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, writeTarget.width, writeTarget.height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.bundle.paintProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.texture);

    const pl = this.bundle.paintLocs;
    if (pl.uPrev != null) gl.uniform1i(pl.uPrev, 0);
    if (pl.uFade != null) gl.uniform1f(pl.uFade, this.fade);
    if (pl.uRadius != null) gl.uniform1f(pl.uRadius, this.radius);
    if (pl.uStrength != null) gl.uniform1f(pl.uStrength, this.strength);
    if (pl.uCutoff != null) gl.uniform1f(pl.uCutoff, this.cutoff);
    if (pl.uSpeed != null) gl.uniform1f(pl.uSpeed, this.hasPointer ? this.speed : 0);
    if (pl.uTime != null) gl.uniform1f(pl.uTime, frame.now * 0.001);
    this.advanceSmoothedSize(frame.delta);
    if (pl.uSize != null) gl.uniform1f(pl.uSize, this.smoothedSize);
    if (pl.uMouse != null) gl.uniform2f(pl.uMouse, this.pointer.x, this.pointer.y);
    if (pl.uMousePrev != null)
      gl.uniform2f(pl.uMousePrev, this.prevPointer.x, this.prevPointer.y);
    if (pl.uResolution != null)
      gl.uniform2f(pl.uResolution, writeTarget.width, writeTarget.height);

    gl.bindVertexArray(this.bundle.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Pass 2: grow/spread then dissipate using ping-pong back to the other buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, readTarget.framebuffer);
    gl.viewport(0, 0, readTarget.width, readTarget.height);
    gl.useProgram(this.bundle.growProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, writeTarget.texture);
    const gl2 = this.bundle.growLocs;
    if (gl2.uPrev != null) gl.uniform1i(gl2.uPrev, 0);
    if (gl2.uResolution != null) {
      gl.uniform2f(gl2.uResolution, readTarget.width, readTarget.height);
    }
    if (gl2.uGrow != null) gl.uniform1f(gl2.uGrow, this.growth);
    if (gl2.uDissipate != null) gl.uniform1f(gl2.uDissipate, this.dissipate);
    if (gl2.uTime != null) gl.uniform1f(gl2.uTime, frame.now * 0.001);
    if (gl2.uCutoff != null) gl.uniform1f(gl2.uCutoff, this.cutoff * 0.6);
    gl.bindVertexArray(this.bundle.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // The post phase runs against the default framebuffer at full canvas size
    // (the engine binds both before the onPostRender hooks), so restore that
    // known state instead of querying gl.getParameter every frame — the
    // queries allocate and can stall the driver pipeline.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, frame.canvas.width, frame.canvas.height);

    // Final texture stays on read target (index unchanged).
    this.settlePointer();

    // Trail decay is GPU-side state, invisible to the uni dirty system — keep
    // requesting frames while ink remains (or the brush is still moving or
    // shrinking). An idle hovering pointer deposits no ink, so the loop
    // settles instead of running at full rate on hover.
    if (this.inkFrames > 0) this.inkFrames -= 1;
    if (this.inkFrames > 0 || this.speed > 0 || this.smoothedSize > 0) {
      getDefaultEngine()?.requestFrame();
    }
  }

  private ensureResources(
    gl: WebGL2RenderingContext,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    const width = Math.max(1, Math.round(canvasWidth * this.resolutionScale));
    const height = Math.max(1, Math.round(canvasHeight * this.resolutionScale));

    if (this.gl && this.gl !== gl) {
      this.disposeGpuResources();
      this.gl = null;
    }
    if (!this.gl) this.gl = gl;

    if (!this.bundle) {
      this.bundle = createTrailProgram(gl);
    }
    if (
      this.targets.length === 2 &&
      this.targets[0]?.width === width &&
      this.targets[0]?.height === height
    ) {
      return;
    }

    this.targets.forEach((target) => target.destroy());
    this.targets = [
      createTrailTarget(gl, width, height),
      createTrailTarget(gl, width, height),
    ];
    this.readIndex = 0;

    // Initialize ping-pong textures to black.
    for (const target of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private disposeGpuResources() {
    if (this.gl && this.bundle) {
      this.gl.deleteProgram(this.bundle.paintProgram);
      this.gl.deleteProgram(this.bundle.growProgram);
      this.gl.deleteVertexArray(this.bundle.vao);
      this.gl.deleteBuffer(this.bundle.buffer);
    }
    this.targets.forEach((target) => target.destroy());
    this.targets = [];
    this.bundle = null;
    this.gl = null;
  }

  private resolveUv(event: PointerEvent) {
    if (this.element instanceof Window) {
      const w = Math.max(1, this.element.innerWidth);
      const h = Math.max(1, this.element.innerHeight);
      return {
        x: clamp(event.clientX / w, 0, 1),
        y: clamp(1 - event.clientY / h, 0, 1),
      };
    }
    const bounds = this.element.getBoundingClientRect();
    const w = Math.max(1, bounds.width);
    const h = Math.max(1, bounds.height);
    return {
      x: clamp((event.clientX - bounds.left) / w, 0, 1),
      y: clamp(1 - (event.clientY - bounds.top) / h, 0, 1),
    };
  }
}

function createTrailProgram(gl: WebGL2RenderingContext): TrailProgramBundle {
  const vertexSource = FULLSCREEN_VERTEX_SOURCE;
  const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uMouse;
uniform vec2 uMousePrev;
uniform vec2 uResolution;
uniform float uSpeed;
uniform float uSize;
uniform float uTime;
uniform float uFade;
uniform float uRadius;
uniform float uStrength;
uniform float uCutoff;
out vec4 outColor;

float distanceToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float l2 = dot(ab, ab);
  if (l2 <= 1e-6) return length(p - a);
  float t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
  vec2 q = a + t * ab;
  return length(p - q);
}

${GLSL_NOISE}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * valueNoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 prev = texture(uPrev, vUv).rgb * uFade;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 a = vec2(uMousePrev.x * aspect, uMousePrev.y);
  vec2 b = vec2(uMouse.x * aspect, uMouse.y);
  float d = distanceToSegment(p, a, b);
  float segmentLen = length(b - a);
  float movementMask = smoothstep(0.00025, 0.0015, segmentLen);
  float speedCurve = clamp(uSize, 0.0, 1.0);
  float dynamicRadius = mix(uRadius, uRadius * 18.0, speedCurve);
  float intensity = movementMask * uStrength;

  // Organic edge variation using warped fBm (avoids blocky/hash look).
  vec2 baseNoiseUv = vUv * vec2(7.0, 4.8) + vec2(uTime * 0.35, -uTime * 0.22);
  float warpX = fbm(baseNoiseUv + vec2(1.7, 5.1));
  float warpY = fbm(baseNoiseUv + vec2(8.3, 2.4));
  vec2 warpedUv = baseNoiseUv + (vec2(warpX, warpY) - 0.5) * 1.35;
  float organic = fbm(warpedUv);
  float edgeNoise = (organic - 0.5) * 2.0;
  float noisyD = d + edgeNoise * dynamicRadius * 0.22;
  float brush = exp(-pow(noisyD / max(0.0001, dynamicRadius), 2.0) * 2.0) * intensity;
  vec3 ink = vec3(brush);
  vec3 trail = clamp(prev + ink, 0.0, 1.0);
  trail = max(trail - vec3(uCutoff), vec3(0.0));
  outColor = vec4(trail, 1.0);
}`;

  const growFragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uResolution;
uniform float uGrow;
uniform float uDissipate;
uniform float uTime;
uniform float uCutoff;
out vec4 outColor;

${GLSL_NOISE}

void main() {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  vec3 c = texture(uPrev, vUv).rgb;
  vec3 s1 = texture(uPrev, vUv + vec2(texel.x, 0.0)).rgb;
  vec3 s2 = texture(uPrev, vUv + vec2(-texel.x, 0.0)).rgb;
  vec3 s3 = texture(uPrev, vUv + vec2(0.0, texel.y)).rgb;
  vec3 s4 = texture(uPrev, vUv + vec2(0.0, -texel.y)).rgb;
  vec3 s5 = texture(uPrev, vUv + vec2(texel.x, texel.y)).rgb;
  vec3 s6 = texture(uPrev, vUv + vec2(-texel.x, texel.y)).rgb;
  vec3 s7 = texture(uPrev, vUv + vec2(texel.x, -texel.y)).rgb;
  vec3 s8 = texture(uPrev, vUv + vec2(-texel.x, -texel.y)).rgb;
  vec3 neighborMax = max(max(max(s1, s2), max(s3, s4)), max(max(s5, s6), max(s7, s8)));
  vec3 grown = mix(c, max(c, neighborMax), clamp(uGrow, 0.0, 1.0));
  // Add low-frequency animated noise to dissipate less uniformly.
  vec2 noiseUv = vUv * vec2(5.0, 3.4) + vec2(uTime * 0.18, -uTime * 0.12);
  float n = valueNoise(noiseUv) * 2.0 - 1.0;
  float noisyDissipate = clamp(uDissipate + n * 0.04, 0.0, 1.0);
  vec3 dissipated = grown * noisyDissipate;
  vec3 trail = max(dissipated - vec3(uCutoff), vec3(0.0));
  outColor = vec4(trail, 1.0);
}`;

  const paintProgram = createProgram(gl, vertexSource, fragmentSource);
  const growProgram = createProgram(gl, vertexSource, growFragmentSource);
  const { vao, buffer } = createFullscreenTriangle(gl);

  const paintLocs: PaintLocs = {
    uPrev: gl.getUniformLocation(paintProgram, "uPrev"),
    uFade: gl.getUniformLocation(paintProgram, "uFade"),
    uRadius: gl.getUniformLocation(paintProgram, "uRadius"),
    uStrength: gl.getUniformLocation(paintProgram, "uStrength"),
    uCutoff: gl.getUniformLocation(paintProgram, "uCutoff"),
    uSpeed: gl.getUniformLocation(paintProgram, "uSpeed"),
    uTime: gl.getUniformLocation(paintProgram, "uTime"),
    uSize: gl.getUniformLocation(paintProgram, "uSize"),
    uMouse: gl.getUniformLocation(paintProgram, "uMouse"),
    uMousePrev: gl.getUniformLocation(paintProgram, "uMousePrev"),
    uResolution: gl.getUniformLocation(paintProgram, "uResolution"),
  };

  const growLocs: GrowLocs = {
    uPrev: gl.getUniformLocation(growProgram, "uPrev"),
    uResolution: gl.getUniformLocation(growProgram, "uResolution"),
    uGrow: gl.getUniformLocation(growProgram, "uGrow"),
    uDissipate: gl.getUniformLocation(growProgram, "uDissipate"),
    uTime: gl.getUniformLocation(growProgram, "uTime"),
    uCutoff: gl.getUniformLocation(growProgram, "uCutoff"),
  };

  return { paintProgram, growProgram, vao, buffer, paintLocs, growLocs };
}

function createTrailTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): TrailTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    throw new Error("Failed to create mouse trail target.");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function createMouseTrail(options: CreateMouseTrailOptions = {}) {
  return new MouseTrail(options);
}
