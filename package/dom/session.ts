import { orderDomPaint } from "./stacking";
import imageShader from "./image-shader";
import { mediaRasterSize } from "./media-resolution";
import boxShader from "./box-shader";
/** One adapter session over an explicit engine; the existing engine owns rAF. */
import { createEngine, type WebGLEngine, type EngineOptions } from "../src/engine/engine";
import { loadTexture, resolveTextureUvTransform, type TextureLoaderResult } from "../src/loaders/texture-loader";
import { ItemManager } from "../src/primitives/item";
import type { MsdfGlyphsHandle } from "../src/primitives/msdf-glyphs";
import type { FullscreenPlaneShaders } from "../src/primitives/plane";
import type { UniValues } from "../src/engine/uni";
import { RectTracker, Measurements, clipGeometry, type Geometry, type Rect } from "./geometry";
import { createResourceCache } from "./resources";
import { PaintLease, type PaintMode } from "./paint";
import { readStyle, type ImageStyle, type BoxStyle, type TextStyle, type DomKind } from "./style";
import type { BmfontAtlas } from "./text";
import { createDomScan, type DomScan, type DomScanOptions } from "./scan";
export type { DomScan, DomScanOptions } from "./scan";
export type { DomKind } from "./style";

export type DomBindingState = "preparing" | "active" | "fallback" | "disposed";
export type DomReadyResult = { state: "active" | "fallback" | "disposed"; reason?: string };
export type DomError = { element: HTMLElement | null; error: unknown };
export type DomBindingOptions = { shaders?: FullscreenPlaneShaders; uni?: UniValues };
export type DomFontSource = { family: string; weight?: number; json: string; texture: string };
export type DomBinding = {
  readonly element: HTMLElement;
  readonly state: DomBindingState;
  readonly reason: string | undefined;
  readonly ready: Promise<DomReadyResult>;
  setUni(values: Partial<UniValues>): void;
  destroy(): void;
};
export type DomLayerOptions = {
  root?: HTMLElement;
  onError?: (event: DomError) => void;
  repairInterval?: number;
  /** Baked SDF/MSDF atlases for `text()`. Unmatched faces stay native. */
  fonts?: DomFontSource[];
} & ({ canvas: HTMLCanvasElement; engine?: never; backend?: EngineOptions["backend"]; dpr?: EngineOptions["dpr"] }
  | { engine: WebGLEngine; canvas?: never; backend?: never; dpr?: never });
export type DomLayer = {
  readonly engine: WebGLEngine;
  bind(element: HTMLElement, options: DomBindingOptions & { shaders: FullscreenPlaneShaders }): DomBinding;
  media(element: HTMLImageElement, options?: DomBindingOptions): DomBinding;
  /** Solid fill + radii. Hides only background/border paint; children stay. */
  box(element: HTMLElement, options?: DomBindingOptions): DomBinding;
  /** MSDF from real layout ranges. Needs matching `fonts` on the layer. */
  text(element: HTMLElement, options?: DomBindingOptions): DomBinding;
  scan(options?: DomScanOptions): DomScan;
  invalidate(): void;
  trackLayout(): () => void;
  readonly stats: { bindings: number; rectReads: number; active: number };
  destroy(): void;
};

const empty: Geometry = { rect: { left: 0, top: 0, width: 0, height: 0 }, clip: null };
const paintMode: Record<DomKind, PaintMode> = { bind: "opacity", media: "opacity", box: "box", text: "color" };

type LoadedFont = { family: string; weight: number; atlas: BmfontAtlas; texture: TextureLoaderResult; release: () => void };
type CreateMsdfGlyphs = typeof import("../src/primitives/msdf-glyphs").createMsdfGlyphs;

type Entry = {
  el: HTMLElement; kind: DomKind; options: DomBindingOptions; handle: DomBinding;
  tracker: RectTracker; paint: PaintLease; geometry: Geometry; style: ImageStyle;
  box?: BoxStyle; text?: TextStyle; textDirty: boolean; textKey: string;
  item: ItemManager | null; glyphs: MsdfGlyphsHandle[]; texture: TextureLoaderResult | null; releaseTexture: () => void;
  source: string; rasterSize: number; generation: number; loading: boolean; failed: boolean; supported: boolean;
  state: DomBindingState; reason?: string; resolve: (result: DomReadyResult) => void;
  ownStyle: string; order: number; cleanup: () => void;
};

