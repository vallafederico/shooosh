/**
 * Public example entry. Each file in this folder uses shooosh for a common look.
 */

export { examples, getExample } from "./catalog"
export { mountExample, type MountExampleOptions } from "./mount"
export type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"
export { run as runGradient, fragment as gradientFragment } from "./gradient"
export { run as runPlasma, fragment as plasmaFragment } from "./plasma"
export { run as runValueNoise, fragment as valueNoiseFragment } from "./value-noise"
export { run as runSdfRings, fragment as sdfRingsFragment } from "./sdf-rings"
export { run as runDomainWarp, fragment as domainWarpFragment } from "./domain-warp"
export { run as runGrid, fragment as gridFragment } from "./grid"
export { run as runMouseLight, fragment as mouseLightFragment } from "./mouse-light"
export { run as runMouseMagnify, fragment as mouseMagnifyFragment } from "./mouse-magnify"
export { run as runGrainBloom, fragment as grainBloomFragment } from "./grain-bloom"
export { run as runItemFill, fragment as itemFillFragment } from "./item-fill"
export { run as runMsdfText, fragment as msdfTextFragment } from "./msdf-text"
export { run as runSdfIcons, fragment as sdfIconsFragment } from "./sdf-icons"
export { makeIconSdfCanvas, makeDemoFontAtlas, packMsdfLine, alphaToSdf } from "./make-sdf"
export { run as runFluidPointer, fragment as fluidPointerFragment } from "./fluid-pointer"
export { run as runFluidAmbient, fragment as fluidAmbientFragment } from "./fluid-ambient"
export { run as runScrollCards, fragment as scrollCardsFragment } from "./scroll-cards"
export { run as runScrollSections, fragment as scrollSectionsFragment } from "./scroll-sections"
export { run as runTexturedPlane, fragment as texturedPlaneFragment } from "./textured-plane"
export { run as runTexturedItem, fragment as texturedItemFragment } from "./textured-item"
export { run as runObjectSpin, fragment as objectSpinFragment } from "./object-spin"
export { run as runObjectEnv, fragment as objectEnvFragment } from "./object-env"
export { run as runObjectPbr, fragment as objectPbrFragment } from "./object-pbr"
export { pbrFragment } from "./pbr-shaders"
export { run as runObjectMesh, fragment as objectMeshFragment } from "./object-mesh"
export { run as runParticlesField, fragment as particlesFieldFragment } from "./particles-field"
export { fluidShaders, type FluidShaders } from "./fluid-shaders"
export { createFluidSim, type FluidSim, type FluidSplat } from "./fluid-sim"
export { makePaperCanvas, makeEnvCanvas } from "./make-texture"
export {
  bloomEffect,
  bloomEffectWgsl,
  grainEffect,
  grainEffectWgsl,
} from "./post-shaders"
