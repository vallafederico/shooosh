/** Shared UI/lifecycle for the two shader recipes. Uses only public shooosh APIs.
 * All textures, uniforms and bind groups are reused until resize/quality changes.
 * Computes only on invalidation; display can reuse the last completed textures.
 * The caller owns the canvas and its sized parent. destroy() is safe during init.
 */
import { createEngine, createCompute, type ComputeSession } from "shooosh"
import type { ExampleRunOptions, ExampleHandle } from "./types"
import { sceneShader } from "./screen-space-scene"
export type ScreenSpaceShaders = { effect: string; blur: string; display: string }
export function runScreenSpaceLab(
  canvas: HTMLCanvasElement,
  mode: "sss" | "ssao",
  shaders: ScreenSpaceShaders,
  options: ExampleRunOptions = {},
): ExampleHandle {
  const host = canvas.parentElement
  if (!host)
    throw new Error("Mount the canvas in a sized parent before running the example.")
  const controls = document.createElement("section")
  controls.setAttribute("aria-label", `${mode.toUpperCase()} controls`)
  controls.style.cssText =
    "position:absolute;z-index:5;left:24px;right:24px;bottom:20px;padding:16px;background:#15202aee;color:#edf1ed;border:1px solid #66747a;border-radius:12px;font:12px/1.5 system-ui;display:flex;gap:16px;flex-wrap:wrap;align-items:center"
  const sss = mode === "sss"
  controls.innerHTML = `<label>View <select data-view><option value="0">Combined</option><option value="1">Without effect</option><option value="2">Effect only</option><option value="3">Normals</option><option value="4">Depth</option><option value="5">Split comparison</option></select></label>
 <label>Radius <input aria-label="Radius" data-radius type="range" min="${sss ? 1 : 0.05}" max="${sss ? 40 : 1.5}" step="${sss ? 1 : 0.05}" value="${sss ? 20 : 0.5}"></label>
 <label>Strength <input aria-label="Strength" data-strength type="range" min="0" max="${sss ? 1 : 3}" step="0.05" value="${sss ? 0.85 : 1.5}"></label>
 <label>Orbit <input aria-label="Orbit" data-orbit type="range" min="-1.2" max="1.2" step="0.02" value="0.25"></label>
 <label>Light <input aria-label="Light" data-light type="range" min="-1" max="1" step="0.05" value="0.3"></label>
 ${sss ? '<label>Light pattern <select data-pattern><option value="uniform">Uniform</option><option value="slits">Slits · diffusion test</option></select></label>' : '<label>Quality <select data-quality><option value="8">8 samples · half resolution</option><option value="16" selected>16 samples · half resolution</option><option value="full">16 samples · full resolution</option></select></label>'}
 <output role="status" style="flex-basis:100%">Preparing WebGPU shaders…</output>`
  host.append(controls)
  const caption = host.querySelector<HTMLElement>(":scope > .overlay")
  const captionStyle = caption?.getAttribute("style")
  if (caption) {
    caption.style.top = "24px"
    caption.style.bottom = "auto"
    caption.style.maxWidth = "52ch"
  }
  const query = (selector: string) =>
    controls.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!
  const status = controls.querySelector("output")!
  const abort = new AbortController()
  let stopped = false,
    dirty = true,
    width = 0,
    height = 0,
    effectWidth = 0,
    effectHeight = 0,
    updates = 0
  let gpu: ComputeSession | null = null
  type Texture = ReturnType<ComputeSession["createStorageTexture"]>
  type Group = ReturnType<ComputeSession["device"]["createBindGroup"]>
  type Resource = Parameters<
    ComputeSession["device"]["createBindGroup"]
  >[0]["entries"][number]["resource"]
  let textures: Texture[] = []
  let groups: Group[] = []
  const data = new Float32Array(8)
  let uniform: ReturnType<ComputeSession["createUniformBuffer"]> | null = null
  let failed = false
  let engine: Awaited<ReturnType<typeof createEngine>> | null = null
  const fail = (error: unknown) => {
    failed = true
    status.textContent = `${mode.toUpperCase()} unavailable: ${error instanceof Error ? error.message : String(error)}. Native controls remain readable.`
  }
  controls.addEventListener(
    "input",
    () => {
      dirty = true
      gpu?.requestFrame()
    },
    { signal: abort.signal },
  )
  canvas.addEventListener("shooosh:unavailable", () => fail("GPU device lost"), {
    signal: abort.signal,
  })
  const ready = (async () => {
    try {
      const renderer = await createEngine(canvas, {
        backend: options.backend ?? "auto",
        dpr: { max: 1.5 },
        clearColor: { r: 0.045, g: 0.052, b: 0.065, a: 1 },
      })
      if (stopped) {
        renderer.destroy()
        return null
      }
      engine = renderer
      engine.start()
      gpu = createCompute(engine)
      if (!gpu) {
        status.textContent =
          "This multipass WGSL example requires WebGPU. WebGL2 is not implemented; no substitute effect is rendered."
        return engine.backend
      }
      const session = gpu
      uniform = session.createUniformBuffer(32, `${mode}-params`)
      const scenePipe = session.createPipeline(sceneShader, `${mode}-geometry`)
      const effectPipe = session.createPipeline(shaders.effect, `${mode}-effect`)
      const blurPipe = session.createPipeline(shaders.blur, `${mode}-blur`)
      const displayPipe = session.createDisplayPipeline(
        shaders.display,
        `${mode}-composite`,
      )

      // Resources are created only on resize. Prebuilt groups avoid cache growth.
      const resize = (w: number, h: number, ew: number, eh: number) => {
        textures.forEach((texture) => texture.destroy())
        textures = []
        groups = []
        width = w
        height = h
        effectWidth = ew
        effectHeight = eh
        const sizes = [
          [w, h],
          [w, h],
          [ew, eh],
          [ew, eh],
        ]
        textures = sizes.map(([x, y], i) =>
          session.createStorageTexture(x!, y!, `${mode}-${i}`),
        )
        const views = textures.map((texture) => texture.createView())
        const diffuse = views[0]!,
          geometry = views[1]!,
          scratch = views[2]!,
          output = views[3]!
        const params = { buffer: uniform! }
        const group = (
          pipe: typeof scenePipe | typeof displayPipe,
          resources: Resource[],
        ) =>
          session.device.createBindGroup({
            layout: pipe.getBindGroupLayout(0),
            entries: resources.map((resource, binding) => ({ binding, resource })),
          })
        groups = [
          group(scenePipe, [params, diffuse, geometry]),
          group(
            effectPipe,
            sss
              ? [params, diffuse, geometry, diffuse, scratch]
              : [params, geometry, scratch],
          ),
          group(
            blurPipe,
            sss
              ? [params, diffuse, geometry, scratch, output]
              : [params, geometry, scratch, output],
          ),
          group(displayPipe, [params, diffuse, geometry, output]),
        ]
      }
      session.setOnCompute(({ encoder }) => {
        if (stopped || failed) return
        const scale = Math.min(1, 960 / Math.max(canvas.width, canvas.height, 1))
        const w = Math.max(1, Math.round(canvas.width * scale))
        const h = Math.max(1, Math.round(canvas.height * scale))
        const quality = sss ? "full" : query("[data-quality]").value
        const ew = sss || quality === "full" ? w : Math.ceil(w / 2)
        const eh = sss || quality === "full" ? h : Math.ceil(h / 2)
        if (w !== width || h !== height || ew !== effectWidth || eh !== effectHeight) {
          resize(w, h, ew, eh)
          dirty = true
        }
        if (!dirty) return
        dirty = false
        data.set([
          w,
          h,
          Number(query("[data-radius]").value),
          Number(query("[data-strength]").value),
          Number(query("[data-orbit]").value),
          Number(query("[data-light]").value),
          Number(query("[data-view]").value),
          sss
            ? query("[data-pattern]").value === "slits"
              ? 0
              : 1
            : quality === "8"
              ? 8
              : 16,
        ])
        session.writeBuffer(uniform!, data)
        session.dispatch(encoder, scenePipe, w, h, groups[0]!, `${mode} geometry`)
        session.dispatch(
          encoder,
          effectPipe,
          ew,
          eh,
          groups[1]!,
          `${mode} ${sss ? "horizontal diffusion" : "occlusion"}`,
        )
        session.dispatch(
          encoder,
          blurPipe,
          ew,
          eh,
          groups[2]!,
          `${mode} ${sss ? "vertical diffusion" : "bilateral denoise"}`,
        )
        updates++
        const mib = (((w * h * 2 + ew * eh * 2) * 8) / 1048576).toFixed(1)
        status.textContent = `WebGPU · scene ${w}×${h} · effect ${ew}×${eh} · 3 compute passes + composite · ${mib} MiB intermediate textures · ${updates} updates. Idle: cached output. GPU time: not measured.`
      })
      session.setOnDisplay(({ pass }) => {
        if (!groups[3] || stopped || failed) return
        pass.setPipeline(displayPipe)
        pass.setBindGroup(0, groups[3])
        pass.draw(3)
      })
      session.requestFrame()
      return engine.backend
    } catch (error) {
      if (!stopped) {
        fail(error)
        options.onInitError?.(error)
      }
      return null
    }
  })()
  return {
    ready,
    getEngine: () => engine,
    destroy() {
      if (stopped) return
      stopped = true
      abort.abort()
      gpu?.destroy()
      textures.forEach((texture) => texture.destroy())
      uniform?.destroy()
      engine?.destroy()
      controls.remove()
      if (caption) {
        if (captionStyle === null) caption.removeAttribute("style")
        else if (captionStyle !== undefined) caption.setAttribute("style", captionStyle)
      }
    },
  }
}
