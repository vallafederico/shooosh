import { demos } from "./demos"
import { mountBackendToggle, setBackendLabel } from "./backend"

const nav = document.querySelector<HTMLElement>("#nav")
const stage = document.querySelector<HTMLElement>("#stage")
const toggleHost = document.querySelector<HTMLElement>("#backend-toggle")

if (!nav || !stage || !toggleHost) {
  throw new Error("Harness markup is missing #nav, #stage, or #backend-toggle")
}

const params = new URLSearchParams(location.search)
const initial = params.get("demo") ?? demos[0]?.id ?? "gradient"
let teardown: (() => void) | undefined
let currentId = initial

function setUrl(id: string) {
  const next = new URL(location.href)
  next.searchParams.set("demo", id)
  history.replaceState(null, "", next)
}

function mount(id: string) {
  const demo = demos.find((entry) => entry.id === id) ?? demos[0]
  if (!demo) return

  teardown?.()
  stage.replaceChildren()
  stage.dataset.demo = demo.id
  currentId = demo.id
  setBackendLabel("…")
  teardown = demo.mount(stage)
  setUrl(demo.id)

  nav.querySelectorAll("button").forEach((button) => {
    button.setAttribute(
      "aria-current",
      button.dataset.id === demo.id ? "true" : "false",
    )
  })
}

for (const demo of demos) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = demo.label
  button.dataset.id = demo.id
  button.addEventListener("click", () => mount(demo.id))
  nav.append(button)
}

mountBackendToggle(toggleHost, () => {
  mount(currentId)
})

mount(initial)

if (import.meta.hot) {
  import.meta.hot.dispose(() => teardown?.())
}
