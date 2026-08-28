/**
 * generateMsdf — walk files/dirs, bake fonts + icons.
 *
 * How to use:
 *   await generateMsdf(["fonts", "icons"], { outDir: "public/msdf" })
 * Default layout: outDir/fonts and outDir/icons. Unknown extensions skip.
 * A broken file is `{ kind: "error" }`; the rest of the batch continues.
 *
 * Docs: docs/msdf.md
 */

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyMsdfSource } from "./classify";
import {
  generateFontAtlas,
  type FontFieldType,
  type GenerateFontAtlasOptions,
} from "./fonts";
import { generateIconSdf, type GenerateIconSdfOptions } from "./icons";

export type GenerateMsdfLayout = "flat" | "kind";

export type GenerateMsdfOptions = {
  outDir: string;
  /**
   * `"kind"` (default) writes fonts to `outDir/fonts` and icons to `outDir/icons`.
   * `"flat"` writes everything into `outDir`.
   */
  layout?: GenerateMsdfLayout;
  fontSize?: number;
  fieldType?: FontFieldType;
  distanceRange?: number;
  textureSize?: [number, number];
  charset?: string;
  iconSize?: number;
  spread?: number;
};

export type MsdfJobResult =
  | {
      kind: "font";
      source: string;
      result: Awaited<ReturnType<typeof generateFontAtlas>>;
    }
  | {
      kind: "icon";
      source: string;
      result: Awaited<ReturnType<typeof generateIconSdf>>;
    }
  | { kind: "skip"; source: string; reason: string }
  | { kind: "error"; source: string; reason: string };

const SKIP_DIR = new Set(["node_modules", ".git", "dist"]);

async function walkDir(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walkDir(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
}

export async function collectMsdfInputs(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const path = resolve(input);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new Error(`shooosh/msdf: cannot read ${input}`);
    }
    if (info.isDirectory()) await walkDir(path, files);
    else if (info.isFile()) files.push(path);
    else throw new Error(`shooosh/msdf: not a file or directory: ${input}`);
  }
  return [...new Set(files)];
}

function fontOptions(
  options: GenerateMsdfOptions,
): GenerateFontAtlasOptions {
  const outDir =
    options.layout === "flat" ? options.outDir : join(options.outDir, "fonts");
  return {
    outDir,
    fontSize: options.fontSize,
    fieldType: options.fieldType,
    distanceRange: options.distanceRange,
    textureSize: options.textureSize,
    charset: options.charset,
  };
}

function iconOptions(
  options: GenerateMsdfOptions,
): GenerateIconSdfOptions {
  const outDir =
    options.layout === "flat" ? options.outDir : join(options.outDir, "icons");
  return {
    outDir,
    size: options.iconSize,
    spread: options.spread,
  };
}

/**
 * Walk files and directories, generate font atlases and icon SDFs.
 * Unknown extensions are skipped (not an error).
 */
export async function generateMsdf(
  inputs: string | string[],
  options: GenerateMsdfOptions,
): Promise<MsdfJobResult[]> {
  if (!options.outDir) {
    throw new Error("shooosh/msdf: `outDir` is required");
  }
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const files = await collectMsdfInputs(list);
  const fonts = fontOptions(options);
  const icons = iconOptions(options);
  const results: MsdfJobResult[] = [];

  for (const source of files) {
    const kind = classifyMsdfSource(source);
    if (!kind) {
      results.push({
        kind: "skip",
        source,
        reason: "unsupported extension",
      });
      continue;
    }
    try {
      if (kind === "font") {
        results.push({
          kind: "font",
          source,
          result: await generateFontAtlas(source, fonts),
        });
      } else {
        results.push({
          kind: "icon",
          source,
          result: await generateIconSdf(source, icons),
        });
      }
    } catch (error) {
      results.push({
        kind: "error",
        source,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
