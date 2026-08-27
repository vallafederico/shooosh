import { getDefaultEngine, type EngineFrame } from "../engine/engine";
import { getElementClipData } from "./item.utils";
import { compileProgramAsync, type AsyncProgram } from "../shaders/compile";
import type { TextureLoaderResult } from "../loaders/texture-loader";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MsdfGlyphsOptions = {
  texture: TextureLoaderResult;
  glyphData: Float32Array;
  glyphCount: number;
  distanceRange: number;
  atlasWidth: number;
  color: [number, number, number];
  alpha: number;
  boxAspect: number;
  uni?: { value1?: number; value2?: number; value3?: number; value4?: number };
};

export type MsdfGlyphsHandle = {
  setGlyphData(data: Float32Array, count: number): void;
  setUni(next: Partial<{ value1: number; value2: number; value3: number; value4: number }>): void;
  destroy(): void;
};

// ─── Shared program per GL context ───────────────────────────────────────────

type SharedProgram = {
  asyncProgram: AsyncProgram;
  refCount: number;
};

const sharedProgramByGl = new WeakMap<WebGL2RenderingContext, SharedProgram>();

function getVertexShader(): string {
  return `#version 300 es
layout(location=0) in vec2 aLocalXY;
layout(location=1) in vec4 aDst;
layout(location=2) in vec4 aSrc;

uniform vec4 uElementNdc;  // (ndcLeft, ndcTop, ndcRight, ndcBottom)
uniform float uBoxAspect;
uniform vec4 uUni;         // x=value1, y=value2(widthPx), z=value3, w=value4(heightPx)

flat out float vDstWidth;
flat out float vSrcWidth;
out vec2 vAtlasUv;

void main() {
  vec2 elemPos = mix(aDst.xy, aDst.zw, aLocalXY);

  float widthPx  = max(uUni.y, 1.0);
  float heightPx = max(uUni.w, 1.0);
  float fy = max(widthPx / (uBoxAspect * heightPx), 0.0001);
  float elemY = elemPos.y * fy + 0.5 * (1.0 - fy);

  // uElementNdc: y=ndcTop (higher value), w=ndcBottom (lower value)
  // elemPos.x in [0,1] → ndcLeft..ndcRight, elemY in [0,1] → ndcTop..ndcBottom
  float ndcX = mix(uElementNdc.x, uElementNdc.z, elemPos.x);
  float ndcY = mix(uElementNdc.y, uElementNdc.w, elemY);

  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  vAtlasUv = mix(aSrc.xy, aSrc.zw, aLocalXY);
  vDstWidth = aDst.z - aDst.x;
  vSrcWidth = aSrc.z - aSrc.x;
}`;
}

function getFragmentShader(): string {
  return `#version 300 es
precision highp float;

flat in float vDstWidth;
flat in float vSrcWidth;
in vec2 vAtlasUv;

uniform sampler2D uTexture;
uniform vec4 uUni;         // y=widthPx
uniform float uDistanceRange;
uniform float uAtlasW;
uniform vec3 uColor;
uniform float uAlpha;

out vec4 outColor;

float median3(vec3 c) { return max(min(c.r, c.g), min(c.b, c.r)); }

void main() {
  vec3 s = texture(uTexture, vAtlasUv).rgb;
  float sd = median3(s) - 0.5;

  float widthPx = max(uUni.y, 1.0);
  float glyphScreenPx = vDstWidth * widthPx;
  float glyphAtlasPx  = abs(vSrcWidth) * uAtlasW;
  float glyphMag      = glyphScreenPx / max(glyphAtlasPx, 0.0001);
  // Canonical msdfgen coverage: saturates to exactly 0 outside the glyph even
  // when minified (a widened smoothstep window leaks alpha across the quad).
  float screenPxRange = max(uDistanceRange * glyphMag, 1.0);
  float alpha         = clamp(sd * screenPxRange + 0.5, 0.0, 1.0);

  outColor = vec4(uColor * alpha * uAlpha, alpha * uAlpha);
}`;
}

