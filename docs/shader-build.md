# Build-time shaders

Unreleased: WGSL translation now belongs to the build. The browser still compiles
and links native shader programs; this removes the JavaScript translator, not GPU
compilation. The supported WGSL subset is unchanged; see [translation](./shader-translation.md).

## Vite / Rollup

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { shoooshShaders } from "shooosh/build"
export default defineConfig({ plugins: [shoooshShaders()] })
```

```wgsl
// gradient.wgsl
fn fsMain() -> vec4f { return vec4f(vUv, 0.5, 1.0); }
```

```ts
import { createScene } from "shooosh"
import shader from "./gradient.wgsl"
createScene(canvas, { screen: { shaders: shader } })
```

For TypeScript, add an ambient declaration:

```ts
declare module "*.wgsl" {
  const shader: Readonly<{ fragment: string; fragmentGlsl: string }>
  export const fragment: string
  export const fragmentGlsl: string
  export default shader
}
```

The plugin transforms plain `.wgsl` imports into WGSL/GLSL data. `?raw` and `?url`
imports pass through. Conversion errors identify the source file and fail the
build. Driver-level validation still happens in the browser. This tool handles
`fsMain` fragments, not compute shaders, custom vertex stages, or post `applyEffect`
functions. Post effects continue to supply their existing WGSL/GLSL pair.

## CLI and other build systems

```sh
shooosh-shader gradient.wgsl gradient-shader.mjs
```

Import the generated default export and pass it as `shaders`. The CLI accepts
`.mjs`, `.js`, or `.ts` output and writes a sibling declaration file. Regenerate
when authoring sources change. Programmatic Node/Bun callers can use
`shaderModule(source)` or `compileShader(source)` from `shooosh/build`.
No build tooling is imported by generated modules.

Repository artifacts can be regenerated after building the package:

```sh
node bin/shader.mjs package/dom/image.wgsl package/dom/image-shader.ts
```

The gradient example imports `.wgsl` directly; its generated `.ts` fixture remains
only for artifact tests and the standalone backend check surface.
The generated sibling declarations are unnecessary for these repository `.ts`
files; only commit the source and generated `.ts` modules. Tests detect stale artifacts.

## Migration and dynamic strings

Raw `shaders: { fragment: wgsl }` works on WebGPU, but now requires a prepared
`fragmentGlsl` for WebGL2. For dynamic or inline authoring, explicitly opt in:

```ts
import { compileShader } from "shooosh/compiler"
const shaders = compileShader(wgsl)
createScene(canvas, { screen: { shaders } })
```

This puts the compiler in that consumer's bundle. Compile once per source change,
not per frame. Both low-level converters also moved from `shooosh` to
`shooosh/compiler`. There is no global compiler registration. Examples and the website now use `.wgsl` build imports. The DOM adapter's built-in image shader is also precompiled.

Prepared pairs work with screens, items and objects. Missing GLSL reports an
error on WebGL2; callers should preserve their readable DOM fallback. Existing
GLSL escape-hatch behavior is unchanged. The global IIFE no longer exposes the
converters; generate shader data ahead of time for script-tag use.

Both shader variants and both renderer implementations remain available by
default. Select backend-only output and production minification using the
[bundle setup guide](./bundle-setup.md).
