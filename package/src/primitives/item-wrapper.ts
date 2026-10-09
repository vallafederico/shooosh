/**
 * createItem — DOM-tracked quad. Public entry for page elements.
 *
 * How to use:
 *   const item = createItem(el, {
 *     shaders: { fragment: wgsl },   // fn fsMain() -> vec4f
 *     onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *   })
 *   item.destroy()
 *
 * Safe to call before the engine exists — queues until getDefaultEngine().
 * The element must be transparent where the GPU should show.
 * `vUv` is top-origin on the **element**, not the page.
 *
 * Docs: docs/site-patterns.md · skill shooosh-item
 *
 * With a texture, sample `fitUv(vUv)` for CSS-like cover/contain (value5–8).
 * Extra textures go in named `maps` (`{ uDepth: null }`), filled when they
 * load with `item.setMap("uDepth", tex)`.
 */

import { ItemManager, type ItemOptions } from "./item";
import type { UniValues } from "../engine/uni";
import type { FullscreenPlaneTexture } from "./plane";

export type CreateItemOptions = ItemOptions;
export type ItemController = Item;

export type CreateItemHooks = {
  onCreate?: (item: Item) => void;
};

export class Item {
  private manager: ItemManager;

  constructor(element: HTMLElement, options: CreateItemOptions = {}) {
    this.manager = new ItemManager(element, options);
  }

  destroy() {
    this.manager.destroy();
  }

  setUni(next: Partial<UniValues>) {
    this.manager.setUni(next);
  }

  getUni() {
    return this.manager.getUni();
  }

  /** Fill or empty a map slot declared in `maps` at creation (next frame, no recompile). */
  setMap(name: string, texture: FullscreenPlaneTexture | null) {
    this.manager.setMap(name, texture);
  }
}

export function createItem(
  element: HTMLElement,
  options: CreateItemOptions = {},
  hooks: CreateItemHooks = {},
) {
  const item = new Item(element, options);
  hooks.onCreate?.(item);
  return item;
}