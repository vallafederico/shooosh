# Car PBR material studio

Open the **Car · PBR material studio** entry in the examples gallery, or use
`/?demo=car-pbr&backend=webgpu`. The gallery renderer toggle also supports WebGL2.

This example embeds the standalone material studio with original, WebP, and KTX2
texture comparison, orbit/zoom, roughness, studio reflections, and emissive controls.
It only loads the studio's JavaScript and model assets when selected. Leaving the
view removes its frame and rendering context.

## Prepare local assets

The source model is not redistributed. With the model package's Node tools built,
prepare the existing car conversion outputs from the repository root:

```sh
node packages/model/demo/car-pbr/prepare.mjs /tmp/shooosh-car-cuadot-v2 harness/public/car-pbr
pnpm --filter harness dev
```

The input directory must contain `original.glb`, `webp.glb`, and `ktx2.glb` with
their material maps. Preparation requires a new output directory. The generated
`harness/public/car-pbr/` directory is ignored by Git; it contains the complete
static studio, so no separate server or temporary port is needed.

To copy this example, copy `car-pbr.ts` and `types.ts`, prepare the standalone
studio, serve its output at `./car-pbr/` relative to your page, and call `run(host)`
with a sized container. Retain the returned handle and call `destroy()` on removal.

KTX2 is decoded in Node into a preview atlas; this view does not demonstrate native
compressed GPU uploads. Maps are resized to 1024 px and normal detail is baked for
a static pose. Source texture payload badges do not report atlas transfer size.
See the [studio implementation and limitations](../packages/model/demo/car-pbr/README.md).

Model attribution: [cuadot on Sketchfab](https://sketchfab.com/cuadot).
