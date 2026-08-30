/**
 * createScene — own a <canvas> (app shell, section hero, SSR-safe init).
 *
 * How to use:
 *   const scene = createScene(canvas, {
 *     autoInit: false,            // SSR: don't touch GPU in the constructor
 *     dpr: { max: 1.5 },
 *     screen: { shaders: { fragment: wgsl } },
 *   })
 *   await scene.init()
 *
 * After init, createItem / createParticles / post use the default engine.
 * Teardown: scene.destroy(). Page-behind without a scene object: acquireLayer.
 * Compute: createCompute(engine) after init — sims / fluids live in examples/.
 *
 * Docs: docs/getting-started.md · docs/site-patterns.md · skill shooosh-site
 */

import {
  getDefaultEngine,
  initEngine,
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
      this.init().catch((error) => {
        this.options.onInitError?.(error);
      });
    }
  }

  /** Idempotent: concurrent / repeat calls share the same init promise. */
  init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const promise = this.runInit();
    this.initPromise = promise;
    // A failed init is not memoized, so a later call can retry.
    promise.catch(() => {
      if (this.initPromise === promise) {
        this.initPromise = null;
      }
    });
    return promise;
  }

  private async runInit() {
    if (!this.canvas) {
      throw new Error("Scene requires a canvas element.");
    }

    const engineOptions: EngineOptions = {
      dpr: this.options.dpr,
      clearColor: this.options.clearColor,
      backend: this.options.backend,
    };

    const engine = await initEngine(this.canvas, engineOptions);
    if (!this.canvas) {
      // Scene was destroyed while init was in flight — don't leak the engine.
      engine.destroy();
      return;
    }
    this.engine = engine;

    if (this.options.autoStart) {
      this.engine.start();
    }

    if (this.options.post?.length) {
      this.postProcessor?.destroy();
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

      if (preset.type === "custom") {
        this.postProcessor.addFragmentEffect(preset);
      }
      // Named bloom/bw/noise presets were removed — pass applyEffect GLSL via custom
      // (see examples/post-shaders.ts).
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

    // Destroy this scene's own engine (default or not) — engine.destroy()
    // already clears the default engine when it matches.
    const activeEngine = this.engine;
    activeEngine?.destroy();

    if (this.options.debug && activeEngine && window.__webglEngine === activeEngine) {
      delete window.__webglEngine;
    }

    this.engine = null;
    this.canvas = null;
    this.initPromise = null;
  }
}

export function createScene(
  canvas: HTMLCanvasElement,
  options: SceneOptions = {},
) {
  return new Scene(canvas, options);
}
