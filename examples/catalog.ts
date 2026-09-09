import { gpgpuSphere } from "./gpgpu-sphere"
import { gpgpuParticles } from "./gpgpu-particles"
import { rigBones } from "./rig-bones"
import { raymarchClouds } from "./raymarch-clouds"
import { carPbr } from "./car-pbr"
import { raymarchLights } from "./raymarch-lights"
import { physics3D } from "./physics-3d"
import { physicsPile } from "./physics-pile"
import { physicsPendulum } from "./physics-pendulum"
import { sss } from "./sss"
import { ssao } from "./ssao"
/**
 * Shader example catalog — each entry's `run` calls createScene / createItem.
 * Fragments stay on the spec so converter tests can read them.
 */

import { fabricSheen } from "./fabric-sheen"
import { domainWarp } from "./domain-warp"
import { domIntegration } from "./dom-integration"
import { fluidAmbient } from "./fluid-ambient"
import { fluidPointer } from "./fluid-pointer"
import { gradient } from "./gradient"
import { fxaa } from "./fxaa"
import { grainBloom } from "./grain-bloom"
import { grid } from "./grid"
import { itemFill } from "./item-fill"
import { mouseLight } from "./mouse-light"
import { mouseMagnify } from "./mouse-magnify"
import { msdfText } from "./msdf-text"
import { objectEnv } from "./object-env"
import { objectMesh } from "./object-mesh"
import { objectPbr } from "./object-pbr"
import { objectSpin } from "./object-spin"
import { particlesField } from "./particles-field"
import { plasma } from "./plasma"
import { refractiveGlass } from "./refractive-glass"
import { scrollCards } from "./scroll-cards"
import { scrollSections } from "./scroll-sections"
import { sdfIcons } from "./sdf-icons"
import { sdfRings } from "./sdf-rings"
import { texturedItem } from "./textured-item"
import { texturedPlane } from "./textured-plane"
import type { ExampleSpec } from "./types"
import { valueNoise } from "./value-noise"

export const examples: ExampleSpec[] = [
  gradient,
  plasma,
  raymarchClouds,
  raymarchLights,
  valueNoise,
  sdfRings,
  domainWarp,
  grid,
  mouseLight,
  mouseMagnify,
  refractiveGlass,
  grainBloom,
  fxaa,
  texturedPlane,
  texturedItem,
  domIntegration,
  itemFill,
  msdfText,
  sdfIcons,
  objectSpin,
  physicsPile,
  physics3D,
  physicsPendulum,
  objectEnv,
  objectPbr,
  carPbr,
  rigBones,
  fabricSheen,
  objectMesh,
  particlesField,
  gpgpuParticles,
  gpgpuSphere,
  fluidPointer,
  fluidAmbient,
  scrollCards,
  scrollSections,
  sss,
  ssao,
]

export function getExample(id: string) {
  return examples.find((entry) => entry.id === id) ?? examples[0]
}
