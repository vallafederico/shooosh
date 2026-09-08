/** Internal seam for DOM adapters. No global engine changes or fake elements. */
import type { WebGLEngine } from "../engine/engine";
import type { TextureUvTransform } from "../loaders/texture-loader";
import type { ItemClipData } from "./item.utils";

export type ItemIntegration = {
  engine: WebGLEngine;
  geometry: (out: Float32Array) => ItemClipData;
  uv?: () => TextureUvTransform;
  onDraw: () => void;
  onError: (error: unknown) => void;
};
