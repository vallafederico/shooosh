import { ObjectManager, type ObjectOptions } from "./object";
import type { UniValues } from "../engine/uni";

export type CreateObjectOptions = ObjectOptions;
export type ObjectController = WebglObject;

export type CreateObjectHooks = {
  onCreate?: (object: WebglObject) => void;
};

export class WebglObject {
  private manager: ObjectManager;

  constructor(element: HTMLElement | null, options: CreateObjectOptions = {}) {
    this.manager = new ObjectManager(element, options);
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

  setTransform(next: {
    scale?: number;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
  }) {
    this.manager.setTransform(next);
  }

  getTransform() {
    return this.manager.getTransform();
  }
}

export function createObject(
  element: HTMLElement | null,
  options: CreateObjectOptions = {},
  hooks: CreateObjectHooks = {},
) {
  const object = new WebglObject(element, options);
  hooks.onCreate?.(object);
  return object;
}

export { WebglObject as GpuObject };
