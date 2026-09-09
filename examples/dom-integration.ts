import shader, { fragment } from "./dom-integration.wgsl"
/**
 * DOM integration lab. Copy run(root), or just createDomLayer + media below.
 * Uses the optional shooosh/dom entry; no global engine or page style changes.
 * The host must have a height. All markup, assets and controls are example-owned.
 */
import { createDomLayer, type DomBinding, type DomLayer } from "shooosh/dom"
import { makeDomPoster } from "./dom-integration-art"
import { domIntegrationStyle } from "./dom-integration-style"
import { mountCanvasInput } from "./dom-canvas-input"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

// Inline vectors remain native DOM; they are not rasterized or shader bindings.
const icon = (path: string) => `<svg class="dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`
const editIcon = icon('<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>')
const heartIcon = icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>')
const arrowIcon = icon('<path d="M4 12h16m-6-6 6 6-6 6"/>')
const resetIcon = icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>')

export { fragment }


export function run(host: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const shell = document.createElement("section")
  shell.className = "dom-lab"
  shell.setAttribute("aria-label", "DOM integration lab")
  shell.innerHTML = `<style>${domIntegrationStyle}</style>
    <header class="dl-heading"><div class="dl-eyebrow"><span>Shooosh / DOM integration</span><span>Interactive study 01</span></div>
    <h1>A page. Two renderers.</h1><p class="dl-intro">The browser lays it out. The GPU paints it. Explore shader effects, scrolling, and the moments where native HTML takes over.</p></header>
    <div class="dl-toolbar">
      <div class="dl-mode" role="group" aria-label="Rendering mode"><button data-action="gpu" aria-pressed="true">GPU</button><button data-action="native" aria-pressed="false">DOM</button></div>
      <label>Shader mix <input data-control="mix" type="range" min="0" max="1" step="0.01" value="0.55" aria-label="Shader mix"></label>
      <label>Image fit <select data-control="fit" aria-label="Image fit"><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select></label>
      <button data-action="swap">Swap image</button><button data-action="radius" aria-pressed="false">Round corners</button>
    </div>
    <div class="dl-scroll" data-content>
      <div class="dl-section-label"><span>01 / Native layout, GPU colour</span><span>Scroll to inspect ↓</span></div>
      <div class="dl-grid">
        <figure><a class="dl-link" href="#" data-image-link><img class="dl-image" data-image="primary" alt="A geometric poster with a disc and open circular frame"></a>
          <figcaption class="dl-card-info"><div><h2 data-poster-title>Colour in context</h2><p>Adjust the shader mix, swap the source, or change the fit. This image is still a native link.</p></div><span class="dl-state" data-state-for="primary">Preparing</span></figcaption></figure>
        <figure><img class="dl-image" data-image="secondary" alt="Lime and forest-green geometric forms" style="object-fit:contain;object-position:25% 75%">
          <figcaption class="dl-card-info"><div><h2>The space around an image</h2><p>Contain · 25% 75% positioning. Empty space is transparent, not stretched.</p></div><span class="dl-state" data-state-for="secondary">Preparing</span></figcaption></figure>
        <figure><img class="dl-image" data-image="fallback" alt="Burgundy geometric forms with rounded native corners" style="border-radius:28px">
          <figcaption class="dl-card-info"><div><h2>Knowing when to step aside</h2><p>Rounded images are outside the first adapter’s CSS subset. The original remains visible.</p></div><span class="dl-state" data-state-for="fallback">Native</span></figcaption></figure>
        <div class="dl-note"><h3>Same markup.<br>A different finish.</h3><p>Switch to DOM to compare with the untouched source. Set the shader mix to zero to inspect alignment and texture fitting.</p><p>No screenshots of HTML. No replaced links. Just measured rectangles and a shared canvas.</p><div class="dl-actions"><button data-action="remount">Remount adapter</button><button data-action="check">Run checks</button></div><div class="dl-checks" data-checks role="status">Ready to inspect.</div></div>
      </div>
      <form class="dl-form" data-editor aria-label="Poster editor">
        <div class="dl-form-heading"><div><span class="dl-eyebrow">02 / Touch the DOM</span><h2>Make it yours.</h2></div>
          <button class="dl-save" type="button" data-action="favorite" aria-label="Save poster" aria-pressed="false">${heartIcon}<span data-save-label>Save</span></button></div>
        <p>The rounded field, pencil, text, selection and caret are painted into a GPU texture. The real input handles typing and focus. Change Shader mix to affect the field itself. Save and reset remain native controls.</p>
        <label class="dl-title-label"><span>Poster title</span><span class="dl-input-wrap">${editIcon}<input data-title-input name="title" type="text" value="Colour in context" placeholder="Give your poster a title" maxlength="60" required autocomplete="off"></span></label>
        <div class="dl-form-bottom"><div class="dl-actions"><button type="submit" class="dl-apply">Apply title ${arrowIcon}</button><button type="reset">${resetIcon} Reset</button></div><span class="dl-form-status" data-editor-status role="status">Edits stay in this example.</span></div>
        <p class="dl-input-status" data-input-status>Preparing canvas input…</p>
      </form>
      <div class="dl-notes"><figure><div class="dl-nested" data-nested><img class="dl-image" data-image="nested" alt="A geometric poster inside a separately scrolling frame"></div>
        <figcaption class="dl-card-info"><div><h2>A scroll inside a scroll</h2><p>Scroll this frame. The GPU image follows its own clipping container.</p></div><span class="dl-state" data-state-for="nested">Preparing</span></figcaption></figure>
        <div class="dl-note"><h3>Inspect the handover.</h3><p>“Round corners” deliberately introduces unsupported CSS. The first image should become native immediately, then return to the GPU when you turn it off.</p><p>The footer shows actual binding states and the last frame’s bounds reads. Metrics update without invalidating the DOM measurement cache.</p></div></div>
    </div>
    <footer class="dl-footer"><input class="dl-engine" data-backend readonly tabindex="-1" aria-label="Active renderer" value="Starting…"><input class="dl-metric" data-metric readonly tabindex="-1" aria-label="Adapter statistics" value="Preparing bindings"><span>WGSL → WebGPU / WebGL2</span></footer>`
  host.append(shell)
  const query = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!
  const content = query<HTMLElement>("[data-content]")
  const primary = query<HTMLImageElement>('[data-image="primary"]')
  const mix = query<HTMLInputElement>('[data-control="mix"]')
  const fit = query<HTMLSelectElement>('[data-control="fit"]')
  const checks = query<HTMLElement>("[data-checks]")
  const images = [...shell.querySelectorAll<HTMLImageElement>("[data-image]")]
  const posters = [0, 1, 2].map(makeDomPoster)
  images.forEach((img, i) => { img.src = posters[i % 3]! })
  let dom: DomLayer | null = null
  let canvas: HTMLCanvasElement | null = null
  let bindings: DomBinding[] = []
  let canvasInput: ReturnType<typeof mountCanvasInput> | null = null
  let disposed = false, generation = 0, native = false, swapped = false, checking = false
  const abort = new AbortController()

  function refresh() {
    if (disposed) return
    query<HTMLInputElement>("[data-backend]").value = native ? "Native DOM" : dom ? dom.engine.backend : "Native fallback"
    const stats = dom?.stats
    const inputMode = query<HTMLInputElement>("[data-title-input]").parentElement!.dataset.canvasInput
    const inputStatus = inputMode === "active" ? "Canvas input · GPU paint / native editing · LTR prototype"
      : "Native input · canvas inactive, unsupported text, or composition in progress"
    if (query<HTMLElement>("[data-input-status]").textContent !== inputStatus) query<HTMLElement>("[data-input-status]").textContent = inputStatus
    const fallback = bindings.filter(b => b.state === "fallback").length
    query<HTMLInputElement>("[data-metric]").value = stats ? `${stats.active} GPU / ${fallback} native / ${stats.bindings} bound · ${stats.rectReads} rect reads` : "Original HTML is painting"
    images.forEach((img, i) => {
      const badge = shell.querySelector<HTMLElement>(`[data-state-for="${img.dataset.image}"]`)!
      const state = native || !dom ? "native" : bindings[i]?.state ?? "preparing"
      const label = state === "active" ? "GPU" : state === "fallback" || state === "native" ? "Native" : "Preparing"
      if (badge.textContent !== label) badge.textContent = label
      badge.dataset.state = state
      badge.title = bindings[i]?.reason ?? (state === "active" ? "Frame submitted; native image retained" : "")
    })
  }
  async function mount(useNative = false) {
    const token = ++generation
    native = useNative
    canvasInput?.destroy(); canvasInput = null
    dom?.destroy(); dom = null; canvas?.remove(); canvas = null; bindings = []
    for (const button of shell.querySelectorAll<HTMLButtonElement>(".dl-mode button")) button.setAttribute("aria-pressed", String((button.dataset.action === "native") === native))
    if (native || disposed) { refresh(); return null }
    const nextCanvas = document.createElement("canvas")
    nextCanvas.className = "dl-canvas"; shell.append(nextCanvas); canvas = nextCanvas
    const next = await createDomLayer({ canvas: nextCanvas, root: content, backend: options.backend, repairInterval: 0,
      onError: ({ error }) => { if (!disposed && token === generation) checks.textContent = `Native fallback: ${error instanceof Error ? error.message : String(error)}` } })
    if (disposed || token !== generation) { next?.destroy(); nextCanvas.remove(); return null }
    dom = next
    if (dom) bindings = images.map(img => dom!.media(img, { shaders: shader, uni: { value1: Number(mix.value) } }))
    if (dom) canvasInput = mountCanvasInput(query<HTMLInputElement>("[data-title-input]"), content, dom.engine, shader, Number(mix.value))
    refresh()
    return dom?.engine.backend ?? null
  }
  function message(text: string) { if (!disposed) checks.textContent = text }
  async function until(test: () => boolean) {
    const deadline = performance.now() + 8000
    while (!test()) {
      if (disposed) throw new Error("Example disposed")
      if (performance.now() > deadline) throw new Error("Timed out waiting for a binding")
      await new Promise(resolve => setTimeout(resolve, 30))
    }
  }
  async function runChecks() {
    if (checking) return
    checking = true
    const controls = [...shell.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,select,input[type=range]")]
    controls.forEach(el => { el.disabled = true })
    const savedRadius = primary.style.borderRadius, savedSource = primary.src, savedScroll = content.scrollTop
    const results: string[] = []
    const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); results.push(`✓ ${label}`) }
    try {
      message("Checking activation, fallback, caching and cleanup…")
      primary.style.borderRadius = ""; content.scrollTop = 0
      await mount()
      if (!dom) throw new Error("GPU unavailable; native content remains intact")
      const session = dom as DomLayer
      const first = bindings[0]!
      await until(() => first.state === "active")
      check(getComputedStyle(primary).visibility === "visible", "Native semantics preserved")
      check(session.media(primary) === first, "Registration is idempotent")
      primary.style.borderRadius = "28px"
      await until(() => first.state === "fallback")
      check(primary.style.opacity === "", "Unsupported CSS restores native paint")
      primary.style.borderRadius = ""
      await until(() => first.state === "active")
      check(true, "Supported CSS reactivates the GPU")
      session.engine.render(); session.engine.render()
      check(session.stats.rectReads === 1, "Settled geometry comes from the cache")
      // Render in the same task, before the browser delivers the scroll event.
      content.scrollTop = 64; session.engine.render()
      check(session.stats.rectReads === 1, "Container scroll needs no new element bounds")
      const nested = query<HTMLElement>("[data-nested]"), nestedScroll = nested.scrollTop
      nested.scrollTop = 64; session.engine.render()
      check(session.stats.rectReads === 1, "Nested scroll needs no new element bounds")
      nested.scrollTop = nestedScroll; content.scrollTop = 0
      session.destroy(); dom = null
      check(primary.style.opacity === "" && first.state === "disposed", "Destroy restores original paint")
      await mount(); await until(() => bindings[0]?.state === "active")
      check(true, "Clean remount succeeds")
      message(`${results.join("\n")}\n${results.length} / ${results.length} checks passed`)
    } catch (error) {
      message(`${results.join("\n")}\n✕ ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (!disposed) {
        primary.style.borderRadius = savedRadius; primary.src = savedSource; content.scrollTop = savedScroll
        dom?.invalidate(); refresh(); controls.forEach(el => { el.disabled = false })
      }
      checking = false
    }
  }
  shell.addEventListener("click", event => {
    const target = event.target as Element
    if (target.closest("[data-image-link]")) { event.preventDefault(); message("Native link received the click. Layout, focus and interaction still belong to HTML."); return }
    const action = target.closest<HTMLButtonElement>("button[data-action]")?.dataset.action
    if (!action) return
    if (action === "gpu" || action === "native" || action === "remount") void mount(action === "native")
    if (action === "swap") { swapped = !swapped; primary.src = posters[swapped ? 2 : 0]! }
    if (action === "radius") {
      const rounded = !primary.style.borderRadius
      primary.style.borderRadius = rounded ? "28px" : ""
      query<HTMLButtonElement>('[data-action="radius"]').setAttribute("aria-pressed", String(rounded))
    }
    if (action === "check") void runChecks()
    if (action === "favorite") {
      const button = query<HTMLButtonElement>('[data-action="favorite"]')
      const saved = button.getAttribute("aria-pressed") !== "true"
      button.setAttribute("aria-pressed", String(saved))
      query<HTMLElement>("[data-save-label]").textContent = saved ? "Saved" : "Save"
      query<HTMLElement>("[data-editor-status]").textContent = saved ? "Poster saved for this session." : "Poster removed from saved."
    }
  }, { signal: abort.signal })
  const editor = query<HTMLFormElement>("[data-editor]")
  const titleInput = query<HTMLInputElement>("[data-title-input]")
  editor.addEventListener("submit", event => {
    event.preventDefault()
    const title = titleInput.value.trim()
    if (!title) { titleInput.setCustomValidity("Enter a title with at least one visible character."); titleInput.reportValidity(); return }
    query<HTMLElement>("[data-poster-title]").textContent = title
    query<HTMLElement>("[data-editor-status]").textContent = `Title updated to “${title}”.`
  }, { signal: abort.signal })
  titleInput.addEventListener("input", () => titleInput.setCustomValidity(""), { signal: abort.signal })
  editor.addEventListener("reset", () => {
    titleInput.setCustomValidity("")
    query<HTMLElement>("[data-poster-title]").textContent = "Colour in context"
    query<HTMLButtonElement>('[data-action="favorite"]').setAttribute("aria-pressed", "false")
    query<HTMLElement>("[data-save-label]").textContent = "Save"
    query<HTMLElement>("[data-editor-status]").textContent = "Title and saved state reset."
  }, { signal: abort.signal })
  mix.addEventListener("input", () => {
    bindings.forEach(b => b.setUni({ value1: Number(mix.value) }))
    canvasInput?.setMix(Number(mix.value))
  }, { signal: abort.signal })
  fit.addEventListener("change", () => { primary.style.objectFit = fit.value }, { signal: abort.signal })
  const timer = window.setInterval(refresh, 250)
  const ready = mount()
  return { ready, destroy() {
    if (disposed) return
    disposed = true; generation++; abort.abort(); clearInterval(timer)
    canvasInput?.destroy(); canvasInput = null
    dom?.destroy(); dom = null; canvas?.remove(); shell.remove()
  } }
}

export const domIntegration: ExampleSpec = {
  id: "dom-integration", label: "DOM integration", kind: "dom-integration",
  copy: "Cached DOM geometry, image shaders, native fallback and an interactive inspection surface.",
  fragment, run,
}
