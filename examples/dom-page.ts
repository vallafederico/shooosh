import shader, { fragment } from "./dom-page.wgsl"
/**
 * Page-mode DOM scan. Copy run(host), or just createDomLayer + scan below.
 *
 * How to use:
 *   const dom = await createDomLayer({ canvas, root })
 *   const page = dom?.scan({ shaders: { bind: shader } })
 *
 * Marks: img[data-sh-media], [data-sh-bind], [data-sh-box], [data-sh-text].
 * Unmarked HTML stays native. This is not a screenshot of the document.
 */
import { createDomLayer, type DomLayer, type DomScan } from "shooosh/dom"
import { makeDomPoster } from "./dom-integration-art"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }

const style = `
.dp { position:relative; min-height:100%; color:#222; font:16px/1.45 system-ui; background:#d3d3d3; }
.dp-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.dp-bar { position:relative; z-index:2; display:flex; justify-content:space-between; gap:12px; padding:20px; }
.dp-mode button { padding:6px 10px; cursor:pointer; }
.dp-mode button[aria-pressed="true"] { background:#222; color:#d3d3d3; }
.dp-copy { position:relative; z-index:2; padding:0 20px 28px; max-width:40rem; }
.dp-grid { position:relative; z-index:2; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; padding:0 20px 40px; }
.dp figure { margin:0; }
.dp img { display:block; width:100%; height:160px; object-fit:cover; background:#bbb; }
.dp-plane { min-height:160px; }
.dp fieldset { position:relative; z-index:2; margin:0 20px 32px; padding:0; border:0; max-width:24rem; }
.dp input { width:100%; padding:8px; }
@media (max-width:700px) { .dp-grid { grid-template-columns:1fr; } }
`

export function run(host: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const shell = document.createElement("section")
  shell.className = "dp"
  shell.setAttribute("aria-label", "DOM page scan")
  shell.innerHTML = `<style>${style}</style>
    <canvas class="dp-canvas" aria-hidden="true"></canvas>
    <div class="dp-bar"><span>shooosh / page scan</span>
      <div class="dp-mode" role="group" aria-label="Rendering mode">
        <button type="button" data-mode="gpu" aria-pressed="true">GPU</button>
        <button type="button" data-mode="native" aria-pressed="false">DOM</button>
      </div>
    </div>
    <div class="dp-copy">
      <h1>Mark the page. Scan it once.</h1>
      <p>GPU paints marked images and the UV plane. This sentence and the unmarked poster stay HTML.</p>
    </div>
    <div class="dp-grid" data-root>
      <figure><img data-sh-media alt="Marked poster one"><figcaption>data-sh-media</figcaption></figure>
      <div class="dp-plane" data-sh-bind></div>
      <figure><img alt="Unmarked poster stays native"><figcaption>unmarked</figcaption></figure>
    </div>
    <fieldset>
      <label>Native input <input type="text" value="stays native" autocomplete="off"></label>
    </fieldset>`
  host.append(shell)
  const canvas = shell.querySelector("canvas")!
  const root = shell.querySelector<HTMLElement>("[data-root]")!
  const posters = [0, 1].map(makeDomPoster)
  const images = [...shell.querySelectorAll("img")]
  images.forEach((img, i) => { img.src = posters[i % posters.length]! })
  let dom: DomLayer | null = null
  let scan: DomScan | null = null
  let disposed = false
  let native = false
  const abort = new AbortController()

  function syncButtons() {
    for (const button of shell.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      button.setAttribute("aria-pressed", String((button.dataset.mode === "native") === native))
    }
  }

  async function mount() {
    scan?.destroy(); scan = null
    if (native || disposed) return
    if (!dom) {
      const next = await createDomLayer({ canvas, root, backend: options.backend, repairInterval: 0,
        onError: ({ error }) => console.warn("[dom-page]", error) })
      if (disposed) { next?.destroy(); return }
      dom = next
    }
    scan = dom?.scan({ shaders: { bind: shader } }) ?? null
  }

  shell.addEventListener("click", (event) => {
    const mode = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-mode]")?.dataset.mode
    if (!mode) return
    native = mode === "native"
    syncButtons()
    if (native) { scan?.destroy(); scan = null }
    else void mount()
  }, { signal: abort.signal })

  const ready = mount().then(() => (native ? null : dom?.engine.backend ?? null))
  return {
    ready,
    destroy() {
      if (disposed) return
      disposed = true
      abort.abort()
      scan?.destroy(); scan = null
      dom?.destroy(); dom = null
      shell.remove()
    },
  }
}

export const domPage: ExampleSpec = {
  id: "dom-page", label: "DOM page scan", kind: "dom-integration",
  copy: "Attribute scan over marked images and decorative quads. Unmarked HTML stays native.",
  fragment, run,
}
