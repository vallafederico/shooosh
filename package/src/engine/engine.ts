/**
 * createEngine — pick a backend and return the shared runtime handle.
 *
 * How to use:
 *   const engine = await createEngine(canvas)              // probe WebGPU → WebGL2
 *   await createEngine(canvas, { backend: "webgl2" })      // force (debug)
 *   initEngine(canvas) sets the default used by createItem / createScreen
 *
 * `backend` semantics:
 *   omitted / "auto" — probe WebGPU, fall back to WebGL2. Either engine chunk may
 *                      load, so the page can pay for both in the worst case.
 *   "webgpu"         — fails hard (GpuUnavailableError). No WebGL2 fallback.
 *   "webgl2"         — WebGL2 only; the WebGPU chunks are never fetched.
 *
 * Site `onFrame` should read `frame.now` / `frame.delta` / `frame.backend` /
 * `frame.canvas`. `frame.gl` exists only on WebGL2 — do not require it.
 *
 * Throws GpuUnavailableError when neither backend starts. Prefer acquireLayer()
 * (returns null) for page-behind mounts so the page stays readable.
 *
 * Docs: docs/api.md
 */

import { probeRenderer, type RendererKind } from "./capabilities";
import { GpuUnavailableError } from "./errors";
import type { ClearColor } from "./engine-utils";

export type { ClearColor } from "./engine-utils";

/**
 * Offscreen colour target the engine renders the site into before post runs.
 * Backend-agnostic: narrow on `backend` before touching the handles.
 */
export type RenderTargetBase = {
  width: number;
  height: number;
  /** Backend view handle: the GL target itself, or a GPUTextureView. */
  createView: () => unknown;
  destroy: () => void;
};

export type WebGl2RenderTarget = RenderTargetBase & {
  backend: "webgl2";
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  depth: WebGLRenderbuffer | null;
};

export type WebGpuRenderTarget = RenderTargetBase & {
  backend: "webgpu";
  /** GPUTexture. Kept opaque so GPU types stay out of the public surface. */
  texture: unknown;
  /** GPUTextureView for the colour attachment / sampled read. */
  view: unknown;
  format: string;
};

export type RenderTarget = WebGl2RenderTarget | WebGpuRenderTarget;

/**
 * Shared per-frame payload. Site `onFrame` hooks should use `canvas` / `now` /
 * `delta` / `backend`. `gl` is only present on the WebGL2 path.
 */
export type EngineFrame = {
  canvas: HTMLCanvasElement;
  clearColor: ClearColor;
  now: number;
  delta: number;
  backend: RendererKind;
  /** Present on the WebGL2 backend only. Do not require this from site code. */
  gl?: WebGL2RenderingContext;
};

/**
 * Post payload. `inputTexture` holds the rendered site; write the result to the
 * canvas. `gl` is WebGL2-only — the WebGPU backend passes its device / encoder
 * through the internal GPU frame channel instead.
 */
export type EnginePostFrame = {
  canvas: HTMLCanvasElement;
  inputTexture: RenderTarget;
  clearColor: ClearColor;
  now: number;
  delta: number;
  backend: RendererKind;
  /** Present on the WebGL2 backend only. */
  gl?: WebGL2RenderingContext;
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
  /** Default `"auto"` probes WebGPU first, then WebGL2. */
  backend?: RendererKind | "auto";
};

export type WebGLEngine = {
  readonly canvas: HTMLCanvasElement;
  readonly backend: RendererKind;
  readonly gl?: WebGL2RenderingContext;
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

export async function createEngine(
  canvas: HTMLCanvasElement,
  options: EngineOptions = {},
): Promise<WebGLEngine> {
  const prefer = options.backend ?? "auto";
  const kind = await probeRenderer({ backend: prefer });

  // backend: "webgpu" is documented to fail hard — never fall through to WebGL2.
  if (prefer === "webgpu" && kind !== "webgpu") {
    throw new GpuUnavailableError("WebGPU is not available in this browser.");
  }

  if (kind === "webgpu") {
    const { createWebGpuEngine } = await import("./webgpu-engine");
    try {
      return await createWebGpuEngine(canvas, options);
    } catch (error) {
      if (prefer === "webgpu") throw error;
      console.warn("shooosh: WebGPU device failed, falling back to WebGL2.", error);
    }
  }

  const webgl2 =
    kind === "webgl2" ? "webgl2" : await probeRenderer({ backend: "webgl2" });
  if (webgl2 === "webgl2") {
    const { createWebGl2Engine } = await import("./webgl2-engine");
    return createWebGl2Engine(canvas, options);
  }

  throw new GpuUnavailableError();
}

// In-flight initEngine promises, keyed by canvas, so concurrent calls share one
// engine instead of racing two onto the same canvas (the loser would leak).
const pendingEngineInits = new Map<HTMLCanvasElement, Promise<WebGLEngine>>();

export async function initEngine(
  canvas: HTMLCanvasElement,
  options: EngineOptions = {},
) {
  const existing = defaultEngine;
  if (existing?.canvas === canvas) {
    return existing;
  }

  const pending = pendingEngineInits.get(canvas);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const engine = await createEngine(canvas, options);
      setDefaultEngine(engine);
      return engine;
    } finally {
      pendingEngineInits.delete(canvas);
    }
  })();
  pendingEngineInits.set(canvas, promise);
  return promise;
}
