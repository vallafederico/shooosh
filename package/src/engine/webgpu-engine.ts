/**
 * WebGPU engine implementation. Not a public import.
 *
 * How to use: createEngine() loads this when probeRenderer() is `"webgpu"`.
 * Screen, item, object, particles, MSDF, textures, post and fluid all run here.
 *
 * The scene pass always carries a depth attachment (GPU_DEPTH_FORMAT) so meshes
 * can depth-test. Every pipeline drawn in that pass must therefore declare a
 * matching `depthStencil` — use `sceneDepthStencil()` from shaders/gpu-compile.
 *
 * With onPostRender subscribers the site renders into an offscreen colour
 * texture (canvas format, so one pipeline format covers every post pass) and
 * post presents into the canvas. Post reads device / encoder / canvas view from
 * runWithGpuPostFrame — they never touch EnginePostFrame.
 *
 * Do not leak GPUDevice into site-facing types. Shared frame is EngineFrame.
 * createCompute uses getGpuInternals(engine) from gpu-internals.ts.
 *
 * Docs: docs/shader-contract.md
 */

import { GpuUnavailableError } from "./errors";
import { resetCanvasRectCache } from "../primitives/item.utils";
import {
  applyCanvasBackdrop,
  clampColorChannel,
  getEffectiveDevicePixelRatio,
  resolveClearColor,
} from "./engine-utils";
import { createSettleLoop } from "./settle-loop";
import {
  getGpuCanvasContext,
  getNavigatorGpu,
  runWithGpuFrame,
  runWithGpuPostFrame,
  GPU_DEPTH_FORMAT,
  GPU_TEXTURE_USAGE,
  type GpuCanvasContext,
  type GpuDevice,
  type GpuTexture,
  type GpuTextureView,
} from "./gpu-api";
import {
  clearGpuInternals,
  registerGpuInternals,
  type GpuPreRenderContext,
} from "./gpu-internals";
import { getDefaultEngine, setDefaultEngine } from "./engine";
import type {
  ClearColor,
  EngineFrame,
  EngineOptions,
  EnginePostFrame,
  PostRenderCallback,
  WebGpuRenderTarget,
  WebGLEngine,
} from "./engine";

