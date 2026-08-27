import { WebGLUnavailableError } from "./errors";
import { resetCanvasRectCache } from "../primitives/item.utils";

export type ClearColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type RenderTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  depth: WebGLRenderbuffer;
  width: number;
  height: number;
  createView: () => RenderTarget;
  destroy: () => void;
};

export type EngineFrame = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  clearColor: ClearColor;
  now: number;
  delta: number;
};

export type EnginePostFrame = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  inputTexture: RenderTarget;
  clearColor: ClearColor;
  now: number;
  delta: number;
};

export type RenderCallback = (frame: EngineFrame) => void;
export type PostRenderCallback = (frame: EnginePostFrame) => void;

export type RenderSubscriptionOptions = {
  /** Lower layers render first. Defaults to 0. */
  layer?: number;
};

export type EngineOptions = {
  /** Cap device pixel ratio. Defaults to device DPR. */
  dpr?: {
    max?: number;
  };
  clearColor?: Partial<ClearColor>;
};

export type WebGLEngine = {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly isRunning: () => boolean;
  start: () => void;
  stop: () => void;
  resize: () => void;
  render: () => void;
  /** Mark the scene dirty, keeping the render loop hot for the settle window. */
  requestFrame: () => void;
  setClearColor: (nextColor: Partial<ClearColor>) => void;
  getClearColor: () => ClearColor;
  onRender: (
    callback: RenderCallback,
    options?: RenderSubscriptionOptions,
  ) => () => void;
  onPostRender: (callback: PostRenderCallback) => () => void;
  destroy: () => void;
};

type RenderSubscriberEntry = {
  id: number;
  layer: number;
  order: number;
  callback: RenderCallback;
};

/** How long the loop keeps rendering after the last dirty mark, so lerp tails and layout settle finish. */
const SETTLE_MS = 250;

let defaultEngine: WebGLEngine | null = null;

export function getDefaultEngine() {
  return defaultEngine;
}

export function setDefaultEngine(engine: WebGLEngine | null) {
  defaultEngine = engine;
}

export function resolveEngine(engine?: WebGLEngine | null) {
  return engine ?? defaultEngine;
}

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getEffectiveDevicePixelRatio(max?: number) {
  const dpr = window.devicePixelRatio;
  const resolved = !Number.isFinite(dpr) || (dpr ?? 0) <= 0 ? 1 : (dpr as number);
  if (typeof max === "number" && max > 0) {
    return Math.min(resolved, max);
  }
  return resolved;
}

export function createEngine(
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

  const baseClearColor: ClearColor = {
    r: options.clearColor?.r ?? 0,
    g: options.clearColor?.g ?? 0,
    b: options.clearColor?.b ?? 0,
    a: options.clearColor?.a ?? 0,
  };

  gl.clearColor(baseClearColor.r, baseClearColor.g, baseClearColor.b, baseClearColor.a);
  // mirror the clear colour on the element so css shows the same backdrop;
  // a transparent clear must leave the canvas element transparent too
  canvas.style.backgroundColor =
    baseClearColor.a > 0
      ? `rgba(${Math.round(baseClearColor.r * 255)}, ${Math.round(baseClearColor.g * 255)}, ${Math.round(baseClearColor.b * 255)}, ${baseClearColor.a})`
      : "transparent";

  let clearColor = baseClearColor;
  let running = false;
  let rafId = 0;
  let previousFrameAt = 0;
  let lastDirtyAt = 0;
  let wasActive = false;
  let sceneTarget: RenderTarget | null = null;
  let renderSubscriberId = 1;
  let renderSubscriberOrder = 0;

  const markDirty = () => {
    lastDirtyAt = performance.now();
  };

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
    markDirty();
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

  const render = () => {
    const now = performance.now();
    const delta = previousFrameAt === 0 ? 0 : now - previousFrameAt;
    previousFrameAt = now;

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
    getSortedRenderSubscribers().forEach(({ callback }) => {
      try {
        callback({
          canvas,
          gl,
          clearColor,
          now,
          delta,
        });
      } catch (error) {
        console.warn("Render callback failed, skipping subscriber:", error);
      }
    });

    if (hasPost && scene) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      postRenderSubscribers.forEach((callback) => {
        try {
          callback({
            canvas,
            gl,
            inputTexture: scene,
            clearColor,
            now,
            delta,
          });
        } catch (error) {
          console.warn("Post render callback failed:", error);
        }
      });
    }
  };

  const frame = () => {
    if (!running) return;

    const active = performance.now() - lastDirtyAt < SETTLE_MS;
    if (active) {
      // Resuming after idle — don't let the gap since the last render spike delta.
      if (!wasActive) previousFrameAt = 0;
      resize();
      render();
    }
    wasActive = active;

    rafId = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    previousFrameAt = 0;
    wasActive = false;
    markDirty();
    rafId = window.requestAnimationFrame(frame);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(rafId);
  };

  const setClearColor = (nextColor: Partial<ClearColor>) => {
    clearColor = {
      r: clampColorChannel(nextColor.r ?? clearColor.r),
      g: clampColorChannel(nextColor.g ?? clearColor.g),
      b: clampColorChannel(nextColor.b ?? clearColor.b),
      a: clampColorChannel(nextColor.a ?? clearColor.a),
    };
  };

  // Global dirty sources — anything that could change what's on screen wakes the loop.
  const onDirtyEvent = () => markDirty();
  document.addEventListener("scroll", onDirtyEvent, { capture: true, passive: true });
  window.addEventListener("resize", onDirtyEvent);
  window.visualViewport?.addEventListener("resize", onDirtyEvent);
  window.addEventListener("pointermove", onDirtyEvent, { passive: true });
  window.addEventListener("pointerdown", onDirtyEvent, { passive: true });
  window.addEventListener("wheel", onDirtyEvent, { passive: true });
  window.addEventListener("touchmove", onDirtyEvent, { passive: true });

  const removeDirtyListeners = () => {
    document.removeEventListener("scroll", onDirtyEvent, { capture: true });
    window.removeEventListener("resize", onDirtyEvent);
    window.visualViewport?.removeEventListener("resize", onDirtyEvent);
    window.removeEventListener("pointermove", onDirtyEvent);
    window.removeEventListener("pointerdown", onDirtyEvent);
    window.removeEventListener("wheel", onDirtyEvent);
    window.removeEventListener("touchmove", onDirtyEvent);
  };

  const destroy = () => {
    stop();
    removeDirtyListeners();
    sceneTarget?.destroy();
    sceneTarget = null;
    renderSubscribers.clear();
    postRenderSubscribers.clear();
    if (defaultEngine === controller) {
      setDefaultEngine(null);
    }
  };

  resize();

  const controller: WebGLEngine = {
    canvas,
    gl,
    isRunning: () => running,
    start,
    stop,
    resize,
    render,
    requestFrame: markDirty,
    setClearColor,
    getClearColor: () => clearColor,
    onRender: subscribeRender,
    onPostRender: (callback) => {
      postRenderSubscribers.add(callback);
      markDirty();
      return () => {
        postRenderSubscribers.delete(callback);
      };
    },
    destroy,
  };

  return controller;
}

export async function initEngine(
  canvas: HTMLCanvasElement,
  options: EngineOptions = {},
) {
  const existing = defaultEngine;
  if (existing?.canvas === canvas) {
    return existing;
  }

  const engine = createEngine(canvas, options);
  setDefaultEngine(engine);
  return engine;
}
