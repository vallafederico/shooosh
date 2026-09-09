# OGL size comparison

**Historical baseline:** see the [updated comparison](./2026-09-09-ogl-optimized.md) after backend-only builds and lightweight scenes.

Measured 2026-09-09 with OGL 1.0.11 from npm and the current shooosh source
checkout. Both use Bun 1.4.0, browser ESM, minify:true, splitting:false, gzip-9.
Namespace exports or selected constructors are retained in `globalThis.api`.
These are export-retention fixtures, not complete equivalent applications.
No repository dependencies or library code were changed for this comparison.

| Fixture | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| OGL all exports | 135,079 | 39,310 |
| shooosh all root exports | 141,663 | 43,557 |
| OGL Renderer + Geometry + Program + Mesh | 44,994 | 12,779 |
| shooosh createEngine + createScreen | 36,508 | 13,161 |
| shooosh createScene | 89,924 | 27,841 |

OGL's [README](https://github.com/oframe/ogl#weight) advertises 29kb minzipped
(Core 8, Math 6, Extras 15). That is its documented guide, not the result of this
current-version build using the same toolchain as shooosh. Our full retained
namespace is 4,247 gzip bytes (~10.8%) larger than OGL's under these settings.

Shooosh carries WebGPU and WebGL2 implementations and runtime WGSL/GLSL
translation. OGL describes itself as tightly coupled to WebGL. These scope
differences help explain size but do not establish an exact additive attribution.
Rapier, DOM adapter and optional utils are absent from the root fixture.

`createScene` statically imports screen, item and object wrappers, the texture
loader and post processor. Those optional behaviors remain reachable through
its configuration. Export-level tree-shaking alone cannot remove all of them.
This is a composition-boundary opportunity: explicit screen-only composition
already retains much less than the general scene helper.

Single-file gzip totals differ from summed gzip of independently compressed
ESM chunks. Previously published README scene numbers are the *initial* static
closure of a split Vite consumer, not this complete single-file payload.
