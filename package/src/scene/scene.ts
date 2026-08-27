import {
  getDefaultEngine,
  initEngine,
  setDefaultEngine,
  type EngineOptions,
  type WebGLEngine,
} from "../engine/engine";
import { loadTexture, type TextureLoaderResult } from "../loaders/texture-loader";
import {
  createPostProcessor,
  type PostProcessor,
} from "../post/processor";
import type { SceneEffectPreset } from "../post/effects";
import {
  createItem,
  type ItemController,
  type CreateItemOptions,
} from "../primitives/item-wrapper";
import {
  createObject,
  type ObjectController,
  type CreateObjectOptions,
} from "../primitives/object-wrapper";
import {
  createScreen,
  type CreateScreenOptions,
  type ScreenController,
} from "../primitives/screen-wrapper";
import type { SceneOptions } from "./dataset";

declare global {
  interface Window {
    __webglEngine?: WebGLEngine;
    __webglScreen?: ScreenController;
  }
}

export type { SceneOptions } from "./dataset";

export class Scene {
  private canvas: HTMLCanvasElement | null = null;
  private engine: WebGLEngine | null = null;
  private screen: ScreenController | null = null;
  private postProcessor: PostProcessor | null = null;
  private items: ItemController[] = [];
  private objects: ObjectController[] = [];
  private options: Required<
    Pick<SceneOptions, "autoStart" | "autoInit" | "debug">
  > &
    SceneOptions;
  private initPromise: Promise<void> | null = null;
  private screenTexture: TextureLoaderResult | null = null;

  constructor(canvas: HTMLCanvasElement, options: SceneOptions = {}) {
    this.canvas = canvas;
    this.options = {
      autoStart: options.autoStart ?? true,
      autoInit: options.autoInit ?? true,
      debug: options.debug ?? false,
      ...options,
    };

    if (this.options.autoInit) {
      this.initPromise = this.init().catch((error) => {
        this.options.onInitError?.(error);
      });
    }
  }

  async init() {
    if (!this.canvas) {
      throw new Error("Scene requires a canvas element.");
    }

    const engineOptions: EngineOptions = {
      dpr: this.options.dpr,
      clearColor: this.options.clearColor,
    };

    this.engine = await initEngine(this.canvas, engineOptions);

    if (this.options.autoStart) {
      this.engine.start();
    }

    if (this.options.post?.length) {
      this.postProcessor = createPostProcessor();
      this.applyPostPresets(this.options.post);
    }

    this.screenTexture?.destroy();
    this.screenTexture = null;

    if (this.options.screen) {
      const screenOptions: CreateScreenOptions = {
        ...(this.options.screen ?? { subdivs: 1 }),
      };
      if (screenOptions.textureUrl) {
        this.screenTexture = await loadTexture(screenOptions.textureUrl, {
          fit: screenOptions.textureFit ?? "cover",
        });
        screenOptions.texture = this.screenTexture;
      }

      this.screen?.destroy();
      this.screen = createScreen(screenOptions);
    }

    if (this.options.debug) {
      window.__webglEngine = this.engine;
      window.__webglScreen = this.screen ?? undefined;
    }
  }

  private applyPostPresets(presets: SceneEffectPreset[]) {
    if (!this.postProcessor) return;

    for (const preset of presets) {
      if (preset.enabled === false) continue;

      switch (preset.type) {
        case "bloom":
          this.postProcessor.addBloomEffect(preset);
          break;
        case "bw":
          this.postProcessor.addBlackAndWhiteEffect(preset);
          break;
        case "noise":
          this.postProcessor.addNoiseEffect(preset);
          break;
        case "custom":
          this.postProcessor.addFragmentEffect(preset);
          break;
      }
    }
  }

  /** Add a DOM-tracked 2D quad. Requires init to have completed. */
  addItem(element: HTMLElement, options: CreateItemOptions = {}) {
    const item = createItem(element, options);
    this.items.push(item);
    return item;
  }

  /** Add a 3D object (DOM-tracked or screen-placed when element is null). */
  addObject(element: HTMLElement | null, options: CreateObjectOptions = {}) {
    const object = createObject(element, options);
    this.objects.push(object);
    return object;
  }

  getPostProcessor() {
    return this.postProcessor;
  }

  configureScreen(next: Partial<CreateScreenOptions>) {
    if (this.screen) {
      this.screen.configure(next);
      return;
    }

    this.options.screen = {
      ...this.options.screen,
      ...next,
    };
  }

  getEngine() {
    return this.engine ?? getDefaultEngine();
  }

  getScreen() {
    return this.screen;
  }

  getInitPromise() {
    return this.initPromise;
  }

  destroy() {
    this.items.forEach((item) => item.destroy());
    this.items = [];
    this.objects.forEach((object) => object.destroy());
    this.objects = [];

    this.postProcessor?.destroy();
    this.postProcessor = null;

    if (this.screen) {
      const currentScreen = this.screen;
      currentScreen.destroy();
      this.screen = null;

      if (this.options.debug && window.__webglScreen === currentScreen) {
        delete window.__webglScreen;
      }
    }

    this.screenTexture?.destroy();
    this.screenTexture = null;

    const activeEngine = getDefaultEngine();
    if (this.canvas && activeEngine?.canvas === this.canvas) {
      activeEngine.destroy();
      setDefaultEngine(null);

      if (this.options.debug && window.__webglEngine === activeEngine) {
        delete window.__webglEngine;
      }
    }

    this.engine = null;
    this.canvas = null;
  }
}

export function createScene(
  canvas: HTMLCanvasElement,
  options: SceneOptions = {},
) {
  return new Scene(canvas, options);
}
