/**
 * One runnable shader example. Fragment is WGSL `fn fsMain` (shader contract).
 * `mount.ts` / the harness turn this into a live createScene / createItem.
 */

export type ExampleSpec = {
  id: string
  label: string
  copy: string
  fragment: string
  /** Default: fullscreen createScene. */
  kind?: "screen" | "items"
  /** WebGL2 post presets. Skipped on WebGPU. */
  post?: "grain-bloom"
  /** Feed pointer as value2 / value3 in 0..1, top-origin (same as vUv). */
  pointer?: boolean
}
