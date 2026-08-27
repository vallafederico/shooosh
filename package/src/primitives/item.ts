import { getDefaultEngine, resolveEngine, type EngineFrame } from "../engine/engine";
import type { FullscreenPlaneShaders, FullscreenPlaneTexture } from "./plane";
import { ensureWatchableUni, type UniValues, type UniWatchController } from "../engine/uni";
import { getElementClipData } from "./item.utils";
import { convertWgslFragmentToGlsl } from "../shaders/wgsl-compat";
import { compileProgramAsync } from "../shaders/compile";

type ItemRenderer = {
  render: (frame: EngineFrame) => void;
  destroy: () => void;
};

export type ItemOptions = {
  layer?: number;
  shaders?: FullscreenPlaneShaders;
  debugUv?: boolean;
  uni?: UniValues;
  /** loadTexture() result — bound as uTexture in the fragment */
  texture?: FullscreenPlaneTexture | null;
  onFrame?: (item: ItemManager, frame: EngineFrame) => ItemManager | void;
};

export class ItemManager {
  private static pending = new Set<ItemManager>();
  private static pendingRafId = 0;

  private element: HTMLElement;
  private options: ItemOptions;
  private uni: UniWatchController;
  private renderer: ItemRenderer | null = null;
  private unsubscribeRender: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private destroyed = false;

  constructor(element: HTMLElement, options: ItemOptions = {}) {
    this.element = element;
    this.options = options;
    this.uni = ensureWatchableUni(options.uni ?? { value1: 1 });
    this.connectOrQueue();
  }

  setUni(next: Partial<UniValues>) {
    this.uni.set(next);
  }

  getUni() {
    return this.uni.target;
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribeRender?.();
    this.unsubscribeRender = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.canvas = null;
    ItemManager.pending.delete(this);
  }

  private connectOrQueue() {
    if (this.destroyed) return;

    const webgl = getDefaultEngine();
    if (webgl) {
      this.attach();
      return;
    }

    ItemManager.pending.add(this);
    ItemManager.ensurePendingLoop();
  }

  private attach() {
    if (this.destroyed || this.unsubscribeRender) return;

    this.unsubscribeRender = getDefaultEngine()!.onRender(
      (frame) => {
        if (this.destroyed) return;

        if (!this.canvas) {
          this.canvas = frame.canvas;
        }
        if (this.canvas !== frame.canvas) {
          return;
        }

        if (!this.renderer) {
          this.renderer = createItemRenderer(this.element, frame, this.options, this.uni);
        }

        this.options.onFrame?.(this, frame);
        this.renderer.render(frame);
      },
      { layer: this.options.layer ?? 10 },
    );
  }

  private static ensurePendingLoop() {
    if (ItemManager.pendingRafId) return;

    const step = () => {
      ItemManager.pendingRafId = 0;
      if (ItemManager.pending.size === 0) return;

      const webgl = getDefaultEngine();
      if (!webgl) {
        ItemManager.pendingRafId = window.requestAnimationFrame(step);
        return;
      }

      const pendingNow = Array.from(ItemManager.pending);
      ItemManager.pending.clear();
      pendingNow.forEach((item) => item.attach());
    };

    ItemManager.pendingRafId = window.requestAnimationFrame(step);
  }
}

function getDefaultVertexShader() {
  return `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = aUv;
}`;
}

function getDefaultFragmentShader(debugUv: boolean) {
  if (debugUv) {
    return `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;
void main() {
  outColor = vec4(vUv, 0.5 + 0.5 * uUni[0].x, 1.0);
}`;
  }
  return `#version 300 es
precision highp float;
uniform vec4 uUni[4];
out vec4 outColor;
void main() {
  float c = max(0.0, uUni[0].x);
  outColor = vec4(vec3(c), 1.0);
}`;
}

function getShaderSource(options: ItemOptions) {
  const wgslFragment = options.shaders?.fragment ?? options.shaders?.wgsl ?? null;
  if (wgslFragment) {
    // raw GLSL passthrough — full #version 300 es sources skip the WGSL shim
    if (/^\s*#version\s+300\s+es/.test(wgslFragment)) {
      return {
        vertex: getDefaultVertexShader(),
        fragment: wgslFragment,
      };
    }
    try {
      return {
        vertex: getDefaultVertexShader(),
        fragment: convertWgslFragmentToGlsl(wgslFragment, { includeUv: true }),
      };
    } catch (error) {
      console.warn(
        "Failed to compile custom WGSL fragment for WebGL, using default shader:",
        error,
      );
    }
  }
  if (options.shaders?.vertex) {
    console.warn("Custom WGSL vertex shaders are not supported on the WebGL runtime.");
  }

  return {
    vertex: getDefaultVertexShader(),
    fragment: getDefaultFragmentShader(Boolean(options.debugUv)),
  };
}

function createItemRenderer(
  element: HTMLElement,
  frame: EngineFrame,
  options: ItemOptions,
  uni: UniWatchController,
): ItemRenderer {
  const gl = frame.gl;

  let uniValues = uni.toFloat32(16);
  const unsubscribeUni = uni.subscribe(() => {
    uniValues = uni.toFloat32(16);
  });

  const indexData = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const texture = options.texture ?? null;
  const glTexture =
    (texture?.view as { texture?: WebGLTexture } | undefined)?.texture ?? null;
  const shaderSource = getShaderSource(options);
  const asyncProgram = compileProgramAsync(
    gl,
    shaderSource.vertex,
    shaderSource.fragment,
    "item",
  );
  let program: WebGLProgram | null = null;
  let uUniLoc: WebGLUniformLocation | null = null;
  let uTextureLoc: WebGLUniformLocation | null = null;

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Failed to create WebGL buffers.");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 16 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return {
    render(nextFrame) {
      if (!program) {
        program = asyncProgram.poll();
        if (!program) return;
        uUniLoc = gl.getUniformLocation(program, "uUni");
        uTextureLoc = gl.getUniformLocation(program, "uTexture");
      }

      const clipData = getElementClipData(element, nextFrame.canvas);
      if (!clipData.isVisible) return;

      gl.disable(gl.DEPTH_TEST);
      // premultiplied-alpha blending — item shaders can output transparency
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, clipData.vertices);
      gl.useProgram(program);
      if (uUniLoc) {
        gl.uniform4fv(uUniLoc, uniValues);
      }
      if (glTexture && uTextureLoc) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.uniform1i(uTextureLoc, 0);
      }
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      if (glTexture) {
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    },
    destroy() {
      unsubscribeUni();
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
      asyncProgram.destroy();
    },
  };
}
