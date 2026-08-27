import { getDefaultEngine } from "./engine";

const WATCH_META = Symbol("webgl.uni.watch");

type Listener = () => void;

export type UniValues = Record<string, number>;

export type UniWatchController = {
  target: UniValues;
  subscribe: (listener: Listener) => () => void;
  set: (next: Partial<UniValues>) => void;
  toFloat32: (maxValues: number) => Float32Array;
};

type WatchMeta = {
  values: Record<string, number>;
  listeners: Set<Listener>;
  controller: UniWatchController;
};

function notifyListeners(meta: WatchMeta) {
  getDefaultEngine()?.requestFrame();
  meta.listeners.forEach((listener) => {
    listener();
  });
}

function getIndexedUniSlot(key: string) {
  const match = /^value(\d+)$/i.exec(key);
  if (!match) return null;
  const slot = Number.parseInt(match[1] ?? "", 10) - 1;
  if (!Number.isFinite(slot) || slot < 0) return null;
  return slot;
}

function defineReactiveKey(target: UniValues, meta: WatchMeta, key: string) {
  if (Object.getOwnPropertyDescriptor(target, key)?.get) return;

  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get() {
      return meta.values[key] ?? 0;
    },
    set(value: unknown) {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      if ((meta.values[key] ?? 0) === value) return;
      meta.values[key] = value;
      notifyListeners(meta);
    },
  });
}

export function ensureWatchableUni(target: UniValues = {}): UniWatchController {
  const existing = (target as UniValues & { [WATCH_META]?: WatchMeta })[WATCH_META];
  if (existing) return existing.controller;

  const values: Record<string, number> = {};
  const listeners = new Set<Listener>();

  Object.keys(target).forEach((key) => {
    const value = target[key];
    values[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  });

  // Pre-allocated reusable output buffer — avoids a Float32Array allocation every frame.
  let float32Cache: Float32Array | null = null;
  let float32CacheSize = 0;

  const meta: WatchMeta = {
    values,
    listeners,
    controller: {
      target,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(next) {
        let changed = false;
        Object.entries(next).forEach(([key, value]) => {
          if (typeof value !== "number" || !Number.isFinite(value)) return;
          if (!(key in values)) {
            values[key] = value;
            defineReactiveKey(target, meta, key);
            changed = true;
            return;
          }
          if (values[key] !== value) {
            values[key] = value;
            changed = true;
          }
        });

        if (changed) {
          notifyListeners(meta);
        }
      },
      toFloat32(maxValues) {
        if (float32Cache === null || float32CacheSize !== maxValues) {
          float32Cache = new Float32Array(maxValues);
          float32CacheSize = maxValues;
        }
        const out = float32Cache;
        out.fill(0);
        const keys = Object.keys(values);
        const consumed = new Set<string>();

        // Deterministic slot mapping for `value1`, `value2`, ... keys.
        for (const key of keys) {
          const slot = getIndexedUniSlot(key);
          if (slot === null || slot >= maxValues) continue;
          out[slot] = values[key] ?? 0;
          consumed.add(key);
        }

        // Fill remaining slots with any other keys in stable order.
        let fallbackIndex = 0;
        for (const key of keys) {
          if (consumed.has(key)) continue;
          while (fallbackIndex < maxValues && out[fallbackIndex] !== 0) {
            fallbackIndex += 1;
          }
          if (fallbackIndex >= maxValues) break;
          out[fallbackIndex] = values[key] ?? 0;
          fallbackIndex += 1;
        }
        return out;
      },
    },
  };

  Object.keys(values).forEach((key) => {
    defineReactiveKey(target, meta, key);
  });

  Object.defineProperty(target, WATCH_META, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: meta,
  });

  return meta.controller;
}
