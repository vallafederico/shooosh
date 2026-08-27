/**
 * Framework wrapper shape — aiuis Canvas + GlItem, same idea in React.
 *
 * When: Solid / React / Astro island owns the GPU canvas.
 * Do not remount the engine on HMR — keep the Scene handle outside the
 * canvas component (a store / module singleton).
 *
 * 1. Root canvas: autoInit false, await init(), set loaded.
 * 2. Item: createItem(ref) on mount, destroy() on cleanup.
 * 3. Optional onItem(item) so the parent can setUni from scroll / a slider.
 *
 * This file is the lifecycle, not a Solid/React dependency.
 *
 * Docs: docs/site-patterns.md · skill shooosh-site · skill shooosh-item
 */

import {
  createItem,
  createScene,
  type ItemController,
  type Scene,
} from "shooosh"

/** Module singleton so HMR does not create a second engine. */
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
