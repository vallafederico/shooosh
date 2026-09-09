# Optional rig entry audit

`shooosh/rig` is built independently from core, in ESM and CJS with TypeScript
declarations. It is absent from the root, DOM, utils and backend exports. There
are no runtime dependencies, automatic frame callbacks, GPU imports or loaders.
Node extraction remains in `shooosh-model/node` and the `rig` CLI command.

Existing core payload: all 78 pre-existing JavaScript files match the committed
baseline byte-for-byte. The new `dist/rig/` directory is measured separately;
it is deliberately excluded from the existing-core fingerprint, not from browser
import-graph checks. Five normal consumer transfer cases remain unchanged.
Reproduce after `bun run bin/build.ts` and `pnpm --filter shooosh-model build`
with `pnpm --filter shooosh-model test:boundary`. Results are stored in
[the boundary report](../../packages/model/audit/boundary-results.json).

| Consumer | Bun gzip bytes | Vite gzip bytes |
| --- | ---: | ---: |
| Unused `/rig` imports + application sentinel | 44 | 44 |
| `createRig` | 2,148 | 2,143 |
| `createRigAnimator` only | 1,551 | 1,548 |

The unused result contains only the 24-byte application sentinel; rig contributes
zero bytes. The bone-only result excludes animation/palette code; sampler-only
excludes rig construction/palette code. All 70 consumer tree-shaking checks pass.
The original core timing results remain applicable to the identical core code;
using rig math has explicit CPU and memory costs proportional to the rig/tracks.

Validation: 171 tests pass, one optional font test is skipped, no failures, 1,542
assertions. Core and model builds and the model viewer type check pass. Coverage
includes 20,000-node hierarchy traversal, cycles, duplicate keys and names,
non-joint ancestors, immutable references/copies, atomic invalid poses, missing
and malformed inverse binds, joint order, rotated/reflected/tiny-scale mesh
inversion, singular output preservation, sockets, STEP/LINEAR/CUBICSPLINE,
quaternion shortest arcs, cubic tangent timing, negative/loop/end times and
malformed animation channels. The CLI extraction test also checks source/output
preservation, material-independent rig data and Node execution.

The supplied car was extracted without warnings: 73 nodes, 44 bones, one skin,
five clips. All clips were sampled at 21 time points each; all 105 evaluations
produced finite skin palettes. Its generated artifact remains outside the repo
at `/tmp/shooosh-car-cuadot-v2/car.rig.json`, alongside the model attribution.

These are pose/bone utilities, not automatic weight painting, IK, retargeting,
clip mixing or a skinning renderer. No animation playback or mesh deformation
was added to the rigid workbench.

Follow-up: [final tree-shaking verification](./2026-09-09-final-tree-shaking.md)
adds exact bare-output and live-scene comparisons. All 82 consumer checks pass,
plus zero unused bytes across seven browser entry graphs.
