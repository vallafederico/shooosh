/**
 * Shader example catalog — each entry's `run` calls createScene / createItem.
 * Fragments stay on the spec so converter tests can read them.
 */

import { domainWarp } from "./domain-warp"
import { gradient } from "./gradient"
import { grainBloom } from "./grain-bloom"
import { grid } from "./grid"
import { itemFill } from "./item-fill"
import { mouseLight } from "./mouse-light"
import { mouseMagnify } from "./mouse-magnify"
import { plasma } from "./plasma"
import { sdfRings } from "./sdf-rings"
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
  itemFill,
]

export function getExample(id: string) {
  return examples.find((entry) => entry.id === id) ?? examples[0]
}
