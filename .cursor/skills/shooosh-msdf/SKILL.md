---
name: shooosh-msdf
description: Generate SDF / MSDF font atlases and icon distance fields for shooosh (Node/Bun). Use when the user wants msdf text, SDF logos, or a script to bake .ttf/.svg/.png into runtime atlases.
---

# Generate font and icon SDFs

Read [docs/msdf.md](../../../docs/msdf.md). This is a **Node / Bun** toolchain (`shooosh/msdf`). Do not import it from a site bundle or from `package/index.ts`.

```js
import { generateMsdf, generateFontAtlas, generateIconSdf } from "shooosh/msdf"
```

```shell
pnpm add -D sharp msdf-bmfont-xml
pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
```

## Choose

| Input | Call | Runtime |
| --- | --- | --- |
| `.ttf` / `.otf` / `.ttc` | `generateFontAtlas` | `createMsdfGlyphs` (WebGL2 today) |
| `.svg` / `.png` / `.webp` | `generateIconSdf` | `createItem` + `loadTexture` |
| mixed dir | `generateMsdf(inputs, { outDir })` | writes `outDir/fonts` + `outDir/icons` |

## Defaults — do not “improve” these

- Fonts: `fieldType: "sdf"`. `"msdf"` beads on hairline / thin outlines.
- Hairline faces: `fontSize: 256`, not 64.
- `distanceRange: 8` (`uPxRange`).
- SVG icons: raster 1024, `spread: 64`. PNG icons: `spread: 8`.
- Encode 0.5 at the edge, greater than 0.5 inside (`alphaToSdf`).

## Always

- Keep generators off the browser entry. Optional deps: `sharp`, `msdf-bmfont-xml`.
- Author page shaders as WGSL. Sampling the atlas is still WebGL2-only.
- Do not add a Python / fonttools variable-font step unless the user asks.

## Next

Mount the baked atlas: skill `shooosh-item` (`loadTexture`) or `createMsdfGlyphs`. Site canvas: `shooosh-site`.
