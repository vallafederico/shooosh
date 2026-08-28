# MSDF / SDF generators

[Documentation](./README.md)

Node and Bun utilities for the atlases `createMsdfGlyphs` and SDF icon quads consume. **Not part of the browser package.** Do not import `shooosh/msdf` from a site bundle — it needs `sharp` and `msdf-bmfont-xml`.

```js
import {
  generateMsdf,
  generateFontAtlas,
  generateIconSdf,
  alphaToSdf,
} from "shooosh/msdf"
```

```shell
pnpm add -D sharp msdf-bmfont-xml
pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
# or after publish:
npx shooosh-msdf fonts/Inter.ttf icons/ --out public/msdf
```

Runtime sampling (`createMsdfGlyphs`, `loadTexture`) runs on both backends — load the atlas after the engine resolves so the handle matches. This page is the asset pipeline.

Harness demos (procedural atlases, no bake required): [`examples/msdf-text.ts`](../examples/msdf-text.ts), [`examples/sdf-icons.ts`](../examples/sdf-icons.ts). Sample SVGs to bake: [`examples/assets/icons/`](../examples/assets/icons/).

## What to generate

| Source | Function | Output | Runtime |
| --- | --- | --- | --- |
| `.ttf` / `.otf` / `.ttc` | `generateFontAtlas` | atlas PNG(s) + bmfont JSON | `createMsdfGlyphs` |
| `.svg` / `.png` / `.webp` | `generateIconSdf` | single-channel SDF PNG + `{ type, width, height, spread }` JSON | `createItem` + `loadTexture` |

Batch: `generateMsdf(inputs, { outDir })` walks files and directories (skips `node_modules`). Default layout is `outDir/fonts` and `outDir/icons`. Pass `layout: "flat"` to write everything into `outDir`.

## Defaults (site path)

Same defaults as the aiuis `scripts/msdf` pipeline:

- Fonts: `fieldType: "sdf"` (not `"msdf"`). Old msdfgen edge coloring beads on thin / hairline outlines. Use `"msdf"` only after you have checked the face.
- Fonts: `fontSize: 64`, `distanceRange: 8` (`uPxRange` in the glyph shader). Hairline faces want `fontSize: 256`.
- Fonts: printable ASCII 32–126 (`ASCII_CHARSET`).
- SVG icons: raster long-edge `1024`, then pad and SDF with `spread: 64`.
- PNG / WebP icons: use the source pixels (alpha = shape), `spread: 8`.

`alphaToSdf` is Felzenszwalb & Huttenlocher EDT. Encoded like the font atlases: **0.5 at the edge, greater than 0.5 inside**.

## CLI

```
bun run bin/msdf.ts <input...> --out <dir> [options]
pnpm msdf -- <input...> --out <dir> [options]

  --out, -o         output directory (required)
  --layout          kind (default) | flat
  --font-size       glyph size, px (default 64; hairline 256)
  --range           distance spread / uPxRange (default 8)
  --field           sdf (default) | msdf
  --icon-size       SVG raster long-edge (default 1024)
  --spread          icon SDF spread (SVG 64 / PNG 8)
  --charset         characters to include
```

Unknown flags fail. Unknown extensions are skipped. A broken font or icon is recorded and the rest of the batch continues; the CLI exits `1` if anything failed or nothing was generated.

## Programmatic

```js
await generateFontAtlas("fonts/Inter.ttf", {
  outDir: "public/msdf/fonts",
  fontSize: 64,
  fieldType: "sdf",
  distanceRange: 8,
})

await generateIconSdf("icons/mark.svg", {
  outDir: "public/msdf/icons",
  size: 1024,
  spread: 64,
})

await generateMsdf(["fonts", "icons"], { outDir: "public/msdf" })
```

`sharp` is loaded only when generating icons. `msdf-bmfont-xml` is loaded only when generating fonts. Missing either throws with an install line.

## Do not

- Import `shooosh/msdf` from `package/index.ts` or the IIFE / site bundle
- Default new faces to `fieldType: "msdf"`
- Expect generators in the browser — bake on Node/Bun, sample at runtime