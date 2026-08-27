// Shared fullscreen layer: ONE fixed canvas + engine behind the whole page
// for DOM-tracked effects (items). Refcounted — the first acquire creates it,
// the last release tears it down. It becomes the default engine, so
// createItem()/loadTexture() work against it without passing a handle.
//
// The canvas sits at z-index -1 with pointer-events none: elements showing an
// effect must be transparent where it renders (an opaque body background
// hides the layer entirely).
//
// For an effect scoped to its own <canvas> element use createScene instead.
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
