import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { easeOutExpo } from "./easings"
import { onRaf } from "./raf"

declare global {
  interface Window {
    sscroll?: Scroll
  }
}

export class Scroll extends Lenis {
  #stopRaf: () => void

  constructor() {
    super({
      duration: 1,
      easing: easeOutExpo,
      smoothWheel: true,
      touchMultiplier: 2,
      anchors: true,
    })
    this.#stopRaf = onRaf((time) => this.raf(time), { priority: -1 })
    window.sscroll = this
  }

  destroy() {
    this.#stopRaf()
    delete window.sscroll
    super.destroy()
  }
}
