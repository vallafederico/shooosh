import { expect, test } from "bun:test";
import { orderDomPaint } from "./stacking";

test("paint follows positioned ancestor z-index, nested contexts and DOM ties", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "Node");
  Object.defineProperty(globalThis, "Node", { configurable: true, value: { DOCUMENT_POSITION_FOLLOWING: 4 } });
  let sequence = 0;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const make = (parent: HTMLElement | null, z = "auto", position = "static", display = "block") => {
    const order = sequence++;
    const el = { parentElement: parent, order, compareDocumentPosition(other: any) { return order < other.order ? 4 : 2; } } as unknown as HTMLElement;
    styles.set(el, { position, zIndex: z, display, isolation: "auto" } as CSSStyleDeclaration);
    return el;
  };
  try {
    const root = make(null), nav = make(root, "10", "fixed"), label = make(nav);
    const low = make(root, "1", "relative"), highInsideLow = make(low, "999", "relative");
    const plane = make(root), hud = make(root, "10", "fixed"), note = make(hud);
    const order = (...els: HTMLElement[]) => orderDomPaint(els.map(el => ({ el })), styles).map(e => e.el);
    expect(order(note, label, plane, highInsideLow)).toEqual([plane, highInsideLow, label, note]);
    styles.get(nav)!.zIndex = "-1";
    expect(order(note, label, plane, highInsideLow)).toEqual([label, plane, highInsideLow, note]);
    // A non-positioned z-index has no effect; flex/grid items are the exception.
    styles.get(plane)!.zIndex = "1000";
    expect(order(note, plane)).toEqual([plane, note]);
    styles.get(root)!.display = "grid";
    expect(order(note, plane)).toEqual([note, plane]);
    expect(order(highInsideLow, low)).toEqual([low, highInsideLow]);
  } finally {
    if (old) Object.defineProperty(globalThis, "Node", old); else Reflect.deleteProperty(globalThis, "Node");
  }
});
