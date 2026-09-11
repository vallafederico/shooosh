/** Prepared static Camaro: Node reconstruction lives in scripts/prepare-camaro.mjs. */
import { createObject, loadTexture, type WebGLEngine } from 'shooosh'
import { createSpinner } from 'shooosh/utility'
import studioShader from './studio-metal.wgsl'
import { modelFitScale } from './lib/model-fit'
import { turntableEuler } from './lib/turntable'

type Part = { vertices: string; indices: string; texture: string; orm: string; material?: { kind?: 'paint' | 'glass' | 'standard'; clearcoat?: number; clearcoatRoughness?: number } }
const camera = { enabled: true, distance: 2.8, fov: 32, near: 0.1, far: 20 }

export function mountCamaro(plane: HTMLElement, { engine }: { engine: WebGLEngine }) {
  const abort = new AbortController()
  const cleanups: Array<() => void> = []
  let disposed = false
  const release = () => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() }
  const bytes = async (name: string) => {
    const response = await fetch(`/camaro/${name}`, { signal: abort.signal })
    if (!response.ok) throw new Error(`Camaro asset ${name}: HTTP ${response.status}`)
    return response.arrayBuffer()
  }
  const texture = async (name: string, data = false) => {
    const loaded = await loadTexture(`/camaro/${name}`, { engine, data, flipY: false,
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' } })
    if (disposed) { loaded.destroy(); throw new Error('Camaro disposed') }
    cleanups.push(() => loaded.destroy())
    return loaded
  }
  plane.dataset.modelState = 'loading'
  void (async () => {
    const manifest: { radius: number; parts: Part[] } = JSON.parse(new TextDecoder().decode(await bytes('model.json')))
    const parts = []
    for (const part of manifest.parts) {
      const [v, i] = await Promise.all([bytes(part.vertices), bytes(part.indices)])
      const albedo = await texture(part.texture), orm = await texture(part.orm, true)
      parts.push({ material: part.material, vertices: new Float32Array(v), indices: new Uint32Array(i), albedo, orm })
    }
    if (disposed) return
    const spinner = createSpinner({ element: plane, inertia: !matchMedia('(prefers-reduced-motion: reduce)').matches })
    cleanups.push(() => spinner.destroy())
    const restX = 0.16
    const restY = -0.65
    let yaw = 0
    const reset = () => { spinner.reset(); yaw = 0; engine.requestFrame() }
    const key = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Home') reset()
      else {
        if (event.key === 'ArrowLeft') yaw -= 0.15
        if (event.key === 'ArrowRight') yaw += 0.15
        engine.requestFrame()
      }
    }
    plane.addEventListener('dblclick', reset); plane.addEventListener('keydown', key)
    cleanups.push(() => { plane.removeEventListener('dblclick', reset); plane.removeEventListener('keydown', key) })
    let scale = 1
    const resize = () => {
      const box = plane.getBoundingClientRect(), canvas = engine.canvas.getBoundingClientRect()
      scale = modelFitScale(manifest.radius, box.width, box.height, canvas.width, canvas.height, camera.distance, camera.fov)
      engine.requestFrame()
    }
    resize()
    const observer = new ResizeObserver(resize); observer.observe(plane); observer.observe(engine.canvas)
    cleanups.push(() => observer.disconnect())
    let rotation = spinner.state
    const pose = () => turntableEuler(restX, restY + rotation.y + yaw)
    parts.forEach((part, index) => {
      const object = createObject(plane, {
        shape: { type: 'custom', vertices: part.vertices, indices: part.indices, vertexStride: 8 },
        uni: { value1: part.material?.clearcoat ?? 0, value2: part.material?.clearcoatRoughness ?? 0.12, value3: part.material?.kind === 'glass' ? 1 : 0 },
        camera, shaders: studioShader, envMap: part.albedo.texture, maskMap: part.orm.texture,
        scale, ...pose(),
        onFrame(self, frame) {
          if (index === 0) rotation = spinner.update(frame.delta / 1000)
          const cursor = rotation.dragging ? 'grabbing' : 'grab'
          if (plane.style.cursor !== cursor) plane.style.cursor = cursor
          self.setTransform({ scale, ...pose() })
        },
      })
      cleanups.push(() => object.destroy())
    })
    plane.dataset.modelState = 'ready'
  })().catch(error => {
    release()
    if (disposed) return
    plane.dataset.modelState = 'error'
    plane.textContent = 'Camaro model unavailable.'
    console.error('[shooosh] Camaro', error)
  })
  return () => { disposed = true; abort.abort(); release(); delete plane.dataset.modelState }
}
