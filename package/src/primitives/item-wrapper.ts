import { ItemManager, type ItemOptions } from "./item";
import type { UniValues } from "../engine/uni";

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