import { demos, type Demo } from "./demos"

const nav = document.querySelector<HTMLElement>("#nav")
const stage = document.querySelector<HTMLElement>("#stage")

if (!nav || !stage) {
  throw new Error("Harness markup is missing #nav or #stage")
}

const params = new URLSearchParams(location.search)
const initial = params.get("demo") ?? demos[0]?.id ?? "screen"
let teardown: (() => void) | undefined

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

mount(initial)

if (import.meta.hot) {
  import.meta.hot.dispose(() => teardown?.())
}
