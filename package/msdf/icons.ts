import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { loadSharp } from "./optional";
import { alphaToSdf } from "./sdf";

export type IconSdfMeta = {
  type: "sdf";
  width: number;
  height: number;
  spread: number;
};

export type GenerateIconSdfOptions = {
  outDir: string;
  /** Output basename. Defaults to the source file name. */
  name?: string;
  /** SVG raster long-edge, px. Ignored for PNG. Default 1024. */
  size?: number;
  /** SDF spread in px. Default 64 for SVG, 8 for PNG. */
  spread?: number;
};

async function rasterize(
  source: string,
  size: number,
  spread: number,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const sharp = await loadSharp();
  const ext = extname(source).toLowerCase();

  if (ext === ".png" || ext === ".webp") {
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  const meta = await sharp(source).metadata();
  const density =
    (72 * size) / Math.max(1, meta.width ?? size, meta.height ?? size);
  const { data, info } = await sharp(source, {
    density: Math.min(2400, density),
  })
    .resize(size, size, { fit: "inside" })
    .extend({
      top: spread,
      bottom: spread,
      left: spread,
      right: spread,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/**
 * SVG or PNG (alpha = shape) → single-channel SDF PNG + `{ type, width, height, spread }` JSON.
 * SVGs are rasterized first so multi-path artwork works.
 */
export async function generateIconSdf(
  source: string,
  options: GenerateIconSdfOptions,
) {
  const ext = extname(source).toLowerCase();
  const isSvg = ext === ".svg";
  const size = options.size ?? 1024;
  const spread = options.spread ?? (isSvg ? 64 : 8);
  const name = options.name ?? basename(source, ext);

  const { data, width, height } = await rasterize(source, size, spread);
  const sdf = alphaToSdf(data, width, height, spread);

  const sharp = await loadSharp();
  await mkdir(options.outDir, { recursive: true });
  const pngPath = join(options.outDir, `${name}.png`);
  const jsonPath = join(options.outDir, `${name}.json`);
  const meta: IconSdfMeta = { type: "sdf", width, height, spread };

  await sharp(sdf, { raw: { width, height, channels: 1 } }).png().toFile(pngPath);
  await writeFile(jsonPath, `${JSON.stringify(meta, null, "\t")}\n`);

  return { pngPath, jsonPath, meta };
}
