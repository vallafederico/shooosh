import { test, expect } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { makeFixture } from "./fixture"
import { serveModel } from "../dist/server.js"
const cli = resolve(import.meta.dir, "../dist/cli.js")
test("built CLI works under Node: inspect, check, edit, compress and generate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-cli-"))
  try {
    const input = join(dir, "source.glb")
    await makeFixture(input)
    const run = (...args: string[]) =>
      execFileSync("node", [cli, ...args], { encoding: "utf8" })
    expect(JSON.parse(run("inspect", input)).stats.nodes).toBe(5)
    expect(JSON.parse(run("check", input)).issues.numErrors).toBe(0)
    await writeFile(
      join(dir, "edit.json"),
      JSON.stringify({ nodes: [{ id: 3, name: "Display" }] }),
    )
    run(
      "edit",
      input,
      "--patch",
      join(dir, "edit.json"),
      "--out",
      join(dir, "edited.glb"),
    )
    expect(JSON.parse(run("inspect", join(dir, "edited.glb"))).nodes[3].name).toBe(
      "Display",
    )
    const sizes = JSON.parse(run("compress", input, "--out", join(dir, "compact.glb")))
    expect(sizes.outputBytes).toBeGreaterThan(0)
    run("generate", input, "--out", join(dir, "Product.ts"))
    expect(await readFile(join(dir, "Product.ts"), "utf8")).toContain("Head__3")
    expect(spawnSync("node", [cli, "inspect", input, "--bad"]).status).toBe(1)
    const existing = await readFile(input)
    expect(spawnSync("node", [cli, "compress", input, "--out", input]).status).toBe(1)
    expect(await readFile(input)).toEqual(existing)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test("workbench server serves only the selected prepared asset and rejects arbitrary routes/hosts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-server-"))
  let server: Awaited<ReturnType<typeof serveModel>> | undefined
  try {
    const input = join(dir, "fixture.glb")
    await makeFixture(input)
    server = await serveModel(input)
    const page = await fetch(server.url)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    )
    expect((await fetch(new URL("model.json", server.url))).status).toBe(200)
    expect((await fetch(new URL("model.bin", server.url))).status).toBe(200)
    expect((await fetch(new URL("viewer.js", server.url))).status).toBe(200)
    expect((await fetch(new URL("../fixture.glb", server.url))).status).toBe(404)
    expect((await fetch(server.url, { method: "POST", body: "{}" })).status).toBe(404)
    expect(
      (await fetch(server.url, { headers: { Host: "attacker.invalid" } })).status,
    ).toBe(404)
  } finally {
    await server?.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("generated interface type-checks and its browser bundle excludes Node processing", async () => {
  const dir = await mkdtemp(join(import.meta.dir, "generated-"))
  try {
    const input = join(dir, "source.glb")
    await makeFixture(input)
    execFileSync("node", [cli, "generate", input, "--out", join(dir, "Product.ts")])
    await writeFile(
      join(dir, "usage.ts"),
      `import { load } from './Product.js';\nexport async function mount(canvas: HTMLCanvasElement){\nconst model=await load(canvas,'/Product.model.json');\nmodel.nodes.Head__3.setTransform({rotation:[0,1,0]});\n// @ts-expect-error nonexistent part must not type-check\nmodel.nodes.DoesNotExist.setVisible(false);\nmodel.destroy();\n}\n`,
    )
    execFileSync(resolve(import.meta.dir, "../node_modules/.bin/tsc"), [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      join(dir, "usage.ts"),
    ])
    const { build } = await import("esbuild")
    const result = await build({
      entryPoints: [join(dir, "usage.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    })
    expect(
      Object.keys(result.metafile!.inputs).some((path) =>
        /texture2ddecoder|sharp|assimp|three|gltf-transform|draco|meshopt|compiler/.test(path),
      ),
    ).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
