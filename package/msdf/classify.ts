/**
 * Classify a path as font (.ttf/.otf/.ttc) or icon (.svg/.png/.webp).
 *
 * How to use: generateMsdf / the CLI. `null` means skip.
 */

import { extname } from "node:path";

export const FONT_EXTENSIONS = [".ttf", ".otf", ".ttc"] as const;
export const ICON_EXTENSIONS = [".svg", ".png", ".webp"] as const;

export type MsdfSourceKind = "font" | "icon";

/** Classify a path by extension. `null` means skip (not a font or icon). */
export function classifyMsdfSource(source: string): MsdfSourceKind | null {
  const ext = extname(source).toLowerCase();
  if ((FONT_EXTENSIONS as readonly string[]).includes(ext)) return "font";
  if ((ICON_EXTENSIONS as readonly string[]).includes(ext)) return "icon";
  return null;
}
