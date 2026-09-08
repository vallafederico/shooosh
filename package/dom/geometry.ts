/** DOM adapter geometry. CSS pixels throughout; DPR belongs to the engine. */
import type { ItemClipData } from "../src/primitives/item.utils";

export type Rect = { left: number; top: number; width: number; height: number };
export type Geometry = { rect: Rect; clip: Rect | null };
export const shift = (r: Rect, x: number, y: number): Rect => ({ ...r, left: r.left + x, top: r.top + y });
export function intersect(a: Rect, b: Rect): Rect {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
  return { left, top, width: Math.max(0, Math.min(a.left + a.width, b.left + b.width) - left),
    height: Math.max(0, Math.min(a.top + a.height, b.top + b.height) - top) };
}

/** A single read cache shared by every binding during the session's read phase. */
export class Measurements {
  private rects = new Map<Element, Rect>();
  private scrolls = new Map<HTMLElement, { x: number; y: number }>();
  reads = 0;
  scroll(el: HTMLElement) {
    let value = this.scrolls.get(el);
    if (!value) {
      // The viewport scroll is already accounted for by RectTracker.read().
      value = el.ownerDocument?.scrollingElement === el ? { x: 0, y: 0 }
        : { x: el.scrollLeft || 0, y: el.scrollTop || 0 };
      this.scrolls.set(el, value);
    }
    return value;
  }
  rect(el: Element): Rect {
    let r = this.rects.get(el);
    if (!r) {
      const b = el.getBoundingClientRect();
      r = { left: b.left, top: b.top, width: b.width, height: b.height };
      this.rects.set(el, r); this.reads++;
    }
    return r;
  }
}

export class RectTracker {
  private doc: { rect: Rect; clips: Rect[]; scrolls: Array<{ x: number; y: number }> } | null = null;
  pinned = false;
  /** Untransformed clipping ancestors, nearest first. Includes scroll containers. */
  clippers: HTMLElement[] = [];
  constructor(readonly element: HTMLElement) {}
  invalidate() { this.doc = null; }
  read(scroll: { x: number; y: number }, measure: Measurements, live = false): Geometry {
    if (!this.doc || this.pinned || live) {
      const rect = measure.rect(this.element);
      const clips = this.clippers.map(el => {
        const outer = measure.rect(el);
        const box = { left: outer.left + el.clientLeft, top: outer.top + el.clientTop,
          width: el.clientWidth, height: el.clientHeight };
        return shift(box, scroll.x, scroll.y);
      });
      this.doc = { rect: shift(rect, scroll.x, scroll.y), clips,
        scrolls: this.clippers.map(el => measure.scroll(el)) };
    }
    // Sample current offsets in the render phase, even if a scroll event has not
    // arrived yet. A clip moves with its OUTER scrollers, never its own scroll.
    let x = -scroll.x, y = -scroll.y;
    let clip: Rect | null = null;
    for (let i = this.clippers.length - 1; i >= 0; i--) {
      const box = shift(this.doc.clips[i]!, x, y);
      clip = clip ? intersect(clip, box) : box;
      const current = measure.scroll(this.clippers[i]!), previous = this.doc.scrolls[i]!;
      x -= current.x - previous.x; y -= current.y - previous.y;
    }
    return { rect: shift(this.doc.rect, x, y), clip };
  }
}

/** Crop geometry AND UVs. The original rect remains the texture-fit reference. */
export function clipGeometry(snapshot: Geometry, canvas: Rect, out: Float32Array): ItemClipData {
  const r = snapshot.rect;
  const clipped = intersect(snapshot.clip ? intersect(r, snapshot.clip) : r, canvas);
  const visible = r.width > 0 && r.height > 0 && clipped.width > 0 && clipped.height > 0;
  if (visible) {
    const x0 = (clipped.left - canvas.left) / canvas.width * 2 - 1;
    const x1 = (clipped.left + clipped.width - canvas.left) / canvas.width * 2 - 1;
    const y0 = 1 - (clipped.top - canvas.top) / canvas.height * 2;
    const y1 = 1 - (clipped.top + clipped.height - canvas.top) / canvas.height * 2;
    const u0 = (clipped.left - r.left) / r.width, u1 = u0 + clipped.width / r.width;
    const v0 = (clipped.top - r.top) / r.height, v1 = v0 + clipped.height / r.height;
    out.set([x0,y0,u0,v0, x0,y1,u0,v1, x1,y0,u1,v0, x1,y1,u1,v1]);
  }
  return { vertices: out, isVisible: visible,
    rect: { ...r, right: r.left + r.width, bottom: r.top + r.height } };
}
