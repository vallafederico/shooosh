/**
 * WebGPU texture upload. Not a public import — loaded by loadTexture.
 *
 * How to use: loadTexture() dynamic-imports this on the WebGPU backend.
 * `view` is a GPUTextureView and `sampler` a GPUSampler, ready to drop into the
 * plane / item bind group (bindings 1 and 2).
 *
 * `vUv` is top-origin on both backends, so the copy does not flip Y here (the
 * WebGL2 path flips because GL textures are bottom-origin).
 *
 * Docs: docs/api.md · docs/shader-contract.md
 */

import type { WebGLEngine } from "../engine/engine";
import { GPU_TEXTURE_USAGE, type GpuSampler } from "../engine/gpu-api";
import { getGpuInternals } from "../engine/gpu-internals";
import type {
  TextureHandle,
  TextureUpload,
  TextureUploadOptions,
} from "./texture-loader";

const UPLOAD_USAGE =
  GPU_TEXTURE_USAGE.TEXTURE_BINDING |
  GPU_TEXTURE_USAGE.COPY_DST |
  GPU_TEXTURE_USAGE.RENDER_ATTACHMENT;

export function uploadWebGpuTexture(
  engine: WebGLEngine,
  bitmap: ImageBitmap,
  options: TextureUploadOptions = {},
): TextureUpload {
  const internals = getGpuInternals(engine);
  if (!internals) {
    throw new Error(
      "loadTexture could not reach the WebGPU device. Await createScene()/initEngine() first.",
    );
  }

  const { device } = internals;
  if (!device.queue.copyExternalImageToTexture) {
    throw new Error(
      "This WebGPU implementation cannot copy images to textures (queue.copyExternalImageToTexture missing).",
    );
  }

  const width = Math.max(1, bitmap.width);
  const height = Math.max(1, bitmap.height);
  // WebGPU has no rgb8 format — the `rgb` request (MSDF atlas) stays rgba8unorm.
  const format = options.format === "rgb" ? "rgba8unorm" : options.format ?? "rgba8unorm";

  const gpuTexture = device.createTexture({
    label: options.label ?? "shooosh-texture",
    size: { width, height },
    format,
    usage: options.usage ?? UPLOAD_USAGE,
  });

  device.queue.copyExternalImageToTexture(
    // Default false — WebGPU UVs are top-origin. `{ flipY: true }` mirrors GL's
    // UNPACK_FLIP_Y; env/matcap loads should keep false on both backends.
    { source: bitmap, flipY: options.flipY === true },
    { texture: gpuTexture, premultipliedAlpha: true },
    { width, height },
  );

  const view = gpuTexture.createView();
  const sampler: GpuSampler | null = (options.createSampler ?? true)
    ? device.createSampler({
        label: `${options.label ?? "shooosh-texture"}-sampler`,
        magFilter: options.sampler?.magFilter ?? "linear",
        minFilter: options.sampler?.minFilter ?? "linear",
        addressModeU: options.sampler?.addressModeU ?? "clamp-to-edge",
        addressModeV: options.sampler?.addressModeV ?? "clamp-to-edge",
      })
    : null;

  const texture: TextureHandle = {
    backend: "webgpu",
    texture: gpuTexture,
    width,
    height,
    createView() {
      return view;
    },
    destroy() {
      gpuTexture.destroy();
    },
  };

  return { texture, view, sampler };
}
