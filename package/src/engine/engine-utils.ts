/**
 * Canvas clear color + DPR helpers. Shared by both engines.
 *
 * How to use: createEngine({ clearColor, dpr: { max: 1.5 } }).
 * Marketing pages cap DPR at 1.5–2. Match clearColor to the page paper
 * if the canvas is opaque.
 *
 * Docs: docs/site-patterns.md
 */

export type ClearColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function clampColorChannel(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function resolveClearColor(partial?: Partial<ClearColor>): ClearColor {
  return {
    r: partial?.r ?? 0,
    g: partial?.g ?? 0,
    b: partial?.b ?? 0,
    a: partial?.a ?? 0,
  };
}

export function applyCanvasBackdrop(canvas: HTMLCanvasElement, color: ClearColor) {
  canvas.style.backgroundColor =
    color.a > 0
      ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
      : "transparent";
}

export function getEffectiveDevicePixelRatio(max?: number) {
  const dpr = window.devicePixelRatio;
  const resolved = !Number.isFinite(dpr) || (dpr ?? 0) <= 0 ? 1 : (dpr as number);
  if (typeof max === "number" && max > 0) {
    return Math.min(resolved, max);
  }
  return resolved;
}

/**
 * CSS size × effective DPR → backing-store size. Reads getBoundingClientRect,
 * which forces layout — call only when a canvas size tracker says it changed.
 */
export function computeCanvasSize(canvas: HTMLCanvasElement, maxDpr?: number) {
  const ratio = getEffectiveDevicePixelRatio(maxDpr);
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : canvas.clientWidth;
  const cssHeight = rect.height > 0 ? rect.height : canvas.clientHeight;
  return {
    ratio,
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}

export type CanvasSizeTracker = {
  /** Cheap per-frame check: true when the canvas size or DPR may have changed. */
  needsResize: () => boolean;
  markDirty: () => void;
  /** Record the applied DPR after a resize so needsResize goes quiet. */
  markClean: (ratio: number) => void;
  destroy: () => void;
};

/**
 * Watches a canvas for size changes (ResizeObserver + window resize for DPR /
 * zoom) so engines can skip the per-frame getBoundingClientRect forced layout.
 */
export function createCanvasSizeTracker(
  canvas: HTMLCanvasElement,
  getRatio: () => number,
  onDirty?: () => void,
): CanvasSizeTracker {
  let dirty = true;
  let cleanRatio = 0;

  const markDirty = () => {
    dirty = true;
    onDirty?.();
  };

  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(markDirty) : null;
  observer?.observe(canvas);
  window.addEventListener("resize", markDirty);

  return {
    needsResize: () => dirty || getRatio() !== cleanRatio,
    markDirty,
    markClean: (ratio) => {
      dirty = false;
      cleanRatio = ratio;
    },
    destroy: () => {
      observer?.disconnect();
      window.removeEventListener("resize", markDirty);
    },
  };
}

export function mergeClearColor(
  current: ClearColor,
  next: Partial<ClearColor>,
): ClearColor {
  return {
    r: clampColorChannel(next.r ?? current.r),
    g: clampColorChannel(next.g ?? current.g),
    b: clampColorChannel(next.b ?? current.b),
    a: clampColorChannel(next.a ?? current.a),
  };
}

export type SubscriberRegistry<RenderCb, PostCb> = {
  subscribeRender: (callback: RenderCb, options?: { layer?: number }) => () => void;
  subscribePostRender: (callback: PostCb) => () => void;
  /** Sorted by layer then insertion order; cache rebuilt lazily. */
  getSortedRenderSubscribers: () => Array<{ callback: RenderCb }>;
  hasPostSubscribers: () => boolean;
  forEachPost: (fn: (callback: PostCb) => void) => void;
  clear: () => void;
};

/**
 * Render/post subscriber bookkeeping shared by both engines. `onSubscribe`
 * (the settle loop's requestFrame) fires whenever a subscriber is added.
 */
export function createSubscriberRegistry<RenderCb, PostCb>(
  onSubscribe: () => void,
): SubscriberRegistry<RenderCb, PostCb> {
  type Entry = { id: number; layer: number; order: number; callback: RenderCb };

  let nextId = 1;
  let nextOrder = 0;
  const renderSubscribers = new Map<number, Entry>();
  const postRenderSubscribers = new Set<PostCb>();
  let sortedCache: Entry[] | null = null;

  return {
    subscribeRender: (callback, options = {}) => {
      const id = nextId++;
      const layer = Number.isFinite(options.layer) ? (options.layer as number) : 0;
      renderSubscribers.set(id, { id, layer, order: nextOrder++, callback });
      sortedCache = null;
      onSubscribe();
      return () => {
        renderSubscribers.delete(id);
        sortedCache = null;
      };
    },
    subscribePostRender: (callback) => {
      postRenderSubscribers.add(callback);
      onSubscribe();
      return () => {
        postRenderSubscribers.delete(callback);
      };
    },
    getSortedRenderSubscribers: () => {
      if (!sortedCache) {
        sortedCache = Array.from(renderSubscribers.values()).sort((a, b) => {
          if (a.layer !== b.layer) return a.layer - b.layer;
          return a.order - b.order;
        });
      }
      return sortedCache;
    },
    hasPostSubscribers: () => postRenderSubscribers.size > 0,
    forEachPost: (fn) => postRenderSubscribers.forEach(fn),
    clear: () => {
      renderSubscribers.clear();
      postRenderSubscribers.clear();
      sortedCache = null;
    },
  };
}

/**
 * ensureSceneTarget pattern shared by both engines: recreate the offscreen
 * target when the canvas backing-store size no longer matches it.
 */
export function ensureSizedTarget<
  T extends { width: number; height: number; destroy: () => void },
>(
  canvas: HTMLCanvasElement,
  target: T | null,
  create: (width: number, height: number) => T,
): T {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  if (target && target.width === width && target.height === height) {
    return target;
  }
  target?.destroy();
  return create(width, height);
}
