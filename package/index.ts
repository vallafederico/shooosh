// Engine
export {
  createEngine,
  initEngine,
  getDefaultEngine,
  setDefaultEngine,
  resolveEngine,
  type WebGLEngine,
  type EngineFrame,
  type EnginePostFrame,
  type EngineOptions,
  type ClearColor,
  type RenderTarget,
} from "./src/engine/engine";
export { WebGLUnavailableError, ShaderCompileError } from "./src/engine/errors";
export {
  probeRenderer,
  type RendererKind,
  type ProbeRendererOptions,
} from "./src/engine/capabilities";

// Scene (declarative entry)
export { Scene, createScene, type SceneOptions } from "./src/scene/scene";
export { parseSceneDataset } from "./src/scene/dataset";

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
  WebglObject as Object3D,
  type CreateObjectOptions,
  type ObjectController,
} from "./src/primitives/object-wrapper";
export type { ItemOptions } from "./src/primitives/item";
export type { ObjectOptions, ObjectShaders, ScreenPlacement } from "./src/primitives/object";
export type { FullscreenPlaneShaders } from "./src/primitives/plane";

// Post-processing
export {
  createPostProcessor,
  PostProcessor,
  type PostEffect,
  type PostEffectKind,
  type PostProcessorOptions,
} from "./src/post/processor";
export { effects, type SceneEffectPreset } from "./src/post/effects";

// Loaders & utilities
export {
  loadTexture,
  resolveTextureUvTransform,
  type TextureLoaderResult,
  type TextureFitMode,
} from "./src/loaders/texture-loader";
export { loadGlb, type GlbMesh } from "./src/loaders/glb-loader";
export { createFakeHdriCanvas, type CreateFakeHdriOptions } from "./src/loaders/fake-hdri";
export { ensureWatchableUni, type UniValues } from "./src/engine/uni";
export { compileProgramAsync, type AsyncProgram } from "./src/shaders/compile";
export { convertWgslFragmentToGlsl } from "./src/shaders/wgsl-compat";

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

// Geometry helpers
export {
  createObjectGeometry,
  type ObjectShape,
} from "./src/primitives/object.utils";
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

// Shared page layer
export { acquireLayer, releaseLayer } from "./src/layer";
