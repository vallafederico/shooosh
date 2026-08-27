import {
  initScreen,
  type InitScreenOptions,
  type ScreenSurfaceController,
} from "./screen";
import type { UniValues } from "../engine/uni";

export type CreateScreenOptions = InitScreenOptions & {
  textureUrl?: string;
};
export type ScreenController = Screen;

export type CreateScreenHooks = {
  onCreate?: (screen: Screen) => void;
};

function resolveScreenOptions(options: CreateScreenOptions): CreateScreenOptions {
  return {
    subdivs: options.subdivs ?? 1,
    layer: options.layer ?? -100,
    debugUv: options.debugUv ?? false,
    texture: options.texture ?? null,
    textureFit: options.textureFit ?? "cover",
    textureUrl: options.textureUrl,
    onFrame: options.onFrame,
    uni: {
      value1: 1,
      ...(options.uni ?? {}),
    },
    shaders: options.shaders,
  };
}

export class Screen {
  private surface: ScreenSurfaceController;

  constructor(options: CreateScreenOptions = {}) {
    this.surface = initScreen(resolveScreenOptions(options));
  }

  render() {
    this.surface.render();
  }

  configure(next: Partial<CreateScreenOptions>) {
    this.surface.configure(next);
  }

  destroy() {
    this.surface.destroy();
  }

  getPlane() {
    return this.surface.getPlane();
  }

  setUni(next: Partial<UniValues>) {
    this.surface.setUni(next);
  }

  getUni() {
    return this.surface.getUni();
  }
}

export function createScreen(
  options: CreateScreenOptions = {},
  hooks: CreateScreenHooks = {},
) {
  const screen = new Screen(options);
  hooks.onCreate?.(screen);
  return screen;
}
