# Camaro homepage reconstruction

The second homepage section (Features) renders the supplied Chevrolet Camaro SS
race car as a static, draggable model. Source folder: `chevrolet-camaro-ss-race-car`.
The supplied download includes no author/license text; no author or license is
inferred. Original files are untouched and are not committed.

## Reproduce

With the existing model package built:

```sh
node web/scripts/prepare-camaro.mjs <download-directory> <new-output-directory>
```

Use the output as `web/public/camaro/`. The script refuses an existing output
folder. It uses the same Assimp importer as `shooosh-model convert`, repairs its
intermediate glTF, then uses `convertModel`, `checkModel`, `inspectModel`,
`compressModel`, `createModelIO`, `bake`, and `checkTexture` from our Node workflow.
The temporary work directory printed by the script contains reconstructed and
compressed GLBs, inventory, and the complete report for further inspection.
The deployable directory contains a portable `preparation-report.json`.

## Reconstruction decisions

- Eight extensionless image references pointed to material names. Underside,
  windows and rim references are remapped to the corresponding supplied textures;
  original embedded body/interior/tire/rim maps are retained.
- Assimp's `FB_ngon_encoding` metadata is removed only after checking that output
  primitives are already triangles.
- Twelve zero-length normals are repaired from adjacent triangle normals; unused
  degenerate vertices receive a finite unit normal. Thirty-five degenerate
  triangles are removed.
- Eight `Rim_Blur` nodes are excluded; the detailed static rims remain.
- Node world transforms are baked, then the complete car is centered and scaled
  uniformly from its original bounds. Material groups retain their UVs, including
  repeat addressing. No texture atlas introduces cross-material UV bleeding.
- Studio metallic/roughness values are approximations for the diffuse/Phong
  source. Windows are opaque tinted surfaces, not simulated transparent glass.
  No skeletal animation, native application features or authored lighting parity
  is claimed.

## Checks

- Reconstructed and meshopt/WebP compressed GLBs: **0 errors, 0 warnings** each.
- Runtime output: **22,446 triangles, 10 material draws**, approximately **2.7 MiB**.
- All 20 runtime color/data images decode successfully through `checkTexture`.
- WebGPU and WebGL2 visually render the same intact body, rims, tires and windows;
  no browser warnings/errors were observed. Keyboard rotation was checked on
  WebGL2. The model fits the same `90svmin` container policy as the can.
- The browser module owns its resources, aborts pending geometry requests on
  teardown, destroys late texture completions and shows a readable loading error.
  These failure/teardown paths were reviewed in code, not GPU stress-tested.

The rendering reuses the existing prepared `can.wgsl` studio shader through the
build plugin. Node codecs and source importers remain outside browser imports.
Prepared assets are ignored by Git: use the documented local prebuilt Vercel
production deployment so `/camaro/` is included along with `/can/`.
