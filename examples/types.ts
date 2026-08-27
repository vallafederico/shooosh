/**
 * One runnable example: a WGSL fragment plus a `run` that uses shooosh.
 *
 * Open the matching file (plasma.ts, …) to see createScene / createItem.
 */

export type ExampleRunOptions = {
  backend?: "auto" | "webgpu" | "webgl2"
  onInitError?: (error: unknown) => void
}

export type ExampleHandle = {
  destroy: () => void
  ready?: Promise<"webgpu" | "webgl2" | null>
}

export type ExampleSpec = {
  id: string
  label: string
  copy: string
  fragment: string
  /** Default: fullscreen createScene. */
  kind?: "screen" | "items"
  /** WebGL2 post presets. Skipped on WebGPU. */
  post?: "grain-bloom"
  /** Pointer drives value2 / value3 (0..1, top-origin — same as vUv). */
  pointer?: boolean
  run: (target: HTMLElement, options?: ExampleRunOptions) => ExampleHandle
}
