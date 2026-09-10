/** Real backend checks: open /dom-regressions.html?backend=webgpu or webgl2. */
import { getGpuPostFrame } from "../../package/src/engine/gpu-api";
import { getGpuInternals } from "../../package/src/engine/gpu-internals";
import { loadTexture } from "../../package/src/loaders/texture-loader";
import { createEngine } from "../../package/index";
import { createDomLayer } from "../../package/dom";
const output = document.querySelector("#results")!;
const root = document.querySelector<HTMLElement>("#fixture")!;
const results: string[] = [];
const assert = (condition: unknown, label: string) => {
  if (!condition) throw new Error(label);
  results.push(`PASS ${label}`); output.textContent = results.join("\n");
};
const timeout = <T>(promise: Promise<T>) => Promise.race([promise, new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error("Binding readiness timed out")), 8000);
})]);
async function run() {
  const backend = new URLSearchParams(location.search).get("backend") === "webgl2" ? "webgl2" : "webgpu";
  const engine = await createEngine(document.querySelector("canvas")!, { backend, clearColor: { r: 1, g: 1, b: 1, a: 0 } });
  engine.start();
  const raster = document.createElement("canvas"); raster.width = raster.height = 32;
  raster.getContext("2d")!.fillRect(0, 0, 32, 32);
  const atlas = { info: { size: 32 }, common: { scaleW: 32, scaleH: 32, base: 28 },
    chars: [{ id: 65, x: 0, y: 0, width: 32, height: 32 }] };
  const json = (value: unknown) => `data:application/json,${encodeURIComponent(JSON.stringify(value))}`;
  const font = { family: "Arial", weight: 400, json: json(atlas), texture: raster.toDataURL() };
  try {
    for (const flipY of [false, true]) {
      const texture = await loadTexture("/regressions/distance-alpha.png", { engine, data: true, flipY, usage: 1 | 2 | 4 | 16 });
      let pixel: Uint8Array;
      if (engine.gl) {
        const gl = engine.gl, previous = gl.getParameter(gl.FRAMEBUFFER_BINDING), fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.texture.texture as WebGLTexture, 0);
        pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous); gl.deleteFramebuffer(fb);
      } else {
        // Readback is harness-only; no GPU-specific API is added to the library.
        const device = getGpuInternals(engine)!.device as any;
        const buffer = device.createBuffer({ size: 256, usage: 1 | 8 });
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture: texture.texture.texture }, { buffer, bytesPerRow: 256 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
        device.queue.submit([encoder.finish()]); await buffer.mapAsync(1);
        pixel = new Uint8Array(buffer.getMappedRange()).slice(0, 4); buffer.unmap(); buffer.destroy();
      }
      texture.destroy();
      assert(flipY ? pixel[0] === 255 && pixel[1] === 0 : Math.abs(pixel[0]! - 128) <= 1 && Math.abs(pixel[3]! - 128) <= 1,
        flipY ? "texture flip is applied exactly once" : "distance RGB survives alpha without premultiplication");
    }
    const vector = await loadTexture('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"><path fill="black" d="M0 0h10v5H0z"/></svg>'), { engine, svgRasterSize: 128 });
    assert(vector.width === 128 && vector.height === 64, "SVG rasterization uses requested resolution and preserves aspect"); vector.destroy();
    const text = document.createElement("p"); text.textContent = "A"; text.style.position = "fixed"; text.style.top = "180px"; root.append(text);
    let dom = (await createDomLayer({ engine, root, fonts: [font] }))!;
    const binding = dom.text(text);
    assert(text.style.color !== "transparent", "native text remains visible while preparing");
    assert((await timeout(binding.ready)).state === "active", `${backend} explicit engine draws glyphs`);
    assert(text.style.color === "transparent", "native paint hides after draw");
    for (const resizeText of [false, true]) {
      let nativeFrames = 0;
      await timeout(new Promise<void>(resolve => {
        let frames = 0;
        const off = engine.onRender(frame => {
          frame.onSubmitted?.(() => {
            if (text.style.color !== "transparent") nativeFrames++;
            if (++frames === 12) { off(); resolve(); return; }
            document.documentElement.classList.toggle("scrolling-test");
            if (resizeText) {
              text.style.width = `${80 + frames * 3}px`;
              text.style.height = `${40 + frames}px`;
            }
            dom.invalidate();
          });
        }, { layer: Number.MAX_VALUE });
        dom.invalidate();
      }));
      assert(nativeFrames === 0, resizeText
        ? "text remains GPU-painted through repeated changed layout bounds"
        : "fixed text stays GPU-painted through repeated layout invalidation");
    }
    text.textContent = "B"; // not in the fixture atlas: a real content change
    await timeout(new Promise<void>(resolve => {
      const off = engine.onRender(() => {
        if (binding.state === "fallback") { off(); resolve(); }
      }, { layer: Number.MAX_VALUE });
      dom.invalidate();
    }));
    assert(text.style.color === "", "real content changes still invalidate glyphs and restore missing-glyph fallback");
    dom.destroy();
    text.textContent = "A";
    assert(text.style.color === "", "destroy restores native text styles");

    text.style.fontWeight = "700";
    dom = (await createDomLayer({ engine, root, fonts: [font] }))!;
    assert((await timeout(dom.text(text).ready)).state === "fallback", "unmatched bold face stays native");
    assert(text.style.color === "", "fallback preserves native paint"); dom.destroy();
    text.style.fontWeight = "400";

    let errors = 0;
    dom = (await createDomLayer({ engine, root, fonts: [{ ...font, json: json({}) }], onError: () => errors++ }))!;
    assert((await timeout(dom.text(text).ready)).state === "fallback" && errors === 1, "invalid atlas reports error and falls back");
    dom.destroy();

    dom = (await createDomLayer({ engine, root, fonts: [font] }))!;
    const pending = dom.text(text); dom.destroy();
    assert((await timeout(pending.ready)).state === "disposed", "destroy settles pending bindings");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(text.style.color === "", "late font completion cannot hide disposed text");
    const front = document.createElement("div"), back = document.createElement("div");
    front.style.cssText = "position:fixed;z-index:10";
    back.style.cssText = "position:fixed;z-index:1";
    const red = document.createElement("div"), blue = document.createElement("div");
    const bounds = "position:fixed;left:350px;top:200px;width:80px;height:80px;";
    red.style.cssText = bounds + "background:rgb(255,0,0)";
    blue.style.cssText = bounds + "background:rgb(0,0,255);z-index:999";
    front.append(red); back.append(blue); root.append(front, back);
    dom = (await createDomLayer({ engine, root }))!;
    await timeout(Promise.all([dom.box(red).ready, dom.box(blue).ready]));
    const readOverlap = () => timeout(new Promise<Uint8Array>(resolve => {
      const off = engine.onPostRender(frame => {
        off();
        const x = Math.round(370 * frame.canvas.width / frame.canvas.clientWidth);
        const y = Math.round(220 * frame.canvas.height / frame.canvas.clientHeight);
        if (frame.inputTexture.backend === "webgl2") {
          const gl = frame.gl!, previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          gl.bindFramebuffer(gl.FRAMEBUFFER, frame.inputTexture.framebuffer);
          const pixels = new Uint8Array(4);
          if (gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) === gl.UNSIGNED_BYTE) {
            gl.readPixels(x, frame.canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          } else {
            const floats = new Float32Array(4);
            gl.readPixels(x, frame.canvas.height - y - 1, 1, 1, gl.RGBA, gl.FLOAT, floats);
            pixels.set(floats.map(value => Math.round(value * 255)));
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, previous); resolve(pixels);
        } else {
          const gpu = getGpuPostFrame()!, device = gpu.device as any;
          const buffer = device.createBuffer({ size: 256, usage: 1 | 8 });
          (gpu.encoder as any).copyTextureToBuffer({ texture: frame.inputTexture.texture, origin: { x, y } },
            { buffer, bytesPerRow: 256 }, { width: 1, height: 1 });
          const bgra = frame.inputTexture.format.startsWith("bgra");
          queueMicrotask(async () => {
            await buffer.mapAsync(1);
            const pixels = new Uint8Array(buffer.getMappedRange()).slice(0, 4);
            buffer.unmap(); buffer.destroy();
            if (bgra) [pixels[0], pixels[2]] = [pixels[2]!, pixels[0]!];
            resolve(pixels);
          });
        }
      });
      engine.requestFrame();
    }));
    let pixel = await readOverlap();
    assert(pixel[0] === 255 && pixel[2] === 0, "ancestor z-10 paints above later DOM and nested z-999 in a lower context");
    front.style.zIndex = "0"; dom.invalidate();
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    pixel = await readOverlap();
    assert(pixel[0] === 0 && pixel[2] === 255, "z-index changes reorder GPU draws");
    dom.destroy(); front.remove(); back.remove();
    output.textContent += "\nAll checks passed.";
  } finally { engine.destroy(); }
}
void run().catch(error => { output.textContent += `\nFAIL ${error.message}`; console.error(error); });
