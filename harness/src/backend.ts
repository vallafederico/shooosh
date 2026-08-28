export type BackendChoice = "auto" | "webgpu" | "webgl2"

const CHOICES: BackendChoice[] = ["auto", "webgpu", "webgl2"]

export function readBackendParam(): BackendChoice {
  const value = new URLSearchParams(location.search).get("backend")
  if (value === "webgpu" || value === "webgl2" || value === "auto") return value
  return "auto"
}

/** Write `?backend=` (omit when auto) and return the choice. */
export function writeBackendParam(choice: BackendChoice): BackendChoice {
  const next = new URL(location.href)
  if (choice === "auto") next.searchParams.delete("backend")
  else next.searchParams.set("backend", choice)
  history.replaceState(null, "", next)
  return choice
}

export function setBackendLabel(kind: string | null | undefined) {
  const el = document.querySelector("#backend")
  if (!el) return
  el.textContent = kind ? `backend · ${kind}` : "backend · none"
}

/**
 * Segmented auto / webgpu / webgl2 control. Calls `onChange` after updating the URL.
 */
export function mountBackendToggle(
  host: HTMLElement,
  onChange: (choice: BackendChoice) => void,
) {
  const group = document.createElement("div")
  group.className = "backend-toggle"
  group.setAttribute("role", "group")
  group.setAttribute("aria-label", "GPU backend")

  const buttons = new Map<BackendChoice, HTMLButtonElement>()

  const sync = (choice: BackendChoice) => {
    for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", id === choice ? "true" : "false")
    }
  }

  for (const choice of CHOICES) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = choice
    button.dataset.backend = choice
    button.addEventListener("click", () => {
      const next = writeBackendParam(choice)
      sync(next)
      onChange(next)
    })
    buttons.set(choice, button)
    group.append(button)
  }

  sync(readBackendParam())
  host.replaceChildren(group)
  return group
}
