import { test, expect } from "bun:test"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { compileShader, shaderModule, shoooshShaders, runShaderCli } from "./index"
import { resolveGlslShaderSource } from "../src/primitives/plane"
const source = 'fn fsMain() -> vec4f { return vec4f(vUv, 0.0, 1.0); }'
test("artifact selects prepared GLSL without runtime translation", () => {
  const shader = compileShader(source)
  expect(shader.fragment).toBe(source)
  expect(resolveGlslShaderSource({ shaders: shader, debugUv: false }).fragment).toBe(shader.fragmentGlsl)
  expect(() => resolveGlslShaderSource({ shaders: { fragment: source }, debugUv: false })).toThrow("precompiled")
  expect(compileShader('fn fsMain() -> vec4f { return vec4f(vNormal, 1.0); }').fragmentGlsl).toContain('in vec3 vNormal')
})
test("CLI writes standalone module + declaration and preserves output on conversion failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shooosh-shader-'))
  try {
    const input = join(dir, 'shader.wgsl'), output = join(dir, 'shader.mjs')
    await writeFile(input, source)
    expect(await runShaderCli([input, output])).toBe(0)
    expect((await import(output)).default).toEqual(compileShader(source))
    expect(await readFile(join(dir, 'shader.d.mts'), 'utf8')).toContain('fragmentGlsl')
    const before = await readFile(output, 'utf8')
    await writeFile(input, 'not a shader')
    expect(await runShaderCli([input, output])).toBe(1)
    expect(await readFile(output, 'utf8')).toBe(before)
    expect(await runShaderCli([input, input])).toBe(1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test("Vite imports .wgsl as data with no compiler in the browser output", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shooosh-plugin-'))
  try {
    await writeFile(join(dir, 'shader.wgsl'), source)
    await writeFile(join(dir, 'main.js'), 'import shader from "./shader.wgsl"; globalThis.shader = shader;')
    const { build } = await import('../../harness/node_modules/vite/dist/node/index.js')
    const output = await build({ configFile: false, root: dir, logLevel: 'silent', plugins: [shoooshShaders()],
      build: { write: false, rollupOptions: { input: join(dir, 'main.js') } } })
    if (Array.isArray(output) || !('output' in output)) throw new Error('Unexpected Vite result')
    const code = output.output.filter((f: {type:string}) => f.type === 'chunk').map((f: {code:string}) => f.code).join('\n')
    expect(code).toContain('fragmentGlsl')
    expect(code).not.toContain('Unable to locate fsMain')
    expect(code).not.toContain('node:fs')
    expect(shoooshShaders().transform(source, 'shader.wgsl?raw')).toBeNull()
    expect(() => shoooshShaders().transform('invalid', '/shader.wgsl')).toThrow('/shader.wgsl')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test("committed built-in and example artifacts match authoring sources", async () => {
  for (const [input, output] of [['package/dom/image.wgsl','package/dom/image-shader.ts'], ['examples/gradient.wgsl','examples/gradient-shader.ts']]) {
    const root = resolve(import.meta.dir, '../..')
    expect(await readFile(join(root, output), 'utf8')).toBe(shaderModule(await readFile(join(root, input), 'utf8')))
  }
})

test("backend artifact targeting removes unused source and permits GPU-only WGSL", () => {
  expect(shaderModule(source,{backend:'webgl2'})).not.toContain('fn fsMain')
  expect(shaderModule(source,{backend:'webgpu'})).not.toContain('fragmentGlsl')
  expect(() => shaderModule(source,{backend:'other' as 'both'})).toThrow('Unknown backend')
})
test("shader minification preserves tokens, directives, strings and continuations", async () => {
  const { minifyShader } = await import('./minify')
  expect(minifyShader('a/* nested /* comment */ done */b')).toBe('a b')
  expect(minifyShader('// remove\n#version 300 es\n  a  + + b; // hi\n')).toBe('#version 300 es\na + + b;')
  expect(minifyShader('#include "a  b"')).toBe('#include "a  b"')
  const continuation = '#define A \\\n\n  untouched'
  expect(minifyShader(continuation)).toBe(continuation)
  expect(() => minifyShader('/* broken')).toThrow('Unterminated')
  const readable=shaderModule('// author note\n'+source)
  const compact=shaderModule('// author note\n'+source,{minify:true})
  expect(compact.length).toBeLessThan(readable.length)
  expect(compact).not.toContain('author note')
})
