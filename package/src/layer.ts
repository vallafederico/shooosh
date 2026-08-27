/**
 * Shared page-behind canvas. One engine for the whole document.
 *
 * How to use:
 *   const engine = await acquireLayer()
 *   if (!engine) return          // no GPU — leave the page readable
 *   const item = createItem(el, { shaders: { fragment: wgsl } })
 *   // teardown
 *   item.destroy()
 *   releaseLayer()               // pair every acquire
 *
 * First acquire creates a fixed, pointer-events:none, z-index:-1 canvas and
 * sets it as the default engine. Last release tears it down.
 *
 * The DOM node must be transparent where the shader should show. An opaque
 * body background hides the layer. For a canvas you own, use createScene.
 *
 * Docs: docs/getting-started.md · docs/site-patterns.md · skill shooosh-site
 */
import {
  createEngine,
  getDefaultEngine,
  setDefaultEngine,
  type EngineOptions,
  type WebGLEngine,
} from "./engine/engine";

export type AcquireLayerOptions = {
  backend?: EngineOptions["backend"];
};

let layer: { engine: WebGLEngine; canvas: HTMLCanvasElement } | null = null;
let refs = 0;
let unavailable = false;
let inflight: Promise<WebGLEngine | null> | null = null;

/**
 * Get the shared layer engine, creating it on first use. Returns null when
 * no GPU backend is available — callers must no-op gracefully. Pair every
 * acquire with a releaseLayer() in the module's teardown.
 */
export async function acquireLayer(
  options: AcquireLayerOptions = {},
): Promise<WebGLEngine | null> {
  if (unavailable) return null;
  if (layer) {
    refs += 1;
    return layer.engine;
  }

  if (!inflight) {
    inflight = instantiateLayer(options).finally(() => {
      inflight = null;
    });
  }

  const engine = await inflight;
  if (!engine) return null;
  refs += 1;
  return engine;
}

async function instantiateLayer(options: AcquireLayerOptions) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-shooosh-layer", "");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;";
  document.body.appendChild(canvas);

  try {
    const engine = await createEngine(canvas, {
      dpr: { max: 2 },
      backend: options.backend,
    });
    if (!getDefaultEngine()) setDefaultEngine(engine);
    engine.start();
    layer = { engine, canvas };
    return engine;
  } catch {
    canvas.remove();
    unavailable = true;
    return null;
  }
}

export function releaseLayer(): void {
  if (!layer) return;
  refs -= 1;
  if (refs > 0) return;
  layer.engine.destroy();
  layer.canvas.remove();
  layer = null;
}
