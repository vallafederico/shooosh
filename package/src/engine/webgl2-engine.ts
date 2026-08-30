/**
 * WebGL2 engine implementation. Not a public import.
 *
 * How to use: createEngine() loads this when WebGPU is missing or forced off.
 * This is the path that still runs post, textures, objects, particles, MSDF.
 *
 * Site code still must not require `frame.gl` — it is optional on EngineFrame.
 *
 * Docs: docs/api.md
 */

import { WebGLUnavailableError } from "./errors";
import { resetCanvasRectCache } from "../primitives/item.utils";
import {
  applyCanvasBackdrop,
  computeCanvasSize,
  createCanvasSizeTracker,
  createSubscriberRegistry,
  ensureSizedTarget,
  getEffectiveDevicePixelRatio,
  mergeClearColor,
  resolveClearColor,
} from "./engine-utils";
import { createSettleLoop } from "./settle-loop";
import { getDefaultEngine, setDefaultEngine } from "./engine";
import type {
  ClearColor,
  EngineFrame,
  EngineOptions,
  EnginePostFrame,
  PostRenderCallback,
  RenderCallback,
  WebGl2RenderTarget,
  WebGLEngine,
} from "./engine";

export function createWebGl2Engine(
  canvas: HTMLCanvasElement,
  options: EngineOptions = {},
): WebGLEngine {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    throw new WebGLUnavailableError();
  }

  // RGBA16F is only renderable with one of these extensions; without either the
  // post target falls back to RGBA8 below.
  const halfFloatExt = gl.getExtension("EXT_color_buffer_half_float");
  const floatExt = gl.getExtension("EXT_color_buffer_float");
  let useHalfFloatTarget = Boolean(halfFloatExt || floatExt);

  const baseClearColor = resolveClearColor(options.clearColor);
  gl.clearColor(baseClearColor.r, baseClearColor.g, baseClearColor.b, baseClearColor.a);
  applyCanvasBackdrop(canvas, baseClearColor);

  let clearColor = baseClearColor;
  let sceneTarget: WebGl2RenderTarget | null = null;

  const createRenderTarget = (width: number, height: number): WebGl2RenderTarget => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const depth = gl.createRenderbuffer();
    if (!texture || !framebuffer || !depth) {
      throw new Error("Failed to create WebGL render target.");
    }

    const specColorStorage = (halfFloat: boolean) => {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        halfFloat ? gl.RGBA16F : gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null,
      );
    };

    gl.bindTexture(gl.TEXTURE_2D, texture);
    specColorStorage(useHalfFloatTarget);
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

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );

    // One-time completeness check — some drivers reject a renderable RGBA16F
    // even when the extension probe passed. Fall back to RGBA8, then warn.
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      if (useHalfFloatTarget) {
        useHalfFloatTarget = false;
        specColorStorage(false);
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn(
          "shooosh: post render target framebuffer is incomplete; post output may be blank.",
        );
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const target: WebGl2RenderTarget = {
      backend: "webgl2",
      texture,
      framebuffer,
      depth,
      width,
      height,
      createView() {
        return this;
      },
      destroy() {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteRenderbuffer(depth);
      },
    };
    return target;
  };

  const ensureSceneTarget = () => {
    sceneTarget = ensureSizedTarget(canvas, sceneTarget, createRenderTarget);
    return sceneTarget;
  };

  const subscribers = createSubscriberRegistry<RenderCallback, PostRenderCallback>(
    () => loop.requestFrame(),
  );

  const resize = () => {
    const { ratio, width, height } = computeCanvasSize(canvas, options.dpr?.max);

    const didResize = canvas.width !== width || canvas.height !== height;
    if (didResize) {
      canvas.width = width;
      canvas.height = height;
      sceneTarget?.destroy();
      sceneTarget = null;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    sizeTracker.markClean(ratio);
  };

  // Per-frame resize is a cheap flag check; getBoundingClientRect (a forced
  // layout) only runs when the tracker saw the canvas or DPR change.
  const resizeIfNeeded = () => {
    if (sizeTracker.needsResize()) resize();
  };

  const renderAt = (now: number, delta: number) => {
    const hasPost = subscribers.hasPostSubscribers();
    const scene = hasPost ? ensureSceneTarget() : null;
    if (scene) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    resetCanvasRectCache();
    const frame: EngineFrame = {
      canvas,
      gl,
      clearColor,
      now,
      delta,
      backend: "webgl2",
    };
    subscribers.getSortedRenderSubscribers().forEach(({ callback }) => {
      try {
        callback(frame);
      } catch (error) {
        console.warn("Render callback failed, skipping subscriber:", error);
      }
    });

    if (hasPost && scene) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      const postFrame: EnginePostFrame = {
        canvas,
        gl,
        inputTexture: scene,
        clearColor,
        now,
        delta,
        backend: "webgl2",
      };
      subscribers.forEachPost((callback) => {
        try {
          callback(postFrame);
        } catch (error) {
          console.warn("Post render callback failed:", error);
        }
      });
    }
  };

  const loop = createSettleLoop({
    resize: resizeIfNeeded,
    render: ({ now, delta }) => renderAt(now, delta),
  });

  const sizeTracker = createCanvasSizeTracker(
    canvas,
    () => getEffectiveDevicePixelRatio(options.dpr?.max),
    () => loop.requestFrame(),
  );

  const setClearColor = (nextColor: Partial<ClearColor>) => {
    clearColor = mergeClearColor(clearColor, nextColor);
    applyCanvasBackdrop(canvas, clearColor);
    loop.requestFrame();
  };

  resize();

  const controller: WebGLEngine = {
    canvas,
    backend: "webgl2",
    gl,
    isRunning: loop.isRunning,
    start: loop.start,
    stop: loop.stop,
    resize,
    render: () => renderAt(performance.now(), 0),
    requestFrame: loop.requestFrame,
    setClearColor,
    getClearColor: () => clearColor,
    onRender: subscribers.subscribeRender,
    onPostRender: subscribers.subscribePostRender,
    destroy() {
      loop.destroy();
      sizeTracker.destroy();
      sceneTarget?.destroy();
      sceneTarget = null;
      subscribers.clear();
      // Release the context instead of waiting for GC — browsers cap live
      // WebGL contexts per page.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      if (getDefaultEngine() === controller) {
        setDefaultEngine(null);
      }
    },
  };

  return controller;
}
