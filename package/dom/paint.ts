/** Own only the native image's opacity. Never hide semantics or change layout. */
export class PaintLease {
  private previous: { value: string; priority: string } | null = null;
  constructor(private el: HTMLElement) {}
  hide() {
    if (this.previous) return;
    this.previous = { value: this.el.style.getPropertyValue("opacity"), priority: this.el.style.getPropertyPriority("opacity") };
    this.el.style.setProperty("opacity", "0", "important");
  }
  restore() {
    if (!this.previous) return;
    // The application may have edited the same property since activation.
    if (this.el.style.getPropertyValue("opacity") === "0" && this.el.style.getPropertyPriority("opacity") === "important") {
      if (this.previous.value) this.el.style.setProperty("opacity", this.previous.value, this.previous.priority);
      else this.el.style.removeProperty("opacity");
    }
    this.previous = null;
  }
}
