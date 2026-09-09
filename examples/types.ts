/// <reference path="./shaders.d.ts" />
/**
 * One runnable example: a WGSL fragment plus a `run` that uses shooosh.
 *
 * Open the matching file (plasma.ts, …) to see createScene / createItem.
 */

import type { WebGLEngine } from "shooosh"

export type ExampleRunOptions = {
  backend?: "auto" | "webgpu" | "webgl2"
  onInitError?: (error: unknown) => void
}

export type ExampleHandle = {
  /** Example-owned engine for development instrumentation; null before init. */
  getEngine?: () => WebGLEngine | null;
  destroy: () => void
  ready?: Promise<"webgpu" | "webgl2" | null>
}

export type ExampleSpec = {
  id: string
  status?: "wip"
  label: string
  copy: string
  fragment: string
  /** Default: fullscreen createScene. */
  kind?:
    | "screen"
    | "items"
    | "scroll-items"
    | "scroll-sections"
    | "sdf-icons"
    | "msdf-text"
    | "dom-integration"
  /** Post chain the example builds. Runs on both backends. */
  post?: "grain-bloom" | "fxaa"
  /** Pointer drives value2 / value3 (0..1, top-origin — same as vUv). */
  pointer?: boolean
  run: (target: HTMLElement, options?: ExampleRunOptions) => ExampleHandle
}
