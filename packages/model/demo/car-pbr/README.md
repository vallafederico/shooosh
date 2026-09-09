# Car material studio

A standalone shooosh example showing cuadot's car with converted textures, GGX direct lighting, procedural studio reflections, emissive lights, and orbit/zoom controls. All rendering code is example-owned; no engine changes or browser processing dependencies.

## Run

Also available in the examples gallery as **Car · PBR material studio**.
See [gallery setup](../../../../examples/car-pbr.md) to prepare assets into the
harness's public directory and open `/?demo=car-pbr` without a separate server.

Requires the model package's built Node tools and an input directory containing `original.glb`, `webp.glb`, and `ktx2.glb` from the car conversion demo. Each must preserve the car's UVs and base-color, normal, packed metallic/roughness, and emissive maps.

From the repository root:

```sh
node packages/model/demo/car-pbr/prepare.mjs /tmp/shooosh-car-cuadot-v2 /tmp/car-material-studio
node packages/model/demo/car-pbr/serve.mjs /tmp/car-material-studio 5196
```

Open the printed localhost URL. Preparation requires a new output directory and does not overwrite an existing one. Model binaries and generated previews stay outside the repository. The server serves a fixed asset list on loopback only.

## Scope

- Original, WebP, and KTX2 variants use identical geometry, lighting, and camera settings.
- Node decodes and resizes each map to 1024 px, then packs a 2048 px PNG atlas. KTX2 is **not uploaded as a native GPU compressed texture**. Payload badges report the embedded source textures, not the generated atlas transfer size or GPU memory usage.
- This is a static reference pose. Tangent-space normal detail is baked into object space for the reference geometry. Ambiguous overlapping UV texels fall back to interpolated geometric normals. This approach does not support skin animation.
- The shader uses GGX direct lighting, an approximate fixed view direction, and analytic studio reflections. It is not a full HDR environment/IBL pipeline. The ground shadow is decorative CSS.
- WebGPU and WebGL2 share the same example-owned WGSL source, compiled during preparation. Browser code imports only shooosh. The preparation build rejects processing dependencies in the browser graph.
- Like the repository harness, preparation resolves the browser's `shooosh` import to `package/index.ts`. The current prebuilt distribution produced a blank WebGL preview when rebundled; source-based rendering was verified on both backends. This example does not modify the distribution build.
- Changing variants recreates and disposes scene resources. Turntable animation is optional and off by default.

Model attribution: [cuadot on Sketchfab](https://sketchfab.com/cuadot). The source model was supplied locally by the user; this example does not redistribute it or grant a model license.

Validation: standalone viewer TypeScript check, successful preparation of all three variants, and browser rendering on WebGPU and WebGL2. This example adds opt-in rendering work; it does not claim identical performance to an untextured scene.
