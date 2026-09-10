import { Core, Transition } from "@unseenco/taxi"
import { createCycles, runDestroy, runPageIn, runPageOut } from "../modules/_"

type TransitionProps = {
  trigger: string | HTMLElement | false
  done: () => void
}

const TRANSITION_MS = 320

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function animateOpacity(el: Element, from: number, to: number): Promise<void> {
  if (!(el instanceof HTMLElement)) return Promise.resolve()

  el.style.opacity = String(from)

  if (prefersReducedMotion()) {
    el.style.opacity = String(to)
    return Promise.resolve()
  }

  const animation = el.animate([{ opacity: from }, { opacity: to }], {
    duration: TRANSITION_MS,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "forwards",
  })

  return animation.finished.then(() => {
    el.style.opacity = String(to)
    if (to === 1) el.style.removeProperty("opacity")
  })
}

class PageTransition extends Transition {
  onLeave({ from, done }: TransitionProps & { from: Element | HTMLElement }) {
    void runPageOut()
      .then(() => runDestroy(from))
      .then(() => animateOpacity(from, 1, 0))
      .then(done)
  }

  onEnter({ to, done }: TransitionProps & { to: Element | HTMLElement }) {
    window.sscroll?.scrollTo(0, { immediate: true, force: true })
    window.scrollTo(0, 0)
    createCycles()
    void runPageIn()
      .then(() => animateOpacity(to, 0, 1))
      .then(done)
  }
}

export class Pages extends Core {
  constructor() {
    super({
      links: "a:not([target]):not([href^=\\#]):not([data-taxi-ignore])",
      removeOldContent: true,
      allowInterruption: false,
      bypassCache: false,
      transitions: {
        default: PageTransition,
      },
    })
  }
}
