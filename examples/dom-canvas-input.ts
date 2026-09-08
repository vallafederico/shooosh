/**
 * Experimental, authored single-line canvas input. The browser owns editing;
 * the texture owns visible paint. This deliberately uses internal item/texture
 * seams until a general dynamic-material API exists. Not an HTML rasterizer.
 * LTR text only; IME composition and RTL retain native paint.
 */
import { loadTexture, type WebGLEngine, type TextureLoaderResult } from "shooosh"
import { ItemManager } from "../package/src/primitives/item"
import { clipGeometry, intersect, Measurements, RectTracker, type Geometry, type Rect } from "../package/dom/geometry"
import { getGpuInternals } from "../package/src/engine/gpu-internals"
import type { GpuTexture } from "../package/src/engine/gpu-api"

export function mountCanvasInput(input: HTMLInputElement, root: HTMLElement, engine: WebGLEngine,
  fragment: string, initialMix: number) {
  const field = input.parentElement!
  const bitmap = document.createElement("canvas")
  const ctx = bitmap.getContext("2d")!
  const abort = new AbortController()
  let texture: TextureLoaderResult | null = null, item: ItemManager | null = null
  let stopped = false, composing = false, printing = false, uploading = false, serial = 0, dirty = true
  let mix = initialMix, lastKey = "", blinkStart = performance.now()
  const fieldTracker = new RectTracker(field), rootTracker = new RectTracker(root), canvasTracker = new RectTracker(engine.canvas)
  const lastGeometry = new Map<RectTracker, Geometry>()
  let layoutDirty = true, visible = true
  let snapshot: Geometry = { rect: { left: 0, top: 0, width: 0, height: 0 }, clip: null }
  let canvasRect: Rect = snapshot.rect
  let textBox = { x: 0, y: 0, width: 0, height: 0 }, font = ""
  function invalidateLayout() {
    layoutDirty = true; dirty = true
    fieldTracker.invalidate(); rootTracker.invalidate(); canvasTracker.invalidate()
    engine.requestFrame()
  }
  function trackAncestors(tracker: RectTracker, styles: Map<Element, CSSStyleDeclaration>) {
    tracker.clippers = []; tracker.pinned = false
    for (let el: HTMLElement | null = tracker.element; el; el = el.parentElement) {
      let style = styles.get(el)
      if (!style) { style = getComputedStyle(el); styles.set(el, style) }
      if (style.position === "fixed" || style.position === "sticky") tracker.pinned = true
      if (el !== tracker.element && (style.overflowX !== "visible" || style.overflowY !== "visible")) tracker.clippers.push(el)
    }
  }
  let caretTimer: number | undefined
  const restore = () => { field.dataset.canvasInput = "native" }
  function scheduleCaret() {
    clearTimeout(caretTimer)
    caretTimer = undefined
    if (stopped || !visible || composing || printing || document.hidden || document.activeElement !== input
      || input.selectionStart !== input.selectionEnd || /[\u0590-\u08ff]/.test(input.value)) return
    // Wake at the next visible blink edge, not every 100ms throughout focus.
    const remaining = 530 - ((performance.now() - blinkStart) % 530)
    caretTimer = window.setTimeout(() => { engine.requestFrame(); scheduleCaret() }, Math.max(1, remaining))
  }
  const wake = () => { dirty = true; blinkStart = performance.now(); scheduleCaret(); engine.requestFrame() }
  function upload() {
    if (!texture) return
    if (engine.backend === "webgl2") {
      const gl = engine.gl!
      const previous = gl.getParameter(gl.TEXTURE_BINDING_2D)
      const premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)
      const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL)
      gl.bindTexture(gl.TEXTURE_2D, texture.texture.texture as WebGLTexture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip)
      gl.bindTexture(gl.TEXTURE_2D, previous)
    } else {
      const queue = getGpuInternals(engine)?.device.queue
      if (!queue?.copyExternalImageToTexture) throw new Error("Dynamic texture uploads unavailable")
      queue.copyExternalImageToTexture({ source: bitmap },
        { texture: texture.texture.texture as GpuTexture, premultipliedAlpha: true },
        { width: bitmap.width, height: bitmap.height })
    }
  }
  const unsubscribe = engine.onRender(() => {
    if (stopped) return
    try {
      const focused = document.activeElement === input
      // Native composition UI and bidirectional shaping are outside this pilot.
      if (printing || composing || /[\u0590-\u08ff]/.test(input.value)) {
        restore(); item?.destroy(); item = null; lastKey = ""; return
      }
      const measurements = new Measurements()
      const scroll = { x: window.scrollX, y: window.scrollY }
      if (layoutDirty) {
        const styles = new Map<Element, CSSStyleDeclaration>()
        for (const tracker of [fieldTracker, rootTracker, canvasTracker]) trackAncestors(tracker, styles)
        const bounds = measurements.rect(field), textBounds = measurements.rect(input)
        textBox = { x: textBounds.left - bounds.left, y: textBounds.top - bounds.top,
          width: textBounds.width, height: textBounds.height }
        const style = getComputedStyle(input)
        font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        layoutDirty = false
      }
      snapshot = fieldTracker.read(scroll, measurements)
      lastGeometry.set(fieldTracker, { ...snapshot })
      const rootGeometry = rootTracker.read(scroll, measurements)
      lastGeometry.set(rootTracker, rootGeometry)
      snapshot.clip = snapshot.clip ? intersect(snapshot.clip, rootGeometry.rect) : rootGeometry.rect
      const canvasGeometry = canvasTracker.read(scroll, measurements)
      lastGeometry.set(canvasTracker, canvasGeometry)
      canvasRect = canvasGeometry.rect
      if (!visible) { clearTimeout(caretTimer); return }
      const bounds = snapshot.rect
      const ratio = Math.min(devicePixelRatio, 2)
      const width = Math.max(1, Math.round(bounds.width * ratio)), height = Math.max(1, Math.round(bounds.height * ratio))
      const caret = focused && Math.floor((performance.now() - blinkStart) / 530) % 2 === 0
      const start = input.selectionStart ?? 0, end = input.selectionEnd ?? start
      const key = JSON.stringify([input.value, input.placeholder, start, end, input.scrollLeft, focused, caret, width, height])
      if (dirty || key !== lastKey) {
        dirty = false; lastKey = key
        if (bitmap.width !== width) bitmap.width = width
        if (bitmap.height !== height) bitmap.height = height
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        ctx.clearRect(0, 0, bounds.width, bounds.height)
        ctx.fillStyle = "#f8f7f1"; ctx.strokeStyle = focused ? "#a3442f" : "#b9bfaf"; ctx.lineWidth = focused ? 2 : 1
        ctx.beginPath(); ctx.roundRect(1, 1, bounds.width - 2, bounds.height - 2, 18); ctx.fill(); ctx.stroke()
        // Authored pencil icon: its visible pixels also travel through the shader.
        ctx.strokeStyle = "#78806f"; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(19, 33); ctx.lineTo(22, 27); ctx.lineTo(31, 18); ctx.lineTo(35, 22); ctx.lineTo(26, 31); ctx.closePath(); ctx.stroke()
        ctx.font = font
        ctx.textBaseline = "middle"
        const x = textBox.x, y = textBox.y + textBox.height / 2
        const origin = x - input.scrollLeft
        ctx.save(); ctx.beginPath(); ctx.rect(x, 4, textBox.width, bounds.height - 8); ctx.clip()
        const a = ctx.measureText(input.value.slice(0, start)).width, b = ctx.measureText(input.value.slice(0, end)).width
        if (focused && start !== end) { ctx.fillStyle = "#adc5dc"; ctx.fillRect(origin + a, y - 11, b - a, 22) }
        ctx.fillStyle = input.value ? "#262d2a" : "#78806f"
        ctx.fillText(input.value || input.placeholder, origin, y)
        if (caret && start === end) { ctx.fillStyle = "#a3442f"; ctx.fillRect(origin + a, y - 10, 1.5, 20) }
        ctx.restore()
        if (texture && texture.width === width && texture.height === height) upload()
        else if (!uploading) {
          uploading = true
          const token = ++serial
          // Size changes get a new texture. Ordinary edits reuse the allocation.
          void loadTexture(bitmap, { engine }).then(next => {
            if (stopped || token !== serial) { next.destroy(); return }
            item?.destroy(); item = null; texture?.destroy(); texture = next
            uploading = false; dirty = true; engine.requestFrame()
          }).catch(() => { uploading = false; fail() })
        }
      }
      if (texture && !item && !composing && texture.width === width && texture.height === height) {
        item = new ItemManager(field, { shaders: { fragment }, texture, layer: 100, uni: { value1: mix } }, {
          engine,
          geometry: out => clipGeometry(visible ? snapshot : { rect: snapshot.rect, clip: { left: 0, top: 0, width: 0, height: 0 } }, canvasRect, out),
          uv: () => ({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }),
          onDraw: () => { if (!stopped && !composing && !printing) field.dataset.canvasInput = "active" },
          onError: fail,
        })
      }
    } catch { fail() }
  }, { layer: -1000 })
  function fail() { destroy(); field.dataset.canvasInput = "fallback" }
  const observer = new ResizeObserver(invalidateLayout)
  for (const el of [field, input, root, engine.canvas]) observer.observe(el)
  const mutations = new MutationObserver(records => {
    // Repair scans temporarily restore/hide image styles in one task. Compare
    // the first old value to the final value, not intermediate owned writes.
    const first = new Map<Element, Map<string, string | null>>()
    for (const record of records) {
      if (record.type !== "attributes") { invalidateLayout(); return }
      const target = record.target as Element, name = record.attributeName!
      let values = first.get(target)
      if (!values) { values = new Map(); first.set(target, values) }
      if (!values.has(name)) values.set(name, record.oldValue)
    }
    for (const [target, values] of first) for (const [name, old] of values)
      if (target.getAttribute(name) !== old) { invalidateLayout(); return }
  })
  mutations.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeOldValue: true })
  const intersection = new IntersectionObserver(entries => {
    const next = entries[entries.length - 1]?.isIntersecting ?? false
    if (next === visible) return
    visible = next; invalidateLayout(); scheduleCaret()
  })
  intersection.observe(field)
  for (const name of ["resize", "pageshow"]) window.addEventListener(name, invalidateLayout, { signal: abort.signal })
  for (const name of ["focus", "blur"]) input.addEventListener(name, invalidateLayout, { signal: abort.signal })
  document.addEventListener("scroll", () => engine.requestFrame(), { capture: true, passive: true, signal: abort.signal })
  for (const name of ["load", "pointerover", "pointerout", "transitionrun", "transitionend", "animationstart", "animationend"])
    document.addEventListener(name, invalidateLayout, { capture: true, signal: abort.signal })
  // CSSOM edits do not notify MutationObserver. A slow read-only repair checks
  // the cache without waking rendering unless layout/font/clip state changed.
  const repairTimer = window.setInterval(() => {
    if (stopped || document.hidden || !visible || layoutDirty) return
    const measure = new Measurements(), styles = new Map<Element, CSSStyleDeclaration>()
    const scroll = { x: window.scrollX, y: window.scrollY }
    const trackers = [fieldTracker, rootTracker, canvasTracker]
    let changed = false
    for (const tracker of trackers) {
      const fresh = new RectTracker(tracker.element); trackAncestors(fresh, styles)
      if (JSON.stringify(tracker.pinned ? lastGeometry.get(tracker) : tracker.read(scroll, measure)) !== JSON.stringify(fresh.read(scroll, measure)) ||
        tracker.pinned !== fresh.pinned || tracker.clippers.length !== fresh.clippers.length ||
        tracker.clippers.some((el, i) => el !== fresh.clippers[i])) changed = true
    }
    const bounds = measure.rect(field), text = measure.rect(input), style = getComputedStyle(input)
    if (font !== `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` || text.left - bounds.left !== textBox.x ||
      text.top - bounds.top !== textBox.y || text.width !== textBox.width || text.height !== textBox.height) changed = true
    if (changed) invalidateLayout()
  }, 1000)
  document.fonts?.addEventListener("loadingdone", invalidateLayout, { signal: abort.signal })
  for (const name of ["input", "select", "focus", "blur", "keyup", "pointerup", "scroll"])
    input.addEventListener(name, wake, { signal: abort.signal })
  document.addEventListener("selectionchange", () => { if (document.activeElement === input) wake() }, { signal: abort.signal })
  document.addEventListener("visibilitychange", scheduleCaret, { signal: abort.signal })
  input.addEventListener("compositionstart", () => { composing = true; wake() }, { signal: abort.signal })
  input.addEventListener("compositionend", () => { composing = false; wake() }, { signal: abort.signal })
  window.addEventListener("beforeprint", () => { printing = true; scheduleCaret(); restore(); item?.destroy(); item = null }, { signal: abort.signal })
  window.addEventListener("afterprint", () => { printing = false; wake() }, { signal: abort.signal })
  engine.canvas.addEventListener("shooosh:unavailable", fail, { signal: abort.signal })
  engine.canvas.addEventListener("webglcontextlost", fail, { signal: abort.signal })
  // No caret timer is armed for an unfocused, hidden or natively painted field.
  scheduleCaret()
  function destroy() {
    if (stopped) return
    stopped = true; serial++; abort.abort(); observer.disconnect(); mutations.disconnect(); intersection.disconnect(); clearInterval(repairTimer); clearTimeout(caretTimer)
    unsubscribe(); item?.destroy(); texture?.destroy(); restore()
  }
  engine.requestFrame()
  return { destroy, invalidate: invalidateLayout, setMix(value: number) { mix = value; item?.setUni({ value1: value }) } }
}
