/**
 * loadTexture — image → GPU texture for createItem / createScreen / MSDF.
 *
 * How to use:
 *   const tex = await loadTexture(url, { fit: "cover" })
 *   createItem(el, { texture: tex, shaders: { fragment: wgsl } })
 *   // In fsMain: textureSample(uTexture, uSampler, fitUv(vUv))
 *   // vUv is top-origin on both backends — default upload does not flip.
 *   // Env/matcap: loadTexture(canvas) (same; no flip needed for dir.xy sampling)
 *   // Or manually: applyTextureUv / textureFitToUni + setUni({ value5…8 })
 *
 * Runs on both backends. The upload itself lives in a backend chunk
 * (texture-upload-webgl2 / texture-upload-webgpu), loaded on demand.
 * Needs a default engine (createScene or acquireLayer).
 * `handle.texture` is opaque — narrow on `handle.backend` before using it.
 * Bake SDF icons with shooosh/msdf, then load the PNG here.
 *
 * Docs: docs/msdf.md · docs/api.md
 */

import { getDefaultEngine } from "../engine/engine";
import type { RendererKind } from "../engine/capabilities";

export type TextureSource =
  | string
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas;

/**
 * Uploaded texture. `texture` is a WebGLTexture or a GPUTexture — check
 * `backend` first. `gl` exists on the WebGL2 path only.
 */
export type TextureHandle = {
  backend: RendererKind;
  texture: unknown;
  createView: () => unknown;
  destroy: () => void;
  width: number;
  height: number;
  gl?: WebGL2RenderingContext;
};

/** What a backend upload module returns to the loader. */
export type TextureUpload = {
  texture: TextureHandle;
  view: unknown;
  sampler: unknown | null;
};

/** Backend-agnostic subset of TextureLoaderOptions an upload module needs. */
export type TextureUploadOptions = {
  label?: string;
  format?: string;
  usage?: number;
  createSampler?: boolean;
  /**
   * Vertical flip on upload. Default `false` on both backends — `vUv` is
   * top-origin, so canvas/image row 0 maps to texture t=0 without a flip.
   * Pass `{ flipY: true }` only for legacy bottom-origin sampling.
   *
   * The flip happens at decode time (`imageOrientation: "flipY"`) or on the
   * WebGPU copy (`copyExternalImageToTexture`). Caller-supplied ImageBitmaps
   * are re-wrapped through `createImageBitmap` when a flip is requested.
   */
  flipY?: boolean;
  sampler?: {
    magFilter?: "linear" | "nearest";
    minFilter?: "linear" | "nearest";
    /**
     * Enables mipmap generation on both backends. WebGL2 uses `generateMipmap`
     * + a `*_MIPMAP_*` min filter; WebGPU allocates the full mip chain and
     * renders it with a cached blit pipeline (needs the default
     * TEXTURE_BINDING | RENDER_ATTACHMENT usage — a custom `usage` missing
     * either keeps the texture single-level, warned once).
     */
    mipmapFilter?: "linear" | "nearest";
    addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
    addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  };
};

export type TextureLoaderResult = {
  texture: TextureHandle;
  view: unknown;
  sampler: unknown | null;
  width: number;
  height: number;
  aspect: number;
  fit: TextureFitMode;
  getUvTransform: (
    targetWidth: number,
    targetHeight: number,
    fit?: TextureFitMode,
  ) => {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  };
  destroy: () => void;
};

export type TextureFitMode = "cover" | "contain" | "stretch";

export type TextureLoaderOptions = TextureUploadOptions & {
  waitForEngine?: boolean;
  waitTimeoutMs?: number;
  fit?: TextureFitMode;
};

export type TextureUvTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export type PlaneSizeFromTextureOptions = {
  width?: number;
  height?: number;
};

async function waitForEngineController(timeoutMs: number) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const webgl = getDefaultEngine();
    if (webgl) return webgl;
    // rAF stops firing in hidden tabs — race it with a timer so the timeout
    // above still elapses instead of hanging forever in a background tab.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 100);
      window.requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return null;
}

