/** Full scene convenience API. Use createCanvasScene for an optional-feature-free mount. */
import { CanvasScene } from "./canvas-scene"
import type { SceneOptions } from "./dataset"
import { loadTexture, type TextureLoaderResult } from "../loaders/texture-loader"
import { createPostProcessor, type PostProcessor } from "../post/processor"
import { createItem, type CreateItemOptions } from "../primitives/item-wrapper"
import { createObject, type CreateObjectOptions } from "../primitives/object-wrapper"
import type { CreateScreenOptions } from "../primitives/screen-wrapper"
export type { SceneOptions } from "./dataset"

export class Scene extends CanvasScene {
  private postProcessor: PostProcessor | null = null
  private screenTexture: TextureLoaderResult | null = null
  constructor(canvas: HTMLCanvasElement, options: SceneOptions = {}) { super(canvas, options) }
  protected async initExtras() {
    if (this.options.post?.length) {
      this.postProcessor?.destroy()
      this.postProcessor = createPostProcessor()
      for (const preset of this.options.post) {
        if (preset.enabled !== false && preset.type === "custom") this.postProcessor.addFragmentEffect(preset)
      }
    }
  }
  protected async prepareScreen(options: CreateScreenOptions) {
    this.screenTexture?.destroy()
    this.screenTexture = null
    if (options.textureUrl) {
      this.screenTexture = await loadTexture(options.textureUrl, { fit: options.textureFit ?? "cover" })
      options.texture = this.screenTexture
    }
  }
  addItem(element: HTMLElement, options: CreateItemOptions = {}) { return this.retain(createItem(element, options)) }
  addObject(element: HTMLElement | null, options: CreateObjectOptions = {}) { return this.retain(createObject(element, options)) }
  getPostProcessor() { return this.postProcessor }
  protected destroyExtras() {
    this.postProcessor?.destroy()
    this.postProcessor = null
    this.screenTexture?.destroy()
    this.screenTexture = null
  }
}
export function createScene(canvas: HTMLCanvasElement, options: SceneOptions = {}) { return new Scene(canvas, options) }
