/** Gallery view for the separately prepared car studio. No model data loads until run(). */
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

// Catalog shader-test placeholder; the actual material lives with the standalone studio.
export const fragment = "fn fsMain() -> vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }"

export function run(host: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const frame = document.createElement("iframe")
  frame.title = "Car PBR material studio"
  frame.style.cssText =
    "display:block;width:100%;height:100%;min-height:600px;border:0;background:#101619"
  const abort = new AbortController()
  let live = true
  let finish!: (backend: "webgpu" | "webgl2" | null) => void
  const ready = new Promise<"webgpu" | "webgl2" | null>((resolve) => {
    finish = resolve
  })
  const url = new URL("./car-pbr/index.html", document.baseURI)
  url.searchParams.set("backend", options.backend ?? "auto")
  url.searchParams.set("embedded", "1")
  const onMessage = (event: MessageEvent) => {
    if (
      !live ||
      event.source !== frame.contentWindow ||
      event.origin !== url.origin ||
      event.data?.type !== "car-pbr-ready"
    )
      return
    const backend = event.data.backend
    if (backend === "webgpu" || backend === "webgl2") {
      clearTimeout(timeout)
      finish(backend)
    } else if (backend === null) fail("The car studio could not initialize its renderer.")
  }
  const fail = (message: string) => {
    if (!live) return
    live = false
    abort.abort()
    window.removeEventListener("message", onMessage)
    clearTimeout(timeout)
    frame.remove()
    options.onInitError?.(new Error(message))
    finish(null)
  }
  const timeout = window.setTimeout(
    () => fail("The car studio did not finish loading."),
    30000,
  )
  window.addEventListener("message", onMessage)
  // Check for locally prepared assets before Vite's HTML fallback could create a nested gallery.
  void fetch(new URL("model.json", url), { signal: abort.signal })
    .then(async (response) => {
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error("missing")
      const metadata = await response.json()
      if (!Array.isArray(metadata.variants)) throw new Error("missing")
      if (!live) return
      frame.src = url.href
      host.append(frame)
    })
    .catch(() =>
      fail(
        "Prepare the car assets first: node packages/model/demo/car-pbr/prepare.mjs <car-variants-directory> harness/public/car-pbr. See examples/car-pbr.md.",
      ),
    )
  return {
    ready,
    destroy() {
      live = false
      abort.abort()
      clearTimeout(timeout)
      window.removeEventListener("message", onMessage)
      frame.remove()
      finish(null)
    },
  }
}

export const carPbr: ExampleSpec = {
  id: "car-pbr",
  label: "Car · PBR material studio",
  copy: "Converted textures, GGX lighting, and interactive material controls.",
  kind: "view",
  fragment,
  run,
}
