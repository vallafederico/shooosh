import { examples, mountExample } from "../../examples"
import { GpuUnavailableError, WebGLUnavailableError } from "shooosh"
import { readBackendParam, setBackendLabel } from "./backend"

export type Demo = {
  id: string
  label: string
  mount: (stage: HTMLElement) => () => void
}

const backend = readBackendParam()

function fail(stage: HTMLElement, error: unknown) {
  const el = document.createElement("p")
  el.className = "fallback"
  el.textContent =
    error instanceof GpuUnavailableError || error instanceof WebGLUnavailableError
      ? "No GPU backend is available in this browser."
      : error instanceof Error
        ? error.message
        : "Failed to start the scene."
  stage.append(el)
  setBackendLabel(null)
}

export const demos: Demo[] = examples.map((spec) => ({
  id: spec.id,
  label: spec.label,
  mount(stage) {
    return mountExample(spec, stage, {
      backend,
      onBackend: setBackendLabel,
      onError: (error) => fail(stage, error),
    })
  },
}))
