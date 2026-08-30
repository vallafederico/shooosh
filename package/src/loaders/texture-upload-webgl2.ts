/**
 * WebGL2 texture upload. Not a public import — loaded by loadTexture.
 *
 * How to use: loadTexture() dynamic-imports this on the WebGL2 backend.
 * `view` is the handle itself, so consumers can read `(view as {texture}).texture`.
 *
 * Docs: docs/api.md
 */

import type {
  TextureHandle,
  TextureUpload,
  TextureUploadOptions,
} from "./texture-loader";

export function uploadWebGl2Texture(
  gl: WebGL2RenderingContext,
  bitmap: ImageBitmap,
  options: TextureUploadOptions = {},
): TextureUpload {
  const width = Math.max(1, bitmap.width);
  const height = Math.max(1, bitmap.height);
  const glTexture = gl.createTexture();
  if (!glTexture) {
    throw new Error("Unable to create WebGL texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  // No UNPACK_FLIP_Y_WEBGL here: the WebGL spec ignores it for ImageBitmap
  // sources, so the loader bakes the default flip (and the premultiply) into
  // the bitmap at decode time instead. Opt out with `{ flipY: false }` for
  // env/matcap maps so sampling matches WebGPU.
  // Use RGB8 when the caller explicitly requests it (e.g. MSDF atlas — only .rgb is read).
  if (options.format === "rgb") {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, bitmap);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  }

  const mapFilter = (filter: "linear" | "nearest" | undefined) =>
    filter === "nearest" ? gl.NEAREST : gl.LINEAR;
  const mapWrap = (wrap: "clamp-to-edge" | "repeat" | "mirror-repeat" | undefined) => {
    if (wrap === "repeat") return gl.REPEAT;
    if (wrap === "mirror-repeat") return gl.MIRRORED_REPEAT;
    return gl.CLAMP_TO_EDGE;
  };
  // mipmapFilter enables mip generation; the min filter picks the matching
  // *_MIPMAP_* mode (WebGL2 handles NPOT mipmaps fine).
  const mipmapFilter = options.sampler?.mipmapFilter;
  const minFilter = (() => {
    if (!mipmapFilter) return mapFilter(options.sampler?.minFilter);
    if (options.sampler?.minFilter === "nearest") {
      return mipmapFilter === "nearest"
        ? gl.NEAREST_MIPMAP_NEAREST
        : gl.NEAREST_MIPMAP_LINEAR;
    }
    return mipmapFilter === "nearest"
      ? gl.LINEAR_MIPMAP_NEAREST
      : gl.LINEAR_MIPMAP_LINEAR;
  })();
  if (mipmapFilter) {
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
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

  const texture: TextureHandle = {
    backend: "webgl2",
    texture: glTexture,
    gl,
    width,
    height,
    createView() {
      return this;
    },
    destroy() {
      gl.deleteTexture(glTexture);
    },
  };

  return {
    texture,
    view: texture,
    sampler: (options.createSampler ?? true) ? {} : null,
  };
}
