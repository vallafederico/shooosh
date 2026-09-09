import { fabricPrefix, fabricSuffix } from "./fabric"
import { sheenWgsl } from "./sheen"
import { clearcoatWgsl } from "./clearcoat"

export const diffuseFragment = fabricPrefix + "base" + fabricSuffix
export const sheenFragment = sheenWgsl + fabricPrefix + "base + fabricSheen(n, l, v, rough) * uUni.values0.y" + fabricSuffix
export const fragment = sheenWgsl + clearcoatWgsl + fabricPrefix +
  "(base + fabricSheen(n, l, v, rough) * uUni.values0.y) * (1.0 - 0.04 * uUni.values0.z) + fabricCoat(n, l, v, uUni.values0.w) * uUni.values0.z * 3.0" + fabricSuffix
