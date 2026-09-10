import { Observe, type ObserveEventData } from "./observe";

/**
 * Scroll-bound progress (`0…1`) while the element is in view.
 *
 * Feature modules should use **`onTrack()`** from `./_` (see `runner.ts`):
 * it constructs `Track` and wires destroy with the rest of the lifecycle.
 *
 * Self-contained adaptation of the plyy Track: window scroll/resize
 * listeners instead of the shared Scroll/Resize subscription stack.
 */

type EdgeAnchor = "top" | "center" | "bottom";

export interface TrackConfig {
  bounds?: [number, number];
  top?: EdgeAnchor;
  bottom?: EdgeAnchor;
  callback?: (value: number) => void;
}

const clamp = (min: number, max: number, value: number) =>
  Math.min(max, Math.max(min, value));

const map = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  inMax === inMin ? outMin : outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);

export class Track extends Observe {
  value = 0;

  #config: Required<Omit<TrackConfig, "callback">> & { callback?: (value: number) => void };
  #top = 0;
  #bottom = 0;
  #raf: number | null = null;

  constructor(element: HTMLElement, config: TrackConfig = {}) {
    super(element, { autoStart: true, once: false, threshold: 0 });
    this.#config = {
      bounds: config.bounds ?? [0, 1],
      top: config.top ?? "bottom",
      bottom: config.bottom ?? "top",
      callback: config.callback,
    };

    this.#computeBounds();
    window.addEventListener("scroll", this.#onScroll, { passive: true });
    window.addEventListener("resize", this.#onResize);
    this.#update();
  }

  protected isIn(_data: ObserveEventData): void {
    this.#update();
  }

  protected isOut(_data: ObserveEventData): void {
    // out of view — nothing to update
  }

  #onScroll = () => {
    if (this.#raf !== null) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = null;
      this.#update();
    });
  };

  #onResize = () => {
    this.#computeBounds();
    this.#update();
  };

  #computeBounds() {
    const rect = this.element.getBoundingClientRect();
    const scrollY = window.scrollY;
    const wh = window.innerHeight;
    const centerOffset = wh / 2;

    const anchorOffset = (anchor: EdgeAnchor) =>
      anchor === "center" ? centerOffset : anchor === "bottom" ? wh : 0;

    this.#top = rect.top + scrollY - anchorOffset(this.#config.top);
    this.#bottom = rect.bottom + scrollY - anchorOffset(this.#config.bottom);
  }

  #update() {
    if (!this.inView) return;
    this.value = clamp(
      this.#config.bounds[0],
      this.#config.bounds[1],
      map(window.scrollY, this.#top, this.#bottom, this.#config.bounds[0], this.#config.bounds[1]),
    );
    this.#config.callback?.(this.value);
  }

  destroy() {
    this.#config.callback = undefined;
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    window.removeEventListener("scroll", this.#onScroll);
    window.removeEventListener("resize", this.#onResize);
    super.destroy();
  }
}