function boxUni(box: BoxStyle, rect: Rect): UniValues {
  return {
    value1: box.fill[0], value2: box.fill[1], value3: box.fill[2], value4: box.fill[3],
    value5: box.radii[0], value6: box.radii[1], value7: box.radii[2], value8: box.radii[3],
    value9: rect.width, value10: rect.height,
  };
}

export async function createDomLayer(options: DomLayerOptions): Promise<DomLayer | null> {
  if (typeof document === "undefined") return null;
  const root = options.root ?? document.body;
  const owned = !options.engine;
  let engine: WebGLEngine;
  try { engine = options.engine ?? await createEngine(options.canvas!, { backend: options.backend, dpr: options.dpr ?? { max: 2 }, clearColor: { a: 0 } }); }
  catch (error) { options.onError?.({ element: null, error }); return null; }
  const canvas = engine.canvas;
  const entries = new Map<HTMLElement, Entry>();
  const textures = createResourceCache((source: string) => loadTexture(source, { engine }));
  const vectorTextures = createResourceCache((key: string) => {
    const [source, svgRasterSize] = JSON.parse(key) as [string, number];
    return loadTexture(source, { engine, svgRasterSize, sampler: { mipmapFilter: "linear" } });
  });
  const fontTextures = createResourceCache((source: string) => loadTexture(source, { engine, data: true }));
  const fontReleases = new Set<() => void>();
  const fonts: LoadedFont[] = [];
  let fontsReady: Promise<void> | null = null;
  let fontsSettled = false;
  let createMsdfGlyphs: CreateMsdfGlyphs | null = null;
  let packDomTextGroups: typeof import("./text").packDomTextGroups;
  let msdfReady: Promise<void> | null = null;
  let msdfFailed = false;
  let destroyed = false, unavailable = false, dirty = true, leases = 0, rectReads = 0, printing = false;
  let canvasRect: Rect = empty.rect;
  const previousPointer = canvas.style.pointerEvents, previousAria = canvas.getAttribute("aria-hidden");
  canvas.style.pointerEvents = "none"; canvas.setAttribute("aria-hidden", "true");
  const report = (entry: Entry, error: unknown) => { options.onError?.({ element: entry.el, error }); };
  const restore = (e: Entry) => { e.paint.restore(); e.ownStyle = e.el.style.cssText; };
  const setState = (e: Entry, state: DomBindingState, reason?: string) => {
    e.state = state; e.reason = reason;
    if (state !== "preparing") e.resolve({ state, reason });
  };
  const clearGlyphs = (e: Entry) => { e.textKey = ""; e.generation++; for (const g of e.glyphs) g.destroy(); e.glyphs = []; };
  const fallback = (e: Entry, reason: string) => {
    restore(e); e.item?.destroy(); e.item = null; clearGlyphs(e); setState(e, "fallback", reason);
  };
  const invalidate = () => {
    if (destroyed || unavailable) return;
    dirty = true; for (const e of entries.values()) e.tracker.invalidate();
    engine.requestFrame();
  };
  const remove = (e: Entry) => {
    if (e.state === "disposed") return;
    e.generation++; e.cleanup(); restore(e); e.item?.destroy(); clearGlyphs(e); e.releaseTexture();
    e.item = null; e.texture = null; entries.delete(e.el); ro.unobserve(e.el);
    setState(e, "disposed"); invalidate();
  };
  const matchFont = (family: string, weight: number) => {
    const name = family.toLowerCase();
    return fonts.find(f => f.family.toLowerCase() === name && f.weight === weight)
      ?? null;
  };
  const loadMsdf = () => {
    if (msdfReady) return msdfReady;
    msdfReady = Promise.all([import("../src/primitives/msdf-glyphs"), import("./text")]).then(([m, text]) => { createMsdfGlyphs = m.createMsdfGlyphs; packDomTextGroups = text.packDomTextGroups; }).catch(error => { msdfFailed = true; options.onError?.({ element: null, error }); });
    return msdfReady;
  };
  const loadFonts = () => {
    if (fontsReady) return fontsReady;
    const sources = options.fonts ?? [];
    if (!sources.length) {
      fontsSettled = true;
      fontsReady = Promise.resolve();
      return fontsReady;
    }
    fontsReady = Promise.all(sources.map(async font => {
      await document.fonts?.ready;
      let release: (() => void) | undefined;
      try {
        const response = await fetch(font.json);
        if (!response.ok) throw new Error(`Font atlas fetch failed (${response.status})`);
        const { validateFontAtlas } = await import("./text");
        const atlas = validateFontAtlas(await response.json());
        if (destroyed || unavailable) return;
        const resource = fontTextures.acquire(font.texture);
        release = resource.release; fontReleases.add(release);
        const texture = await resource.ready;
        if (destroyed || unavailable) { release(); fontReleases.delete(release); return; }
        if (texture.width !== atlas.common.scaleW || texture.height !== atlas.common.scaleH) throw new Error("Font atlas dimensions do not match its texture");
        fonts.push({ family: font.family, weight: font.weight ?? 400, atlas, texture, release: resource.release });
      } catch (error) {
        if (release) { release(); fontReleases.delete(release); }
        if (!destroyed) options.onError?.({ element: null, error });
      }
    })).then(() => undefined).finally(() => { fontsSettled = true; });
    return fontsReady;
  };
  const load = (e: Entry, source: string, rasterSize: number) => {
    e.generation++; const generation = e.generation;
    restore(e); e.item?.destroy(); e.item = null; e.releaseTexture(); e.texture = null;
    e.source = source; e.rasterSize = rasterSize; e.loading = true; e.failed = false; setState(e, "preparing");
    const resource = rasterSize ? vectorTextures.acquire(JSON.stringify([source, rasterSize])) : textures.acquire(source);
    e.releaseTexture = resource.release;
    void resource.ready.then(texture => {
      if (destroyed || unavailable || e.state === "disposed" || e.generation !== generation) { return; }
      e.texture = texture; e.loading = false; invalidate();
    }).catch(error => {
      if (destroyed || e.state === "disposed" || e.generation !== generation) return;
      e.loading = false; e.failed = true; fallback(e, "Image upload failed"); report(e, error); engine.requestFrame();
    });
  };
  const attachText = (e: Entry) => {
    if (e.glyphs.length && !e.textDirty || e.failed || !e.supported || !e.text || printing || unavailable) return;
    if (msdfFailed) { e.failed = true; fallback(e, "Glyph renderer failed to load"); return; }
    if (!fontsSettled || !createMsdfGlyphs) {
      void Promise.all([loadFonts(), loadMsdf()]).then(() => { if (!destroyed) invalidate(); });
      return;
    }
    if (!fonts.length) { fallback(e, "No font atlases"); return; }
    const packed = packDomTextGroups(e.el, (family, weight) => matchFont(family, weight)?.atlas ?? null);
    if (packed.missing) { fallback(e, "Missing glyphs stay native"); return; }
    if (e.el.textContent?.trim() && packed.groups.every(g => g.glyphCount === 0)) {
      fallback(e, "No glyphs to paint"); return;
    }
    // Invalidation can come from scrolling classes or unrelated DOM changes.
    // Keep ready GPU resources when the relative glyph layout/paint is identical.
    const textKey = JSON.stringify([e.text, packed.width, packed.height,
      packed.groups.map(group => [fonts.findIndex(font => font.atlas === group.atlas), ...group.glyphData])]);
    e.textDirty = false;
    if (e.glyphs.length && e.textKey === textKey) return;
    clearGlyphs(e);
    e.textKey = textKey;
    const generation = e.generation;
    const color = e.text.color;
    const drawn = new Set<BmfontAtlas>();
    const expected = packed.groups.filter(g => g.glyphCount > 0).length;
    for (const group of packed.groups) {
      if (!group.glyphCount) continue;
      const loaded = fonts.find(f => f.atlas === group.atlas);
      if (!loaded) continue;
      e.glyphs.push(createMsdfGlyphs(e.el, {
        onDraw: () => {
          if (destroyed || unavailable || printing || e.state === "disposed" || e.generation !== generation) return;
          drawn.add(group.atlas);
          if (drawn.size === expected) { e.paint.hide(); e.ownStyle = e.el.style.cssText; setState(e, "active"); }
        },
        onError: error => { if (e.generation !== generation || destroyed) return; e.failed = true; fallback(e, "Glyph draw failed"); report(e, error); engine.requestFrame(); },
        engine, texture: loaded.texture, glyphData: group.glyphData, glyphCount: group.glyphCount,
        distanceRange: group.atlas.distanceField?.distanceRange ?? 8,
        atlasWidth: group.atlas.common.scaleW, color, alpha: 1, boxAspect: packed.boxAspect,
        layer: 10 + e.order, uni: { value2: packed.width, value4: packed.height },
      }));
    }

  };
  const attach = (e: Entry) => {
    if (e.kind === "text") { attachText(e); return; }
    if (e.item || e.failed || !e.supported || e.kind === "media" && !e.texture || printing || unavailable) return;
    if (e.kind === "box" && !e.box) return;
    const generation = e.generation;
    const shaders = e.kind === "box" ? (e.options.shaders ?? boxShader) : (e.options.shaders ?? imageShader);
    const uni = e.kind === "box" && e.box ? { ...boxUni(e.box, e.geometry.rect), ...e.options.uni } : e.options.uni;
    e.item = new ItemManager(e.el, { ...e.options, uni, layer: 10 + e.order,
      texture: e.texture, shaders }, {
      engine,
      geometry: out => clipGeometry(e.geometry, canvasRect, out),
      uv: e.kind === "media" ? () => {
        const uv = resolveTextureUvTransform(e.texture!.aspect,
          e.geometry.rect.width / Math.max(0.0001, e.geometry.rect.height), e.style.fit);
        uv.offsetX = (1 - uv.scaleX) * e.style.position[0];
        uv.offsetY = (1 - uv.scaleY) * e.style.position[1];
        return uv;
      } : undefined,
      onDraw: () => {
        if (destroyed || unavailable || printing || e.state === "disposed" || e.generation !== generation || !e.item || !e.supported) return;
        if (e.kind === "media" || e.kind === "box") { e.paint.hide(); e.ownStyle = e.el.style.cssText; }
        setState(e, "active");
      },
      onError: error => { e.failed = true; fallback(e, "Shader or draw failed"); report(e, error); engine.requestFrame(); },
    });
  };

  const ro = new ResizeObserver(invalidate); ro.observe(root); ro.observe(canvas);
  const mo = new MutationObserver(records => {
    if (records.some(r => !(r.type === "attributes" && r.attributeName === "style" &&
      (r.target === canvas || entries.get(r.target as HTMLElement)?.ownStyle === (r.target as HTMLElement).style.cssText)))) invalidate();
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "media", "open"] });
  const listeners: Array<() => void> = [];
  const listen = (target: EventTarget, name: string, callback: EventListener, capture = false) => {
    target.addEventListener(name, callback, { capture, passive: true });
    listeners.push(() => target.removeEventListener(name, callback, capture));
  };
  listen(document, "scroll", () => { engine.requestFrame(); }, true);
  for (const event of ["resize", "pageshow"]) listen(window, event, invalidate);
  listen(document, "load", invalidate, true);
  for (const event of ["pointerover", "pointerout", "focusin", "focusout", "transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"])
    listen(document, event, invalidate, true);
  if (document.fonts) listen(document.fonts, "loadingdone", invalidate);
  if (window.visualViewport) { listen(window.visualViewport, "resize", invalidate); listen(window.visualViewport, "scroll", invalidate); }
  const lose = () => {
    if (destroyed || unavailable) return;
    unavailable = true; canvas.style.visibility = "hidden";
    for (const e of entries.values()) { e.generation++; fallback(e, "Renderer unavailable; remount to retry"); e.releaseTexture(); e.texture = null; }
  };
  listen(canvas, "webglcontextlost", lose); listen(canvas, "shooosh:unavailable", lose);
  listen(window, "beforeprint", () => { printing = true; for (const e of entries.values()) fallback(e, "Printing native content"); canvas.style.visibility = "hidden"; });
  listen(window, "afterprint", () => { printing = false; canvas.style.visibility = previousVisibility; invalidate(); });
  const previousVisibility = canvas.style.visibility;
  const interval = options.repairInterval ?? 500;
  const sameRect = (a: Rect | null, b: Rect | null) => a === b || !!a && !!b &&
    a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
  const repair = () => {
    if (document.hidden || destroyed || unavailable || printing || dirty || entries.size === 0) return;
    const measurements = new Measurements(), styles = new Map<Element, CSSStyleDeclaration>();
    const scroll = { x: window.scrollX, y: window.scrollY };
    let changed = !sameRect(canvasRect, measurements.rect(canvas));
    const active = [...entries.values()].filter(e => e.state === "active" && e.kind !== "bind");
    for (const e of active) restore(e);
    try {
      const ordered = orderDomPaint([...entries.values()], styles);
      for (const [index, e] of ordered.entries()) {
        if (!e.el.isConnected || !root.contains(e.el)) { changed = true; break; }
        if (e.order !== index) changed = true;
        const tracker = new RectTracker(e.el);
        const result = readStyle(e.el, tracker, e.kind, styles);
        const fragment = e.options.shaders?.fragment ?? e.options.shaders?.wgsl;
        if (fragment && /^\s*#version/.test(fragment)) result.reason = "DOM adapter shaders must be authored in WGSL";
        const geometry = tracker.read(scroll, measurements);
        if (tracker.pinned !== e.tracker.pinned || tracker.clippers.length !== e.tracker.clippers.length ||
          tracker.clippers.some((el, i) => el !== e.tracker.clippers[i]) ||
          e.supported !== !result.reason || result.image.fit !== e.style.fit ||
          result.image.position.some((value, i) => value !== e.style.position[i]) ||
          JSON.stringify(result.box) !== JSON.stringify(e.box) || JSON.stringify(result.text) !== JSON.stringify(e.text) ||
          !sameRect(e.geometry.rect, geometry.rect) || !sameRect(e.geometry.clip, geometry.clip) ||
          e.kind === "media" && ((e.el as HTMLImageElement).currentSrc || (e.el as HTMLImageElement).src) !== e.source) changed = true;
      }
    } finally {
      for (const e of active) { e.paint.hide(); e.ownStyle = e.el.style.cssText; }
    }
    if (changed) invalidate();
  };
  const timer = interval > 0 ? window.setInterval(repair, Math.max(100, interval)) : 0;
  const unsubscribe = engine.onRender(() => {
    if (destroyed || unavailable || printing) return;
    const moving = leases > 0 || document.getAnimations().some(a => a.playState === "running" &&
      a.effect instanceof KeyframeEffect && a.effect.target instanceof Element &&
      [...entries.keys()].some(el => a.effect instanceof KeyframeEffect && a.effect.target instanceof Element && a.effect.target.contains(el)));
    const restyle = dirty || moving; dirty = false;
    const styles = new Map<Element, CSSStyleDeclaration>();
    const current = [...entries.values()];
    if (restyle) for (const e of current) restore(e);
    const ordered = restyle ? orderDomPaint(current, styles) : current.sort((a, b) => a.order - b.order);
    const measurements = new Measurements();
    canvasRect = measurements.rect(canvas);
    const scroll = { x: window.scrollX, y: window.scrollY };
    const actions: Array<() => void> = [];
    ordered.forEach((e, index) => {
      if (!e.el.isConnected || !root.contains(e.el)) { actions.push(() => remove(e)); return; }
      if (restyle) {
        const result = readStyle(e.el, e.tracker, e.kind, styles);
        const fragment = e.options.shaders?.fragment ?? e.options.shaders?.wgsl;
        if (fragment && /^\s*#version/.test(fragment)) result.reason = "DOM adapter shaders must be authored in WGSL";
        const boxChanged = JSON.stringify(e.box) !== JSON.stringify(result.box);
        e.style = result.image; e.box = result.box; e.text = result.text; e.supported = !result.reason;
        if (result.reason) actions.push(() => fallback(e, result.reason!));
        e.tracker.invalidate();
        if (e.kind === "text") e.textDirty = true;
        if (e.kind === "box" && boxChanged) actions.push(() => { e.item?.destroy(); e.item = null; });
      }
      e.geometry = e.tracker.read(scroll, measurements, moving);
      if (e.order !== index) { e.order = index; actions.push(() => { e.item?.destroy(); e.item = null; clearGlyphs(e); }); }
      if (e.kind === "box" && e.box && e.item) e.item.setUni(boxUni(e.box, e.geometry.rect));
      if (e.kind === "media") {
        const img = e.el as HTMLImageElement;
        const source = img.currentSrc || img.src;
        const rasterSize = mediaRasterSize(source, e.geometry.rect.width, e.geometry.rect.height,
          canvas.width / Math.max(canvasRect.width, 1));
        if (e.supported && (source !== e.source || rasterSize !== e.rasterSize)) actions.push(() => load(e, source, rasterSize));
        if (!source) actions.push(() => fallback(e, "Image has no source"));
      }
      actions.push(() => attach(e));
    });
    rectReads = measurements.reads;
    for (const action of actions) action();
    if (moving) engine.requestFrame();
  }, { layer: -Number.MAX_VALUE });

  function register(el: HTMLElement, bindingOptions: DomBindingOptions, kind: DomKind): DomBinding {
    if (destroyed) throw new Error("DOM layer is destroyed");
    if (!root.contains(el)) throw new Error("DOM binding must be inside the layer root");
    if (entries.has(el)) return entries.get(el)!.handle;
    if (kind === "media" && !(el instanceof HTMLImageElement)) throw new Error("media() currently supports HTMLImageElement only");
    let resolve!: Entry["resolve"];
    const ready = new Promise<DomReadyResult>(done => { resolve = done; });
    const e: Entry = { el, kind, options: { ...bindingOptions, uni: { ...bindingOptions.uni } },
      handle: null!, tracker: new RectTracker(el), paint: new PaintLease(el, paintMode[kind]), geometry: empty,
      style: { fit: "stretch", position: [0.5, 0.5] }, item: null, glyphs: [], texture: null, releaseTexture: () => {},
      textDirty: true, textKey: "", source: "", rasterSize: 0, generation: 0, loading: false, failed: false, supported: false,
      state: "preparing", resolve, ownStyle: el.style.cssText, order: -1, cleanup: () => {} };
    const onError = () => { e.generation++; e.failed = true; fallback(e, "Native image failed to load"); };
    if (kind === "media") { el.addEventListener("error", onError); e.cleanup = () => el.removeEventListener("error", onError); }
    e.handle = { element: el, get state() { return e.state; }, get reason() { return e.reason; }, ready,
      setUni(values) { if (e.state === "disposed") return; Object.assign(e.options.uni!, values); e.item?.setUni(values); engine.requestFrame(); },
      destroy() { remove(e); } };
    entries.set(el, e); ro.observe(el);
    if (kind === "text") void Promise.all([loadFonts(), loadMsdf()]).then(() => { if (!destroyed && e.state !== "disposed") invalidate(); });
    if (unavailable) fallback(e, "Renderer unavailable; remount to retry"); else invalidate();
    return e.handle;
  }
  if (owned) engine.start();
  let scanner: DomScan | null = null;
  const bind = (element: HTMLElement, bindingOptions: DomBindingOptions & { shaders: FullscreenPlaneShaders }) =>
    register(element, bindingOptions, "bind");
  const media = (element: HTMLImageElement, bindingOptions: DomBindingOptions = {}) =>
    register(element, bindingOptions, "media");
  const box = (element: HTMLElement, bindingOptions: DomBindingOptions = {}) =>
    register(element, bindingOptions, "box");
  const text = (element: HTMLElement, bindingOptions: DomBindingOptions = {}) =>
    register(element, bindingOptions, "text");
  return {
    engine, bind, media, box, text,
    scan(scanOptions = {}) {
      scanner?.destroy();
      scanner = createDomScan(root, { bind, media, box, text }, scanOptions, options.onError);
      return scanner;
    },
    invalidate,
    trackLayout() { leases++; invalidate(); let released = false; return () => { if (!released) { released = true; leases--; invalidate(); } }; },
    get stats() { return { bindings: entries.size, rectReads, active: [...entries.values()].filter(e => e.state === "active").length }; },
    destroy() {
      if (destroyed) return; destroyed = true;
      scanner?.destroy(); scanner = null;
      unsubscribe(); ro.disconnect(); mo.disconnect(); clearInterval(timer); listeners.forEach(off => off());
      for (const e of [...entries.values()]) remove(e);
      for (const release of fontReleases) release();
      fontReleases.clear(); fonts.length = 0;
      if (canvas.style.pointerEvents === "none") canvas.style.pointerEvents = previousPointer;
      if (canvas.getAttribute("aria-hidden") === "true") {
        if (previousAria === null) canvas.removeAttribute("aria-hidden"); else canvas.setAttribute("aria-hidden", previousAria);
      }
      if ((printing || unavailable) && canvas.style.visibility === "hidden") canvas.style.visibility = previousVisibility;
      if (owned) engine.destroy({ retainContext: true });
      else engine.requestFrame();
    },
  };
}
