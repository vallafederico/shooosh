/**
 * Browser SDF helpers for demos — same encoding as shooosh/msdf (0.5 edge, >0.5 inside).
 *
 * How to use (icons):
 *   const canvas = makeIconSdfCanvas("mark")
 *   const tex = await loadTexture(canvas)
 *   createItem(el, { texture: tex, shaders: { fragment: sdfIconFragment } })
 *
 * How to use (text):
 *   const atlas = makeDemoFontAtlas("shooosh")
 *   const tex = await loadTexture(atlas.canvas)
 *   const packed = packMsdfLine(atlas, "shooosh", widthPx, heightPx)
 *   createMsdfGlyphs(el, { texture: tex, …packed, distanceRange: atlas.distanceRange, … })
 *
 * Production sites should bake with `shooosh/msdf` (Node/Bun) instead of this.
 * Docs: docs/msdf.md · skill shooosh-msdf
 */

const FAR = 1e20

function edt1d(f: Float64Array, n: number) {
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s =
      (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k -= 1
      s =
        (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k += 1
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!
  }
  return d
}

function edt2d(grid: Float64Array, width: number, height: number) {
  const line = new Float64Array(Math.max(width, height))
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = grid[y * width + x]!
    const d = edt1d(line, height)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]!
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) line[x] = grid[y * width + x]!
    const d = edt1d(line, width)
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x]!
  }
}

/** RGBA alpha ≥ 128 → single-channel SDF bytes (length = width * height). */
export function alphaToSdf(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  spread: number,
) {
  const size = width * height
  const outer = new Float64Array(size)
  const inner = new Float64Array(size)
  for (let i = 0; i < size; i++) {
    const inside = (data[i * 4 + 3] ?? 0) >= 128
    outer[i] = inside ? 0 : FAR
    inner[i] = inside ? FAR : 0
  }
  edt2d(outer, width, height)
  edt2d(inner, width, height)

  const sdf = new Uint8Array(size)
  const range = Math.max(1, spread)
  for (let i = 0; i < size; i++) {
    const sd = Math.sqrt(outer[i]!) - Math.sqrt(inner[i]!)
    const value = Math.max(0, Math.min(1, 0.5 - sd / (2 * range)))
    sdf[i] = Math.round(value * 255)
  }
  return sdf
}

