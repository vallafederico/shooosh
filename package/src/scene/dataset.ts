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
  /** Post-processing effect presets applied in order. */
  post?: SceneEffectPreset[];
  /** Engine options passed to createEngine. */
  dpr?: EngineOptions["dpr"];
  clearColor?: EngineOptions["clearColor"];
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
