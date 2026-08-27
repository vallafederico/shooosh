import { getDefaultEngine, initEngine } from "../engine/engine";

type WebglTextureHandle = {
  texture: WebGLTexture;
  gl: WebGL2RenderingContext;
  createView: () => unknown;
  destroy: () => void;
  width?: number;
  height?: number;
};

type WebglDeviceHandle = {
  gl: WebGL2RenderingContext;
};

export type TextureSource =
  | string
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas;

export type TextureLoaderResult = {
  texture: WebglTextureHandle;
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

export type TextureLoaderOptions = {
  label?: string;
  format?: string;
  usage?: number;
  waitForEngine?: boolean;
  waitTimeoutMs?: number;
  createSampler?: boolean;
  fit?: TextureFitMode;
  sampler?: {
    magFilter?: "linear" | "nearest";
    minFilter?: "linear" | "nearest";
    mipmapFilter?: "linear" | "nearest";
    addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
    addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  };
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
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  }
  return null;
}

async function decodeImageFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch texture "${url}" (${response.status}).`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function decodeImageFromElement(image: HTMLImageElement) {
  if (
    !image.complete ||
    image.naturalWidth === 0 ||
    image.naturalHeight === 0
  ) {
    await image.decode();
  }
  return createImageBitmap(image);
}

async function toImageBitmap(source: TextureSource) {
  if (typeof source === "string") {
    return decodeImageFromUrl(source);
  }
  if (source instanceof ImageBitmap) {
    return source;
  }
  if (source instanceof HTMLImageElement) {
    return decodeImageFromElement(source);
  }
  return createImageBitmap(source);
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

    const gl = webglController.gl;
    const bitmap = await toImageBitmap(source);
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);
    const glTexture = gl.createTexture();
    if (!glTexture) {
      throw new Error("Unable to create WebGL texture.");
    }
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    // Use RGB8 when the caller explicitly requests it (e.g. MSDF atlas — only .rgb is read).
    if (options.format === "rgb") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, bitmap);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    }

    const mapFilter = (filter: "linear" | "nearest" | undefined) =>
      filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    const mapWrap = (
      wrap: "clamp-to-edge" | "repeat" | "mirror-repeat" | undefined,
    ) => {
      if (wrap === "repeat") return gl.REPEAT;
      if (wrap === "mirror-repeat") return gl.MIRRORED_REPEAT;
      return gl.CLAMP_TO_EDGE;
    };
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mapFilter(options.sampler?.minFilter),
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      mapFilter(options.sampler?.magFilter),
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      mapWrap(options.sampler?.addressModeU),
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      mapWrap(options.sampler?.addressModeV),
    );
    gl.bindTexture(gl.TEXTURE_2D, null);

    const texture: WebglTextureHandle = {
      texture: glTexture,
      gl,
      width,
      height,
      createView() {
        return this;
      },
      destroy() {
        this.gl.deleteTexture(this.texture);
      },
    };
    const view = texture;
    const sampler = (options.createSampler ?? true) ? {} : null;
    const aspect = width / Math.max(1, height);
    const fit = options.fit ?? "cover";

    const shouldCloseBitmap = !(source instanceof ImageBitmap);
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
        if (shouldCloseBitmap) {
          bitmap.close();
        }
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
