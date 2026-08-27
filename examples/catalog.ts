/**
 * Shader example catalog — fragments only, no engine import.
 * The harness and `mount.ts` turn these into live scenes.
 */

import { domainWarp } from "./domain-warp"
import { gradient } from "./gradient"
import { grainBloom } from "./grain-bloom"
import { itemFill } from "./item-fill"
import { mouseLight } from "./mouse-light"
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
  mouseLight,
  grainBloom,
  itemFill,
]

export function getExample(id: string) {
  return examples.find((entry) => entry.id === id) ?? examples[0]
}
