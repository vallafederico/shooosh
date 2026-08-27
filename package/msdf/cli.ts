import { generateMsdf, type GenerateMsdfLayout } from "./batch";
import type { FontFieldType } from "./fonts";

export type MsdfCliArgs = {
  inputs: string[];
  outDir: string;
  fontSize?: number;
  distanceRange?: number;
  fieldType?: FontFieldType;
  iconSize?: number;
  spread?: number;
  charset?: string;
  layout?: GenerateMsdfLayout;
  help?: boolean;
};

export const MSDF_CLI_USAGE = `Generate SDF / MSDF atlases for fonts and icons.

Usage:
  bun run bin/msdf.ts <input...> --out <dir> [options]
  pnpm msdf -- <input...> --out <dir> [options]
  npx shooosh-msdf <input...> --out <dir> [options]

Inputs are .ttf/.otf/.ttc fonts or .svg/.png/.webp icons. Directories are walked.

Options:
  --out, -o              output directory (required)
  --layout               kind (default: fonts/ and icons/ subdirs) | flat
  --font-size            glyph size in the atlas, px (default 64; hairline 256)
  --range                distance field spread / uPxRange (default 8)
  --field                sdf (default, site path) | msdf
  --icon-size            SVG raster long-edge, px (default 1024)
  --spread               icon SDF spread (SVG default 64, PNG default 8)
  --charset              characters to include (default: printable ASCII)
  --help, -h
`;

function readValue(argv: string[], i: number, flag: string): [string, number] {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`missing value for ${flag}`);
  }
  return [value, i + 1];
}

export function parseMsdfArgs(argv: string[]): MsdfCliArgs {
  const inputs: string[] = [];
  const args: MsdfCliArgs = { inputs, outDir: "" };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    switch (flag) {
      case "--out":
      case "-o": {
        const [value, next] = readValue(argv, i, flag);
        args.outDir = value;
        i = next;
        break;
      }
      case "--font-size": {
        const [value, next] = readValue(argv, i, flag);
        args.fontSize = Number(value);
        i = next;
        break;
      }
      case "--range":
      case "--distance-range": {
        const [value, next] = readValue(argv, i, flag);
        args.distanceRange = Number(value);
        i = next;
        break;
      }
      case "--field": {
        const [value, next] = readValue(argv, i, flag);
        if (value !== "sdf" && value !== "msdf") {
          throw new Error("--field must be sdf or msdf");
        }
        args.fieldType = value;
        i = next;
        break;
      }
      case "--icon-size": {
        const [value, next] = readValue(argv, i, flag);
        args.iconSize = Number(value);
        i = next;
        break;
      }
      case "--spread": {
        const [value, next] = readValue(argv, i, flag);
        args.spread = Number(value);
        i = next;
        break;
      }
      case "--charset": {
        const [value, next] = readValue(argv, i, flag);
        args.charset = value;
        i = next;
        break;
      }
      case "--layout": {
        const [value, next] = readValue(argv, i, flag);
        if (value !== "kind" && value !== "flat") {
          throw new Error("--layout must be kind or flat");
        }
        args.layout = value;
        i = next;
        break;
      }
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (flag.startsWith("-")) throw new Error(`unknown flag ${flag}`);
        inputs.push(flag);
    }
  }

  return args;
}

export async function runMsdfCli(argv: string[]): Promise<number> {
  let args: MsdfCliArgs;
  try {
    args = parseMsdfArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(MSDF_CLI_USAGE);
    return 1;
  }

  if (args.help) {
    console.log(MSDF_CLI_USAGE);
    return 0;
  }

  if (args.inputs.length === 0) {
    console.error("pass at least one font, icon, or directory");
    console.error(MSDF_CLI_USAGE);
    return 1;
  }

  if (!args.outDir) {
    console.error("--out is required");
    console.error(MSDF_CLI_USAGE);
    return 1;
  }

  const results = await generateMsdf(args.inputs, {
    outDir: args.outDir,
    layout: args.layout,
    fontSize: args.fontSize,
    fieldType: args.fieldType,
    distanceRange: args.distanceRange,
    charset: args.charset,
    iconSize: args.iconSize,
    spread: args.spread,
  });

  let fonts = 0;
  let icons = 0;
  let skipped = 0;
  let failed = 0;
  for (const result of results) {
    if (result.kind === "font") {
      fonts += 1;
      console.log(`font  ${result.source} → ${result.result.jsonPath}`);
    } else if (result.kind === "icon") {
      icons += 1;
      console.log(`icon  ${result.source} → ${result.result.pngPath}`);
    } else if (result.kind === "error") {
      failed += 1;
      console.log(`fail  ${result.source} (${result.reason})`);
    } else {
      skipped += 1;
      console.log(`skip  ${result.source} (${result.reason})`);
    }
  }

  if (fonts + icons === 0) {
    console.error("no fonts or icons found");
    return 1;
  }

  console.log(
    `done  ${fonts} font(s), ${icons} icon(s), ${skipped} skipped, ${failed} failed`,
  );
  return failed > 0 ? 1 : 0;
}
