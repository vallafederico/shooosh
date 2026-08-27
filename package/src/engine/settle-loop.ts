/** How long the loop keeps rendering after the last dirty mark, so lerp tails and layout settle finish. */
export const SETTLE_MS = 250;

export type SettleTiming = {
  now: number;
  delta: number;
};

export type SettleLoop = {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  requestFrame: () => void;
  destroy: () => void;
};

export function createSettleLoop(handlers: {
  resize: () => void;
  render: (timing: SettleTiming) => void;
}): SettleLoop {
  let running = false;
  let rafId = 0;
  let previousFrameAt = 0;
  let lastDirtyAt = 0;
  let wasActive = false;

  const markDirty = () => {
    lastDirtyAt = performance.now();
  };

  const frame = () => {
    if (!running) return;

    const now = performance.now();
    const active = now - lastDirtyAt < SETTLE_MS;
    if (active) {
      // Resuming after idle — don't let the gap since the last render spike delta.
      if (!wasActive) previousFrameAt = 0;
      const delta = previousFrameAt === 0 ? 0 : now - previousFrameAt;
      previousFrameAt = now;
      handlers.resize();
      handlers.render({ now, delta });
    }
    wasActive = active;

    rafId = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    previousFrameAt = 0;
    wasActive = false;
    markDirty();
    rafId = window.requestAnimationFrame(frame);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(rafId);
  };

  const onDirtyEvent = () => markDirty();
  document.addEventListener("scroll", onDirtyEvent, { capture: true, passive: true });
  window.addEventListener("resize", onDirtyEvent);
  window.visualViewport?.addEventListener("resize", onDirtyEvent);
  window.addEventListener("pointermove", onDirtyEvent, { passive: true });
  window.addEventListener("pointerdown", onDirtyEvent, { passive: true });
  window.addEventListener("wheel", onDirtyEvent, { passive: true });
  window.addEventListener("touchmove", onDirtyEvent, { passive: true });

  const destroy = () => {
    stop();
    document.removeEventListener("scroll", onDirtyEvent, { capture: true });
    window.removeEventListener("resize", onDirtyEvent);
    window.visualViewport?.removeEventListener("resize", onDirtyEvent);
    window.removeEventListener("pointermove", onDirtyEvent);
    window.removeEventListener("pointerdown", onDirtyEvent);
    window.removeEventListener("wheel", onDirtyEvent);
    window.removeEventListener("touchmove", onDirtyEvent);
  };

  return {
    start,
    stop,
    isRunning: () => running,
    requestFrame: markDirty,
    destroy,
  };
}
