import { describe, expect, test } from "bun:test";
import { RectTracker, Measurements, clipGeometry, type Rect } from "./geometry";

function element(rect: Rect) {
  let calls = 0;
  return { el: { getBoundingClientRect() { calls++; return rect; } } as HTMLElement,
    get calls() { return calls; } };
}
describe("DOM geometry cache", () => {
  test("nested offsets are current before scroll events, with independent clip motion", () => {
    const outer = element({ left: 10, top: 100, width: 200, height: 200 });
    const inner = element({ left: 20, top: 140, width: 180, height: 160 });
    Object.assign(outer.el, { clientLeft: 0, clientTop: 0, clientWidth: 200, clientHeight: 200, scrollTop: 20, scrollLeft: 0 });
    Object.assign(inner.el, { clientLeft: 0, clientTop: 0, clientWidth: 180, clientHeight: 160, scrollTop: 30, scrollLeft: 0 });
    const source = element({ left: 30, top: 160, width: 100, height: 100 });
    const tracker = new RectTracker(source.el); tracker.clippers = [inner.el, outer.el];
    tracker.read({ x: 0, y: 0 }, new Measurements());
    // No invalidate(), no event, and no changes to our mock DOMRects.
    inner.el.scrollTop = 60;
    let measure = new Measurements();
    let next = tracker.read({ x: 0, y: 0 }, measure);
    expect(next.rect.top).toBe(130);
    expect(next.clip).toEqual({ left: 20, top: 140, width: 180, height: 160 });
    expect(measure.reads).toBe(0);
    outer.el.scrollTop = 70; outer.el.scrollLeft = 5;
    measure = new Measurements();
    next = tracker.read({ x: 0, y: 10 }, measure);
    expect(next.rect).toEqual({ left: 25, top: 70, width: 100, height: 100 });
    expect(next.clip).toEqual({ left: 15, top: 90, width: 180, height: 150 });
    expect(measure.reads).toBe(0);
    expect(source.calls).toBe(1);
  });
  test("document scrolling element is not counted twice", () => {
    const root = element({ left: 0, top: 0, width: 200, height: 400 });
    Object.assign(root.el, { clientLeft: 0, clientTop: 0, clientWidth: 200, clientHeight: 400,
      scrollTop: 0, scrollLeft: 0, ownerDocument: { scrollingElement: root.el } });
    const tracker = new RectTracker(element({ left: 10, top: 100, width: 100, height: 100 }).el);
    tracker.clippers = [root.el];
    tracker.read({ x: 0, y: 0 }, new Measurements());
    root.el.scrollTop = 50;
    expect(tracker.read({ x: 0, y: 50 }, new Measurements()).rect.top).toBe(50);
  });
  test("root scrolling subtracts scroll without remeasuring", () => {
    const source = element({ left: 20, top: 300, width: 100, height: 50 });
    const tracker = new RectTracker(source.el);
    tracker.read({ x: 0, y: 100 }, new Measurements());
    expect(tracker.read({ x: 5, y: 250 }, new Measurements()).rect).toEqual({ left: 15, top: 150, width: 100, height: 50 });
    expect(source.calls).toBe(1);
  });
  test("live measurements replace the cache before returning to cached mode", () => {
    const rect = { left: 0, top: 100, width: 100, height: 50 };
    const source = element(rect), tracker = new RectTracker(source.el);
    tracker.read({ x: 0, y: 0 }, new Measurements());
    rect.top = 300;
    tracker.read({ x: 0, y: 100 }, new Measurements(), true);
    expect(tracker.read({ x: 0, y: 200 }, new Measurements()).rect.top).toBe(200);
    expect(source.calls).toBe(2);
  });
  test("shared clipping ancestor is measured once per read phase", () => {
    const parent = element({ left: 0, top: 0, width: 200, height: 100 });
    Object.assign(parent.el, { clientLeft: 2, clientTop: 2, clientWidth: 196, clientHeight: 96 });
    const a = new RectTracker(element({ left: 0, top: 0, width: 50, height: 50 }).el);
    const b = new RectTracker(element({ left: 100, top: 0, width: 50, height: 50 }).el);
    a.clippers = b.clippers = [parent.el];
    const measure = new Measurements();
    a.read({ x: 0, y: 0 }, measure); b.read({ x: 0, y: 0 }, measure);
    expect(parent.calls).toBe(1);
    expect(measure.reads).toBe(3);
  });
  test("clipping crops UVs without squeezing the image", () => {
    const geometry = clipGeometry({ rect: { left: 0, top: 0, width: 200, height: 100 },
      clip: { left: 50, top: 0, width: 100, height: 100 } },
      { left: 0, top: 0, width: 200, height: 100 }, new Float32Array(16));
    expect(geometry.isVisible).toBe(true);
    expect(geometry.rect.width).toBe(200);
    expect(Array.from(geometry.vertices)).toEqual([-.5,1,.25,0, -.5,-1,.25,1, .5,1,.75,0, .5,-1,.75,1]);
  });
  test("zero-area clips and empty elements are culled", () => {
    const r = { left: 0, top: 0, width: 200, height: 100 };
    expect(clipGeometry({ rect: r, clip: { ...r, width: 0 } }, r, new Float32Array(16)).isVisible).toBe(false);
    expect(clipGeometry({ rect: { ...r, height: 0 }, clip: null }, r, new Float32Array(16)).isVisible).toBe(false);
  });
});
