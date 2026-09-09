import { test, expect } from "bun:test"
import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
  symlink,
  readdir,
  truncate,
} from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import {
  openModel,
  inspectModel,
  editModel,
  generateInterface,
  convertTexture,
  inspectTexture,
  checkTexture,
} from "../dist/node.js"
import { inspectKtx2 } from "../dist/texture-tools.js"
import { inspectJson } from "../dist/manifest.js"
import { makeFixture } from "./fixture"
import sharp from "sharp"
const moduleUrl = new URL("../dist/node.js", import.meta.url).href

test("glTF external resources reject traversal, URL schemes and escaping symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-boundary-"))
  try {
    const assets = join(dir, "assets")
    await import("node:fs/promises").then((fs) => fs.mkdir(assets))
    const outside = join(dir, "private.png")
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
      .png()
      .toFile(outside)
    await symlink(outside, join(assets, "linked.png"))
    for (const uri of [
      "../private.png",
      "%2e%2e/private.png",
      "..\\private.png",
      outside,
      "linked.png",
      "https://example.invalid/private.png",
      "file:///private.png",
      "%00.png",
    ]) {
      const input = join(assets, "model.gltf")
      await writeFile(
        input,
        JSON.stringify({
          asset: { version: "2.0" },
          images: [{ uri }],
          textures: [{ source: 0 }],
          materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        }),
      )
      await expect(openModel(input)).rejects.toThrow()
    }
    expect(await readFile(outside)).toEqual(await readFile(join(assets, "linked.png")))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("unsupported required extension and cycles rejected before decoder IO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-structure-"))
  try {
    for (const json of [
      { asset: { version: "2.0" }, extensionsRequired: ["UNKNOWN_critical"] },
      { asset: { version: "2.0" }, nodes: [{ children: [0] }] },
    ]) {
      const input = join(dir, "input.gltf")
      await writeFile(input, JSON.stringify(json))
      await expect(openModel(input)).rejects.toThrow()
    }
    const huge = join(dir, "sparse.gltf")
    await writeFile(
      huge,
      JSON.stringify({
        asset: { version: "2.0" },
        accessors: [
          {
            count: 1_000_000_000,
            type: "VEC3",
            componentType: 5126,
            sparse: { count: 1 },
          },
        ],
      }),
    )
    await expect(openModel(huge)).rejects.toThrow("budget exceeded")
    const input = join(dir, "large.gltf")
    await writeFile(input, "")
    await truncate(input, 64 * 1024 * 1024 + 1)
    await expect(inspectModel(input)).rejects.toThrow("Oversized")
    const nodes = Array.from({ length: 20000 }, (_, i) =>
      i < 19999 ? { children: [i + 1] } : {},
    )
    expect(inspectJson({ asset: { version: "2.0" }, nodes }).stats.nodes).toBe(20000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("output collision, malicious names and invalid edits cannot overwrite source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-output-"))
  try {
    const input = join(dir, "input.glb")
    await makeFixture(input)
    const original = await readFile(input)
    await expect(
      editModel(input, input, { nodes: [{ id: 0, name: "overwritten" }] }),
    ).rejects.toThrow()
    const output = join(dir, "edit.glb")
    const results = await Promise.allSettled([
      editModel(input, output, { nodes: [{ id: 0, name: "a" }] }),
      editModel(input, output, { nodes: [{ id: 0, name: "b" }] }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await readFile(input)).toEqual(original)
    for (const patch of [
      { nodes: [{ id: -1, name: "a" }] },
      { nodes: [{ id: 0, rotation: [0, 0, 0, 0] }] },
      { nodes: [{ id: 0, translation: [NaN, 0, 0] }] },
    ])
      await expect(editModel(input, join(dir, "bad.glb"), patch)).rejects.toThrow()
    const filename = join(dir, "Product`$(touch SHOULD_NOT_EXIST)`.ts")
    await generateInterface(input, filename)
    expect(
      (await readFile(filename, "utf8")).includes("export async function load"),
    ).toBe(true)
    expect((await readdir(dir)).includes("SHOULD_NOT_EXIST")).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("seeded KTX header mutation corpus stays bounded; invalid PNG fails without output", async () => {
  let seed = 12345
  for (let n = 0; n < 512; n++) {
    const bytes = new Uint8Array(80 + (n % 12) * 24)
    for (let i = 0; i < bytes.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      bytes[i] = seed >>> 24
    }
    if (n % 2 === 0) bytes.set([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10])
    expect(() => inspectKtx2(bytes)).toThrow()
  }
  const dir = await mkdtemp(join(tmpdir(), "texture-invalid-"))
  try {
    const source = join(dir, "bad.png")
    await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect((await checkTexture(source)).valid).toBe(false)
    await expect(convertTexture(source, join(dir, "output.webp"))).rejects.toThrow()
    expect(await readdir(dir)).toEqual(["bad.png"])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test.each(["abort", "timeout"])(
  "%s during KTX encoding kills child and removes worker scratch tree",
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), "model-cancel-"))
    try {
      const executable = join(dir, "fake-ktx"),
        pidFile = join(dir, "pid")
      await writeFile(
        executable,
        `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);\n`,
        { mode: 0o755 },
      )
      execFileSync(
        "node",
        [
          "--input-type=module",
          "-e",
          `
   import {convertModel,createModelIO} from ${JSON.stringify(moduleUrl)};
   import {Document} from ${JSON.stringify(new URL("../node_modules/@gltf-transform/core/dist/index.js", import.meta.url).href)};
   import sharp from ${JSON.stringify(new URL("../node_modules/sharp/lib/index.js", import.meta.url).href)};
   import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';import {tmpdir} from 'node:os';
   const doc=new Document();doc.createBuffer();const image=await sharp({create:{width:64,height:64,channels:3,background:'red'}}).png().toBuffer();doc.createMaterial().setBaseColorTexture(doc.createTexture().setMimeType('image/png').setImage(image));
   const io=await createModelIO();await io.write(${JSON.stringify(join(dir, "input.glb"))},doc);
   const before=new Set((await readdir(tmpdir())).filter(p=>p.startsWith('model-conversion-')));
   const abort=new AbortController();const promise=convertModel(${JSON.stringify(join(dir, "input.glb"))},${JSON.stringify(join(dir, "output.glb"))},{textures:{format:'ktx2',ktxPath:${JSON.stringify(executable)}},signal:abort.signal, timeoutMs: ${mode === "timeout" ? "2000" : "120000"}});
   let failure; const rejected=assert.rejects(promise, error => { failure=error; return true });
   let pid;for(let i=0;i<200;i++){try{pid=Number(await readFile(${JSON.stringify(pidFile)},'utf8'));break}catch{}await new Promise(r=>setTimeout(r,20))}
   assert.ok(pid,'encoder started: '+failure);if (${JSON.stringify(mode)} === 'abort') abort.abort();await rejected;
   await new Promise(r=>setTimeout(r,50));assert.throws(()=>process.kill(pid,0));
   const after=(await readdir(tmpdir())).filter(p=>p.startsWith('model-conversion-')&&!before.has(p));assert.deepEqual(after,[]);
  `,
        ],
        { timeout: 15000, encoding: "utf8" },
      )
      expect((await readdir(dir)).includes("output.glb")).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  20000,
)
