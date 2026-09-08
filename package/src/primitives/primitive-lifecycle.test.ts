import { expect, test } from "bun:test";
import { createPrimitiveLifecycle } from "./primitive-lifecycle";
import { getDefaultEngine, setDefaultEngine, type WebGLEngine, type EngineFrame } from "../engine/engine";

test("explicit engine attachment ignores the default engine and cleans up", () => {
  const previous = getDefaultEngine();
  let defaultCalls = 0, unsubscribed = 0, renders = 0, disposed = 0;
  let callback!: (frame: EngineFrame) => void;
  setDefaultEngine({ onRender() { defaultCalls++; } } as unknown as WebGLEngine);
  try {
    const lifecycle = createPrimitiveLifecycle({
      engine: { onRender(cb) { callback = cb; return () => { unsubscribed++; }; } } as WebGLEngine,
      layer: 0, createRenderer: () => ({ destroy() { disposed++; } }),
      renderFrame() { renders++; },
    });
    callback({ canvas: {} } as EngineFrame);
    lifecycle.destroy(); lifecycle.destroy();
    callback({ canvas: {} } as EngineFrame);
    expect(defaultCalls).toBe(0); expect(renders).toBe(1);
    expect(unsubscribed).toBe(1); expect(disposed).toBe(1);
  } finally { setDefaultEngine(previous); }
});
