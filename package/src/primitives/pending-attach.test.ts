import { expect, test } from "bun:test";
import { createLazyGpuFactory, createPendingAttachQueue } from "./pending-attach";
import { getDefaultEngine, setDefaultEngine, type WebGLEngine } from "../engine/engine";

test("pure lazy factory construction does not import; use still loads exactly once", async () => {
  let loads = 0;
  const renderer = () => "renderer";
  const ensure = createLazyGpuFactory({ label: "test", load: async () => { loads++; return renderer; } });
  expect(loads).toBe(0);
  expect(ensure()).toBeNull();
  expect(ensure()).toBeNull();
  expect(loads).toBe(1);
  await Promise.resolve();
  expect(ensure()).toBe(renderer);
  expect(loads).toBe(1);
});

test("pure queue construction does not schedule; enqueued managers still attach", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousEngine = getDefaultEngine();
  const frames: Array<() => void> = [];
  const attached: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    requestAnimationFrame(callback: () => void) { frames.push(callback); return frames.length; },
  } });
  setDefaultEngine({} as WebGLEngine);
  try {
    const queue = createPendingAttachQueue<string>(item => attached.push(item));
    expect(frames).toHaveLength(0);
    queue.enqueue("active"); queue.enqueue("removed"); queue.dequeue("removed");
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(attached).toEqual(["active"]);
  } finally {
    setDefaultEngine(previousEngine);
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("lazy renderer wakes every explicit engine when its chunk settles", async () => {
  let first = 0, second = 0;
  const a = { requestFrame() { first++; } } as WebGLEngine;
  const b = { requestFrame() { second++; } } as WebGLEngine;
  const ensure = createLazyGpuFactory({ label: "explicit", load: async () => () => {} });
  ensure(a); ensure(a); ensure(b);
  await Promise.resolve();
  expect(first).toBe(1); expect(second).toBe(1);
});

test("failed lazy renderer wakes its engine and surfaces the error for native fallback", async () => {
  let frames = 0;
  const error = new Error("chunk unavailable");
  const engine = { requestFrame() { frames++; } } as WebGLEngine;
  const ensure = createLazyGpuFactory({ label: "failure test", load: async () => { throw error; } });
  ensure(engine);
  await Promise.resolve(); await Promise.resolve();
  expect(frames).toBe(1);
  expect(() => ensure(engine)).toThrow("chunk unavailable");
});
