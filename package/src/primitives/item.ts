/**
 * ItemManager — tracks getBoundingClientRect and draws a quad. Not public.
 *
 * How to use: createItem() wraps this. Queues on a raf list until an engine
 * exists, then picks WebGPU (gpu-item) or WebGL2 (plane compile).
 *
 * Docs: docs/site-patterns.md
 */

import type { EngineFrame } from "../engine/engine";
import {
  resolveGlslShaderSource,
  type FullscreenPlaneShaders,
  type FullscreenPlaneTexture,
} from "./plane";
import { ensureWatchableUni, type UniValues, type UniWatchController } from "../engine/uni";
import { getElementClipData } from "./item.utils";
import { compileProgramAsync } from "../shaders/compile";
import {
  resolveTextureUvTransform,
  textureFitToUni,
  type TextureFitMode,
} from "../loaders/texture-loader";
import { createLazyGpuFactory } from "./pending-attach";
import { createPrimitiveLifecycle, type PrimitiveLifecycle } from "./primitive-lifecycle";

type ItemRenderer = {
  render: (frame: EngineFrame) => void;
  destroy: () => void;
};

const ensureGpuItemFactory = createLazyGpuFactory({
  label: "item",
  load: () => import("./gpu-item").then((m) => m.createGpuItemRenderer),
});

export type ItemOptions = {
  layer?: number;
  shaders?: FullscreenPlaneShaders;
  debugUv?: boolean;
  uni?: UniValues;
  /** loadTexture() result — bound as uTexture in the fragment */
  texture?: FullscreenPlaneTexture | null;
  /** CSS object-fit for uTexture. Default `"cover"`. Writes value5–8 each frame. */
  textureFit?: TextureFitMode;
  onFrame?: (item: ItemManager, frame: EngineFrame) => ItemManager | void;
};

export class ItemManager {
  private element: HTMLElement;
  private options: ItemOptions;
  private uni: UniWatchController;
  private lifecycle: PrimitiveLifecycle<ItemRenderer>;

  constructor(element: HTMLElement, options: ItemOptions = {}) {
    this.element = element;
    this.options = options;
    this.uni = ensureWatchableUni(options.uni ?? { value1: 1 });
    this.lifecycle = createPrimitiveLifecycle<ItemRenderer>({
      layer: options.layer ?? 10,
      createRenderer: (frame) => {
        if (frame.backend === "webgpu") {
          const createGpuRenderer = ensureGpuItemFactory();
          if (!createGpuRenderer) return null;
          return createGpuRenderer(this.element, this.options, this.uni);
        }
        if (frame.gl) {
          return createItemRenderer(this.element, frame, this.options, this.uni);
        }
        return null;
      },
      renderFrame: (renderer, frame) => {
        this.options.onFrame?.(this, frame);
        renderer.render(frame);
      },
    });
  }

  setUni(next: Partial<UniValues>) {
    this.uni.set(next);
  }

  getUni() {
    return this.uni.target;
  }

  destroy() {
    this.lifecycle.destroy();
  }
}

function createItemRenderer(
  element: HTMLElement,
  frame: EngineFrame,
  options: ItemOptions,
  uni: UniWatchController,
): ItemRenderer {
  const gl = frame.gl;
  if (!gl) {
    return { render() {}, destroy() {} };
  }

  let uniValues = uni.toFloat32(16);
  const unsubscribeUni = uni.subscribe(() => {
    uniValues = uni.toFloat32(16);
  });

  const indexData = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const texture = options.texture ?? null;
  const glTexture =
    (texture?.view as { texture?: WebGLTexture } | undefined)?.texture ?? null;
  const shaderSource = resolveGlslShaderSource({
    debugUv: Boolean(options.debugUv),
    shaders: options.shaders,
    kind: "item",
  });
  // Match the WebGPU path's wgsl.usesTexture guard — skip the per-frame fit
  // block entirely when the shader never samples the texture.
  const usesTexture = Boolean(glTexture) && /\buTexture\b/.test(shaderSource.fragment);
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

  // Per-renderer scratch — getElementClipData fills this instead of allocating.
  const clipVertices = new Float32Array(16);
  // Texture-fit cache — recompute only when the (textureAspect, targetAspect,
  // fit) triple changes, so static frames stay clean for the settle loop.
  let lastFitTextureAspect = Number.NaN;
  let lastFitTargetAspect = Number.NaN;
  let lastFitMode: TextureFitMode | null = null;

  return {
    render(nextFrame) {
      if (!program) {
        program = asyncProgram.poll();
        if (!program) return;
        uUniLoc = gl.getUniformLocation(program, "uUni");
        uTextureLoc = gl.getUniformLocation(program, "uTexture");
      }

      const clipData = getElementClipData(element, nextFrame.canvas, clipVertices);
      if (!clipData.isVisible) return;

      if (texture && usesTexture) {
        const rect = clipData.rect;
        const targetAspect =
          Math.max(1, rect.width) / Math.max(1, rect.height);
        const fit = options.textureFit ?? "cover";
        if (
          texture.aspect !== lastFitTextureAspect ||
          targetAspect !== lastFitTargetAspect ||
          fit !== lastFitMode
        ) {
          lastFitTextureAspect = texture.aspect;
          lastFitTargetAspect = targetAspect;
          lastFitMode = fit;
          const uvTransform = resolveTextureUvTransform(texture.aspect, targetAspect, fit);
          uni.set(textureFitToUni(uvTransform));
        }
      }

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
