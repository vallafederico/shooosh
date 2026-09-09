# Car demo

Model by [cuadot](https://sketchfab.com/cuadot), supplied by the user as
`car/source/Car.fbx` and five `car/textures/Mat_Robot_*.png` maps.

```sh
pnpm --filter shooosh-model build
node packages/model/demo/car.mjs /path/to/car /path/to/new-demo-output
```

Requires KTX tools (see the package README). The script writes a rigged original,
WebP and KTX2 variants, a static reference-pose preview, validation/size reports,
and attribution. It opens local servers on ports 5185 (model), 5186 (KTX2 texture
comparison), and 5187 (WebP texture comparison); URLs are printed on completion.
Stop with Ctrl+C. The output directory must be new.

The FBX contains one skinned mesh and five animations. Its imported quaternion
samples and skin weights require normalization. The provided metallic and
roughness maps are explicitly packed into glTF's B/G channels, and the emissive
map is enabled. Full rig and clips remain in original/optimized variants.
The current rigid model viewer uses separate static geometry with skins/clips
removed. It opens with base-color textures and provides a solid-color toggle.
The comparison views show individual original/converted maps. The 3D preview
still uses approximate lighting; normal/emissive/data-map shading and rigged
animation playback are not implemented.

Source files and generated models stay outside the repository/npm package.
The model author credit is shown in each demo view and saved with its outputs.