function ensureSharedProgram(gl: WebGL2RenderingContext): SharedProgram {
  let sp = sharedProgramByGl.get(gl);
  if (!sp) {
    sp = {
      asyncProgram: compileProgramAsync(gl, getVertexShader(), getFragmentShader(), "msdf-glyphs"),
      refCount: 0,
    };
    sharedProgramByGl.set(gl, sp);
  }
  sp.refCount++;
  return sp;
}

function releaseSharedProgram(gl: WebGL2RenderingContext) {
  const sp = sharedProgramByGl.get(gl);
  if (!sp) return;
  sp.refCount--;
  if (sp.refCount <= 0) {
    sp.asyncProgram.destroy();
    sharedProgramByGl.delete(gl);
  }
}

// ─── Unit quad vertices (6 verts, triangle list, no index buffer) ─────────────
// TL(0,0), BL(0,1), TR(1,0), TR(1,0), BL(0,1), BR(1,1)
const UNIT_QUAD = new Float32Array([
  0, 0,
  0, 1,
  1, 0,
  1, 0,
  0, 1,
  1, 1,
]);

// ─── MsdfGlyphsRenderer ──────────────────────────────────────────────────────

type UniStore = { value1: number; value2: number; value3: number; value4: number };

type MsdfGlyphsRenderer = {
  render: (frame: EngineFrame) => void;
  setGlyphData: (data: Float32Array, count: number) => void;
  setUni: (next: Partial<UniStore>) => void;
  destroy: () => void;
};

