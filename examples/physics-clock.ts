/** Bound catch-up work after long frames; never integrate a variable timestep. */
export function createPhysicsClock() {
  let previous: number | undefined
  let accumulator = 0
  return {
    reset() { previous = undefined; accumulator = 0 },
    advance(now: number, step: () => void) {
      const elapsed = previous === undefined ? 0 : Math.max(0, (now - previous) / 1000)
      previous = now
      accumulator += Math.min(elapsed, 5 / 60)
      let steps = 0
      while (accumulator + 1e-9 >= 1 / 60 && steps < 5) {
        step(); accumulator -= 1 / 60; steps++
      }
      return steps
    },
  }
}
