/**
 * Wrap a Scene so the harness can destroy it and read the backend.
 * Example files still own the createScene / createItem call.
 */

import type { Scene } from "shooosh"
import type { ExampleHandle } from "./types"

export function fromScene(scene: Scene, extraDestroy?: () => void): ExampleHandle {
  return {
    destroy() {
      extraDestroy?.()
      scene.destroy()
    },
    ready: Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(
      () => scene.getEngine()?.backend ?? null,
    ),
  }
}
