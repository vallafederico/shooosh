import { compileShader } from "shooosh/compiler"
import { createDomLayer, type DomLayer, type DomBinding } from "../../package/dom";
import { createEngine, getDefaultEngine, initEngine } from "../../package/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("stage"), root = $("root"), photo = $<HTMLImageElement>("photo");
function poster(alternate = false) {
  const c = document.createElement("canvas"); c.width = 900; c.height = 600;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = alternate ? "#633469" : "#193b40"; ctx.fillRect(0,0,900,600);
  ctx.fillStyle = "#ef927c"; ctx.beginPath(); ctx.arc(260,300,200,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#c7ff75"; ctx.fillRect(500,100,170,400);
  return c.toDataURL();
}
const original = poster(), alternate = poster(true);
for (const img of root.querySelectorAll("img")) img.src = original;
$("contain").style.objectFit = "contain"; $("contain").style.objectPosition = "25% 75%";
let dom: DomLayer | null = null, bindings: DomBinding[] = [], shown = true;
const requested = new URLSearchParams(location.search).get("backend");
const shader = `fn fsMain() -> vec4f { return vec4f(vUv.x * 0.7, 0.2 + vUv.y * 0.5, 0.45, 1.0); }`;
async function mount() {
  if (requested === "none") { status(); return; }
  dom = await createDomLayer({ canvas, root, backend: requested === "webgl2" ? "webgl2" : requested === "webgpu" ? "webgpu" : "auto", repairInterval: 0,
    onError: ({ error }) => console.warn("DOM harness", error) });
  if (dom) {
    bindings = [...root.querySelectorAll("img")].map(img => dom!.media(img));
    bindings.push(dom.bind($("shader"), { shaders: compileShader(shader) }));
    await Promise.all(bindings.slice(0,3).map(b => b.ready));
  }
  status();
}
function status() {
  $("status").textContent = `Backend: ${dom?.engine.backend ?? "native"}\n` + bindings.map(b => `${b.element.id}: ${b.state}${b.reason ? ` — ${b.reason}` : ""}`).join("\n") +
    (dom ? `\nBindings: ${dom.stats.bindings}; last frame rect reads: ${dom.stats.rectReads}` : "");
}
$("refresh").onclick = status;
$("toggle").onclick = async () => {
  shown = !shown;
  if (!shown) { dom?.destroy(); dom = null; canvas.style.visibility = "hidden"; }
  else { canvas.style.visibility = ""; await mount(); }
  $("toggle").textContent = shown ? "Show DOM" : "Show GPU"; status();
};
$("change").onclick = () => { photo.src = photo.src === original ? alternate : original; };
$("round").onclick = () => { photo.style.borderRadius = photo.style.borderRadius ? "" : "24px"; };
$("destroy").onclick = () => { dom?.destroy(); dom = null; canvas.style.visibility = "hidden"; status(); };
$("loss").onclick = () => {
  if (dom?.engine.gl) dom.engine.gl.getExtension("WEBGL_lose_context")?.loseContext();
  else dom?.engine.destroy();
  setTimeout(status,100);
};
const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
async function until(check: () => boolean) {
  const end = performance.now()+8000;
  while (!check()) { if (performance.now()>end) throw new Error("Timed out"); await frame(); }
}
$("checks-button").onclick = async () => {
  const results: string[] = [];
  const check = (condition: boolean, name: string) => { if (!condition) throw new Error(name); results.push(`PASS ${name}`); };
  try {
    if (!dom) throw new Error("Mount GPU adapter first");
    const image = bindings[0]!;
    check(image.state === "active", "image activated after submitted draw");
    check(getComputedStyle(photo).visibility === "visible", "native semantics remain visible");
    $("image-link").focus(); check(document.activeElement === $("image-link"), "native image link receives keyboard focus");
    photo.style.borderRadius = "24px"; await until(() => image.state === "fallback");
    check(photo.style.opacity === "", "unsupported CSS restores native paint");
    photo.style.borderRadius = ""; await until(() => image.state === "active");
    photo.src = alternate; await until(() => image.state === "preparing"); await until(() => image.state === "active");
    check(true, "responsive resource replacement reactivates");
    // A bad shader must leave its own image native while its neighbors stay active.
    const bad = document.createElement("img"); bad.src = original; bad.style.cssText="position:fixed;left:10px;top:10px;width:20px;height:20px"; root.append(bad);
    const badBinding = dom.media(bad, { shaders: { fragment: "fn fsMain() -> vec4f { return definitely_invalid; }" } });
    await until(() => badBinding.state === "fallback");
    check(bad.style.opacity === "" && image.state === "active", "shader failure is local and native remains painted");
    badBinding.destroy(); bad.remove();
    const pending = document.createElement("img"); pending.src = original; root.append(pending);
    const pendingBinding = dom.media(pending); pendingBinding.destroy(); pending.remove();
    await frame(); await frame(); check(pendingBinding.state === "disposed", "pending binding cannot revive after disposal");
    const before = dom.stats.bindings;
    check(dom.media(photo) === image && dom.stats.bindings === before, "duplicate registration is idempotent");
    const marked = document.createElement("img");
    marked.setAttribute("data-sh-media", "");
    marked.src = original;
    marked.style.cssText = "position:fixed;left:10px;top:40px;width:20px;height:20px";
    root.append(marked);
    const scanned = dom.scan({ media: "img[data-sh-media]", bind: false, observe: false });
    await until(() => scanned.bindings.some(b => b.element === marked && b.state === "active"));
    check(scanned.bindings.every(b => b.element.hasAttribute("data-sh-media")), "scan binds only marked images");
    check(image.state === "active", "piecewise bindings survive a media-only scan");
    scanned.destroy(); marked.remove();
    check(marked.style.opacity === "", "scan destroy restores its images");
    // Root scroll requires only the canvas read once geometry is cached.
    // Root scroll requires only the canvas read once geometry is cached.
    dom.invalidate(); await frame(); await frame();
    window.scrollTo(0,30); await frame(); await frame();
    check(dom.stats.rectReads === 1, "ordinary scroll reuses element geometry"); window.scrollTo(0,0);
    $("scroller").scrollIntoView(); await until(() => bindings[3]!.state === "active");
    $("scroller").scrollTop = 80; await frame(); await frame();
    check(bindings[3]!.state === "active", "nested scrolling remains active and clipped");
    window.scrollTo(0,0);
    const defaultBefore = getDefaultEngine();
    check(defaultBefore === null, "adapter did not mutate default engine");
    dom.destroy(); dom = null;
    check(photo.style.opacity === "" && image.state === "disposed", "session disposal restores native image");
    await mount(); check(bindings[0]!.state === "active", "remount works");
    // A different default engine must not capture adapter items or uploads.
    dom!.destroy(); dom = null;
    const otherCanvas = document.createElement("canvas"); otherCanvas.style.cssText = "position:fixed;width:1px;height:1px;left:-10px"; document.body.append(otherCanvas);
    const other = await initEngine(otherCanvas, { backend: requested === "webgl2" ? "webgl2" : "webgpu" });
    await mount();
    check(getDefaultEngine() === other && bindings[0]!.state === "active", "items and textures use explicit engine while another default exists");
    other.destroy(); otherCanvas.remove();
    const unavailableCanvas = document.createElement("canvas");
    unavailableCanvas.getContext = (() => null) as typeof unavailableCanvas.getContext;
    check(await createDomLayer({ canvas: unavailableCanvas, backend: "webgl2" }) === null, "failed backend initialization returns null");
    // A borrowed engine must survive session disposal.
    const borrowedCanvas = document.createElement("canvas"); document.body.append(borrowedCanvas);
    const borrowed = await createEngine(borrowedCanvas, { backend: requested === "webgl2" ? "webgl2" : "webgpu" }); borrowed.start();
    const adapter = await createDomLayer({ engine: borrowed, root, repairInterval: 0 }); adapter!.destroy();
    check(borrowed.isRunning(), "borrowed engine survives adapter destruction"); borrowed.destroy(); borrowedCanvas.remove();
  } catch (error) { results.push(`FAIL ${String(error)}`); }
  $("checks").textContent = results.join("\n"); status();
};
void mount();
