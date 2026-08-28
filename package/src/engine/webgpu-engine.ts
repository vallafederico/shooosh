/**
 * WebGPU engine implementation. Not a public import.
 *
 * How to use: createEngine() loads this when probeRenderer() is `"webgpu"`.
 * Screen + item run here. Post, textures, objects, particles, MSDF do not —
 * those stay on the WebGL2 engine and warn / no-op on this path.
 *
 * Do not leak GPUDevice into site-facing types. Shared frame is EngineFrame.
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
  type GpuCanvasContext,
  type GpuDevice,
} from "./gpu-api";
import { getDefaultEngine, setDefaultEngine } from "./engine";
import type {
  ClearColor,
  EngineFrame,
  EngineOptions,
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
  let postWarned = false;
  let renderSubscriberId = 1;
  let renderSubscriberOrder = 0;

  type RenderSubscriberEntry = {
    id: number;
    layer: number;
    order: number;
    callback: (frame: EngineFrame) => void;
  };

  const renderSubscribers = new Map<number, RenderSubscriberEntry>();
  let sortedRenderSubscribersCache: RenderSubscriberEntry[] | null = null;

  const configureContext = (gpuContext: GpuCanvasContext, width: number, height: number) => {
    gpuContext.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });
    configuredWidth = width;
    configuredHeight = height;
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
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
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
    onPostRender: () => {
      if (!postWarned) {
        postWarned = true;
        console.warn(
          "shooosh: post-processing is not implemented on the WebGPU backend yet; onPostRender is a no-op.",
        );
      }
      return () => {};
    },
    destroy() {
      loop.destroy();
      renderSubscribers.clear();
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

  return controller;
}
