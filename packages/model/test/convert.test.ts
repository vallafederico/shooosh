import { test, expect } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { inspectModel, readMetadata } from "../dist/node.js"
const cli = resolve(import.meta.dir, "../dist/cli.js")
const run = (...args: string[]) =>
  JSON.parse(execFileSync("node", [cli, ...args], { encoding: "utf8" }))

test("binary FBX converts, validates and enters the generated shooosh workflow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-fbx-"))
  try {
    const input = resolve(import.meta.dir, "fixtures/box.fbx")
    const source = await readFile(input)
    const output = join(dir, "box.glb")
    expect(run("convert", input, "--out", output).validation.numErrors).toBe(0)
    expect((await inspectModel(output)).stats.uniqueMeshTriangles).toBeGreaterThan(0)
    run("generate", output, "--out", join(dir, "Box.ts"))
    expect(await readFile(input)).toEqual(source)
    expect(() => run("convert", input, "--out", output)).toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("OBJ packs sidecar material and texture; missing resources fail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-obj-"))
  try {
    const input = join(dir, "triangle.obj")
    await writeFile(
      input,
      "mtllib triangle.mtl\no Panel\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl Red\nf 1/1 2/2 3/3\n",
    )
    await writeFile(join(dir, "triangle.mtl"), "newmtl Red\nKd 1 0 0\nmap_Kd pixel.png\n")
    await writeFile(
      join(dir, "pixel.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=",
        "base64",
      ),
    )
    const output = join(dir, "triangle.glb")
    expect(run("convert", input, "--out", output).validation.numErrors).toBe(0)
    const metadata: any = await readMetadata(output)
    expect(metadata.images[0].bufferView).toBeNumber()
    expect(metadata.images[0].uri).toBeUndefined()
    expect(metadata.materials.some((m: any) => m.name === "Red")).toBe(true)
    await rm(join(dir, "pixel.png"))
    expect(() => run("convert", input, "--out", join(dir, "missing.glb"))).toThrow()
    await rm(join(dir, "triangle.mtl"))
    expect(() => run("convert", input, "--out", join(dir, "missing.glb"))).toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("STL, PLY and OFF import as valid triangle GLBs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-formats-"))
  try {
    const sources = {
      stl: "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle\n",
      ply: "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n",
      off: "OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n",
    }
    for (const [format, text] of Object.entries(sources)) {
      const input = join(dir, `triangle.${format}`)
      await writeFile(input, text)
      expect(
        run("convert", input, "--out", join(dir, `${format}.glb`)).validation.numErrors,
      ).toBe(0)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("Node API supports cancellation and timeout without output", () => {
  const module = new URL("../dist/node.js", import.meta.url).href
  const input = resolve(import.meta.dir, "fixtures/box.fbx")
  execFileSync("node", [
    "--input-type=module",
    "-e",
    `
    import { convertModel } from ${JSON.stringify(module)};
    import { mkdtemp, access, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import assert from 'node:assert/strict';
    const dir = await mkdtemp(tmpdir() + '/convert-abort-');
    try {
      await assert.rejects(convertModel(${JSON.stringify(input)}, dir + '/abort.glb', { signal: AbortSignal.abort() }));
      await assert.rejects(convertModel(${JSON.stringify(input)}, dir + '/timeout.glb', { timeoutMs: 1 }), /timed out/);
      await assert.rejects(access(dir + '/timeout.glb'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  `,
  ])
})

test("Collada, 3DS and glTF inputs normalize to GLB", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-legacy-"))
  try {
    const dae = `<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><created>2026-01-01T00:00:00</created><modified>2026-01-01T00:00:00</modified><up_axis>Y_UP</up_axis></asset><library_geometries><geometry id="tri"><mesh><source id="pos"><float_array id="pa" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#pa" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices><triangles count="1"><input semantic="VERTEX" source="#verts" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="scene"><node id="Panel" name="Panel"><instance_geometry url="#tri"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>`
    await writeFile(join(dir, "tri.dae"), dae)
    const chunk = (id: number, ...parts: Buffer[]) => {
      const header = Buffer.alloc(6)
      header.writeUInt16LE(id)
      header.writeUInt32LE(6 + parts.reduce((n, part) => n + part.length, 0), 2)
      return Buffer.concat([header, ...parts])
    }
    const vertices = Buffer.alloc(38)
    vertices.writeUInt16LE(3)
    ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => vertices.writeFloatLE(v, 2 + i * 4))
    const faces = Buffer.alloc(10)
    faces.writeUInt16LE(1)
    faces.writeUInt16LE(1, 4)
    faces.writeUInt16LE(2, 6)
    await writeFile(
      join(dir, "tri.3ds"),
      chunk(
        0x4d4d,
        chunk(
          0x3d3d,
          chunk(
            0x4000,
            Buffer.from("Panel\0"),
            chunk(0x4100, chunk(0x4110, vertices), chunk(0x4120, faces)),
          ),
        ),
      ),
    )
    for (const format of ["dae", "3ds"]) {
      const output = join(dir, `${format}.glb`)
      expect(
        run("convert", join(dir, `tri.${format}`), "--out", output).validation.numErrors,
      ).toBe(0)
      expect((await inspectModel(output)).stats.uniqueMeshTriangles).toBe(1)
    }
    const { createModelIO } = await import("../dist/node.js")
    const io = await createModelIO()
    await io.write(join(dir, "tri.gltf"), await io.read(join(dir, "dae.glb")))
    for (const input of ["tri.gltf", "dae.glb"]) {
      expect(
        run("convert", join(dir, input), "--out", join(dir, `${input}.glb`)).validation
          .numErrors,
      ).toBe(0)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
