/**
 * parseSceneDataset — read `data-*` on a canvas into SceneOptions.
 *
 * How to use (Webflow / IIFE):
 *   createScene(canvas, parseSceneDataset(canvas.dataset))
 *
 * Docs: docs/site-patterns.md
 */

import type { EngineOptions } from "../engine/engine";
import type { CreateScreenOptions } from "../primitives/screen-wrapper";
import type { SceneEffectPreset } from "../post/effects";

export type SceneOptions = {
  /** Start the render loop after init. Default true. */
  autoStart?: boolean;
  /** Initialize immediately in the constructor. Default true. */
  autoInit?: boolean;
  /** Expose engine/screen on window for debugging. Default false. */
  debug?: boolean;
  /** Optional fullscreen background plane. */
  screen?: CreateScreenOptions;
  /**
   * Post stack (WebGL2). Prefer createPostProcessor().addFragmentEffect with
   * example-owned applyEffect GLSL — see examples/post-shaders.ts.
   * effects.custom({ fragmentShader }) is thin sugar for createScene({ post }).
   */
  post?: SceneEffectPreset[];
  /** Engine options passed to createEngine. */
  dpr?: EngineOptions["dpr"];
  clearColor?: EngineOptions["clearColor"];
  /** Default `"auto"` probes WebGPU first, then WebGL2. */
  backend?: EngineOptions["backend"];
  onInitError?: (error: unknown) => void;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return value === "true" || value === "1";
}

function parseNumber(value: string | undefined) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Map data-module dataset attributes to SceneOptions.
 *
 * Supported keys:
 * - data-debug
 * - data-auto-start
 * - data-screen-subdivs
 * - data-dpr-max
 */
export function parseSceneDataset(dataset: DOMStringMap): Partial<SceneOptions> {
  const subdivs = parseNumber(dataset.screenSubdivs);
  return {
    debug: parseBoolean(dataset.debug, false),
    autoStart: parseBoolean(dataset.autoStart, true),
    dpr: {
      max: parseNumber(dataset.dprMax),
    },
    screen: subdivs
      ? {
          subdivs,
        }
      : undefined,
  };
}
