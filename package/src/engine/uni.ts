/**
 * Uniform bag — `setUni({ value1, value2, … })` packed into 16 floats.
 *
 * How to use (site):
 *   item.setUni({ value1: t })  →  WGSL `uUni.values0.x`  /  GLSL `uUni[0].x`
 * Named uniforms are task 03. Until then keep the valueN packing.
 *
 * A write marks the settle loop dirty. Skip setUni when nothing changed.
 *
 * Docs: docs/shader-contract.md
 */

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

  // Cached key → slot assignment. Rebuilt only when a key is added (set()) or
  // maxValues changes, so the per-frame toFloat32 path allocates nothing and
  // slots stay stable regardless of the values passing through them.
  let slotMapCache: Array<{ key: string; slot: number }> | null = null;
  let slotMapMaxValues = 0;

  const buildSlotMap = (maxValues: number) => {
    const keys = Object.keys(values);
    const occupied = new Array<boolean>(maxValues).fill(false);
    const consumed = new Set<string>();
    const map: Array<{ key: string; slot: number }> = [];

    // Deterministic slot mapping for `value1`, `value2`, ... keys.
    for (const key of keys) {
      const slot = getIndexedUniSlot(key);
      if (slot === null || slot >= maxValues) continue;
      occupied[slot] = true;
      consumed.add(key);
      map.push({ key, slot });
    }

    // Fill remaining slots with any other keys in stable order.
    let fallbackIndex = 0;
    for (const key of keys) {
      if (consumed.has(key)) continue;
      while (fallbackIndex < maxValues && occupied[fallbackIndex]) {
        fallbackIndex += 1;
      }
      if (fallbackIndex >= maxValues) break;
      occupied[fallbackIndex] = true;
      map.push({ key, slot: fallbackIndex });
      fallbackIndex += 1;
    }
    return map;
  };

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
            slotMapCache = null;
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
        if (slotMapCache === null || slotMapMaxValues !== maxValues) {
          slotMapCache = buildSlotMap(maxValues);
          slotMapMaxValues = maxValues;
        }
        for (const entry of slotMapCache) {
          out[entry.slot] = values[entry.key] ?? 0;
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
