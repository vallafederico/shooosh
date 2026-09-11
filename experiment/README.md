# Private experiments

This workspace is for prototypes and comparisons, not a supported library entry.
It is private, has no exported API and has its own Vite build and public assets.
Production packages, website, examples and harness must never import it. The
root package's explicit publish file list excludes this directory.

From the repository root:

```sh
pnpm --filter shooosh-experiment dev
# http://localhost:5199/text-bench.html
pnpm --filter shooosh-experiment build
pnpm --filter shooosh-experiment preview
pnpm --filter shooosh-experiment test
bun bin/check-experiment-isolation.ts
```

Prepare assets/shaders offline. Runtime loads prepared assets, allocates GPU
resources and performs only input-dependent updates and draws. Do not ship font
parsers, packers, shader translators or benchmark instrumentation to core. Slug
curve and band textures are prepacked binary buffers, including float16 encoding.
Glyph lookup tables and reusable update buffers are allocated once per mount.

See [benchmark guide](../docs/text-benchmark.md) for reproduction and results.
Moving an experiment into a public optional entry requires explicit review of
its API, runtime dependencies, tree shaking, bundle budgets and both backends.

## Recorded text benchmark results

Measured 2026-09-11 using a production preview in Chrome 152 on macOS,
WebGL2, an 800×480 viewport and the same Abel Regular font. Values below
are **GPU draw medians in milliseconds**, with two trials per scenario in
A–B–B–A order and 179 available GPU query samples per trial.

| Workload | Renderer | Static: first / second | Changing: first / second |
| --- | --- | ---: | ---: |
| 500 glyphs · 16px · DPR 1 | MSDF | 0.108 / 0.105 | 0.104 / 0.105 |
| 500 glyphs · 16px · DPR 1 | Slug reference | 0.210 / 0.235 | 0.189 / 0.173 |
| 16 glyphs · 96px · DPR 2 | Default SDF | 0.169 / 0.185 | 0.171 / 0.183 |
| 16 glyphs · 96px · DPR 2 | Slug reference | 0.185 / 0.190 | 0.259 / 0.190 |

The atlas renderer was cheaper in these local trials, with a smaller gap in
the large-text SDF comparison. Default SDF and Slug both looked clean in the
inspected large-text captures. The optional MSDF bake showed artifacts on
“e”, “t” and some corners, so its timing alone does not establish a quality win.

These are historical measurements from before the move into this workspace
and the subsequent offline binary-packing/reusable-buffer changes, not a fresh
measurement of the current revision. They exclude preceding text-update buffer
uploads and are not end-to-end frame times. Results do not establish a universal
ranking across devices, fonts or sizes. Slug here is our WebGL2 port of the free
reference coverage shader, not the commercial SDK. WebGPU atlas rendering was
smoke-tested, but GPU timing and the Slug comparison are WebGL2-only.

For future runs, retain the exported JSON and record the commit, browser/device,
font, glyph count, size, DPR and visual findings alongside timings. See the
[full benchmark guide](../docs/text-benchmark.md) for methodology and limitations.

## MSDF artifact fix (2026-09-11)

The earlier visible defects were caused by the runtime RGB median expression,
not a defective atlas bake. Both WebGL2 and WebGPU used
`max(min(r,g), min(b,r))`, which returns the wrong value when red is lowest.
Both now use `max(min(r,g), min(max(r,g),b))`. The example shader was corrected
too. The original 64px atlas and its dimensions are retained. No additional
runtime dependency or texture memory was introduced; the shader adds the
necessary scalar maximum. Seven experiment tests and the 82 tree-shaking checks
pass; two new tests exercise the actual shader expressions over RGB permutations.

The enlarged MSDF capture is now clean. Historical quality conclusions above
are superseded by this fix. The comparison remains experiment-only.

Rerun with the corrected median, production preview, same Chrome/macOS WebGL2
setup, 500 glyphs at 16px / DPR 1 (GPU medians in ms):

| Renderer | Static: first / second | Changing: first / second |
| --- | ---: | ---: |
| Corrected MSDF | 0.935 / 0.941 | 0.580 / 0.305 |
| Slug reference | 1.168 / 1.427 | 1.126 / 1.494 |

These runs were substantially noisier than the historical session, including
for unchanged Slug. Do not interpret the absolute differences across sessions
as the cost of the median fix. Each trial retained 179 GPU query samples.

A subsequent 96px / DPR 2 pass (16 glyphs) settled to much tighter GPU medians:

| Renderer | Static: first / second | Changing: first / second |
| --- | ---: | ---: |
| Corrected MSDF | 0.190 / 0.179 | 0.180 / 0.180 |
| Slug reference | 0.190 / 0.191 | 0.208 / 0.188 |

At this size the two are close; these numbers do not justify a broad speed
ranking. Clean MSDF rendering was visually confirmed on WebGL2 and WebGPU at
96px / DPR 2 using the original atlas. The package build and all 82 tree-shaking
checks pass. Full package tests: 192 pass, with the same two existing model
integration failures. Experiment type-check and seven experiment tests pass.

## Bundle size and perceived startup speed

Run `pnpm --filter shooosh-experiment audit:startup` to build independent SDF,
MSDF and Slug pages and regenerate the [payload report](results/startup-bytes.md)
and [machine-readable byte inventory](results/startup-bytes.json). All emitted JS
(including lazy WebGPU chunks) is counted there; **it is not the same as the JS
actually fetched on a WebGL2 startup**. These are adapter-plus-measurement-shell
costs, not the size of a bare library import. No audit code enters core.

Serve each separately, for example:

```sh
pnpm --filter shooosh-experiment exec vite preview --outDir dist/startup-sdf --port 5201
# /startup.html; use startup-msdf or startup-slug for the other builds
```

The page records navigation TTFB (including connection/setup), request wait time,
per-resource download/transfer/encoded/decoded bytes, module import, mount to
first draw, first-text render opportunity, paint entries, long tasks, layout
shifts, and text-update CPU/next-frame latency. Change text and export JSON to
retain interaction samples. Unsupported observer types remain unavailable.

Local smoke measurements, 2026-09-11, Chrome 152/macOS, WebGL2, 500 glyphs at
16px/DPR 1. Single observed navigation per row, cache state uncontrolled:

| Renderer | Requested JS body, encoded KiB | Font body, encoded KiB | Document TTFB ms | FCP ms | First-text opportunity ms | Edit-to-frame opportunity ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SDF | 13.17 | 19.64 | 2.7 | 48 | 61.4 | 14.9 |
| MSDF | 13.17 | 35.56 | 5.1 | 40 | 59.8 | 14.8 |
| Slug | 6.19 | 768.64 | 7.6 | 68 | 61.9 | 13.2 |

No long tasks were observed in these smoke samples. Slug's `.bin` responses were
uncompressed by this preview server; their mostly padded data compresses very
well in the offline byte audit. Production must actually serve compressed data
to realize those estimates. Encoded body sizes exclude HTTP headers and may also
be reported for cached responses; consult `transferBytes` per resource for actual
network traffic. Font assets include the current metadata dependency.

First-text opportunity means a successful draw plus two RAF callbacks, **not an
actual compositor presentation timestamp**; it can precede an asynchronously
reported FCP. FCP/LCP can describe the HTML shell rather than canvas text. Recorded
event samples are not a field INP score. Local TTFB excludes realistic WAN/CDN
conditions. No cold-cache, mobile, throttled-network or field-CWV claim is made.
For a release decision, repeat in fresh browser profiles and warm reloads, under
representative network/CPU conditions and on real devices, retaining raw JSON.