function createMsdfGlyphsRenderer(
  element: HTMLElement,
  frame: EngineFrame,
  options: MsdfGlyphsOptions,
): MsdfGlyphsRenderer {
  const gl = frame.gl;
  const sp = ensureSharedProgram(gl);

  let glyphData = options.glyphData;
  let glyphCount = options.glyphCount;
  let instanceDirty = true;

  const uni: UniStore = {
    value1: options.uni?.value1 ?? 0,
    value2: options.uni?.value2 ?? 1,
    value3: options.uni?.value3 ?? 0,
    value4: options.uni?.value4 ?? 1,
  };

  const glTexture =
    (options.texture?.view as { texture?: WebGLTexture } | undefined)?.texture ?? null;

  // VAO + buffers
  const vao = gl.createVertexArray();
  const quadVbo = gl.createBuffer();
  const instanceVbo = gl.createBuffer();
  if (!vao || !quadVbo || !instanceVbo) {
    throw new Error("[msdf-glyphs] Failed to create WebGL buffers.");
  }

  // Initialize VAO
  gl.bindVertexArray(vao);

  // Quad VBO — location 0, aLocalXY, divisor 0
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(0, 0);

  // Instance VBO — aDst (location 1) + aSrc (location 2), 8 floats per instance
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
  gl.bufferData(gl.ARRAY_BUFFER, Math.max(1, glyphData.byteLength), gl.DYNAMIC_DRAW);
  // aDst: vec4 at offset 0
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  // aSrc: vec4 at offset 16
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Cached uniform locations (populated once program is ready)
  let program: WebGLProgram | null = null;
  let loc_uUni: WebGLUniformLocation | null = null;
  let loc_uElementNdc: WebGLUniformLocation | null = null;
  let loc_uBoxAspect: WebGLUniformLocation | null = null;
  let loc_uDistanceRange: WebGLUniformLocation | null = null;
  let loc_uAtlasW: WebGLUniformLocation | null = null;
  let loc_uColor: WebGLUniformLocation | null = null;
  let loc_uAlpha: WebGLUniformLocation | null = null;
  let loc_uTexture: WebGLUniformLocation | null = null;

  return {
    render(nextFrame) {
      // Poll for program readiness
      if (!program) {
        program = sp.asyncProgram.poll();
        if (!program) return;
        loc_uUni          = gl.getUniformLocation(program, "uUni");
        loc_uElementNdc   = gl.getUniformLocation(program, "uElementNdc");
        loc_uBoxAspect    = gl.getUniformLocation(program, "uBoxAspect");
        loc_uDistanceRange = gl.getUniformLocation(program, "uDistanceRange");
        loc_uAtlasW       = gl.getUniformLocation(program, "uAtlasW");
        loc_uColor        = gl.getUniformLocation(program, "uColor");
        loc_uAlpha        = gl.getUniformLocation(program, "uAlpha");
        loc_uTexture      = gl.getUniformLocation(program, "uTexture");
      }

      if (glyphCount === 0) return;

      // Visibility check — also yields fresh element dimensions each frame.
      const elemRect = element.getBoundingClientRect();
      const clipData = getElementClipData(element, nextFrame.canvas);
      if (!clipData.isVisible) return;

      // Parse NDC from clipData vertices
      // Layout: [ndcLeft, ndcTop, 0, 0, ndcLeft, ndcBottom, 0, 1, ndcRight, ndcTop, 1, 0, ndcRight, ndcBottom, 1, 1]
      const v = clipData.vertices;
      const ndcLeft   = v[0]!;
      const ndcTop    = v[1]!;
      const ndcBottom = v[5]!;
      const ndcRight  = v[8]!;

      // Fresh element size — avoids stale widthPx/heightPx after resize.
      const widthPx  = Math.max(elemRect.width, 1);
      const heightPx = Math.max(elemRect.height, 1);

      // Update instance buffer if dirty
      if (instanceDirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
        gl.bufferData(gl.ARRAY_BUFFER, glyphData, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        instanceDirty = false;
      }

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);

      // uUni: x=value1, y=widthPx (live), z=value3, w=heightPx (live)
      if (loc_uUni) {
        gl.uniform4f(loc_uUni, uni.value1, widthPx, uni.value3, heightPx);
      }
      if (loc_uElementNdc) {
        gl.uniform4f(loc_uElementNdc, ndcLeft, ndcTop, ndcRight, ndcBottom);
      }
      if (loc_uBoxAspect) {
        gl.uniform1f(loc_uBoxAspect, options.boxAspect);
      }
      if (loc_uDistanceRange) {
        gl.uniform1f(loc_uDistanceRange, options.distanceRange);
      }
      if (loc_uAtlasW) {
        gl.uniform1f(loc_uAtlasW, options.atlasWidth);
      }
      if (loc_uColor) {
        gl.uniform3f(loc_uColor, options.color[0], options.color[1], options.color[2]);
      }
      if (loc_uAlpha) {
        gl.uniform1f(loc_uAlpha, options.alpha);
      }
      if (glTexture && loc_uTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.uniform1i(loc_uTexture, 0);
      }

      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, glyphCount);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
      if (glTexture) {
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    },

    setGlyphData(data, count) {
      glyphData = data;
      glyphCount = count;
      instanceDirty = true;
      getDefaultEngine()?.requestFrame();
    },

    setUni(next) {
      let changed = false;
      if (next.value1 !== undefined && next.value1 !== uni.value1) { uni.value1 = next.value1; changed = true; }
      if (next.value2 !== undefined && next.value2 !== uni.value2) { uni.value2 = next.value2; changed = true; }
      if (next.value3 !== undefined && next.value3 !== uni.value3) { uni.value3 = next.value3; changed = true; }
      if (next.value4 !== undefined && next.value4 !== uni.value4) { uni.value4 = next.value4; changed = true; }
      if (changed) getDefaultEngine()?.requestFrame();
    },

    destroy() {
      gl.deleteBuffer(quadVbo);
      gl.deleteBuffer(instanceVbo);
      gl.deleteVertexArray(vao);
      releaseSharedProgram(gl);
    },
  };
}

