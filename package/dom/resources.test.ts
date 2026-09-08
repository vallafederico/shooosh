import { expect, test } from "bun:test";
import { createResourceCache } from "./resources";
test("shared textures are released only after their last binding", async () => {
  let loads = 0, destroyed = 0;
  const cache = createResourceCache(async () => { loads++; return { destroy() { destroyed++; } }; });
  const a = cache.acquire("a"), b = cache.acquire("a");
  expect(await a.ready).toBe(await b.ready); expect(loads).toBe(1);
  a.release(); a.release(); expect(destroyed).toBe(0);
  b.release(); expect(destroyed).toBe(1);
});
test("a cancelled upload is destroyed on arrival and cannot replace a newer lease", async () => {
  const completions: Array<(r: { destroy(): void }) => void> = [];
  let destroyed = 0;
  const cache = createResourceCache(() => new Promise<{ destroy(): void }>(resolve => completions.push(resolve)));
  const old = cache.acquire("a"); old.release();
  const next = cache.acquire("a");
  completions[0]!({ destroy() { destroyed++; } }); await old.ready;
  expect(destroyed).toBe(1);
  completions[1]!({ destroy() { destroyed++; } }); await next.ready;
  expect(destroyed).toBe(1); next.release(); expect(destroyed).toBe(2);
});
