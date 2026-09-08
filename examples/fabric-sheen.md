# Fabric, sheen and clearcoat

**WIP:** experimental demos. Bundle and runtime checks cover integration; they do not establish production readiness or full visual correctness.

Open `/?demo=fabric-sheen&backend=webgpu` in the Vite harness; repeat with
`backend=webgl2`. Three identical rounded meshes share the same light and base
color. Left is diffuse, centre adds tinted sheen, right also adds clearcoat.

Copy `fabric-sheen.ts`, `types.ts` and the three `materials/*.ts` helpers.
Call `run(canvas, { backend: "auto" })` on a client canvas with a nonzero CSS size
and a positioned parent. Native range controls are mounted in that parent;
call the returned `destroy()` on unmount. Initialization checks destruction before
creating meshes. No textures, model downloads, physics or automatic animation.

| Control / slot | Meaning |
| --- | --- |
| `value1` | Sheen roughness, 0.12–1 |
| `value2` | Sheen strength, 0–2 |
| `value3` | Coat strength, 0–1 |
| `value4` | Coat roughness, 0.1–0.8 |
| `value5` | Procedural weave normal detail, 0–1 |
| `value6` | Shared light azimuth in radians |

Controls use native labels and keyboard range behavior. Each input updates the
uniforms; there is no time uniform or application RAF. The underlying engine
still renders its normal settle window after changes. A derivative-based fade
suppresses weave detail when it becomes too fine for the screen footprint.

## Import only the material needed

```ts
import { composeFabric } from "./materials/fabric"
import { sheenWgsl } from "./materials/sheen"

const fragment = composeFabric(sheenWgsl,
  "base + fabricSheen(n, l, v, rough) * uUni.values0.y")
// Pass fragment and the six uniform slots above to createObject.
```

The composer imports no optional lobes. Clearcoat is a separate WGSL string in
`materials/clearcoat.ts`; a sheen-only consumer does not include it. The comparison module assembles all three variants. Importing that module can
retain unselected variant strings in Bun; use the helper imports shown above for
a single material, which are checked under both bundlers. Changing a strength to
zero is an A/B control, not download elimination; omit the lobe import to remove it.

This is an artistic material example: a cloth-like sheen distribution, a GGX
coat, approximate ambient fill and procedural normal perturbation. It is not an
energy-compensated layered BSDF, anisotropic woven-fibre model, or cloth simulator.
The fixed view direction follows the existing PBR example; adapt it for a moving
camera. Base color, sheen tint and light intensity are shader constants.

Reference: [sciecode/sheen](https://github.com/sciecode/sheen/blob/master/src/modules/cloth.js)
combines sheen, clearcoat and bump detail with a separate cloth simulation. This
example uses freshly authored WGSL and no Three dependency or copied simulation.

Verification: `bun test examples/materials.test.ts` checks conversion and isolated
shader imports with Bun and Vite/Rollup. Also run `bun test package` and
`bun run bin/build.ts`. In the browser, compare all three meshes on both backends;
set sheen and coat to zero, vary light/detail, use keyboard controls, then switch
away and back to verify disposal/remount. GPU shader execution time is not measured
by bundle size or conversion tests.

Verified in the local harness on WebGPU and WebGL2, including keyboard zero-strength
A/B and switching away/back. The helper-only fixtures measured 495/503 gzip bytes
for diffuse and 696/703 for sheen (Bun/Vite, gzip-9, includes the tiny consumer).
These are shader composition bytes, not the total scene bundle or GPU timing.

## WIP verification

`bun run bin/build.ts` runs direct/index consumer bundle checks under Bun and
Vite, plus the material conversion/isolation tests (`bun run test:examples`).
Build the runtime audit with `bun run --cwd harness build:perf`, preview it, then
open `/perf.html?backend=webgpu&scenario=wip` and repeat with `backend=webgl2`.
The WIP group includes fabric, SSS and SSAO. SSS/SSAO on WebGL2 test their explicit
fallback, not a simulated version of the effects. Idle checks are not a substitute
for visual correctness, control interaction or GPU timing checks.
