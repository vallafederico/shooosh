/**
 * shooosh/msdf — Node / Bun font + icon SDF generators.
 *
 * How to use:
 *   import { generateMsdf, generateFontAtlas, generateIconSdf } from "shooosh/msdf"
 *   await generateMsdf(["fonts", "icons"], { outDir: "public/msdf" })
 *   pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
 *
 * Fonts default to fieldType "sdf" (not "msdf" — beads on hairlines).
 * SVG icons: raster 1024 / spread 64. PNG: spread 8.
 * Encode 0.5 at the edge, > 0.5 inside.
 *
 * Do not import this from package/index.ts or a site bundle.
 * Optional deps: sharp (icons), msdf-bmfont-xml (fonts).
 *
 * Docs: docs/msdf.md · skill shooosh-msdf
 */

export { alphaToSdf } from "./sdf";
export {
  generateIconSdf,
  type GenerateIconSdfOptions,
  type IconSdfMeta,
} from "./icons";
export {
  generateFontAtlas,
  ASCII_CHARSET,
  type FontFieldType,
  type GenerateFontAtlasOptions,
} from "./fonts";
export {
  generateMsdf,
  collectMsdfInputs,
  type GenerateMsdfOptions,
  type GenerateMsdfLayout,
  type MsdfJobResult,
} from "./batch";
export {
  classifyMsdfSource,
  FONT_EXTENSIONS,
  ICON_EXTENSIONS,
  type MsdfSourceKind,
} from "./classify";
export {
  parseMsdfArgs,
  runMsdfCli,
  MSDF_CLI_USAGE,
  type MsdfCliArgs,
} from "./cli";
