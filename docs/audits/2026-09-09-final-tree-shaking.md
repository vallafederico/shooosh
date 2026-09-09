# Final tree-shaking and size verification

Verified against committed baseline `72fe4c7cc204b4a6fdec80a9538727aace10747a`,
using the same installed dependencies and Bun version for both builds.

**Existing browser bundles: +0 bytes.** All 78 pre-existing generated JavaScript
files match byte-for-byte. The separate `dist/rig` build is measured independently;
no rig code is included in simpler entries. All five consumer cases retain the
same initial and total emitted raw/gzip bytes, including lazy backend chunks.

| Consumer | Initial raw bytes | Initial gzip bytes | Change |
| --- | ---: | ---: | ---: |
| probeRenderer | 749 | 452 | 0 |
| createItem | 11,136 | 4,887 | 0 |
| createScene | 39,686 | 15,927 | 0 |
| createDomLayer | 27,989 | 11,369 | 0 |
| scene + DOM | 53,416 | 20,969 | 0 |

**82 Bun/Vite consumer checks pass.** Unused named imports, namespace imports,
side-effect imports of all browser entries, and unused rig-example imports both
directly and through the example barrel produce exactly the bare application's
output: 24 raw bytes / 44 gzip bytes for the test sentinel, with zero library
bytes. Adding an unused rig import to a live createScene consumer preserves its
initial and total emitted sizes in both bundlers. Paired tests use the same entry
basename because Bun embeds that basename in shared chunk filenames.

Bone-only consumers discard animation/palette helpers; sampler-only consumers
discard rig construction/palette helpers. Rig, compiler, font tools and physics
leakage checks continue to pass for unrelated consumer graphs.

**Seven browser entry graphs pass** separate esbuild checks: core, DOM, WebGPU,
WebGL2, rig, model controller and model adapter. Each adds zero bytes when unused;
none contains the Node/native conversion dependencies. The full Node processing
entry cannot be bundled for the browser. The model/core builds also pass.

These are ESM browser-consumer guarantees. Optional functionality costs bytes
when used, and extra opt-in files increase package installation size. The gallery
includes its examples intentionally; this audit does not claim its full app
bundle or the npm installation stayed the same size. No library implementation
changes were needed for this verification.

Reproduce:

```sh
bun run bin/build.ts
pnpm --filter shooosh-model build
pnpm --filter shooosh-model test:boundary
```

Core build runs `bin/test-tree-shaking.ts` (82 checks). Machine-readable baseline
sizes and unused-entry results are in
[boundary-results.json](../../packages/model/audit/boundary-results.json).
