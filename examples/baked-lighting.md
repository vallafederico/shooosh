# Baked lighting that still moves: per-light bakes in packed sheets

Realistic objects on shooosh's object pipeline (no lights or shadows at runtime,
two textures, 16 floats) by baking in Blender, so that lights can still be mixed
live as objects tumble. This guide covers the pipeline used for the unisn.co
`/webgl` scene. The Blender script isn't redistributed, so the steps and their
reasons are below.

## Prepare the source by hand

Automatic splitting, hole filling and material guessing on downloaded models
never came out right: pieces got mis-named, backs stayed open, and the
materials were wrong. One prepared `.blend` beats a clever script:
- **one closed object per moving piece**, named for the scene;
- **Principled materials:** base colour (textures fine), roughness, metallic set
  to 0 or 1, emission for screens, no alpha;
- shadow decals and anything that won't move removed.

The build then only names objects, restores real-world sizes, lays them out
(floating, no floor) and bakes.

## Bake each light alone, each object alone

- **One pass per light** (two keys, a fill, a room/HDRI with bounce): the shader
  mixes them with live weights. A shuffle cross-fades between moods, moving
  shadows and highlights together.
- **One object at a time**, everything else hidden from Cycles, so each object
  carries only its own shadows and can float away without a stranger's shadow
  stuck on it.
- **A fresh atlas UV** (`smart_project`, `average_islands_scale`, padded
  `pack_islands`) as UV 0 of the export; the original UVs only feed the bake.
- **Colour maps' alpha is never opacity:** set `alpha_mode = "NONE"`. One
  diffuse map's grey alpha mask darkened a whole model to a third.

## Pack the sheet

Three maps on the same UVs, RGB only, since browsers premultiply alpha on upload
and wipe the darks. The albedo carries the detail; light and surface are smooth:

```
┌───────────────┐  albedo (sRGB), W × W
│    albedo     │
├───────┬───────┤  light: R key 1, G key 2, B fill, irradiance with shadows (W/2)
│ light │surface│  surface: R room/AO, G roughness, B metal (0–0.5) or glow (0.5–1) (W/2)
└───────┴───────┘
```

- **Light channels** are stored as `sqrt(value · scale)` for more steps in the
  darks. Write the scales to a manifest, and fold `1/scale` into the shader's
  light weights.
- **Size the albedo near the source textures.** Halving a 4096 px source made
  everything look low-res. Bake light and surface at half size: it's faster,
  and they don't need more.
- **Clamp each lookup a little inside its region,** so mips and filtering never
  reach the neighbouring map.

## Encode: AVIF 4:4:4

The packed channels rule out chroma subsampling: lossy WebP is always 4:2:0 and
bleeds one channel into the next. Measured on a 4096 × 6144 sheet (error in 8-bit
levels, 99th percentile):

| Encoding | Size | Albedo | Light | Surface |
| --- | --- | --- | --- | --- |
| WebP near-lossless q60 | 7.0 MB | ≈0 | ≈0 | ≈0 |
| **AVIF 4:4:4 q88** | **1.2 MB** | 3 | 4 | 7 |
| KTX2 ETC1S | 1.6 MB | 5 | 23 | 47 |
| KTX2 UASTC + RDO + zstd | 6.1–7.2 MB | 3–4 | 5–9 | 5–8 |

ETC1S breaks packed data. UASTC is accurate but about 5× the download, for
roughly 100 ms of load and 190 MB of VRAM saved here (see
[the proposal](../docs/proposals/object-scenes.md) §7). With sharp:
`.avif({ quality: 88, chromaSubsampling: "4:4:4" })`.

## Load

- **Mipmaps on:** `loadTexture(url, { sampler: { mipmapFilter: "linear" } })`.
  Without mips, detail shimmers as objects tumble. The object sampler's own mip
  filter is "nearest"; see the proposal §6.
- **Version the files:** fetch the manifest uncached (a unique query) and append
  its bake stamp to every texture and GLB URL. A CDN edge once served a stale
  manifest pointing at deleted sheets after a redeploy.

## Shade (one fsMain)

- **Diffuse:** albedo × (Σ light·weight·tint + room·ambient).
- **Metals:** no diffuse, albedo-tinted reflections.
- **Dielectrics:** 4% reflectance rising to white at grazing angles.
- **Reflections and rim:** from a direction-sampled environment built from the
  same light list ([procedural-environment.md](./procedural-environment.md)).
- **Plastic that doesn't look plastic:**
  - coarse value noise keyed to the atlas UVs (blotches in colour and
    roughness, a faint normal wobble). Finer than the map's texels, it aliased
    into speckle;
  - a little extra roughness;
  - a filmic curve;
  - and in post, a grade and a distance haze ([depth-of-field.md](./depth-of-field.md)).
- **Copies:** cloned objects can share a sheet and take a body colour through a
  spare uniform. Recolour by the albedo's luminance, so decals and keys keep
  their light and dark.

## Limits

- **Moving objects keep their own baked shading:** shadows between objects aren't
  live.
- **Rebakes are slow** (about 25 minutes for three models on a laptop GPU).
  Bake at quarter size to check the pipeline first.
