import Lenis from "lenis"
import type { WebGLEngine } from "shooosh"
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
  #releaseClock?: () => void

  constructor() {
    super({
      duration: 1,
      easing: easeOutExpo,
      smoothWheel: true,
      // Keep DOM and GPU on the same JS clock, without amplified finger travel.
      syncTouch: true,
      touchMultiplier: 1,
      syncTouchLerp: 0.15,
      touchInertiaExponent: 1.5,
      // Multi-touch belongs to the browser, including its release event.
      virtualScroll: (() => {
        let pinching = false
        return ({ event }: { event: WheelEvent | TouchEvent }) => {
          if (!("touches" in event)) return true
          if (event.touches.length > 1) pinching = true
          if (!pinching) return true
          if (event.touches.length === 0) pinching = false
          return false
        }
      })(),
      allowNestedScroll: true,
      anchors: true,
    })
    this.#stopRaf = onRaf((time) => this.raf(time), { priority: -1 })
    window.sscroll = this
  }

  /** One page renderer owns advancement; restore the app clock on unmount. */
  useRenderClock(engine: WebGLEngine): () => void {
    this.#releaseClock?.()
    this.#stopRaf()
    const stopWake = this.on("scroll", engine.requestFrame)
    // Registered before the DOM layer, so scroll advances before its read phase.
    const stopRender = engine.onRender(({ now }) => this.raf(now), { layer: -Number.MAX_VALUE })
    let released = false
    const release = () => {
      if (released) return
      released = true
      stopRender()
      stopWake()
      this.#releaseClock = undefined
      this.#stopRaf = onRaf((time) => this.raf(time), { priority: -1 })
    }
    this.#releaseClock = release
    engine.requestFrame()
    return release
  }

  destroy() {
    this.#releaseClock?.()
    this.#stopRaf()
    delete window.sscroll
    super.destroy()
  }
}