// ─── Public factory ───────────────────────────────────────────────────────────

type MsdfGlyphsManager = {
  pending: Set<MsdfGlyphsManager>;
  element: HTMLElement;
  options: MsdfGlyphsOptions;
  renderer: MsdfGlyphsRenderer | null;
  unsubscribeRender: (() => void) | null;
  canvas: HTMLCanvasElement | null;
  destroyed: boolean;
  pendingUni: Partial<{ value1: number; value2: number; value3: number; value4: number }>;
  pendingGlyphData: { data: Float32Array; count: number } | null;
};

// Static pending set shared across all instances (mirrors ItemManager pattern)
const pendingManagers = new Set<MsdfGlyphsManager>();
let pendingRafId = 0;

function ensurePendingLoop() {
  if (pendingRafId) return;

  const step = () => {
    pendingRafId = 0;
    if (pendingManagers.size === 0) return;

    const engine = getDefaultEngine();
    if (!engine) {
      pendingRafId = window.requestAnimationFrame(step);
      return;
    }

    const nowPending = Array.from(pendingManagers);
    pendingManagers.clear();
    nowPending.forEach((mgr) => attachManager(mgr));
  };

  pendingRafId = window.requestAnimationFrame(step);
}

function attachManager(mgr: MsdfGlyphsManager) {
  if (mgr.destroyed || mgr.unsubscribeRender) return;

  mgr.unsubscribeRender = getDefaultEngine()!.onRender(
    (frame) => {
      if (mgr.destroyed) return;
      if (!mgr.canvas) mgr.canvas = frame.canvas;
      if (mgr.canvas !== frame.canvas) return;

      if (!mgr.renderer) {
        mgr.renderer = createMsdfGlyphsRenderer(mgr.element, frame, mgr.options);
        // Apply any queued updates that arrived before the renderer existed
        if (Object.keys(mgr.pendingUni).length > 0) {
          mgr.renderer.setUni(mgr.pendingUni);
          mgr.pendingUni = {};
        }
        if (mgr.pendingGlyphData) {
          mgr.renderer.setGlyphData(mgr.pendingGlyphData.data, mgr.pendingGlyphData.count);
          mgr.pendingGlyphData = null;
        }
      }

      mgr.renderer.render(frame);
    },
    { layer: 10 },
  );
}

export function createMsdfGlyphs(
  element: HTMLElement,
  options: MsdfGlyphsOptions,
): MsdfGlyphsHandle {
  const mgr: MsdfGlyphsManager = {
    pending: pendingManagers,
    element,
    options,
    renderer: null,
    unsubscribeRender: null,
    canvas: null,
    destroyed: false,
    pendingUni: {},
    pendingGlyphData: null,
  };

  // Connect immediately if engine is already available, else queue
  const engine = getDefaultEngine();
  if (engine) {
    attachManager(mgr);
  } else {
    pendingManagers.add(mgr);
    ensurePendingLoop();
  }

  return {
    setGlyphData(data, count) {
      if (mgr.renderer) {
        mgr.renderer.setGlyphData(data, count);
      } else {
        mgr.pendingGlyphData = { data, count };
        // Also update options so renderer created later gets the latest data
        mgr.options = { ...mgr.options, glyphData: data, glyphCount: count };
      }
    },
    setUni(next) {
      if (mgr.renderer) {
        mgr.renderer.setUni(next);
      } else {
        Object.assign(mgr.pendingUni, next);
        // Merge into options.uni so renderer created later picks them up
        mgr.options = {
          ...mgr.options,
          uni: { ...mgr.options.uni, ...next },
        };
      }
    },
    destroy() {
      mgr.destroyed = true;
      mgr.unsubscribeRender?.();
      mgr.unsubscribeRender = null;
      mgr.renderer?.destroy();
      mgr.renderer = null;
      mgr.canvas = null;
      pendingManagers.delete(mgr);
    },
  };
}
