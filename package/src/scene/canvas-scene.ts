/**
 * createScene — own a <canvas> (app shell, section hero, SSR-safe init).
 *
 * How to use:
 *   const scene = createScene(canvas, {
 *     autoInit: false,            // SSR: don't touch GPU in the constructor
 *     dpr: { max: 1.5 },
 *     screen: { shaders },
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

/** Lightweight owned-canvas scene; own optional resources with retain(). */
export type CanvasSceneOptions = Omit<SceneOptions, "post" | "screen"> & { screen?: Omit<CreateScreenOptions, "textureUrl"> }
export class CanvasScene {
  protected canvas: HTMLCanvasElement | null = null;
  protected engine: WebGLEngine | null = null;
  private screen: ScreenController | null = null;
  protected options: Required<
    Pick<SceneOptions, "autoStart" | "autoInit" | "debug">
  > &
    SceneOptions;
  private initPromise: Promise<void> | null = null;

  constructor(canvas: HTMLCanvasElement, options: CanvasSceneOptions = {}) {
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

    await this.initExtras()
    if (!this.canvas) { this.destroyExtras(); return }

    if (this.options.screen) {
      const screenOptions: CreateScreenOptions = {
        ...(this.options.screen ?? { subdivs: 1 }),
      };
      await this.prepareScreen(screenOptions)
      if (!this.canvas) { this.destroyExtras(); return }

      this.screen?.destroy();
      this.screen = createScreen(screenOptions);
    }

    if (this.options.debug) {
      window.__webglEngine = this.engine;
      window.__webglScreen = this.screen ?? undefined;
    }
  }

  private resources = new Set<{ destroy(): void }>()
  /** Transfer cleanup ownership to this scene (post, items, meshes, textures…). */
  retain<T extends { destroy(): void }>(resource: T): T {
    if (!this.canvas) resource.destroy()
    else this.resources.add(resource)
    return resource
  }
  protected async initExtras(): Promise<void> {}
  protected async prepareScreen(_options: CreateScreenOptions): Promise<void> {}
  protected destroyExtras(): void {}

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
    this.resources.forEach(resource => resource.destroy())
    this.resources.clear()
    this.destroyExtras()

    if (this.screen) {
      const currentScreen = this.screen;
      currentScreen.destroy();
      this.screen = null;

      if (this.options.debug && window.__webglScreen === currentScreen) {
        delete window.__webglScreen;
      }
    }


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

export function createCanvasScene(
  canvas: HTMLCanvasElement,
  options: CanvasSceneOptions = {},
) {
  return new CanvasScene(canvas, options);
}
