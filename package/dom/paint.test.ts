import { expect, test } from "bun:test";
import { PaintLease } from "./paint";
function fixture() {
  const values = new Map<string, [string, string]>();
  const style = { getPropertyValue: (k: string) => values.get(k)?.[0] ?? "",
    getPropertyPriority: (k: string) => values.get(k)?.[1] ?? "",
    setProperty: (k: string, v: string, p = "") => values.set(k, [v, p]), removeProperty: (k: string) => values.delete(k) };
  return { style, lease: new PaintLease({ style } as unknown as HTMLElement) };
}
test("native paint is restored with its original priority", () => {
  const { style, lease } = fixture();
  style.setProperty("opacity", "1", "important");
  lease.hide(); lease.hide();
  expect(style.getPropertyValue("opacity")).toBe("0");
  lease.restore(); lease.restore();
  expect(style.getPropertyValue("opacity")).toBe("1");
  expect(style.getPropertyPriority("opacity")).toBe("important");
});
test("teardown never overwrites a newer application edit", () => {
  const { style, lease } = fixture(); lease.hide();
  style.setProperty("opacity", "0.5"); lease.restore();
  expect(style.getPropertyValue("opacity")).toBe("0.5");
});
