import { initViewport } from "./lib/resize"
import { Pages } from "./lib/pages"
import { Scroll } from "./lib/scroll"
import { createCycles, runDestroy, runPageIn } from "./modules/_"

let scroll: Scroll | undefined

function bindGrid() {
  addEventListener("keydown", (event) => {
    if (event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault()
      document.body.classList.toggle("tastebuds-show-grid")
    }
  })
}

function bind() {
  createCycles()
  void runPageIn()
}

function boot() {
  initViewport()
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scroll = new Scroll()
  }
  new Pages()
  bind()
  bindGrid()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true })
} else {
  boot()
}

window.addEventListener("pagehide", () => {
  runDestroy()
  scroll?.destroy()
})
