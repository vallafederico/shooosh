export type BackendChoice = "auto" | "webgpu" | "webgl2"

export function readBackendParam(): BackendChoice {
  const value = new URLSearchParams(location.search).get("backend")
  if (value === "webgpu" || value === "webgl2") return value
  return "auto"
}

export function setBackendLabel(kind: string | null | undefined) {
  const el = document.querySelector("#backend")
  if (!el) return
  el.textContent = kind ? `backend · ${kind}` : "backend · none"
}
