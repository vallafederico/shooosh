import { WebGLUnavailableError } from "./errors";
import { resetCanvasRectCache } from "../primitives/item.utils";
import {
  applyCanvasBackdrop,
  clampColorChannel,
  getEffectiveDevicePixelRatio,
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
  RenderSubscriptionOptions,
  RenderTarget,
  WebGLEngine,
} from "./engine";

type RenderSubscriberEntry = {
  id: number;
  layer: number;
  order: number;
  callback: RenderCallback;
};

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

  gl.getExtension("EXT_color_buffer_half_float");
  gl.getExtension("EXT_color_buffer_float");

  const baseClearColor = resolveClearColor(options.clearColor);
  gl.clearColor(baseClearColor.r, baseClearColor.g, baseClearColor.b, baseClearColor.a);
  applyCanvasBackdrop(canvas, baseClearColor);

  let clearColor = baseClearColor;
  let sceneTarget: RenderTarget | null = null;
  let renderSubscriberId = 1;
  let renderSubscriberOrder = 0;

  const renderSubscribers = new Map<number, RenderSubscriberEntry>();
  const postRenderSubscribers = new Set<PostRenderCallback>();
  let sortedRenderSubscribersCache: RenderSubscriberEntry[] | null = null;

  const createRenderTarget = (width: number, height: number): RenderTarget => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const depth = gl.createRenderbuffer();
    if (!texture || !framebuffer || !depth) {
      throw new Error("Failed to create WebGL render target.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      width,
      height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
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

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const target: RenderTarget = {
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
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (sceneTarget && sceneTarget.width === width && sceneTarget.height === height) {
      return sceneTarget;
    }
    sceneTarget?.destroy();
    sceneTarget = createRenderTarget(width, height);
    return sceneTarget;
  };

  const getSortedRenderSubscribers = () => {
    if (!sortedRenderSubscribersCache) {
      sortedRenderSubscribersCache = Array.from(renderSubscribers.values()).sort((a, b) => {
        if (a.layer !== b.layer) return a.layer - b.layer;
        return a.order - b.order;
      });
    }
    return sortedRenderSubscribersCache;
  };

  const subscribeRender = (
    callback: RenderCallback,
    subscriptionOptions: RenderSubscriptionOptions = {},
  ) => {
    const id = renderSubscriberId++;
    const layer = Number.isFinite(subscriptionOptions.layer)
      ? (subscriptionOptions.layer as number)
      : 0;
    const entry: RenderSubscriberEntry = {
      id,
      layer,
      order: renderSubscriberOrder++,
      callback,
    };
    renderSubscribers.set(id, entry);
    sortedRenderSubscribersCache = null;
    loop.requestFrame();
    return () => {
      renderSubscribers.delete(id);
      sortedRenderSubscribersCache = null;
    };
  };

  const resize = () => {
    const ratio = getEffectiveDevicePixelRatio(options.dpr?.max);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : canvas.clientWidth;
    const cssHeight = rect.height > 0 ? rect.height : canvas.clientHeight;
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));

    const didResize = canvas.width !== width || canvas.height !== height;
    if (didResize) {
      canvas.width = width;
      canvas.height = height;
      sceneTarget?.destroy();
      sceneTarget = null;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const renderAt = (now: number, delta: number) => {
    const hasPost = postRenderSubscribers.size > 0;
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
    getSortedRenderSubscribers().forEach(({ callback }) => {
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
      postRenderSubscribers.forEach((callback) => {
        try {
          callback(postFrame);
        } catch (error) {
          console.warn("Post render callback failed:", error);
        }
      });
    }
  };

  const loop = createSettleLoop({
    resize,
    render: ({ now, delta }) => renderAt(now, delta),
  });

  const setClearColor = (nextColor: Partial<ClearColor>) => {
    clearColor = {
      r: clampColorChannel(nextColor.r ?? clearColor.r),
      g: clampColorChannel(nextColor.g ?? clearColor.g),
      b: clampColorChannel(nextColor.b ?? clearColor.b),
      a: clampColorChannel(nextColor.a ?? clearColor.a),
    };
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
    onRender: subscribeRender,
    onPostRender: (callback) => {
      postRenderSubscribers.add(callback);
      loop.requestFrame();
      return () => {
        postRenderSubscribers.delete(callback);
      };
    },
    destroy() {
      loop.destroy();
      sceneTarget?.destroy();
      sceneTarget = null;
      renderSubscribers.clear();
      postRenderSubscribers.clear();
      if (getDefaultEngine() === controller) {
        setDefaultEngine(null);
      }
    },
  };

  return controller;
}
