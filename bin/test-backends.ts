/** Published backend graph and consumer checks. Run after package build. */
import { strict as assert } from "node:assert"
import { mkdtemp, writeFile, rm, readdir, readFile, mkdir, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { gzipSync } from "node:zlib"
import { shoooshShaders } from "../package/build/index"
const root = resolve(import.meta.dir, '..')
const { build: viteBuild } = await import('../harness/node_modules/vite/dist/node/index.js')
const dir = await mkdtemp(join(tmpdir(), 'shooosh-backends-'))
const report: unknown[] = []
function check(code: string, backend: string) {
  assert(!code.includes('Unable to locate fsMain'), 'Runtime compiler leaked')
  if (backend === 'webgl2') assert(!/requestAdapter|createRenderPipeline|createComputePipeline|@group\(/.test(code), 'WebGPU leaked')
  if (backend === 'webgpu') assert(!/createShader\(|shaderSource\(|#version 300 es\\n(?:in|precision)/.test(code), 'WebGL implementation/shader leaked')
}
try {
  await mkdir(join(dir, 'node_modules'))
  await symlink(root, join(dir, 'node_modules/shooosh'))
  await writeFile(join(dir,'shader.wgsl'), 'fn fsMain() -> vec4f { return vec4f(vUv, 0.5, 1.0); }')
  for (const backend of ['webgl2', 'webgpu'] as const) {
    // Inspect the full published surface, including chunks that a particular fixture could discard.
    for (const file of await readdir(join(root,'dist',backend), {recursive:true})) {
      if (file.endsWith('.js')) check(await readFile(join(root,'dist',backend,file),'utf8'),backend)
    }
    const api = await import(join(root,'dist',backend,'esm.js'))
    assert.equal(await api.probeRenderer(), null, 'SSR probe must return null')
    await assert.rejects(api.probeRenderer({backend: backend==='webgl2'?'webgpu':'webgl2'}), /excluded/)
    if (backend==='webgl2') assert.equal(api.createCompute({}), null)
    for (const [name,symbols] of Object.entries({canvas:['createCanvasScene'],dom:[],scene:['createScene'], item:['createItem','acquireLayer'], object:['createObject','initEngine'], post:['createPostProcessor','initEngine'], particles:['createParticles','initEngine'], msdf:['createMsdfGlyphs','initEngine'], all:['createScene','createObject','createParticles','createMsdfGlyphs','createPostProcessor','createMouseTrail','loadTexture','createCompute']})) {
      const entry=join(dir,'main.js')
      await writeFile(entry,`${symbols.length?`import {${symbols}} from "shooosh/${backend}";`:""} ${name==='dom'||name==='all'?`import {createDomLayer} from "shooosh/${backend}/dom";`:""}globalThis.api=[${symbols}${name==='dom'||name==='all'?`,createDomLayer`:""}];`)
      for (const bundler of ['bun','vite']) {
        let codes: string[]
        if(bundler==='bun') {
          const result=await Bun.build({entrypoints:[entry],target:'browser',minify:true,splitting:true,outdir:join(dir,'out')})
          assert(result.success);codes=await Promise.all(result.outputs.filter(f=>f.path.endsWith('.js')).map(f=>f.text()))
        } else {
          const result=await viteBuild({configFile:false,root:dir,logLevel:'silent',build:{write:false,rollupOptions:{input:entry}}})
          if(Array.isArray(result)||!('output' in result))throw Error('Unexpected Vite result')
          codes=result.output.filter((f: {type:string})=>f.type==='chunk').map((f: {code:string})=>f.code)
        }
        codes.forEach(c=>check(c,backend))
        report.push({backend,name,bundler,raw:codes.reduce((n,c)=>n+Buffer.byteLength(c),0),gzip:codes.reduce((n,c)=>n+gzipSync(c,{level:9}).length,0)})
      }
    }
    // Exercise plugin resolution rather than explicit entry imports.
    await writeFile(join(dir,'main.js'),'import {createScene} from "shooosh"; import shader from "./shader.wgsl"; globalThis.api=[createScene,shader];')
    const result=await viteBuild({configFile:false,root:dir,logLevel:'silent',plugins:[shoooshShaders({backend})],build:{write:false,rollupOptions:{input:join(dir,'main.js')}}})
    if(Array.isArray(result)||!('output' in result))throw Error('Unexpected Vite result')
    const code=result.output.filter((f: {type:string})=>f.type==='chunk').map((f: {code:string})=>f.code).join('\n');check(code,backend)
    assert(backend==='webgl2' ? !code.includes('fn fsMain') : !code.includes('void main'))
  }
  if (process.argv.includes('--report')) await writeFile(join(root,'docs/audits/2026-09-09-backend-builds.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
  console.log('Backend graph, 38 consumer builds, target resolution and SSR checks passed.')
} finally { await rm(dir,{recursive:true,force:true}) }
