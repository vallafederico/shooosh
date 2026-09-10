import { afterAll, expect, mock, test } from "bun:test"

const appFrames = new Set<(time: number) => void>()
mock.module("./raf", () => ({ onRaf(callback: (time: number) => void) {
  appFrames.add(callback)
  return () => { appFrames.delete(callback) }
} }))
mock.module("lenis/dist/lenis.css", () => ({}))
mock.module("lenis", () => ({ default: class {
  times: number[] = []
  listeners = new Set<() => void>()
  raf(time: number) { this.times.push(time); for (const callback of this.listeners) callback() }
  on(_event: string, callback: () => void) { this.listeners.add(callback); return () => this.listeners.delete(callback) }
  destroy() { this.listeners.clear() }
} }))
const previousWindow = globalThis.window
Object.assign(globalThis, { window: {} })
afterAll(() => { Object.assign(globalThis, { window: previousWindow }); mock.restore() })
const { Scroll } = await import("./scroll")

test("renderer owns scroll advancement until release; disposal leaves no clock or listener", () => {
  const scroll = new Scroll()
  const frames = new Set<(frame: { now: number }) => void>()
  let wakes = 0
  const engine = {
    requestFrame() { wakes++ },
    onRender(callback: (frame: { now: number }) => void) {
      frames.add(callback)
      return () => { frames.delete(callback) }
    },
  }
  const release = scroll.useRenderClock(engine as any)
  expect(appFrames.size).toBe(0)
  for (const callback of frames) callback({ now: 100 })
  expect((scroll as any).times).toEqual([100])
  expect(wakes).toBe(2) // initial wake plus scroll emitted during advancement
  release()
  release()
  expect(frames.size).toBe(0)
  expect(appFrames.size).toBe(1)
  for (const callback of appFrames) callback(116)
  expect((scroll as any).times).toEqual([100, 116])
  expect(wakes).toBe(2)
  const releaseAgain = scroll.useRenderClock(engine as any)
  scroll.destroy()
  releaseAgain()
  expect(frames.size).toBe(0)
  expect(appFrames.size).toBe(0)
  expect((scroll as any).listeners.size).toBe(0)
})
