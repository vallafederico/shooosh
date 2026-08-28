/**
 * generateFontAtlas — TTF/OTF → atlas PNG + bmfont JSON.
 *
 * How to use:
 *   await generateFontAtlas("Inter.ttf", { outDir, fontSize: 64, fieldType: "sdf" })
 * Hairline faces want fontSize: 256. distanceRange (default 8) is uPxRange.
 * Runtime: createMsdfGlyphs (WebGL2) + loadTexture.
 *
 * Docs: docs/msdf.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { loadBmfont } from "./optional";

export type FontFieldType = "sdf" | "msdf";

export type GenerateFontAtlasOptions = {
  outDir: string;
  /** Output basename. Defaults to the font file name. */
  name?: string;
  /** Glyph size in the atlas, px. Hairline faces want 256. Default 64. */
  fontSize?: number;
  /**
   * `"sdf"` (default) is the site path — old msdfgen edge coloring beads on
   * thin outlines. Use `"msdf"` only if you have verified the face.
   */
  fieldType?: FontFieldType;
  /** Distance field spread in px (`uPxRange` in the shader). Default 8. */
  distanceRange?: number;
  textureSize?: [number, number];
  /** Characters to include. Default: printable ASCII 32–126. */
  charset?: string;
};

export const ASCII_CHARSET =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

type BMFontTexture = { filename: string; texture: Buffer };
type BMFontData = { filename: string; data: string };

async function generateBMFontAsync(
  fontPath: string,
  options: Record<string, unknown>,
) {
  const generateBMFont = await loadBmfont();
  return new Promise<{ textures: BMFontTexture[]; font: BMFontData }>(
    (resolvePromise, reject) => {
      generateBMFont(
        fontPath,
        options,
        (error: Error | null, textures: BMFontTexture[], font: BMFontData) => {
          if (error) reject(error);
          else resolvePromise({ textures, font });
        },
      );
    },
  );
}

/**
 * TTF/OTF → glyph atlas PNG(s) + bmfont JSON (the format MsdfText / createMsdfGlyphs consume).
 */
export async function generateFontAtlas(
  fontPath: string,
  options: GenerateFontAtlasOptions,
) {
  const name = options.name ?? basename(fontPath, extname(fontPath));
  const fontSize = options.fontSize ?? 64;
  const fieldType = options.fieldType ?? "sdf";
  const distanceRange = options.distanceRange ?? 8;
  const textureSize = options.textureSize ?? [2048, 2048];
  const charset = options.charset ?? ASCII_CHARSET;

  await mkdir(options.outDir, { recursive: true });

  const { textures, font } = await generateBMFontAsync(fontPath, {
    outputType: "json",
    fieldType,
    fontSize,
    distanceRange,
    textureSize,
    smartSize: true,
    charset,
    filename: name,
  });

  const texturePaths: string[] = [];
  for (const texture of textures) {
    const textureName = `${basename(texture.filename, ".png")}.png`;
    const texturePath = join(options.outDir, textureName);
    await writeFile(texturePath, texture.texture);
    texturePaths.push(texturePath);
  }

  const jsonPath = join(options.outDir, `${name}.json`);
  await writeFile(jsonPath, font.data);

  return { textures: texturePaths, jsonPath, name, fieldType, distanceRange };
}
