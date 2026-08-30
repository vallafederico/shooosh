/**
 * Shared primitive lifecycle: connect-or-queue → attach → first-canvas guard →
 * backend pick → destroy. Not a public import.
 *
 * How to use (inside a primitive manager):
 *   const lifecycle = createPrimitiveLifecycle<Renderer>({
 *     layer: options.layer ?? 10,
 *     createRenderer(frame) { … pick gpu-* or WebGL2 … },
 *     renderFrame(renderer, frame) { renderer.render(frame) },
 *   })
 *   // teardown: lifecycle.destroy()
 *
 * Safe to call before the engine exists — queues on the shared pending-attach
 * raf list until getDefaultEngine() returns one. Renders only for the first
 * canvas seen, mirroring the managers this replaced.
 */

import { getDefaultEngine, type EngineFrame } from "../engine/engine";
import { createPendingAttachQueue } from "./pending-attach";

export type PrimitiveLifecycle<TRenderer> = {
  /** The backend renderer, once a frame produced one. */
  getRenderer: () => TRenderer | null;
  destroy: () => void;
};

type PendingEntry = { attach: () => void };

const pendingPrimitives = createPendingAttachQueue<PendingEntry>((entry) => {
  entry.attach();
});

export function createPrimitiveLifecycle<
  TRenderer extends { destroy: () => void },
>(options: {
  /** Render layer for engine.onRender. */
  layer: number;
  /** Build the backend renderer. Return null while the gpu-* chunk loads. */
  createRenderer: (frame: EngineFrame) => TRenderer | null;
  /** Runs once right after the renderer is created (flush queued updates). */
  onRendererCreated?: (renderer: TRenderer) => void;
  /** Per-frame draw — typically `(renderer, frame) => renderer.render(frame)`. */
  renderFrame: (renderer: TRenderer, frame: EngineFrame) => void;
}): PrimitiveLifecycle<TRenderer> {
  let renderer: TRenderer | null = null;
  let unsubscribeRender: (() => void) | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let destroyed = false;

  const entry: PendingEntry = {
    attach() {
      if (destroyed || unsubscribeRender) return;

      unsubscribeRender = getDefaultEngine()!.onRender(
        (frame) => {
          if (destroyed) return;

          if (!canvas) {
            canvas = frame.canvas;
          }
          if (canvas !== frame.canvas) {
            return;
          }

          if (!renderer) {
            renderer = options.createRenderer(frame);
            if (!renderer) return;
            options.onRendererCreated?.(renderer);
          }

          options.renderFrame(renderer, frame);
        },
        { layer: options.layer },
      );
    },
  };

  if (getDefaultEngine()) {
    entry.attach();
  } else {
    pendingPrimitives.enqueue(entry);
  }

  return {
    getRenderer: () => renderer,
    destroy() {
      destroyed = true;
      unsubscribeRender?.();
      unsubscribeRender = null;
      renderer?.destroy();
      renderer = null;
      canvas = null;
      pendingPrimitives.dequeue(entry);
    },
  };
}
