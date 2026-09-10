/**
 * Page-mode scan over createDomLayer bind()/media()/box()/text().
 *
 * How to use:
 *   import effect from "./effect.wgsl"; // prepared by shooosh/build
 *   const page = dom.scan({
 *     shaders: { bind: effect },
 *   })
 *
 * Default marks: img[data-sh-media], [data-sh-bind], [data-sh-box], [data-sh-text].
 * Unmarked nodes stay native. Not HTML capture.
 */
import type { FullscreenPlaneShaders } from "../src/primitives/plane"
import type { UniValues } from "../src/engine/uni"
import type { DomBinding, DomBindingOptions, DomError } from "./session"

export const DEFAULT_MEDIA_SELECTOR = "img[data-sh-media]"
export const DEFAULT_BIND_SELECTOR = "[data-sh-bind]"
export const DEFAULT_BOX_SELECTOR = "[data-sh-box]"
export const DEFAULT_TEXT_SELECTOR = "[data-sh-text]"

export type DomScanOptions = {
  media?: string | false
  bind?: string | false
  box?: string | false
  text?: string | false
  shaders?: {
    media?: FullscreenPlaneShaders
    bind?: FullscreenPlaneShaders
    box?: FullscreenPlaneShaders
  }
  uni?: {
    media?: UniValues
    bind?: UniValues
    box?: UniValues
    text?: UniValues
  }
  observe?: boolean
}

export type DomScan = {
  readonly bindings: readonly DomBinding[]
  refresh(): void
  destroy(): void
}

export type DomScanBindings = {
  media(element: HTMLImageElement, options?: DomBindingOptions): DomBinding
  bind(element: HTMLElement, options: DomBindingOptions & { shaders: FullscreenPlaneShaders }): DomBinding
  box(element: HTMLElement, options?: DomBindingOptions): DomBinding
  text(element: HTMLElement, options?: DomBindingOptions): DomBinding
}

type QueryRoot = { querySelectorAll(selectors: string): ArrayLike<Element> }

export function queryScanTargets(
  root: QueryRoot,
  selectors: { media: string | false; bind: string | false; box: string | false; text: string | false },
): { media: HTMLImageElement[]; bind: HTMLElement[]; box: HTMLElement[]; text: HTMLElement[] } {
  const pick = (selector: string | false, tag?: string) => {
    if (!selector) return [] as HTMLElement[]
    const out: HTMLElement[] = []
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (tag && el.tagName !== tag) continue
      out.push(el as HTMLElement)
    }
    return out
  }
  const media = pick(selectors.media, "IMG") as HTMLImageElement[]
  const claimed = new Set<Element>(media)
  const take = (els: HTMLElement[]) => {
    const next: HTMLElement[] = []
    for (const el of els) {
      if (claimed.has(el)) continue
      claimed.add(el)
      next.push(el)
    }
    return next
  }
  return {
    media,
    text: take(pick(selectors.text)),
    box: take(pick(selectors.box)),
    bind: take(pick(selectors.bind)),
  }
}

export function createDomScan(
  root: HTMLElement,
  bindings: DomScanBindings,
  options: DomScanOptions = {},
  onError?: (event: DomError) => void,
): DomScan {
  const owned = new Map<HTMLElement, DomBinding>()
  let destroyed = false
  let warnedBind = false
  const mediaSelector = options.media === undefined ? DEFAULT_MEDIA_SELECTOR : options.media
  const bindSelector = options.bind === undefined ? DEFAULT_BIND_SELECTOR : options.bind
  const boxSelector = options.box === undefined ? DEFAULT_BOX_SELECTOR : options.box
  const textSelector = options.text === undefined ? DEFAULT_TEXT_SELECTOR : options.text
  const observe = options.observe !== false

  const refresh = () => {
    if (destroyed) return
    const { media, bind, box, text } = queryScanTargets(root, {
      media: mediaSelector, bind: bindSelector, box: boxSelector, text: textSelector,
    })
    const next = new Set<HTMLElement>([...media, ...bind, ...box, ...text])
    for (const [el, handle] of owned) {
      if (!next.has(el) || !el.isConnected) {
        handle.destroy()
        owned.delete(el)
      }
    }
    for (const img of media) {
      if (owned.has(img)) continue
      owned.set(img, bindings.media(img, { shaders: options.shaders?.media, uni: options.uni?.media }))
    }
    for (const el of text) {
      if (owned.has(el)) continue
      owned.set(el, bindings.text(el, { uni: options.uni?.text }))
    }
    for (const el of box) {
      if (owned.has(el)) continue
      owned.set(el, bindings.box(el, { shaders: options.shaders?.box, uni: options.uni?.box }))
    }
    if (bind.length && !options.shaders?.bind) {
      if (!warnedBind) {
        warnedBind = true
        onError?.({ element: bind[0] ?? null, error: new Error("scan() bind targets need shaders.bind") })
      }
    } else if (options.shaders?.bind) {
      for (const el of bind) {
        if (owned.has(el)) continue
        owned.set(el, bindings.bind(el, { shaders: options.shaders.bind, uni: options.uni?.bind }))
      }
    }
  }

  let observer: MutationObserver | null = null
  if (observe && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => refresh())
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-sh-media", "data-sh-bind", "data-sh-box", "data-sh-text"],
    })
  }

  refresh()
  return {
    get bindings() { return [...owned.values()] },
    refresh,
    destroy() {
      if (destroyed) return
      destroyed = true
      observer?.disconnect()
      observer = null
      for (const handle of owned.values()) handle.destroy()
      owned.clear()
    },
  }
}
