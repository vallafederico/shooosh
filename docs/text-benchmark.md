# SDF / MSDF versus free Slug reference benchmark

The checkout-only tool compares our actual `createMsdfGlyphs` renderer with a
WebGL2 port of Eric Lengyel's **free Slug reference coverage shader**. It requires
no commercial SDK and no Three.js. All code/assets are experiment-only; nothing is
imported by the library or website.

```sh
pnpm --filter shooosh-experiment build
pnpm --filter shooosh-experiment preview
# Open /text-bench.html at the printed URL
```

For development: `pnpm --filter shooosh-experiment dev`, then `/text-bench.html`.
Use a production preview and a visible tab for measurements. Choose WebGL2 and
**Compare SDF / Slug**. Trials run A–B–B–A, with static and changing text for each
adapter. Each warms up 60 frames and samples 180 frames. A single adapter can also
be selected. The atlas adapters support WebGPU; Slug currently rejects WebGPU
explicitly, so there is no misleading cross-backend comparison.

## What is matched and measured

Both use the same bundled OFL Abel Regular TTF, text, em size, fixed grid/baselines,
white premultiplied glyph color, viewport, DPR and visible glyph count. Font SHA256
is included in reports. Text update alternates equal-length strings with identical
character repertoires. Atlas padding and Slug's curve bounds differ, as they do
in actual rendering; the visible outlines share placement. Grid placement is
synthetic: this is not shaping, kerning, DOM layout or editable-input performance.

Reports separate initialization, CPU update, CPU draw submission, RAF interval,
and GPU draw elapsed time (median/p95/max and sample counts). WebGL2 uses
`EXT_disjoint_timer_query_webgl2` asynchronously, rejects disjoint timings and
reports null if unsupported. GPU intervals cover rendering/clear, **not the
preceding update's buffer upload**. CPU submission includes query overhead.
RAF is refresh-rate capped; very small CPU spans can round to zero. GPU queue
completion is outside sampled CPU spans. WebGPU GPU timing is currently null.

Initialization includes fetching/preparation and first successful draw; cached
runs are not cold-start comparisons. Shooosh uses its engine, while Slug uses a
minimal instanced WebGL2 adapter. CPU submission differences include that engine
integration overhead, not just glyph algorithm cost. Slug uses RGBA16F curves
and RG16UI bands in 4096-wide textures, eight bands per axis, without optional
optical weight boost. Packing is correct but not globally memory-optimal.

The 2D Slug quads expand by one physical pixel with corresponding em coordinates,
a specialization for axis-aligned text; this benchmark does not evaluate the
reference vertex shader's general projective dynamic dilation, rotated text,
color glyphs or typography services. Do not advertise these results as the
commercial Slug SDK's performance.

Visibility/viewport changes invalidate results. Controls lock during a run.
The glyph count cannot exceed the visible grid. Blank output rejects timings.
Images captured outside the timed loops let you inspect both outputs, and JSON
export keeps trial settings and results. Repeat runs on the same hardware/power
mode, at different sizes/DPR/counts. A single desktop result is not a general
speed ranking. For quality checks, compare the saved captures at original size.

## Rebuild assets and shader

The committed small font/atlas/curve assets make the tool runnable without Python.
To reproduce them, install `fonttools` in a separate Python virtual environment:

```sh
python3 -m venv /tmp/shooosh-fonttools
/tmp/shooosh-fonttools/bin/pip install fonttools
/tmp/shooosh-fonttools/bin/python experiment/scripts/text-bench/prepare.py \
  experiment/assets/Abel-Regular.ttf experiment/assets/abel-slug.json
bun experiment/scripts/text-bench/bake.ts
python3 experiment/scripts/text-bench/pack-runtime.py
python3 experiment/scripts/text-bench/port-slug.py
bun test experiment/src/text-bench
```

The font packer accepts quadratic TrueType outlines, resolves implied points and
composites via fontTools, and rejects cubic fonts. Bands overlap by 1/1024 em,
omit ray-parallel segments and sort curves by descending maximum ray coordinate.
Tests check every band for completeness, sorting and valid texture addresses.
The SDF and MSDF atlases are baked at 64px with distance range 8 through our existing CLI API.

