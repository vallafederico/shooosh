/**
 * Shared lazy WebGPU drawer load + pending-engine attach. Not a public import.
 *
 * How to use (inside a primitive manager):
 *   const ensureGpu = createLazyGpuFactory({
 *     label: "item",
 *     load: () => import("./gpu-item").then((m) => m.createGpuItemRenderer),
 *   })
 *   const pending = createPendingAttachQueue<ItemManager>((item) => item.attach())
 *
 * WebGL2-only pages never download the gpu-* chunk until a webgpu frame asks.
 */

import { getDefaultEngine } from "../engine/engine";

/** Returns the factory once the dynamic import resolves; null while in flight. */
export function createLazyGpuFactory<TFactory>(options: {
  label: string;
  load: () => Promise<TFactory>;
}): () => TFactory | null {
  let factory: TFactory | null = null;
  let loading: Promise<void> | null = null;
  return () => {
    if (factory) return factory;
    if (!loading) {
      loading = options
        .load()
        .then((fn) => {
          factory = fn;
          getDefaultEngine()?.requestFrame();
        })
        .catch((error) => {
          console.warn(
            `shooosh: failed to load the WebGPU ${options.label} renderer:`,
            error,
          );
        });
    }
    return null;
  };
}

/**
 * Queue managers until `getDefaultEngine()` exists, then attach each once.
 * `onReady` is typically `(m) => m.attach()`.
 */
export function createPendingAttachQueue<T>(onReady: (item: T) => void) {
  const pending = new Set<T>();
  let pendingRafId = 0;

  const pump = () => {
    if (pendingRafId) return;
    const step = () => {
      pendingRafId = 0;
      if (pending.size === 0) return;
      if (!getDefaultEngine()) {
        pendingRafId = window.requestAnimationFrame(step);
        return;
      }
      const batch = Array.from(pending);
      pending.clear();
      batch.forEach(onReady);
    };
    pendingRafId = window.requestAnimationFrame(step);
  };

  return {
    enqueue(item: T) {
      pending.add(item);
      pump();
    },
    dequeue(item: T) {
      pending.delete(item);
    },
  };
}
