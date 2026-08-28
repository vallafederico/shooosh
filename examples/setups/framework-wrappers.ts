/**
 * Solid / React lifecycle. Keep the Scene outside the canvas component
 * so HMR does not remount the engine. Pair with a shader from examples/.
 *
 * Docs: docs/site-patterns.md
 */

import {
  createItem,
  createScene,
  type ItemController,
  type Scene,
} from "shooosh"

let scene: Scene | null = null

export async function mountCanvas(canvas: HTMLCanvasElement) {
  if (scene) return scene
  scene = createScene(canvas, {
    autoInit: false,
    dpr: { max: 1.5 },
    onInitError: (error) => console.error("[shooosh]", error),
  })
  await scene.init()
  return scene
}

export function mountItem(
  element: HTMLElement,
  options: Parameters<typeof createItem>[1],
  onItem?: (item: ItemController) => void,
) {
  const item = createItem(element, options)
  onItem?.(item)
  return () => item.destroy()
}

export function unmountCanvas() {
  scene?.destroy()
  scene = null
}