The Slug HLSL source is vendored at commit
`be3c13eb7d63f9e8aa5c583e42d92c374cb91d98`; the mechanical GLSL translation keeps
its root-eligibility, polynomial solving and coverage combination. This is an
explicit legacy shader port for comparing the reference, not a new core preset.
Original source, MIT license and attribution live in `experiment/src/text-bench/vendor/slug/`.

- Reference: https://github.com/EricLengyel/Slug
- Free-release announcement: https://terathon.com/blog/decade-slug.html
- Font: https://github.com/google/fonts/tree/main/ofl/abel (OFL bundled beside TTF)

A trusted same-origin module may still be loaded via **Local adapter**, implementing
`experiment/src/text-bench/contract.ts`. It must prepare a successful draw, submit one
frame per render without its own RAF, release resources on failure/destruction,
and identify its version/font. Optional GPU hooks start sampling and return GPU
milliseconds. Never substitute another renderer while reporting it as Slug.

## First local run (2026-09-11)

Production preview, Chrome 152/macOS, WebGL2, 800×480, DPR 1, 500 glyphs, 16px.
Two observations per adapter/scenario in A–B–B–A order:

| GPU draw median (ms) | First | Second |
| --- | ---: | ---: |
| MSDF static | 0.108 | 0.105 |
| MSDF changing | 0.104 | 0.105 |
| Slug static | 0.210 | 0.235 |
| Slug changing | 0.189 | 0.173 |

179 available GPU query samples per trial. On this workload MSDF's draw was
cheaper. This is not evidence for all sizes, devices or implementations. CPU
update/upload work is separate. Browser validation found no GPU warning/errors.

Validation: six benchmark tests pass (9,464 assertions); package build and all
82 tree-shaking checks pass. `bun test package` reports 190 passes and two model
integration failures (rig CLI extraction and generated-interface type checking),
also present before this integration. Harness-wide TypeScript still reports five
existing unresolved backend/compiler imports in `backend-check.ts` and `dom.ts`;
no errors in benchmark files. The benchmark production build passes.

Large-text visual check (96px, DPR 2): the optional MSDF bake has artifacts on e/t and some corners; Slug is clean in those captures. The default comparison now uses our font generator's default SDF bake, with MSDF available separately. Earlier table values above are specifically MSDF, not the new default SDF run.

Default SDF follow-up, 16 glyphs at 96px / DPR 2: SDF GPU medians were
0.169/0.185 ms static and 0.171/0.183 ms changing. Slug was 0.185/0.190 ms
static and 0.259/0.190 ms changing. Both rendered cleanly in the inspected
captures. The variation across runs reinforces that these are local observations,
not universal ratios. WebGPU atlas smoke also completed; GPU timing correctly
remained unavailable there. Unsupported Slug/WebGPU comparison rejects explicitly.

The benchmark now lives in the private `experiment/` workspace. The normal harness no longer copies its public assets. Slug texture packing and float16 conversion run offline; runtime uploads the prepared binary textures. The root build enforces `bin/check-experiment-isolation.ts`.

## Corrected diagnosis (2026-09-11)

The MSDF artifacts described above were traced to an incorrect RGB median in
both runtime shaders, not the atlas generator. The original atlas renders cleanly
with `max(min(r,g), min(max(r,g),b))`. Shader-expression regression tests cover all
343 combinations of seven representative values per backend. No texture resize,
rebake workaround, or added runtime dependency is needed. Use the latest rerun
results in the experiment README; earlier quality conclusions are superseded.

The post-fix large-text A–B–B–A run measured MSDF static 0.190/0.179 ms,
changing 0.180/0.180 ms; Slug static 0.190/0.191 ms, changing 0.208/0.188 ms.
Small-text timings in this session were noisy and are recorded separately in the
experiment README. They should not be used to infer a regression from the older
session. The median fix uses the unchanged original atlas on both backends.
