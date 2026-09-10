/** Own only the paint this binding replaces. Never hide semantics or change layout. */
export type PaintMode = "opacity" | "box" | "color"

const MODE_PROPS: Record<PaintMode, string[]> = {
  opacity: ["opacity"],
  box: [
    "background-color",
    "background-image",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
  ],
  color: ["color", "-webkit-text-fill-color"],
}

function hiddenValue(mode: PaintMode, prop: string) {
  if (mode === "opacity") return "0"
  if (prop === "background-image") return "none"
  return "transparent"
}

export class PaintLease {
  private previous: Array<{ prop: string; value: string; priority: string }> | null = null
  constructor(private el: HTMLElement, private mode: PaintMode = "opacity") {}
  hide() {
    if (this.previous) return
    this.previous = MODE_PROPS[this.mode].map((prop) => ({
      prop,
      value: this.el.style.getPropertyValue(prop),
      priority: this.el.style.getPropertyPriority(prop),
    }))
    for (const prop of MODE_PROPS[this.mode]) {
      this.el.style.setProperty(prop, hiddenValue(this.mode, prop), "important")
    }
  }
  restore() {
    if (!this.previous) return
    for (const { prop, value, priority } of this.previous) {
      const current = this.el.style.getPropertyValue(prop)
      const currentPriority = this.el.style.getPropertyPriority(prop)
      const expected = hiddenValue(this.mode, prop)
      if (current !== expected || currentPriority !== "important") continue
      if (value) this.el.style.setProperty(prop, value, priority)
      else this.el.style.removeProperty(prop)
    }
    this.previous = null
  }
}
