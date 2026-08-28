/**
 * shooosh — public browser API. Source of truth for what sites may import.
 *
 * How to use:
 *   Dedicated canvas:  createScene(canvas, { screen: { shaders: { fragment: wgsl } } })
 *   Compute (WebGPU):  createCompute(engine); pipelines / ping-pong / setOnCompute
 *   Post (both):       createPostProcessor().addFragmentEffect({ fragmentShader, fragmentShaderWgsl })
 *   Page-behind layer: const engine = await acquireLayer(); createItem(el, { shaders })
 *   Probe only:        await probeRenderer() → "webgpu" | "webgl2" | null
 *
 * Fluids / bloom / FXAA / grain looks live in examples/ — not package presets.
 * Author shaders as WGSL `fn fsMain() -> vec4f`. `vUv` is top-origin.
 * `setUni({ value1 })` → `uUni.values0.x` (WGSL) / `uUni[0].x` (GLSL).
 * Failed compile keeps the last good program — never blank the page.
 *
 * Do not: import `shooosh/msdf` from here or a site bundle (Node/Bun only).
 * Do not: require `frame.gl` from site `onFrame` hooks.
 *
 * Docs: docs/api.md · docs/shader-contract.md · docs/getting-started.md
 * Copy a look: examples/README.md
 */

// Engine
export {
  createEngine,
  initEngine,
  getDefaultEngine,
  type WebGLEngine,
  type EngineFrame,
  type EnginePostFrame,
  type EngineOptions,
  type ClearColor,
  type RenderTarget,
} from "./src/engine/engine";
export { WebGLUnavailableError, GpuUnavailableError, ShaderCompileError } from "./src/engine/errors";
export {
  probeRenderer,
  type RendererKind,
  type ProbeRendererOptions,
} from "./src/engine/capabilities";
export type { UniValues } from "./src/engine/uni";

// Scene (declarative entry)
export { Scene, createScene, type SceneOptions } from "./src/scene/scene";
export { parseSceneDataset } from "./src/scene/dataset";

// WebGPU compute (generic) — fluids / sims live in examples/
export {
  createCompute,
  type ComputeSession,
  type ComputePingPong,
  type ComputeTickContext,
  type ComputeDisplayContext,
  type CreateComputeOptions,
} from "./src/compute";

// Primitives
export {
  createScreen,
  Screen,
  type CreateScreenOptions,
  type ScreenController,
} from "./src/primitives/screen-wrapper";
export {
  createItem,
  Item,
  type CreateItemOptions,
  type ItemController,
} from "./src/primitives/item-wrapper";
export {
  createObject,
  type CreateObjectOptions,
  type ObjectController,
} from "./src/primitives/object-wrapper";
export type { ItemOptions } from "./src/primitives/item";
export type { ObjectOptions, ObjectShaders, ScreenPlacement } from "./src/primitives/object";
export type { FullscreenPlaneShaders } from "./src/primitives/plane";
export {
  createParticles,
  Particles,
  type CreateParticlesOptions,
  type ParticlesController,
} from "./src/primitives/particles-wrapper";
export type { ParticlesOptions } from "./src/primitives/particles";
export {
  createMsdfGlyphs,
  type MsdfGlyphsOptions,
  type MsdfGlyphsHandle,
} from "./src/primitives/msdf-glyphs";

// Post-processing — author shaders only; looks in examples/post-shaders.ts
export {
  createPostProcessor,
  PostProcessor,
  type PostEffect,
  type PostEffectKind,
  type PostProcessorOptions,
  type FragmentEffectOptions,
} from "./src/post/processor";
export { effects, type SceneEffectPreset } from "./src/post/effects";

// Loaders & utilities
export {
  loadTexture,
  resolveTextureUvTransform,
  applyTextureUv,
  textureFitToUni,
  type TextureLoaderResult,
  type TextureHandle,
  type TextureFitMode,
  type TextureUvTransform,
} from "./src/loaders/texture-loader";
export { loadGlb, type GlbMesh } from "./src/loaders/glb-loader";
export { convertWgslFragmentToGlsl } from "./src/shaders/wgsl-compat";
export { convertGlslFragmentToWgsl } from "./src/shaders/glsl-compat";

// Input helpers
export {
  createMouseMonad,
  MouseMonad,
  type MouseMonadState,
  type CreateMouseMonadOptions,
} from "./src/inputs/mouse-monad";
export {
  createMouseTrail,
  MouseTrail,
  type CreateMouseTrailOptions,
  type MouseTrailTextureHandle,
} from "./src/inputs/mousetrail";

// Shared page layer
export { acquireLayer, releaseLayer, type AcquireLayerOptions } from "./src/layer";
