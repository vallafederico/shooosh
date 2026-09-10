/**
 * Layout DOM text into createMsdfGlyphs instance data.
 *
 * How to use: packDomTextGroups(element, matchAtlas) after matching baked bmfonts.
 * dst is each character's Range rect in element 0..1. Missing glyphs fail the run
 * so native type stays. Mixed weight is split per atlas, not screenshoted.
 */
export type BmfontChar = { id: number; x: number; y: number; width: number; height: number; xoffset?: number; yoffset?: number }
export type BmfontAtlas = {
  chars: BmfontChar[]
  info?: { size: number }
  common: { scaleW: number; scaleH: number; base?: number }
  distanceField?: { distanceRange?: number }
}

/** Atlas rectangles include distance-field padding, unlike DOM advance boxes. */
export function glyphInkRect(glyph: BmfontChar, fontSize: number, atlasSize: number,
  atlasBase: number, left: number, baseline: number) {
  const scale = fontSize / Math.abs(atlasSize)
  const x = left + (glyph.xoffset ?? 0) * scale
  const y = baseline + ((glyph.yoffset ?? 0) - atlasBase) * scale
  return { left: x, top: y, right: x + glyph.width * scale, bottom: y + glyph.height * scale }
}

export type TextGlyphGroup = {
  atlas: BmfontAtlas
  glyphData: Float32Array
  glyphCount: number
}

function weightOf(value: string) {
  if (value === "bold" || value === "bolder") return 700
  if (value === "normal" || value === "lighter") return 400
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : 400
}

export function familyOf(fontFamily: string) {
  return fontFamily.split(",")[0]?.replace(/['"]/g, "").trim() ?? ""
}

export function glyphMap(atlas: BmfontAtlas) {
  const chars = new Map<number, BmfontChar>()
  for (const glyph of atlas.chars) chars.set(glyph.id, glyph)
  return chars
}

export function packDomTextGroups(
  element: HTMLElement,
  match: (family: string, weight: number) => BmfontAtlas | null,
) {
  const box = element.getBoundingClientRect()
  const width = Math.max(box.width, 1)
  const height = Math.max(box.height, 1)
  const buckets = new Map<BmfontAtlas, { chars: Map<number, BmfontChar>; instances: number[] }>()
  let missing = 0
  const baseStyle = getComputedStyle(element)
  const range = document.createRange()
  const measure = document.createElement("canvas").getContext("2d")
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const parent = text.parentElement
    if (!parent) continue
    const style = getComputedStyle(parent)
    if (style.color !== baseStyle.color || style.fontStyle !== "normal" || style.textTransform !== "none" ||
      style.direction !== "ltr" || style.textShadow !== "none" || style.transform !== "none" ||
      Number(style.opacity) !== 1 || style.visibility !== "visible" || style.display === "none") {
      if (text.data.trim()) missing++
      continue
    }
    const atlas = match(familyOf(style.fontFamily), weightOf(style.fontWeight))
    if (!atlas) {
      if (text.data.trim()) missing++
      continue
    }
    let bucket = buckets.get(atlas)
    if (!bucket) {
      bucket = { chars: glyphMap(atlas), instances: [] }
      buckets.set(atlas, bucket)
    }
    const atlasW = Math.max(atlas.common.scaleW, 1)
    const atlasH = Math.max(atlas.common.scaleH, 1)
    const fontSize = parseFloat(style.fontSize)
    if (!measure || !atlas.info?.size || atlas.common.base === undefined) {
      if (text.data.trim()) missing++
      continue
    }
    measure.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`
    const ascent = measure.measureText("Mg").fontBoundingBoxAscent
    if (!Number.isFinite(ascent)) { missing++; continue }
    const value = text.data
    for (let i = 0; i < value.length;) {
      const start = i
      const code = value.codePointAt(i)!
      i += code > 0xffff ? 2 : 1
      if (code === 10 || code === 13 || code === 32) continue
      range.setStart(text, start)
      range.setEnd(text, i)
      const rect = range.getBoundingClientRect()
      if (rect.width < 0.2 && rect.height < 0.2) continue
      const glyph = bucket.chars.get(code)
      if (!glyph || glyph.width <= 0 || glyph.height <= 0) {
        missing++
        continue
      }
      const ink = glyphInkRect(glyph, fontSize, atlas.info.size, atlas.common.base, rect.left, rect.top + ascent)
      bucket.instances.push(
        (ink.left - box.left) / width,
        (ink.top - box.top) / height,
        (ink.right - box.left) / width,
        (ink.bottom - box.top) / height,
        glyph.x / atlasW, glyph.y / atlasH,
        (glyph.x + glyph.width) / atlasW, (glyph.y + glyph.height) / atlasH,
      )
    }
  }
  const groups: TextGlyphGroup[] = []
  for (const [atlas, bucket] of buckets) {
    groups.push({
      atlas,
      glyphData: new Float32Array(bucket.instances),
      glyphCount: bucket.instances.length / 8,
    })
  }
  return { groups, missing, width, height, boxAspect: width / height }
}

/** Reject invalid metrics before any native text can be hidden. */
export function validateFontAtlas(value: unknown): BmfontAtlas {
  const a = value as BmfontAtlas;
  const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!a || !Array.isArray(a.chars) || !positive(Math.abs(a.info?.size ?? 0)) ||
    !positive(a.common?.scaleW) || !positive(a.common?.scaleH) || !Number.isFinite(a.common?.base) ||
    (a.distanceField?.distanceRange !== undefined && !positive(a.distanceField.distanceRange)))
    throw new Error("Invalid font atlas metrics");
  const ids = new Set<number>();
  for (const g of a.chars) {
    if (!Number.isInteger(g.id) || ids.has(g.id) ||
      ![g.x, g.y, g.width, g.height, g.xoffset ?? 0, g.yoffset ?? 0].every(Number.isFinite) ||
      g.x < 0 || g.y < 0 || g.width < 0 || g.height < 0 ||
      g.x + g.width > a.common.scaleW || g.y + g.height > a.common.scaleH)
      throw new Error("Invalid font atlas glyph bounds");
    ids.add(g.id);
  }
  return a;
}
