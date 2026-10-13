# Proposals: object scenes (from the unisn.co `/webgl` scene)

Status: proposed, 2026-10-13. Source: a production-style scene of ~60 baked,
tumbling objects with Rapier physics, drawn cables, a playable CRT, depth of
field and a grade, built on shooosh **0.0.6** (unisn.co/webgl). Every gap
below was hit there; each lists what was needed, the workaround, measurements
where there are some, and a proposed change.

Checked against `main` (0.0.8, `8fd46b0`): none of these exist yet. Items gained
`setMap` (named extra maps), but objects have no map swapping; the WGSL→GLSL
translator still has no handling for vector `select`, module-level `const` or
derivatives (see [shader translation](../shader-translation.md#pitfalls-seen-in-practice)).

Recipes that work around these today, with copy sets:
[depth of field](../../examples/depth-of-field.md) ·
[drawn cables](../../examples/drawn-cables.md) ·
[live textures](../../examples/live-texture.md) ·
[procedural environment](../../examples/procedural-environment.md) ·
[baked lighting](../../examples/baked-lighting.md) ·
[physics interaction](../../examples/physics-interaction.md).

Two of these (§1, §6) are running in production as a pnpm patch on 0.0.6's
built `dist`. The diffs below are written against `package/src`.

## 1. A world-position varying for object shaders (patched locally)

**Need.** Per-pixel depth of field and darkening with distance. Each object
shader writes its pixel's depth, relative to a focus plane, to alpha, and one
post effect blurs and darkens by it. Object fragments get `vUv` and `vNormal` only, and the
depth buffer can't be read (WebGPU: `RENDER_ATTACHMENT` only and
`depthStoreOp: "discard"`; WebGL2: a renderbuffer). So no shader can know how
far its pixel is.

**What we did.** A pnpm patch on 0.0.6 (`patchedDependencies`) adds `vPosition: vec3f`, the fragment's world position
(`model × position`), on both backends. The camera looks down -Z at the origin,
so `abs(vPosition.z)` is the distance from the plane z = 0. The patch touches
the built `dist`:

- `chunks/gpu-object-*.js` (WebGPU): `VsOut.world` at location 2, written by
  `vsMain`, copied to `var<private> vPosition` in `fsEntry`.
- `esm.js` (WebGL2 object vertex shader): `out vec3 vPosition`.
- `build/esm.js`, `compiler/esm.js` (WGSL→GLSL): `vPosition` in the symbol
  table, `in vec3 vPosition;` in the header when the source names it.

**Proposed change** (source, `package/src`):

`primitives/gpu-object.ts`, `OBJECT_PREAMBLE` and `OBJECT_ENTRY`:

```diff
 struct VsOut {
   @builtin(position) position: vec4f,
   @location(0) normal: vec3f,
   @location(1) uv: vec2f,
+  @location(2) world: vec3f,
 }
 …
   out.uv = aUv;
+  out.world = (uUni.model * vec4f(aPosition, 1.0)).xyz;
   return out;
 }

 var<private> vUv: vec2f;
 var<private> vNormal: vec3f;
+var<private> vPosition: vec3f;
 …
   vNormal = in.normal;
+  vPosition = in.world;
   return fsMain();
```

`primitives/object.ts`, `getDefaultVertexShader`:

```diff
 out vec3 vNormal;
 out vec2 vUv;
+out vec3 vPosition;
 void main() {
   gl_Position = uMvp * vec4(aPosition, 1.0);
+  vPosition = (uModel * vec4(aPosition, 1.0)).xyz;
```

`shaders/wgsl-compat.ts`:

```diff
 export type WgslCompatOptions = {
   includeUv?: boolean;
   includeNormal?: boolean;
+  includePosition?: boolean;
 …
   symbols.set("vNormal", "vec3");
+  symbols.set("vPosition", "vec3");
 …
     options.includeNormal ? "in vec3 vNormal;" : "",
+    options.includePosition ? "in vec3 vPosition;" : "",
 …
-  const key = `${options.includeUv ? 1 : 0}${options.includeNormal ? 1 : 0}\u0000${source}`;
+  const key = `${options.includeUv ? 1 : 0}${options.includeNormal ? 1 : 0}${options.includePosition ? 1 : 0}\u0000${source}`;
```

…and pass `includePosition: /\bvPosition\b/.test(source)` wherever
`includeNormal` is derived (the compiler's `compileShader` and the build
plugin). Document `vPosition` in `docs/shader-contract.md` next to `vNormal`.
A view-space depth varying (`vViewDepth`) would also do, but the world position
covers more cases: fog, height gradients, focus planes.

## 2. A readable depth texture for post effects

**Need.** Depth of field, fog and outlines usually read scene depth in post.
**Workaround.** §1 plus alpha as a per-pixel data channel. That only works
because object alpha isn't blended, and it spends alpha.
**Proposal.** An opt-in `createPostProcessor({ depth: true })`:

- WebGPU: create the scene depth texture with `TEXTURE_BINDING`, keep
  `depthStoreOp: "store"`, and bind it as `uDepth` (`texture_depth_2d`) in
  `applyEffect`.
- WebGL2: a `DEPTH_COMPONENT24` texture instead of the renderbuffer.

Also expose near and far so effects can linearise depth.

## 3. Updatable textures (video, canvases)

**Need.** A video or animated canvas on the CRT.
**Workaround.** `loadTexture(canvas)` once, then copy into
`TextureHandle.texture` every frame by hand:

- WebGPU: `copyExternalImageToTexture`, with the device from `createCompute`.
- WebGL2: `texSubImage2D`.

See [live-texture.ts](../../examples/live-texture.ts).
**Proposal.** `TextureSource` accepts `HTMLVideoElement`, and the handle gets
`handle.update(source?)`, plus an opt-in `live: true` that re-uploads each
frame. Also let objects swap maps (`object.setMaskMap`, `setEnvMap`), so a
screen can change source without being rebuilt.

## 4. Deforming meshes (skinning, or vertex updates)

**Need.** Cables that bend.
**Workaround.** Custom vertex shaders are ignored and geometry can't change
after upload. So each cable is a rope of separate tube objects, one per link,
with round ends so bends never gap ([drawn-cables.ts](../../examples/drawn-cables.ts)). That's about 30
extra objects per cable. The phone's coiled cord is 6 rigid segments.
**Proposal**, either of:

- `object.setGeometry({ vertices })`: re-upload into the same buffer,
  same layout.
- A small skinning path: `JOINTS_0`/`WEIGHTS_0` attributes and a bone-matrix
  uniform array.

Either turns a cable into one object.

## 5. More uniforms per object

The baked-object shader uses 14 of the 16 floats; depth of field took the last
two. A `uni` block of 32 or 64 floats, or named uniforms (the docs mention
"task 03"), would leave room for per-object tuning.

## 6. Trilinear filtering for object maps (patched locally)

**Need.** Big atlases (a 4096 px albedo) on tumbling objects. Without mips they
shimmer. With mips but `mipmapFilter` left at its default ("nearest"), detail
pops between levels.
**What we did.** We load the sheets with `sampler: { mipmapFilter: "linear" }`,
which allocates the chain, and the patch adds `mipmapFilter: "linear"` to the
WebGPU `object-sampler` in `gpu-object`. WebGL2 already takes the texture's
own `*_MIPMAP_LINEAR` filter.
**Proposal.** The object sampler should follow the bound map's sampler options,
or take its own `sampler` option.

## 7. Runtime KTX2 (compressed textures): measured, not adopted here

**Need.** GPU memory and upload time for large atlases. Our three sheets
(4096 × 6144, 3072 × 4608 and 2048 × 3072, RGB data with packed channels) take
about 250 MB of VRAM as RGBA8 with mips, against about 60 MB as BC7 or ASTC
4×4.

**Today.** `shooosh-model` encodes and checks KTX2 offline (`ktx` 4.4.2 CLI),
but the runtime can't use it. `loadTexture` decodes to RGBA8 through
`createImageBitmap`, and the WebGPU device is requested with no
`requiredFeatures`, so `bc7-rgba-unorm` and `astc-4x4-unorm` can't be created
even where the GPU supports them.

**Measured on the computer sheet** (4096 × 6144; error in 8-bit levels, 99th
percentile, per map):

| Encoding | Size | Albedo | Light | Surface |
| --- | --- | --- | --- | --- |
| AVIF 4:4:4, q88 (what we ship) | 1.2 MB | 3 | 4 | 7 |
| KTX2 ETC1S (basis-lz, q200) | 1.6 MB | 5 | 23 | 47 |
| KTX2 UASTC q2, RDO 1.5, zstd 18 | 7.2 MB | 3 | 5 | 5 |
| KTX2 UASTC q1, RDO 4–8, zstd 22 | 6.1–6.2 MB | 4 | 7–9 | 7–8 |

ETC1S breaks packed data: roughness and metal are off by up to 47 levels.
UASTC is accurate but 5× the download. On this page, texture decode, upload
and mip generation take about 145 ms of a roughly 200 ms scene load. So KTX2
would save about 100 ms and 190 MB of VRAM, for about 12 MB more download. We
kept AVIF.

**Proposal**, still worth having for desktop-heavy scenes and mobile VRAM:
1. Request `texture-compression-bc`, `-astc` and `-etc2` in `requestDevice`
   when the adapter has them. They're free to enable.
2. `loadTexture("….ktx2")` should parse the container and transcode UASTC in
   a worker (Basis Universal's transcoder with zstd), choosing BC7 on desktop,
   ASTC 4×4 on Apple and mobile, ETC2 on Android, and RGBA8 as a fallback. It
   should upload the file's own mips, not regenerate them.
3. On WebGL2, use the matching extensions (`EXT_texture_compression_bptc`,
   `WEBGL_compressed_texture_astc`, `WEBGL_compressed_texture_etc`) and
   `compressedTexImage2D`.
4. In `shooosh-model`'s docs, steer packed or data textures to UASTC, never
   ETC1S (numbers above).

## 8. Post effects: per-pass cost

A post effect runs the same shader on every pass, so per-pixel work (our grade
and darkening) easily ends up inside the blur's tap loop. That's 17× the work.
At 5K it was the whole frame budget: 15.7 ms. Splitting it into a prepare pass
by `passIndex` brought that to 8.3 ms. Two things would help:
- effects made of distinct shaders per pass;
- half-resolution passes for blurs, so a depth-of-field blur costs a quarter.

## 9. Smaller notes

- Object alpha goes into the colour target unblended. That makes it a free
  data channel (§1) but rules out real transparency, so the wire boxes are
  dithered. An opt-in `blend: "alpha"` on objects would help.
- With a post effect active there's no MSAA. An MSAA scene target that is
  resolved before post would keep edges clean under depth of field.
