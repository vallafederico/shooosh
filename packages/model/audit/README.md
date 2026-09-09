# Adversarial and browser-boundary audit — 2026-09-09

The core browser payload is unchanged from commit
`72fe4c7cc204b4a6fdec80a9538727aace10747a`. All 78 generated JavaScript files
match byte-for-byte, including backend chunks. The same Bun version and installed
dependency versions were used to build an isolated archive of that commit.
No `package/` renderer source or root package dependency declarations changed.

The reproducible results are in [boundary-results.json](./boundary-results.json).
Run after building core and model packages:

```sh
bun run bin/build.ts
pnpm --filter shooosh-model build
pnpm --filter shooosh-model test:boundary
bun test packages/model/test
```

`test:boundary` creates/removes an isolated baseline directory, verifies the full
core JS fingerprint, compares five consumer bundles, and checks six browser
import graphs. It fails on CLI/native dependency leakage or payload drift.

| Consumer       | Initial raw bytes | Initial gzip bytes | Delta |
| -------------- | ----------------: | -----------------: | ----: |
| probeRenderer  |               749 |                452 |     0 |
| createItem     |            11,136 |              4,887 |     0 |
| createScene    |            39,686 |             15,927 |     0 |
| createDomLayer |            27,989 |             11,369 |     0 |
| scene + DOM    |            53,416 |             20,969 |     0 |

Total emitted bytes, including lazy chunks, are also identical for every case.
These are browser transfer measurements, not npm installation sizes. The
separate model package contains Node dependencies and local viewer assets.
Its explicitly imported runtime controller/adapter is an opt-in browser payload;
it is not silently included in shooosh. Those graphs contain no Sharp, Assimp,
glTF Transform, Draco, meshoptimizer, texture decoder, process-launching code or
Node built-ins. Importing the Node entry in a browser build fails.

## Runtime measurements

[performance-results.json](./performance-results.json) records 16 visible-browser
runs using the existing `harness/perf.html`: one baseline/current idle pair and
three alternating baseline/current active pairs on each backend. The viewport
was 1280×720 at DPR 2, with a 1.5-second warmup and ~1-second sample. Both archives
used the same harness code. The active fixture rendered 20 DOM-tracked images.

| Measurement                                                    | Baseline             | Current              |
| -------------------------------------------------------------- | -------------------- | -------------------- |
| WebGPU/WebGL2 idle frames, bounds reads, style reads, requests | all 0                | all 0                |
| WebGPU active frames per sample                                | 120                  | 120                  |
| WebGPU callback p50 / p95                                      | 0.1–0.2 / 0.2–0.3 ms | 0.1 / 0.2 ms         |
| WebGL2 active frames per sample                                | 121                  | 120–121              |
| WebGL2 callback p50 / p95                                      | 0.1–0.2 / 0.2–0.3 ms | 0.1–0.2 / 0.2–0.3 ms |

Active runs made one bounds read/request per frame and zero style reads on both
versions. No visibility interruptions or external wake events were recorded.
There is no observed added work or performance regression. Timings are
instrumented callback spans, not GPU timings or entire frames. The 1-frame
variation is within sample/refresh-boundary noise. Exact wall-clock equality
cannot be promised, and CLI encoding work competes for system resources if run
concurrently with rendering; it does not add work to the renderer itself.
Different model complexity or texture dimensions also change asset costs.

## Issues found and fixed in Node/CLI code

1. **External resource escape:** glTF and Assimp references could read outside
   the source tree, including through symlinks. Resource resolution now decodes
   paths, checks canonical containment, rejects network schemes and requires
   regular files. Validator reads use the same policy.
2. **KTX cancellation cleanup:** killing a conversion worker during external
   encoding could orphan the encoder and its scratch files. The parent now
   owns KTX processes, kills them on cancellation/timeout, awaits completion,
   and removes the entire per-job scratch tree.
3. **Inherited Node execution flags:** calls made from `node --input-type=module`
   failed when a file-based worker inherited incompatible flags. Workers run
   built JS with a clean `execArgv`.
4. **Unvalidated parser inputs:** unsupported required extensions, cyclic
   hierarchies and oversized `.gltf` JSON are rejected before dependency parsing.
   A default 512 MiB decoded-accessor estimate also rejects sparse-accessor
   allocation bombs. `openModel(path, { maxDecodedBytes })` can explicitly raise
   that estimate for trusted large assets; it is not a process-wide memory cap.
5. **Unsigned KTX dimensions:** mip dimensions now use arithmetic division,
   avoiding signed bit-shift truncation for malformed large dimensions.

## Adversarial coverage

Final verification: `bun test package` passed 160 tests, with one optional font
atlas test skipped and no failures (1,428 assertions). The model build, viewer
type check, core build and browser boundary audit also pass.

The suite covers eight resource-escape variants, network references, escaping
symlinks, unknown required extensions, hierarchy cycles and a 20,000-node chain,
oversized JSON, sparse-accessor allocation bombs, invalid transforms,
source/output collisions, concurrent output races, shell-like filenames,
512 deterministic malformed KTX headers, corrupt PNGs, cancellation and timeout
during a real launched test encoder, child-process death, scratch cleanup, and
no partial output. These tests augment model round trips, FBX/OBJ/DAE/STL/PLY/3DS/
OFF conversions, shared material bindings, data-map preservation, KTX2/Basis,
BC7/ETC2/ASTC decode checks, mip validation, glTF color-space compatibility,
no-overwrite behavior, and local HTTP route/Host/CSP restrictions.

The user-supplied car also exercises an actual rigged asset with 26,923 triangles,
five clips and four bound texture images (metallic/roughness packed). The full
KTX conversion path is rerun after the cleanup changes and its textures validated.

Scope: the official KTX and Assimp/Sharp/WASM codecs remain dependencies, not
formally verified parsers. The public low-level `createModelIO()` interface is
for trusted programmatic use; high-level `openModel` adds the accessor budget.
Prepared browser manifests are application-controlled build artifacts, with
geometry/hash checks; this audit does not certify arbitrary untrusted manifests,
all codecs, every GPU or every operating system. No native compressed GPU upload
was added to the engine.

## Textured workbench follow-up

The CLI workbench now prepares base-color PNG previews and UV data on Node.
Default generated site geometry is unchanged; including preview textures through
`prepareModel` is explicit. The optional model adapter adds texture upload/shading
and a solid/textured toggle. This changes that opt-in adapter and local viewer,
not the core shooosh browser builds. The boundary results were regenerated after
this addition; the earlier timing samples describe the unchanged core workload,
not the cost of rendering a newly textured model.

Verification: 162 tests pass, one optional font test is skipped, and builds/type
checks pass. The new regression checks UV preservation through flat-normal
splits, binary alignment, asymmetric image orientation, sampler metadata,
unsupported UV fallback, source preservation and unchanged default binary output.
The actual car displays matching base-color textures on WebGPU and WebGL2;
the solid/textured toggle was checked visually. Its WebP and KTX2 variants also
successfully prepare decoded texture previews on Node.

## Optional rig follow-up

`shooosh/rig` adds a separate opt-in build. The 78 existing core files remain
identical; `dist/rig` is excluded from the existing-core fingerprint and measured
as its own browser graph. No rig imports enter the model controller or viewer.
See the [rig audit](../../../docs/audits/2026-09-09-optional-rig.md) for the latest
171-test result, 70 consumer checks and actual car rig sampling.
