/** One adapter session over an explicit engine; the existing engine owns rAF. */
import { createEngine, type WebGLEngine, type EngineOptions } from "../src/engine/engine";
import { loadTexture, resolveTextureUvTransform, type TextureLoaderResult } from "../src/loaders/texture-loader";
import { ItemManager } from "../src/primitives/item";
import type { FullscreenPlaneShaders } from "../src/primitives/plane";
import type { UniValues } from "../src/engine/uni";
import { RectTracker, Measurements, clipGeometry, type Geometry, type Rect } from "./geometry";
import { createResourceCache } from "./resources";
import { PaintLease } from "./paint";
import { readStyle, type ImageStyle } from "./style";

export type DomBindingState = "preparing" | "active" | "fallback" | "disposed";
export type DomReadyResult = { state: "active" | "fallback" | "disposed"; reason?: string };
export type DomError = { element: HTMLElement | null; error: unknown };
export type DomBindingOptions = { shaders?: FullscreenPlaneShaders; uni?: UniValues };
export type DomBinding = {
  readonly element: HTMLElement;
  readonly state: DomBindingState;
  readonly reason: string | undefined;
  /** First activation/fallback/disposal; offscreen items wait until drawn. */
  readonly ready: Promise<DomReadyResult>;
  setUni(values: Partial<UniValues>): void;
  destroy(): void;
};
export type DomLayerOptions = {
  root?: HTMLElement;
  onError?: (event: DomError) => void;
  /** Optional maintenance scan for changes observers cannot see. 0 disables it. */
  repairInterval?: number;
} & ({ canvas: HTMLCanvasElement; engine?: never; backend?: EngineOptions["backend"]; dpr?: EngineOptions["dpr"] }
  | { engine: WebGLEngine; canvas?: never; backend?: never; dpr?: never });
export type DomLayer = {
  readonly engine: WebGLEngine;
  /** Decorative quad only: leaves all native paint untouched. */
  bind(element: HTMLElement, options: DomBindingOptions & { shaders: FullscreenPlaneShaders }): DomBinding;
  /** Enhances an existing img. Native image stays until a successful submitted draw. */
  media(element: HTMLImageElement, options?: DomBindingOptions): DomBinding;
  invalidate(): void;
  /** Continuous layout/style tracking until the returned release function is called. */
  trackLayout(): () => void;
  readonly stats: { bindings: number; rectReads: number; active: number };
  destroy(): void;
};

const imageFragment = `fn fsMain() -> vec4f {
  let uv = fitUv(vUv);
  let color = textureSample(uTexture, uSampler, uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
  return color;
}`;
const empty: Geometry = { rect: { left: 0, top: 0, width: 0, height: 0 }, clip: null };

