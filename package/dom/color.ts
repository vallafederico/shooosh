/** Parse computed CSS colours for GPU materials. Unsupported syntax stays native. */
export function parseCssColor(value: string): [number, number, number, number] | null {
  const raw = value.trim().toLowerCase()
  if (!raw || raw === "transparent") return [0, 0, 0, 0]
  const hex = /^#([0-9a-f]{3,8})$/.exec(raw)
  if (hex) {
    const h = hex[1]!
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0]! + h[0]!, 16) / 255
      const g = parseInt(h[1]! + h[1]!, 16) / 255
      const b = parseInt(h[2]! + h[2]!, 16) / 255
      const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1
      return [r, g, b, a]
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16) / 255
      const g = parseInt(h.slice(2, 4), 16) / 255
      const b = parseInt(h.slice(4, 6), 16) / 255
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      return [r, g, b, a]
    }
    return null
  }
  const rgb = /^(?:rgb|rgba)\(\s*([^\)]+)\)$/.exec(raw)
  if (!rgb) return null
  const body = rgb[1]!.replace(/\//g, " ").replace(/,/g, " ").trim().split(/\s+/)
  if (body.length < 3) return null
  const n = (part: string, i: number) => {
    if (part.endsWith("%")) return Math.min(1, Math.max(0, parseFloat(part) / 100))
    const value = parseFloat(part)
    if (!Number.isFinite(value)) return null
    return i < 3 && value > 1 ? value / 255 : value
  }
  const r = n(body[0]!, 0), g = n(body[1]!, 1), b = n(body[2]!, 2)
  const a = body[3] !== undefined ? n(body[3]!, 3) : 1
  if (r === null || g === null || b === null || a === null) return null
  return [r, g, b, a]
}
