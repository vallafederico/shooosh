/** Conservative CSS contract. Unsupported paint stays native. */
import type { RectTracker } from "./geometry"
import type { TextureFitMode } from "../src/loaders/texture-loader"
import { parseCssColor } from "./color"

export type DomKind = "bind" | "media" | "box" | "text"
export type ImageStyle = { fit: TextureFitMode; position: [number, number] }
export type BoxStyle = {
  fill: [number, number, number, number]
  radii: [number, number, number, number]
}
export type TextStyle = { family: string; weight: number; color: [number, number, number] }
export type StyleResult = { reason?: string; image: ImageStyle; box?: BoxStyle; text?: TextStyle }

const zero = (value: string) => value.split(/\s+/).every(v => parseFloat(v) === 0)

function radiusPx(value: string) {
  return Math.max(0, parseFloat(value) || 0)
}

function fontWeight(value: string) {
  if (value === "bold" || value === "bolder") return 700
  if (value === "normal" || value === "lighter") return 400
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : 400
}

export function readStyle(element: HTMLElement, tracker: RectTracker, kind: DomKind,
  cache: Map<Element, CSSStyleDeclaration>): StyleResult {
  const get = (el: Element) => { let s = cache.get(el); if (!s) { s = getComputedStyle(el); cache.set(el, s); } return s; }
  const own = get(element)
  const image: ImageStyle = { fit: "stretch", position: [0.5, 0.5] }
  tracker.clippers = []; tracker.pinned = false
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    const s = get(el)
    if (s.display === "none" || s.visibility !== "visible" || s.contentVisibility === "hidden") return { reason: "Element or ancestor is hidden", image }
    if (s.zoom && s.zoom !== "1" && s.zoom !== "normal" || s.transform !== "none" || s.rotate && s.rotate !== "none" || s.scale && s.scale !== "none" || s.translate && s.translate !== "none" || s.perspective !== "none")
      return { reason: "CSS transforms are not supported in this first release", image }
    if (Number(s.opacity) !== 1 || s.filter !== "none" || s.mixBlendMode !== "normal" || s.clipPath !== "none" || s.maskImage && s.maskImage !== "none" || s.backdropFilter && s.backdropFilter !== "none")
      return { reason: "Opacity, filters, masks and blending require native paint", image }
    if (s.position === "fixed" || s.position === "sticky") tracker.pinned = true
    if (el !== element && (s.overflowX !== "visible" || s.overflowY !== "visible")) {
      if (s.overflowX === "visible" || s.overflowY === "visible") return { reason: "Single-axis clipping is not supported", image }
      if (![s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].every(zero)
        && kind !== "box")
        return { reason: "Rounded ancestor clips are not supported", image }
      tracker.clippers.push(el)
    }
  }
  if (kind === "media") {
    if (element.matches(":focus-visible")) return { reason: "Focused images retain native focus paint", image }
    if (own.transitionDuration.split(",").some(v => parseFloat(v) > 0) && own.transitionProperty.split(",").some(v => ["all", "opacity"].includes(v.trim())))
      return { reason: "Native opacity transitions are not supported for image takeover", image }
    if (![own.borderTopWidth, own.borderRightWidth, own.borderBottomWidth, own.borderLeftWidth,
      own.paddingTop, own.paddingRight, own.paddingBottom, own.paddingLeft,
      own.borderTopLeftRadius, own.borderTopRightRadius, own.borderBottomLeftRadius, own.borderBottomRightRadius].every(zero)
      || own.boxShadow !== "none" || own.backgroundImage !== "none" || !["rgba(0, 0, 0, 0)", "transparent"].includes(own.backgroundColor))
      return { reason: "Image borders, padding, backgrounds, shadows and radii remain native", image }
    if (!["fill", "contain", "cover"].includes(own.objectFit)) return { reason: "Only fill, contain and cover are supported", image }
    const parts = own.objectPosition.trim().split(/\s+/)
    if (parts.length !== 2 || parts.some(p => !/^-?(?:\d*\.)?\d+%$/.test(p))) return { reason: "object-position must resolve to two percentages", image }
    image.fit = own.objectFit === "fill" ? "stretch" : own.objectFit as TextureFitMode
    image.position = parts.map(p => parseFloat(p) / 100) as [number, number]
  }
  if (kind === "box") {
    if (own.backgroundImage !== "none") return { reason: "Background images and gradients remain native", image }
    if (own.boxShadow !== "none") return { reason: "Box shadows remain native", image }
    const widths = [own.borderTopWidth, own.borderRightWidth, own.borderBottomWidth, own.borderLeftWidth]
    if (!widths.every(zero)) return { reason: "Borders remain native until the uniform-border subset", image }
    const fill = parseCssColor(own.backgroundColor)
    if (!fill || fill[3] === 0) return { reason: "Transparent boxes stay native", image }
    return {
      image,
      box: {
        fill,
        radii: [
          radiusPx(own.borderTopLeftRadius),
          radiusPx(own.borderTopRightRadius),
          radiusPx(own.borderBottomRightRadius),
          radiusPx(own.borderBottomLeftRadius),
        ],
      },
    }
  }
  if (kind === "text") {
    const color = parseCssColor(own.color)
    if (!color || color[3] !== 1) return { reason: "Translucent text stays native", image }
    if (tracker.clippers.length) return { reason: "Clipped text stays native", image }
    if (own.fontStyle !== "normal" || own.textTransform !== "none" || own.direction !== "ltr") return { reason: "Styled or bidirectional text stays native", image }
    const family = own.fontFamily.split(",")[0]?.replace(/['"]/g, "").trim() ?? ""
    if (!family) return { reason: "Text needs a font family", image }
    if (own.textShadow !== "none") return { reason: "Text shadows remain native", image }
    if (own.writingMode && own.writingMode !== "horizontal-tb") return { reason: "Vertical text stays native", image }
    return { image, text: { family, weight: fontWeight(own.fontWeight), color: [color[0], color[1], color[2]] } }
  }
  return { image }
}