function sdfBytesToCanvas(sdf: Uint8Array, width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < sdf.length; i++) {
    const v = sdf[i]!
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export type IconKind = "mark" | "arrow" | "rings"

/** Procedural stand-in for `generateIconSdf("….svg")` — same runtime sampling. */
export function makeIconSdfCanvas(
  kind: IconKind = "mark",
  size = 256,
  spread = 24,
): HTMLCanvasElement {
  const pad = spread
  const dim = size + pad * 2
  const scratch = document.createElement("canvas")
  scratch.width = dim
  scratch.height = dim
  const ctx = scratch.getContext("2d")
  if (!ctx) return scratch

  ctx.clearRect(0, 0, dim, dim)
  ctx.fillStyle = "#fff"
  const c = dim * 0.5
  const r = size * 0.32

  if (kind === "mark") {
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(c, c, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = "source-over"
    ctx.fillRect(c - size * 0.04, c - r * 0.85, size * 0.08, r * 1.7)
  } else if (kind === "arrow") {
    ctx.beginPath()
    ctx.moveTo(c - r * 0.9, c)
    ctx.lineTo(c + r * 0.2, c - r * 0.75)
    ctx.lineTo(c + r * 0.2, c - r * 0.28)
    ctx.lineTo(c + r * 0.95, c - r * 0.28)
    ctx.lineTo(c + r * 0.95, c + r * 0.28)
    ctx.lineTo(c + r * 0.2, c + r * 0.28)
    ctx.lineTo(c + r * 0.2, c + r * 0.75)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.lineWidth = size * 0.07
    ctx.strokeStyle = "#fff"
    ctx.beginPath()
    ctx.arc(c, c, r * 0.55, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(c, c, r * 0.95, 0.35, Math.PI * 1.55)
    ctx.stroke()
  }

  const image = ctx.getImageData(0, 0, dim, dim)
  const sdf = alphaToSdf(image.data, dim, dim, spread)
  return sdfBytesToCanvas(sdf, dim, dim)
}

export type DemoGlyph = {
  id: number
  char: string
  /** Atlas pixel rect. */
  x: number
  y: number
  width: number
  height: number
  xadvance: number
}

export type DemoFontAtlas = {
  canvas: HTMLCanvasElement
  glyphs: Map<string, DemoGlyph>
  distanceRange: number
  atlasWidth: number
  atlasHeight: number
  lineHeight: number
}

/**
 * Tiny runtime font atlas for demos (canvas fillText → SDF).
 * Prefer `generateFontAtlas` + committed PNG/JSON on real sites.
 */
export function makeDemoFontAtlas(
  charset = "shooosh HELLO",
  options: { cell?: number; spread?: number } = {},
): DemoFontAtlas {
  const cell = options.cell ?? 64
  const spread = options.spread ?? 8
  const unique = [...new Set(charset.split(""))].filter((c) => c !== " ")
  const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length)))
  const rows = Math.max(1, Math.ceil(unique.length / cols))
  const atlasWidth = cols * cell
  const atlasHeight = rows * cell

  const scratch = document.createElement("canvas")
  scratch.width = cell
  scratch.height = cell
  const sctx = scratch.getContext("2d")
  if (!sctx) {
    return {
      canvas: scratch,
      glyphs: new Map(),
      distanceRange: spread,
      atlasWidth: cell,
      atlasHeight: cell,
      lineHeight: cell,
    }
  }

  const atlas = document.createElement("canvas")
  atlas.width = atlasWidth
  atlas.height = atlasHeight
  const actx = atlas.getContext("2d")
  if (!actx) {
    return {
      canvas: atlas,
      glyphs: new Map(),
      distanceRange: spread,
      atlasWidth,
      atlasHeight,
      lineHeight: cell,
    }
  }

  const glyphs = new Map<string, DemoGlyph>()
  unique.forEach((char, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    sctx.clearRect(0, 0, cell, cell)
    sctx.fillStyle = "#fff"
    sctx.font = `600 ${Math.round(cell * 0.62)}px "IBM Plex Mono", ui-monospace, monospace`
    sctx.textAlign = "center"
    sctx.textBaseline = "middle"
    sctx.fillText(char, cell * 0.5, cell * 0.55)

    const image = sctx.getImageData(0, 0, cell, cell)
    const sdf = alphaToSdf(image.data, cell, cell, spread)
    const tile = sdfBytesToCanvas(sdf, cell, cell)
    actx.drawImage(tile, col * cell, row * cell)

    glyphs.set(char, {
      id: index,
      char,
      x: col * cell,
      y: row * cell,
      width: cell,
      height: cell,
      xadvance: cell * 0.62,
    })
  })

  return {
    canvas: atlas,
    glyphs,
    distanceRange: spread,
    atlasWidth,
    atlasHeight,
    lineHeight: cell,
  }
}

/**
 * Pack a string into createMsdfGlyphs instance data (8 floats / glyph:
 * dst xyxy in element 0..1, src uvuv in atlas 0..1).
 */
export function packMsdfLine(
  atlas: DemoFontAtlas,
  text: string,
  widthPx: number,
  heightPx: number,
) {
  const advances: number[] = []
  for (const char of text) {
    if (char === " ") {
      advances.push(atlas.lineHeight * 0.35)
      continue
    }
    advances.push(atlas.glyphs.get(char)?.xadvance ?? atlas.lineHeight * 0.5)
  }
  const total = advances.reduce((a, b) => a + b, 0) || 1
  const scale = Math.min(1, (widthPx * 0.86) / total)
  const drawH = atlas.lineHeight * scale
  const originX = (widthPx - total * scale) * 0.5
  const originY = (heightPx - drawH) * 0.5

  const instances: number[] = []
  let cursor = originX
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    const advance = advances[i]! * scale
    if (char === " ") {
      cursor += advance
      continue
    }
    const g = atlas.glyphs.get(char)
    if (!g) {
      cursor += advance
      continue
    }
    const glyphW = advance
    const x0 = cursor / widthPx
    const x1 = (cursor + glyphW) / widthPx
    const y0 = originY / heightPx
    const y1 = (originY + drawH) / heightPx
    const u0 = g.x / atlas.atlasWidth
    const v0 = g.y / atlas.atlasHeight
    const u1 = (g.x + g.width) / atlas.atlasWidth
    const v1 = (g.y + g.height) / atlas.atlasHeight
    instances.push(x0, y0, x1, y1, u0, v0, u1, v1)
    cursor += advance
    count += 1
  }

  return {
    glyphData: new Float32Array(instances),
    glyphCount: count,
    boxAspect: widthPx / Math.max(heightPx, 1),
  }
}
