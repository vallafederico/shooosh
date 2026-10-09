declare const __SHOOOSH_GPU__: boolean;
declare const __SHOOOSH_GL__: boolean;
/**
 * ItemManager — tracks getBoundingClientRect and draws a quad. Not public.
 *
 * How to use: createItem() wraps this. Queues on a raf list until an engine
 * exists, then picks WebGPU (gpu-item) or WebGL2 (plane compile).
 *
 * Docs: docs/site-patterns.md
 */

import type { ItemIntegration } from "./item-integration";
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
import { isValidMapName } from "../shaders/wgsl-wrap";

type ItemRenderer = {
  render: (frame: EngineFrame) => "pending" | "drawn" | "culled" | "failed";
  /** A map slot's texture changed (`ItemManager.setMap`): rebind before the next draw. */
  mapsChanged?: () => void;
  destroy: () => void;
};

/** An item's named map slots: a texture, or null until one is set. */
export type ItemMaps = Record<string, FullscreenPlaneTexture | null>;

const ensureGpuItemFactory = /* @__PURE__ */ createLazyGpuFactory({
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
  /**
   * Extra textures by name, for a fragment to sample next to `uTexture`:
   * `{ uDepth: tex }` → `textureSample(uDepth, uSampler, fitUv(vUv))`. The
   * names are the slots, fixed at creation; `null` declares a slot to fill
   * later with `setMap` (a map that loads after the image). An empty slot
   * samples one transparent texel (0, 0, 0, 0): gate the effect on a uniform
   * set alongside `setMap`. Maps share `uSampler` and `uTexture`'s fit.
   */
  maps?: ItemMaps;
  onFrame?: (item: ItemManager, frame: EngineFrame) => ItemManager | void;
};

export class ItemManager {
  private element: HTMLElement;
  private options: ItemOptions;
  private uni: UniWatchController;
  private lifecycle: PrimitiveLifecycle<ItemRenderer>;

  constructor(element: HTMLElement, options: ItemOptions = {}, private integration?: ItemIntegration) {
    this.element = element;
    // Own the maps record: setMap writes into it, the renderers read it.
    this.options = options.maps ? { ...options, maps: validMaps(options.maps) } : options;
    this.uni = ensureWatchableUni(options.uni ?? { value1: 1 });
    this.lifecycle = createPrimitiveLifecycle<ItemRenderer>({
      engine: integration?.engine,
      onError: integration?.onError,
      layer: options.layer ?? 10,
      createRenderer: (frame) => {
        if ((typeof __SHOOOSH_GPU__ === "undefined" || __SHOOOSH_GPU__) && frame.backend === "webgpu") {
          const createGpuRenderer = ensureGpuItemFactory();
          if (!createGpuRenderer) { integration?.engine.requestFrame(); return null; }
          return createGpuRenderer(this.element, this.options, this.uni, integration);
        }
        if ((typeof __SHOOOSH_GL__ === "undefined" || __SHOOOSH_GL__) && frame.gl) {
          return createItemRenderer(this.element, frame, this.options, this.uni, integration);
        }
        return null;
      },
      renderFrame: (renderer, frame) => {
        this.options.onFrame?.(this, frame);
        try {
          const status = renderer.render(frame);
          if (status === "pending") integration?.engine.requestFrame();
          if (status === "failed") integration?.onError(new Error("Item shader compilation failed; see shader log."));
          if (status === "drawn" && integration) frame.onSubmitted?.(integration.onDraw);
        } catch (error) {
          if (integration) integration.onError(error);
          else throw error;
        }
      },
    });
  }

  setUni(next: Partial<UniValues>) {
    this.uni.set(next);
    this.integration?.engine.requestFrame();
  }

  /**
   * Fill (or empty, with null) a map slot declared in `maps` at creation.
   * Takes effect on the next frame; the shader is not recompiled. Unknown
   * names are ignored with a warning: the slots are fixed with the shader.
   */
  setMap(name: string, texture: FullscreenPlaneTexture | null) {
    const maps = this.options.maps;
    if (!maps || !(name in maps)) {
      console.warn(`shooosh: setMap("${name}") on an item without that map slot; declare it in maps at creation.`);
      return;
    }
    if (maps[name] === texture) return;
    maps[name] = texture;
    this.lifecycle.getRenderer()?.mapsChanged?.();
    this.integration?.engine.requestFrame();
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
  integration?: ItemIntegration,
): ItemRenderer {
  const gl = frame.gl;
  if (!gl) {
    return { render() { return "failed"; }, destroy() {} };
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
  // Map slots the program samples, each on its own unit after uTexture's 0.
  const mapNames = Object.keys(options.maps ?? {}).sort();
  let mapLocs: Array<{ name: string; loc: WebGLUniformLocation }> = [];

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
        if (!program) return asyncProgram.status() === "failed" ? "failed" : "pending";
        uUniLoc = gl.getUniformLocation(program, "uUni");
        uTextureLoc = gl.getUniformLocation(program, "uTexture");
        for (const name of mapNames) {
          const loc = gl.getUniformLocation(program, name);
          if (loc) mapLocs.push({ name, loc });
        }
      }

      const clipData = integration?.geometry(clipVertices) ?? getElementClipData(element, nextFrame.canvas, clipVertices);
      if (!clipData.isVisible) return "culled";

      if (integration?.uv) uni.set(textureFitToUni(integration.uv()));
      if (texture && usesTexture && !integration?.uv) {
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
      for (let i = 0; i < mapLocs.length; i++) {
        const { name, loc } = mapLocs[i]!;
        const map = options.maps?.[name] ?? null;
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, glMapTexture(map) ?? emptyGlTexture(gl));
        gl.uniform1i(loc, 1 + i);
      }
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      for (let i = mapLocs.length - 1; i >= 0; i--) {
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      gl.activeTexture(gl.TEXTURE0);
      if (glTexture) {
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      return "drawn";
    },
    destroy() {
      unsubscribeUni();
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
      asyncProgram.destroy();
      mapLocs = [];
    },
  };
}

/** Copy a maps record, dropping slots whose names cannot be shader identifiers. */
function validMaps(maps: ItemMaps): ItemMaps {
  const out: ItemMaps = {};
  for (const [name, texture] of Object.entries(maps)) {
    if (isValidMapName(name)) out[name] = texture;
    else console.warn(`shooosh: ignoring map "${name}"; map names are identifiers other than uTexture, uSampler, uUni, vUv and fitUv.`);
  }
  return out;
}

function glMapTexture(map: FullscreenPlaneTexture | null) {
  if (!map) return null;
  if (map.texture?.backend && map.texture.backend !== "webgl2") return null;
  return (map.view as { texture?: WebGLTexture } | undefined)?.texture ?? null;
}

/** One transparent texel per context: what an empty map slot samples. */
const emptyGlTextures = new WeakMap<WebGL2RenderingContext, WebGLTexture>();
function emptyGlTexture(gl: WebGL2RenderingContext) {
  let texture = emptyGlTextures.get(gl);
  if (texture) return texture;
  texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  emptyGlTextures.set(gl, texture);
  return texture;
}
