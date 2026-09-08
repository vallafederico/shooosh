/**
 * Renderer-independent drag rotation. Call update(deltaSeconds) in your own loop.
 * Pointer capture keeps drags attached outside the element. No RAF or GPU imports.
 * The owner supplies touch-action: none on an exclusive touch interaction surface.
 */
export interface SpinnerOptions {
  element: HTMLElement
  /** Radians per CSS pixel. Default 0.008. */
  sensitivity?: number
  /** Exponential velocity decay per second. Default 5. */
  damping?: number
  /** Disable release momentum, e.g. for reduced motion. Default true. */
  inertia?: boolean
}
export interface SpinnerState {
  /** Rotation about X (vertical drag), in radians. */
  readonly x: number
  /** Rotation about Y (horizontal drag), in radians. */
  readonly y: number
  readonly dragging: boolean
  readonly moving: boolean
}
export function createSpinner(options: SpinnerOptions) {
  const { element, sensitivity = 0.008, damping = 5, inertia = true } = options
  if (!Number.isFinite(sensitivity) || !Number.isFinite(damping) || damping <= 0) {
    throw new RangeError('Spinner sensitivity must be finite and damping must be positive')
  }
  const state = { x: 0, y: 0, dragging: false, moving: false }
  let pointer: number | null = null
  let lastX = 0, lastY = 0, lastTime = 0, vx = 0, vy = 0
  let destroyed = false
  const stop = () => { vx = vy = 0; state.moving = false }
  const down = (event: PointerEvent) => {
    if (pointer !== null || event.button !== 0 || !event.isPrimary) return
    element.setPointerCapture(event.pointerId)
    pointer = event.pointerId
    lastX = event.clientX; lastY = event.clientY; lastTime = event.timeStamp
    stop(); state.dragging = true
  }
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    const dx = (event.clientY - lastY) * -sensitivity
    const dy = (event.clientX - lastX) * sensitivity
    const dt = Math.max(1 / 240, (event.timeStamp - lastTime) / 1000)
    state.x += dx; state.y += dy
    vx = Math.max(-12, Math.min(12, dx / dt))
    vy = Math.max(-12, Math.min(12, dy / dt))
    lastX = event.clientX; lastY = event.clientY; lastTime = event.timeStamp
  }
  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    const id = pointer
    pointer = null; state.dragging = false
    if (event.type !== 'pointerup' || !inertia || event.timeStamp - lastTime > 100) stop()
    state.moving = Math.hypot(vx, vy) > 0.001
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
  }
  const events = { pointerdown: down, pointermove: move, pointerup: end, pointercancel: end, lostpointercapture: end }
  for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler as EventListener)
  return {
    get state(): Readonly<SpinnerState> { return state },
    update(deltaSeconds: number): Readonly<SpinnerState> {
      if (destroyed || state.dragging || !state.moving || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state
      const dt = Math.min(deltaSeconds, 0.1)
      const decay = Math.exp(-damping * dt)
      const distance = (1 - decay) / damping
      state.x += vx * distance; state.y += vy * distance
      vx *= decay; vy *= decay
      if (Math.hypot(vx, vy) < 0.001) stop()
      return state
    },
    reset() { state.x = state.y = 0; stop() },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler as EventListener)
      if (pointer !== null && element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer)
      pointer = null; state.dragging = false; stop()
    },
  }
}
