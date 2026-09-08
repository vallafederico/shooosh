import { describe, expect, test } from 'bun:test'
import { createSpinner } from './spinner'

class Surface extends EventTarget {
  captured: number | null = null
  setPointerCapture(id: number) { this.captured = id }
  hasPointerCapture(id: number) { return this.captured === id }
  releasePointerCapture() { this.captured = null }
  pointer(type: string, x: number, y: number, time: number, id = 1, button = 0) {
    const event = new Event(type)
    Object.defineProperties(event, Object.fromEntries(Object.entries({ clientX: x, clientY: y, timeStamp: time, pointerId: id, button, isPrimary: id === 1 }).map(([key, value]) => [key, { value }])))
    this.dispatchEvent(event)
  }
}
function setup(inertia = true) {
  const surface = new Surface()
  return { surface, spinner: createSpinner({ element: surface as unknown as HTMLElement, inertia }) }
}
function fling(surface: Surface) {
  surface.pointer('pointerdown', 0, 0, 0)
  surface.pointer('pointermove', 100, 25, 100)
  surface.pointer('pointerup', 100, 25, 110)
}
describe('drag spinner', () => {
  test('only primary button starts; captures active pointer and ignores other pointers', () => {
    const { surface, spinner } = setup()
    surface.pointer('pointerdown', 0, 0, 0, 1, 2)
    expect(spinner.state.dragging).toBe(false)
    surface.pointer('pointerdown', 0, 0, 0)
    expect(surface.captured).toBe(1)
    surface.pointer('pointermove', 100, 25, 100, 2)
    expect(spinner.state.y).toBe(0)
    surface.pointer('pointermove', 100, 25, 100)
    expect(spinner.state.y).toBeCloseTo(0.8)
    expect(spinner.state.x).toBeCloseTo(-0.2)
    surface.pointer('pointerup', 100, 25, 110)
    expect(surface.captured).toBeNull()
    expect(spinner.state.moving).toBe(true)
  })
  test('release damping is independent of 60/120Hz frame rate and settles', () => {
    const a = setup(), b = setup()
    fling(a.surface); fling(b.surface)
    for (let i = 0; i < 60; i++) a.spinner.update(1 / 60)
    for (let i = 0; i < 120; i++) b.spinner.update(1 / 120)
    expect(a.spinner.state.y).toBeCloseTo(b.spinner.state.y, 10)
    for (let i = 0; i < 600; i++) a.spinner.update(1 / 60)
    expect(a.spinner.state.moving).toBe(false)
  })
  test('holding before release, cancellation, and reduced motion stop momentum', () => {
    for (const mode of ['hold', 'pointercancel', 'lostpointercapture', 'reduced']) {
      const { surface, spinner } = setup(mode !== 'reduced')
      surface.pointer('pointerdown', 0, 0, 0)
      surface.pointer('pointermove', 100, 0, 100)
      surface.pointer(mode === 'hold' || mode === 'reduced' ? 'pointerup' : mode, 100, 0, mode === 'hold' ? 500 : 110)
      spinner.update(1 / 60)
      expect(spinner.state.y).toBeCloseTo(0.8)
      expect(spinner.state.moving).toBe(false)
    }
  })
  test('reset clears momentum; destroy releases capture and removes listeners', () => {
    const { surface, spinner } = setup()
    fling(surface); spinner.reset(); spinner.update(1 / 60)
    expect(spinner.state.y).toBe(0)
    surface.pointer('pointerdown', 0, 0, 200)
    spinner.destroy(); spinner.destroy()
    expect(surface.captured).toBeNull()
    surface.pointer('pointermove', 300, 100, 250)
    expect(spinner.state.y).toBe(0)
    expect(spinner.state.dragging).toBe(false)
  })
})