type Entry = {
  el: HTMLElement; media: boolean; options: DomBindingOptions; handle: DomBinding;
  tracker: RectTracker; paint: PaintLease; geometry: Geometry; style: ImageStyle;
  item: ItemManager | null; texture: TextureLoaderResult | null; releaseTexture: () => void;
  source: string; generation: number; loading: boolean; failed: boolean; supported: boolean;
  state: DomBindingState; reason?: string; resolve: (result: DomReadyResult) => void;
  ownStyle: string; order: number; cleanup: () => void;
};

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
  const fallback = (e: Entry, reason: string) => {
    restore(e); e.item?.destroy(); e.item = null; setState(e, "fallback", reason);
  };
  const invalidate = () => {
    if (destroyed || unavailable) return;
    dirty = true; for (const e of entries.values()) e.tracker.invalidate();
    engine.requestFrame();
  };
  const remove = (e: Entry) => {
    if (e.state === "disposed") return;
    e.generation++; e.cleanup(); restore(e); e.item?.destroy(); e.releaseTexture();
    e.item = null; e.texture = null; entries.delete(e.el); ro.unobserve(e.el);
    setState(e, "disposed"); invalidate();
  };
  const load = (e: Entry, source: string) => {
    e.generation++; const generation = e.generation;
    restore(e); e.item?.destroy(); e.item = null; e.releaseTexture(); e.texture = null;
    e.source = source; e.loading = true; e.failed = false; setState(e, "preparing");
    // Decode the browser-selected source, including srcset/picture changes.
    const resource = textures.acquire(source); e.releaseTexture = resource.release;
    void resource.ready.then(texture => {
      if (destroyed || unavailable || e.state === "disposed" || e.generation !== generation) { return; }
      e.texture = texture; e.loading = false; invalidate();
    }).catch(error => {
      if (destroyed || e.state === "disposed" || e.generation !== generation) return;
      e.loading = false; e.failed = true; fallback(e, "Image upload failed"); report(e, error); engine.requestFrame();
    });
  };
  const attach = (e: Entry) => {
    if (e.item || e.failed || !e.supported || e.media && !e.texture || printing || unavailable) return;
    const generation = e.generation;
    e.item = new ItemManager(e.el, { ...e.options, layer: 10 + e.order,
      texture: e.texture, shaders: e.options.shaders ?? { fragment: imageFragment } }, {
      engine,
      geometry: out => clipGeometry(e.geometry, canvasRect, out),
      uv: e.media ? () => {
        const uv = resolveTextureUvTransform(e.texture!.aspect,
          e.geometry.rect.width / Math.max(0.0001, e.geometry.rect.height), e.style.fit);
        uv.offsetX = (1 - uv.scaleX) * e.style.position[0];
        uv.offsetY = (1 - uv.scaleY) * e.style.position[1];
        return uv;
      } : undefined,
      onDraw: () => {
        if (destroyed || unavailable || printing || e.state === "disposed" || e.generation !== generation || !e.item || !e.supported) return;
        if (e.media) { e.paint.hide(); e.ownStyle = e.el.style.cssText; }
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
  // Global observation catches an unbound sibling/ancestor moving the bound root.
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "media", "open"] });
  const listeners: Array<() => void> = [];
  const listen = (target: EventTarget, name: string, callback: EventListener, capture = false) => {
    target.addEventListener(name, callback, { capture, passive: true });
    listeners.push(() => target.removeEventListener(name, callback, capture));
  };
  listen(document, "scroll", () => {
    // Geometry samples current root/nested offsets in the render phase. Scroll
    // events only wake the loop; they must not gate cache freshness.
    engine.requestFrame();
  }, true);
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
    // Check native CSS synchronously, restoring owned paint before the task ends.
    // An unchanged maintenance scan must not open another 250ms render burst.
    const active = [...entries.values()].filter(e => e.state === "active" && e.media);
    for (const e of active) restore(e);
    try {
      let previous: HTMLElement | null = null;
      for (const e of [...entries.values()].sort((a, b) => a.order - b.order)) {
        if (!e.el.isConnected || !root.contains(e.el)) { changed = true; break; }
        if (previous && previous.compareDocumentPosition(e.el) & Node.DOCUMENT_POSITION_PRECEDING) changed = true;
        previous = e.el;
        const tracker = new RectTracker(e.el);
        const result = readStyle(e.el, tracker, e.media, styles);
        const fragment = e.options.shaders?.fragment ?? e.options.shaders?.wgsl;
        if (fragment && /^\s*#version/.test(fragment)) result.reason = "DOM adapter shaders must be authored in WGSL";
        const geometry = tracker.read(scroll, measurements);
        if (tracker.pinned !== e.tracker.pinned || tracker.clippers.length !== e.tracker.clippers.length ||
          tracker.clippers.some((el, i) => el !== e.tracker.clippers[i]) ||
          e.supported !== !result.reason || result.image.fit !== e.style.fit ||
          result.image.position.some((value, i) => value !== e.style.position[i]) ||
          !sameRect(e.geometry.rect, geometry.rect) || !sameRect(e.geometry.clip, geometry.clip) ||
          e.media && ((e.el as HTMLImageElement).currentSrc || (e.el as HTMLImageElement).src) !== e.source) changed = true;
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
    const ordered = [...entries.values()].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    // Restore owned paint in one batch before style reads; hide only after submit.
    // Opacity changes paint, never layout, hit testing, or native semantics.
    if (restyle) for (const e of ordered) restore(e);
    const measurements = new Measurements();
    canvasRect = measurements.rect(canvas);
    const styles = new Map<Element, CSSStyleDeclaration>();
    const scroll = { x: window.scrollX, y: window.scrollY };
    const actions: Array<() => void> = [];
    ordered.forEach((e, index) => {
      if (!e.el.isConnected || !root.contains(e.el)) { actions.push(() => remove(e)); return; }
      if (restyle) {
        const result = readStyle(e.el, e.tracker, e.media, styles);
        const fragment = e.options.shaders?.fragment ?? e.options.shaders?.wgsl;
        if (fragment && /^\s*#version/.test(fragment)) result.reason = "DOM adapter shaders must be authored in WGSL";
        e.style = result.image; e.supported = !result.reason;
        if (result.reason) actions.push(() => fallback(e, result.reason!));
        e.tracker.invalidate();
      }
      e.geometry = e.tracker.read(scroll, measurements, moving);
      if (e.order !== index) { e.order = index; actions.push(() => { e.item?.destroy(); e.item = null; }); }
      if (e.media) {
        const img = e.el as HTMLImageElement;
        const source = img.currentSrc || img.src;
        if (e.supported && source !== e.source) actions.push(() => load(e, source));
        if (!source) actions.push(() => fallback(e, "Image has no source"));
      }
      actions.push(() => attach(e));
    });
    rectReads = measurements.reads;
    for (const action of actions) action();
    if (moving) engine.requestFrame();
  }, { layer: -Number.MAX_VALUE });

  function register(el: HTMLElement, bindingOptions: DomBindingOptions, media: boolean): DomBinding {
    if (destroyed) throw new Error("DOM layer is destroyed");
    if (!root.contains(el)) throw new Error("DOM binding must be inside the layer root");
    if (entries.has(el)) return entries.get(el)!.handle;
    if (media && !(el instanceof HTMLImageElement)) throw new Error("media() currently supports HTMLImageElement only");
    let resolve!: Entry["resolve"];
    const ready = new Promise<DomReadyResult>(done => { resolve = done; });
    const e: Entry = { el, media, options: { ...bindingOptions, uni: { ...bindingOptions.uni } },
      handle: null!, tracker: new RectTracker(el), paint: new PaintLease(el), geometry: empty,
      style: { fit: "stretch", position: [0.5, 0.5] }, item: null, texture: null, releaseTexture: () => {},
      source: "", generation: 0, loading: false, failed: false, supported: false,
      state: "preparing", resolve, ownStyle: el.style.cssText, order: -1, cleanup: () => {} };
    const onError = () => { e.generation++; e.failed = true; fallback(e, "Native image failed to load"); };
    if (media) { el.addEventListener("error", onError); e.cleanup = () => el.removeEventListener("error", onError); }
    e.handle = { element: el, get state() { return e.state; }, get reason() { return e.reason; }, ready,
      setUni(values) { if (e.state === "disposed") return; Object.assign(e.options.uni!, values); e.item?.setUni(values); engine.requestFrame(); },
      destroy() { remove(e); } };
    entries.set(el, e); ro.observe(el);
    if (unavailable) fallback(e, "Renderer unavailable; remount to retry"); else invalidate();
    return e.handle;
  }
  if (owned) engine.start();
  return {
    engine,
    bind: (element, bindingOptions) => register(element, bindingOptions, false),
    media: (element, bindingOptions = {}) => register(element, bindingOptions, true),
    invalidate,
    trackLayout() { leases++; invalidate(); let released = false; return () => { if (!released) { released = true; leases--; invalidate(); } }; },
    get stats() { return { bindings: entries.size, rectReads, active: [...entries.values()].filter(e => e.state === "active").length }; },
    destroy() {
      if (destroyed) return; destroyed = true;
      unsubscribe(); ro.disconnect(); mo.disconnect(); clearInterval(timer); listeners.forEach(off => off());
      for (const e of [...entries.values()]) remove(e);
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
