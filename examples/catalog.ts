/**
 * Shader example catalog — each entry's `run` calls createScene / createItem.
 * Fragments stay on the spec so converter tests can read them.
 */

import { domainWarp } from "./domain-warp"
import { fluidAmbient } from "./fluid-ambient"
import { fluidPointer } from "./fluid-pointer"
import { gradient } from "./gradient"
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
  valueNoise,
  sdfRings,
  domainWarp,
  grid,
  mouseLight,
  mouseMagnify,
  grainBloom,
  texturedPlane,
  texturedItem,
  itemFill,
  msdfText,
  sdfIcons,
  objectSpin,
  objectEnv,
  objectPbr,
  objectMesh,
  particlesField,
  fluidPointer,
  fluidAmbient,
  scrollCards,
  scrollSections,
]

export function getExample(id: string) {
  return examples.find((entry) => entry.id === id) ?? examples[0]
}
