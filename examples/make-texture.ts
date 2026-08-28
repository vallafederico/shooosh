/**
 * Procedural paper canvas for loadTexture demos — no binary assets required.
 *
 * How to use:
 *   await scene.getInitPromise()
 *   const tex = await loadTexture(makePaperCanvas())
 *   scene.configureScreen({ texture: tex, shaders: { fragment } })
 */

export function makePaperCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  const ink = "#0c0c0b"
  const paper = "#ece7dc"
  const acid = "#d8ff3e"

  ctx.fillStyle = paper
  ctx.fillRect(0, 0, size, size)

  // Soft grain
  const image = ctx.getImageData(0, 0, size, size)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18
    data[i] = Math.min(255, Math.max(0, data[i]! + n))
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1]! + n))
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2]! + n))
  }
  ctx.putImageData(image, 0, 0)

  // Brand stripe + rings
  ctx.strokeStyle = acid
  ctx.lineWidth = size * 0.012
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.48, size * 0.22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.48, size * 0.34, 0.2, Math.PI * 1.4)
  ctx.stroke()

  ctx.fillStyle = ink
  ctx.font = `600 ${Math.round(size * 0.08)}px "IBM Plex Mono", monospace`
  ctx.fillText("shooosh", size * 0.18, size * 0.82)

  return canvas
}

/** Cool → warm gradient used as a fake env/matcap for createObject. */
export function makeEnvCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, "#0a0a09")
  g.addColorStop(0.28, "#2a3228")
  g.addColorStop(0.55, "#8a9470")
  g.addColorStop(0.72, "#d8ff3e")
  g.addColorStop(1, "#ece7dc")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Soft key highlight so chrome reads a hot spot, not a flat wash.
  const bloom = ctx.createRadialGradient(
    size * 0.28,
    size * 0.22,
    size * 0.02,
    size * 0.28,
    size * 0.22,
    size * 0.45,
  )
  bloom.addColorStop(0, "rgba(255,255,245,0.95)")
  bloom.addColorStop(0.35, "rgba(216,255,62,0.35)")
  bloom.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, size, size)

  return canvas
}
