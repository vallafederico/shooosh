type RafCallback = (time: number) => void;
type RafOptions = { priority?: number };

const callbacks = new Map<RafCallback, number>();
let frameId: number | null = null;

function loop(time: number) {
  frameId = null;
  const frameCallbacks = Array.from(callbacks.entries()).sort(([, left], [, right]) => left - right);
  for (const [callback] of frameCallbacks) {
    if (callbacks.has(callback)) callback(time);
  }
  if (callbacks.size > 0) frameId = requestAnimationFrame(loop);
}

export function onRaf(callback: RafCallback, options: RafOptions = {}): () => void {
  callbacks.set(callback, options.priority ?? 0);
  if (frameId === null) frameId = requestAnimationFrame(loop);

  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0 && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}