export async function createWebGpuEngine(
  canvas: HTMLCanvasElement,
  options: EngineOptions = {},
): Promise<WebGLEngine> {
  const gpu = getNavigatorGpu();
  if (!gpu) {
    throw new GpuUnavailableError("WebGPU is not available in this browser.");
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new GpuUnavailableError("No WebGPU adapter is available.");
  }

  let device: GpuDevice;
  try {
    device = await adapter.requestDevice();
  } catch (error) {
    throw new GpuUnavailableError(
      error instanceof Error ? error.message : "Failed to create a WebGPU device.",
    );
  }

  const context = getGpuCanvasContext(canvas);
  if (!context) {
    device.destroy();
    throw new GpuUnavailableError("Failed to get a GPU canvas context.");
  }

  const format = gpu.getPreferredCanvasFormat();
  const baseClearColor = resolveClearColor(options.clearColor);
  applyCanvasBackdrop(canvas, baseClearColor);

  let clearColor = baseClearColor;
  let configuredWidth = 0;
  let configuredHeight = 0;
  let renderSubscriberId = 1;
  let renderSubscriberOrder = 0;
  let preRenderSubscriberId = 1;
  let sceneTarget: WebGpuRenderTarget | null = null;
  let depthTexture: GpuTexture | null = null;
  let depthView: GpuTextureView | null = null;
  let depthWidth = 0;
  let depthHeight = 0;

  type RenderSubscriberEntry = {
    id: number;
    layer: number;
    order: number;
    callback: (frame: EngineFrame) => void;
  };

  const renderSubscribers = new Map<number, RenderSubscriberEntry>();
  let sortedRenderSubscribersCache: RenderSubscriberEntry[] | null = null;
  const preRenderSubscribers = new Map<
    number,
    (ctx: GpuPreRenderContext) => void
  >();
  const postRenderSubscribers = new Set<PostRenderCallback>();

  const configureContext = (gpuContext: GpuCanvasContext, width: number, height: number) => {
    gpuContext.configure({
      device,
      format,
      alphaMode: "premultiplied",
      // COPY_DST lets post copy the scene straight to the canvas while its
      // pipelines are still compiling, instead of presenting nothing.
      usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.COPY_DST,
    });
    configuredWidth = width;
    configuredHeight = height;
  };

  const createSceneTarget = (width: number, height: number): WebGpuRenderTarget => {
    const texture = device.createTexture({
      label: "shooosh-scene",
      size: { width, height },
      format,
      usage:
        GPU_TEXTURE_USAGE.RENDER_ATTACHMENT |
        GPU_TEXTURE_USAGE.TEXTURE_BINDING |
        GPU_TEXTURE_USAGE.COPY_SRC,
    });
    const view = texture.createView();
    return {
      backend: "webgpu",
      texture,
      view,
      format,
      width,
      height,
      createView() {
        return view;
      },
      destroy() {
        texture.destroy();
      },
    };
  };

  /**
   * The scene pass always owns a depth buffer so createObject can depth-test
   * without the engine having to know whether a mesh exists this frame. Flat
   * drawables opt out per pipeline (`depthWriteEnabled: false`, compare
   * `always`), so their layer ordering is unchanged.
   */
  const ensureDepthView = () => {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (depthView && depthWidth === width && depthHeight === height) {
      return depthView;
    }
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      label: "shooosh-depth",
      size: { width, height },
      format: GPU_DEPTH_FORMAT,
      usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
    });
    depthView = depthTexture.createView();
    depthWidth = width;
    depthHeight = height;
    return depthView;
  };

  const releaseDepth = () => {
    depthTexture?.destroy();
    depthTexture = null;
    depthView = null;
    depthWidth = 0;
    depthHeight = 0;
  };

  const ensureSceneTarget = () => {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (sceneTarget && sceneTarget.width === width && sceneTarget.height === height) {
      return sceneTarget;
    }
    sceneTarget?.destroy();
    sceneTarget = createSceneTarget(width, height);
    return sceneTarget;
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
      releaseDepth();
    }
    if (didResize || configuredWidth !== width || configuredHeight !== height) {
      configureContext(context, width, height);
    }
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

  const renderAt = (now: number, delta: number) => {
    const encoder = device.createCommandEncoder({ label: "shooosh-frame" });

    const preCtx: GpuPreRenderContext = {
      device,
      encoder,
      canvas,
      now,
      delta,
    };
    preRenderSubscribers.forEach((callback) => {
      try {
        callback(preCtx);
      } catch (error) {
        console.warn("Pre-render callback failed, skipping:", error);
      }
    });

    const hasPost = postRenderSubscribers.size > 0;
    const scene = hasPost ? ensureSceneTarget() : null;

    // Acquired on demand: when post is not ready to draw, nothing touches the
    // canvas and the browser keeps presenting the previous frame.
    let canvasTexture: ReturnType<typeof context.getCurrentTexture> | null = null;
    let canvasView: unknown = null;
    const getCanvasTexture = () => {
      if (!canvasTexture) canvasTexture = context.getCurrentTexture();
      return canvasTexture;
    };
    const getCanvasView = () => {
      if (!canvasView) canvasView = getCanvasTexture().createView();
      return canvasView;
    };

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: scene ? scene.view : getCanvasView(),
          clearValue: {
            r: clearColor.r,
            g: clearColor.g,
            b: clearColor.b,
            a: clearColor.a,
          },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: ensureDepthView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    resetCanvasRectCache();
    const frame: EngineFrame = {
      canvas,
      clearColor,
      now,
      delta,
      backend: "webgpu",
    };

    runWithGpuFrame({ device, context, format, encoder, pass }, () => {
      getSortedRenderSubscribers().forEach(({ callback }) => {
        try {
          callback(frame);
        } catch (error) {
          console.warn("Render callback failed, skipping subscriber:", error);
        }
      });
    });

    pass.end();

    if (scene) {
      const postFrame: EnginePostFrame = {
        canvas,
        inputTexture: scene,
        clearColor,
        now,
        delta,
        backend: "webgpu",
      };
      runWithGpuPostFrame(
        {
          device,
          format,
          encoder,
          getTargetView: getCanvasView,
          getTargetTexture: getCanvasTexture,
        },
        () => {
          postRenderSubscribers.forEach((callback) => {
            try {
              callback(postFrame);
            } catch (error) {
              console.warn("Post render callback failed:", error);
            }
          });
        },
      );
    }

    device.queue.submit([encoder.finish()]);
  };

  const loop = createSettleLoop({
    resize,
    render: ({ now, delta }) => renderAt(now, delta),
  });

  const subscribeRender = (
    callback: (frame: EngineFrame) => void,
    subscriptionOptions: { layer?: number } = {},
  ) => {
    const id = renderSubscriberId++;
    const layer = Number.isFinite(subscriptionOptions.layer)
      ? (subscriptionOptions.layer as number)
      : 0;
    renderSubscribers.set(id, {
      id,
      layer,
      order: renderSubscriberOrder++,
      callback,
    });
    sortedRenderSubscribersCache = null;
    loop.requestFrame();
    return () => {
      renderSubscribers.delete(id);
      sortedRenderSubscribersCache = null;
    };
  };

  const subscribePreRender = (callback: (ctx: GpuPreRenderContext) => void) => {
    const id = preRenderSubscriberId++;
    preRenderSubscribers.set(id, callback);
    loop.requestFrame();
    return () => {
      preRenderSubscribers.delete(id);
    };
  };

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
    backend: "webgpu",
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
      clearGpuInternals(controller);
      loop.destroy();
      sceneTarget?.destroy();
      sceneTarget = null;
      releaseDepth();
      renderSubscribers.clear();
      preRenderSubscribers.clear();
      postRenderSubscribers.clear();
      try {
        device.destroy();
      } catch {
        // already lost
      }
      if (getDefaultEngine() === controller) {
        setDefaultEngine(null);
      }
    },
  };

  registerGpuInternals(controller, {
    device,
    format,
    onPreRender: subscribePreRender,
  });

  return controller;
}
