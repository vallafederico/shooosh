import { getDefaultEngine, type EngineFrame } from "../engine/engine";
import { compileProgramAsync, type AsyncProgram } from "../shaders/compile";

export type ParticlesOptions = {
  /** Float32Array of clip-space positions: [x0, y0, x1, y1, ...] — x/y in [-1, 1]. */
  positions: Float32Array;
  /** Point size in CSS pixels (default 2). Multiplied by DPR internally. */
  size?: number;
  /** RGBA color, each channel in [0, 1]. Default white [1, 1, 1, 1]. */
  color?: [number, number, number, number];
  /** Render layer (default 10). Lower layers render first. */
  layer?: number;
};

const VERTEX_SRC = `#version 300 es
in vec2 aPosition;
uniform float uSize;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  gl_PointSize = uSize;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform float uSize;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord) * 2.0;
  float alpha = uColor.w * (1.0 - smoothstep(1.0 - (2.0 / uSize), 1.0, dist));
  outColor = vec4(uColor.rgb * alpha, alpha);
}`;

const pending = new Set<ParticlesManager>();
let pendingRafId = 0;

function ensurePendingLoop() {
  if (pendingRafId) return;
  const step = () => {
    pendingRafId = 0;
    if (pending.size === 0) return;
    const engine = getDefaultEngine();
    if (!engine) {
      pendingRafId = window.requestAnimationFrame(step);
      return;
    }
    const items = Array.from(pending);
    pending.clear();
    items.forEach((p) => p._attach());
  };
  pendingRafId = window.requestAnimationFrame(step);
}

export class ParticlesManager {
  private options: ParticlesOptions;
  private unsubRender: (() => void) | null = null;
  private destroyed = false;
  private gl: WebGL2RenderingContext | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private asyncProgram: AsyncProgram | null = null;
  private program: WebGLProgram | null = null;
  private uSizeLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private count = 0;

  constructor(options: ParticlesOptions) {
    this.options = { ...options };
    this.count = Math.floor(options.positions.length / 2);
    this._connectOrQueue();
  }

  setPositions(next: Float32Array) {
    this.options.positions = next;
    this.count = Math.floor(next.length / 2);
    const gl = this.gl;
    const vbo = this.vbo;
    if (gl && vbo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, next, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    getDefaultEngine()?.requestFrame();
  }

  destroy() {
    this.destroyed = true;
    this.unsubRender?.();
    this.unsubRender = null;
    const gl = this.gl;
    if (gl) {
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.vbo) gl.deleteBuffer(this.vbo);
    }
    this.asyncProgram?.destroy();
    this.asyncProgram = null;
    this.program = null;
    this.vao = null;
    this.vbo = null;
    this.gl = null;
    pending.delete(this);
  }

  _connectOrQueue() {
    if (this.destroyed) return;
    const engine = getDefaultEngine();
    if (engine) {
      this._attach();
      return;
    }
    pending.add(this);
    ensurePendingLoop();
  }

  _attach() {
    if (this.destroyed || this.unsubRender) return;
    const engine = getDefaultEngine();
    if (!engine) return;
    const gl = engine.gl;
    this.gl = gl;

    // Create VAO + VBO
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("Failed to create WebGL buffers for particles.");
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.options.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);

    this.asyncProgram = compileProgramAsync(gl, VERTEX_SRC, FRAGMENT_SRC, "particles");

    this.unsubRender = engine.onRender(
      (frame) => this._render(frame),
      { layer: this.options.layer ?? 10 },
    );
  }

  private _render(frame: EngineFrame) {
    if (this.destroyed || this.count === 0) return;

    const gl = frame.gl;

    if (!this.program) {
      this.program = this.asyncProgram?.poll() ?? null;
      if (!this.program) return;

      // Program just became ready — look up uniform locations and wire VAO attrib
      this.uSizeLoc = gl.getUniformLocation(this.program, "uSize");
      this.uColorLoc = gl.getUniformLocation(this.program, "uColor");

      const aPos = gl.getAttribLocation(this.program, "aPosition");
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
    }

    // Compute DPR from canvas physical vs CSS width
    const cssWidth = frame.canvas.getBoundingClientRect().width;
    const dpr = cssWidth > 0 ? frame.canvas.width / cssWidth : (window.devicePixelRatio || 1);
    const pointSize = (this.options.size ?? 2) * dpr;
    const color = this.options.color ?? [1, 1, 1, 1];

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    if (this.uSizeLoc !== null) gl.uniform1f(this.uSizeLoc, pointSize);
    if (this.uColorLoc !== null) gl.uniform4fv(this.uColorLoc, color);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
}