async function decodeImageFromUrl(url: string, bitmapOptions: ImageBitmapOptions) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch texture "${url}" (${response.status}).`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob, bitmapOptions);
}

async function decodeImageFromElement(
  image: HTMLImageElement,
  bitmapOptions: ImageBitmapOptions,
) {
  if (
    !image.complete ||
    image.naturalWidth === 0 ||
    image.naturalHeight === 0
  ) {
    await image.decode();
  }
  return createImageBitmap(image, bitmapOptions);
}

let warnedBitmapFlip = false;

/**
 * Decode to an ImageBitmap, optionally flipping Y and always premultiplying
 * alpha so both backends match the library's premultiplied-alpha blending.
 * `owned` is true when the loader created the bitmap (and may close it after
 * upload); a caller-supplied ImageBitmap that needs no flip is used as-is and
 * never closed.
 */
async function toImageBitmap(
  source: TextureSource,
  flipY: boolean,
): Promise<{ bitmap: ImageBitmap; owned: boolean }> {
  const bitmapOptions: ImageBitmapOptions = {
    premultiplyAlpha: "premultiply",
    ...(flipY ? { imageOrientation: "flipY" as const } : {}),
  };
  if (typeof source === "string") {
    return { bitmap: await decodeImageFromUrl(source, bitmapOptions), owned: true };
  }
  if (source instanceof ImageBitmap) {
    if (!flipY) return { bitmap: source, owned: false };
    // A finished ImageBitmap cannot be re-oriented in place; re-wrap it through
    // createImageBitmap. If the platform cannot, degrade to the unflipped
    // bitmap instead of failing the load.
    try {
      return { bitmap: await createImageBitmap(source, bitmapOptions), owned: true };
    } catch {
      if (!warnedBitmapFlip) {
        warnedBitmapFlip = true;
        console.warn(
          "loadTexture: could not flip a caller-supplied ImageBitmap on this platform; uploading unflipped. Pass the original image/blob, or { flipY: false }.",
        );
      }
      return { bitmap: source, owned: false };
    }
  }
  if (source instanceof HTMLImageElement) {
    return { bitmap: await decodeImageFromElement(source, bitmapOptions), owned: true };
  }
  return { bitmap: await createImageBitmap(source, bitmapOptions), owned: true };
}

export function resolveTextureUvTransform(
  textureAspect: number,
  targetAspect: number,
  fit: TextureFitMode = "cover",
): TextureUvTransform {
  const safeTextureAspect = Math.max(0.0001, textureAspect);
  const safeTargetAspect = Math.max(0.0001, targetAspect);
  if (fit === "stretch") {
    return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  }

  const targetWider = safeTargetAspect > safeTextureAspect;
  if (fit === "cover") {
    if (targetWider) {
      const scaleY = safeTextureAspect / safeTargetAspect;
      return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) * 0.5 };
    }
    const scaleX = safeTargetAspect / safeTextureAspect;
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) * 0.5, offsetY: 0 };
  }

  // contain
  if (targetWider) {
    const scaleX = safeTargetAspect / safeTextureAspect;
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) * 0.5, offsetY: 0 };
  }
  const scaleY = safeTextureAspect / safeTargetAspect;
  return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) * 0.5 };
}

/** Apply a cover/contain transform to a UV (same math as shader `fitUv`). */
export function applyTextureUv(
  uv: { x: number; y: number },
  transform: TextureUvTransform,
) {
  return {
    x: uv.x * transform.scaleX + transform.offsetX,
    y: uv.y * transform.scaleY + transform.offsetY,
  };
}

/**
 * Pack a fit transform into value5–8 (`uUni.values1` / `uUni[1]`).
 * Planes and items write these automatically when a texture is bound.
 */
export function textureFitToUni(transform: TextureUvTransform) {
  return {
    value5: transform.scaleX,
    value6: transform.scaleY,
    value7: transform.offsetX,
    value8: transform.offsetY,
  };
}

export function resolvePlaneSizeFromTexture(
  textureWidth: number,
  textureHeight: number,
  options: PlaneSizeFromTextureOptions = {},
) {
  const aspect = Math.max(0.0001, textureWidth / Math.max(1, textureHeight));
  if (typeof options.width === "number" && typeof options.height === "number") {
    return { width: options.width, height: options.height };
  }
  if (typeof options.width === "number") {
    return { width: options.width, height: options.width / aspect };
  }
  if (typeof options.height === "number") {
    return { width: options.height * aspect, height: options.height };
  }
  return {
    width: textureWidth,
    height: textureHeight,
  };
}

export class TextureLoader {
  static async load(
    source: TextureSource,
    options: TextureLoaderOptions = {},
  ): Promise<TextureLoaderResult> {
    const waitForEngine = options.waitForEngine ?? true;
    const timeoutMs = options.waitTimeoutMs ?? 10000;
    const webglController =
      getDefaultEngine() ??
      (waitForEngine ? await waitForEngineController(timeoutMs) : null);
    if (!webglController) {
      throw new Error(
        "WebGL is not initialized yet. Call createScene() or initEngine() before loading textures.",
      );
    }

    // Top-origin vUv on both backends — no flip unless the caller opts in.
    // (Older WebGL2 upload used UNPACK_FLIP_Y, but that is ignored for
    // ImageBitmap sources, so the effective default was always unflipped.)
    const wantsDecodeFlip = options.flipY === true;
    const { bitmap, owned } = await toImageBitmap(source, wantsDecodeFlip);
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);

    let upload: TextureUpload;
    if (webglController.backend === "webgpu") {
      const { uploadWebGpuTexture } = await import("./texture-upload-webgpu");
      upload = uploadWebGpuTexture(webglController, bitmap, options);
    } else {
      const gl = webglController.gl;
      if (!gl) {
        throw new Error(
          "loadTexture needs an initialized backend. Call createScene() or initEngine() first.",
        );
      }
      const { uploadWebGl2Texture } = await import("./texture-upload-webgl2");
      upload = uploadWebGl2Texture(gl, bitmap, options);
    }

    // Both upload paths copy the pixels synchronously, so the decoded bitmap
    // can be released right away — but never close a caller-owned ImageBitmap.
    if (owned) {
      bitmap.close();
    }

    const { texture, view, sampler } = upload;
    const aspect = width / Math.max(1, height);
    const fit = options.fit ?? "cover";

    return {
      texture,
      view,
      sampler,
      width,
      height,
      aspect,
      fit,
      getUvTransform(targetWidth, targetHeight, nextFit = fit) {
        const targetAspect = targetWidth / Math.max(1, targetHeight);
        return resolveTextureUvTransform(aspect, targetAspect, nextFit);
      },
      destroy() {
        texture.destroy();
      },
    };
  }
}

export function loadTexture(
  source: TextureSource,
  options: TextureLoaderOptions = {},
) {
  return TextureLoader.load(source, options);
}
