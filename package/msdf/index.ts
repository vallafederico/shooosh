/**
 * Node / Bun SDF + MSDF generators. Do not import this from the browser
 * package entry (`package/index.ts`) or a site bundle — it needs `sharp`
 * and `msdf-bmfont-xml`.
 *
 *   import { generateMsdf, generateFontAtlas, generateIconSdf } from "shooosh/msdf"
 *   bun run bin/msdf.ts fonts/Inter.ttf icons/ --out public/msdf
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
