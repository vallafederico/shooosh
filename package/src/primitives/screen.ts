import {
  initFullscreenPlane,
  type FullscreenPlaneController,
  type FullscreenPlaneInitOptions,
  type FullscreenPlaneShaders,
  type FullscreenPlaneTexture,
} from "./plane";
import type { TextureFitMode } from "../loaders/texture-loader";
import type { UniValues } from "../engine/uni";

export type ScreenSubdivs =
  | number
  | {
      x?: number;
      y?: number;
    };

export type InitScreenOptions = {
  subdivs?: ScreenSubdivs;
  layer?: number;
  debugUv?: boolean;
  shaders?: FullscreenPlaneShaders;
  uni?: UniValues;
  texture?: FullscreenPlaneTexture | null;
  textureFit?: TextureFitMode;
  onFrame?: (
    screen: ScreenSurfaceController,
    frame: Parameters<NonNullable<FullscreenPlaneInitOptions["onFrame"]>>[1],
  ) => ScreenSurfaceController | void;
};

export type ScreenSurfaceController = {
  render: () => void;
  configure: (next: Partial<InitScreenOptions>) => void;
  destroy: () => void;
  getPlane: () => FullscreenPlaneController;
  setUni: (next: Partial<UniValues>) => void;
  getUni: () => UniValues;
};

function resolveSubdivs(subdivs: ScreenSubdivs | undefined) {
  if (typeof subdivs === "number") {
    return {
      x: subdivs,
      y: subdivs,
    };
  }

  return {
    x: subdivs?.x ?? 1,
    y: subdivs?.y ?? 1,
  };
}

function toPlaneOptions(options: InitScreenOptions): FullscreenPlaneInitOptions {
  const subdivs = resolveSubdivs(options.subdivs);
  return {
    subdivisionsX: subdivs.x,
    subdivisionsY: subdivs.y,
    renderLayer: options.layer ?? -100,
    debugUv: options.debugUv ?? false,
    shaders: options.shaders,
    uni: options.uni,
    texture: options.texture ?? null,
    textureFit: options.textureFit ?? "cover",
  };
}

export function initScreen(options: InitScreenOptions = {}): ScreenSurfaceController {
  let controller: ScreenSurfaceController | null = null;
  const plane = initFullscreenPlane({
    ...toPlaneOptions(options),
    onFrame: (_plane, frame) => {
      if (controller) {
        options.onFrame?.(controller, frame);
      }
    },
  });

  controller = {
    render: () => plane.render(),
    configure(next) {
      const merged: InitScreenOptions = {
        ...options,
        ...next,
      };
      options = merged;
      plane.configure(toPlaneOptions(merged));
    },
    destroy: () => plane.destroy(),
    getPlane: () => plane,
    setUni: (next) => plane.setUni(next),
    getUni: () => plane.getUni(),
  };
  return controller;
}
