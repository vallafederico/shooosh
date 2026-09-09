/** Comparable published-package consumers. Downloads pinned OGL and Three.js into a temporary directory.
 * bun bin/compare-ogl.ts [--keep] — build shooosh first. No dependency changes.
 * Report sizes include all JS in one file, with the same minifier per comparison.
 */
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {compileShader} from '../package/compiler/index'
const root=resolve(import.meta.dir,'..')
const temp=await mkdtemp(join(tmpdir(),'shooosh-ogl-'))
const version='1.0.11'
const threeVersion='0.186.0'
const {build:viteBuild}=await import('../harness/node_modules/vite/dist/node/index.js')
const retain=(entry:string,names:string[])=>`import {${names}} from ${JSON.stringify(entry)};globalThis.api=[${names}];`
const namespace=(entry:string)=>`import * as api from ${JSON.stringify(entry)};globalThis.api=api;`
const shaders=compileShader('fn fsMain() -> vec4f { return vec4f(vUv, 0.5 + 0.5 * sin(uUni.values0.x), 1.0); }')
const oglMount=`import {Renderer,Geometry,Program,Mesh} from 'ogl';
function mount(canvas){
 const renderer=new Renderer({canvas,webgl:2,dpr:1,alpha:true});const gl=renderer.gl;
 const resize=()=>renderer.setSize(window.innerWidth,window.innerHeight);resize();window.addEventListener('resize',resize);
 const geometry=new Geometry(gl,{position:{size:2,data:new Float32Array([-1,-1,3,-1,-1,3])},uv:{size:2,data:new Float32Array([0,0,2,0,0,2])}});
 const program=new Program(gl,{depthTest:false,depthWrite:false,cullFace:null,vertex:'#version 300 es\\nin vec2 position;in vec2 uv;out vec2 vUv;void main(){vUv=vec2(uv.x,1.0-uv.y);gl_Position=vec4(position,0,1);}',fragment:'#version 300 es\\nprecision highp float;in vec2 vUv;uniform float uTime;out vec4 outColor;void main(){outColor=vec4(vUv,0.5+0.5*sin(uTime),1.0);}',uniforms:{uTime:{value:0}}});
 const mesh=new Mesh(gl,{geometry,program});let raf=0;
 const render=t=>{program.uniforms.uTime.value=t*0.001;renderer.render({scene:mesh});raf=requestAnimationFrame(render)};
 raf=requestAnimationFrame(render);
 return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);geometry.remove();program.remove()};
}globalThis.api=[mount];`
const threeMount=`import {WebGLRenderer,BufferGeometry,BufferAttribute,RawShaderMaterial,Mesh,Camera,GLSL3} from 'three';
function mount(canvas){
 const renderer=new WebGLRenderer({canvas,alpha:true,antialias:false});renderer.setPixelRatio(1);
 const resize=()=>renderer.setSize(window.innerWidth,window.innerHeight,false);resize();window.addEventListener('resize',resize);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));geometry.setAttribute('uv',new BufferAttribute(new Float32Array([0,0,2,0,0,2]),2));
 const material=new RawShaderMaterial({glslVersion:GLSL3,depthTest:false,depthWrite:false,vertexShader:'precision highp float;in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=vec2(uv.x,1.0-uv.y);gl_Position=vec4(position,1);}',fragmentShader:'precision highp float;in vec2 vUv;uniform float uTime;out vec4 outColor;void main(){outColor=vec4(vUv,0.5+0.5*sin(uTime),1.0);}',uniforms:{uTime:{value:0}}});
 const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;const camera=new Camera();let raf=0;
 const render=t=>{material.uniforms.uTime.value=t*0.001;renderer.render(mesh,camera);raf=requestAnimationFrame(render)};raf=requestAnimationFrame(render);
 return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);geometry.dispose();material.dispose();renderer.dispose()};
}globalThis.api=[mount];`
const threeGpuMount=`import {WebGPURenderer,BufferGeometry,BufferAttribute,MeshBasicNodeMaterial,Mesh,OrthographicCamera,LinearSRGBColorSpace} from 'three/webgpu';
import {attribute,uv,uniform,vec4} from 'three/tsl';
async function mount(canvas){
 const renderer=new WebGPURenderer({canvas,alpha:true,antialias:false});renderer.setPixelRatio(1);renderer.outputColorSpace=LinearSRGBColorSpace;
 await renderer.init();if(!renderer.backend.isWebGPUBackend){renderer.dispose();throw Error('WebGPU unavailable: Three.js selected its WebGL2 fallback')}
 const resize=()=>renderer.setSize(window.innerWidth,window.innerHeight,false);resize();window.addEventListener('resize',resize);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));geometry.setAttribute('uv',new BufferAttribute(new Float32Array([0,0,2,0,0,2]),2));
 const time=uniform(0);const material=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false});
 material.vertexNode=vec4(attribute('position','vec3'),1);material.fragmentNode=vec4(uv().x,uv().y.oneMinus(),time.sin().mul(0.5).add(0.5),1);
 const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;const camera=new OrthographicCamera(-1,1,1,-1,0,1);let raf=0;
 const render=t=>{time.value=t*0.001;renderer.render(mesh,camera);raf=requestAnimationFrame(render)};raf=requestAnimationFrame(render);
 return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);geometry.dispose();material.dispose();renderer.dispose()};
}globalThis.api=[mount];`
const shoooshMount=(entry:string,dual=false,gpu=entry==='shooosh/webgpu')=>`import {createCanvasScene} from ${JSON.stringify(entry)};
async function mount(canvas){const scene=createCanvasScene(canvas,{backend:${JSON.stringify(gpu?'webgpu':'webgl2')},autoInit:false,dpr:{max:1},screen:{shaders:${JSON.stringify(dual?shaders:gpu?{fragment:shaders.fragment}:{fragmentGlsl:shaders.fragmentGlsl})},onFrame(self,frame){self.setUni({value1:frame.now*0.001})}}});await scene.init();return ()=>scene.destroy()}globalThis.api=[mount];`
const fixtures=[
 {name:'engine',three:retain('three',['WebGLRenderer']),ogl:retain('ogl',['Renderer']),shooosh:retain('shooosh/webgl2',['createEngine'])},
 {name:'fullscreen-api',three:retain('three',['WebGLRenderer','BufferGeometry','BufferAttribute','RawShaderMaterial','Mesh','Camera']),ogl:retain('ogl',['Renderer','Geometry','Program','Mesh']),shooosh:retain('shooosh/webgl2',['initEngine','createScreen'])},
 {name:'canvas-scene-api',three:retain('three',['WebGLRenderer','BufferGeometry','BufferAttribute','RawShaderMaterial','Mesh','Camera']),ogl:retain('ogl',['Renderer','Geometry','Program','Mesh']),shooosh:retain('shooosh/webgl2',['createCanvasScene'])},
 {name:'box-api',three:retain('three',['WebGLRenderer','PerspectiveCamera','BoxGeometry','RawShaderMaterial','Mesh']),ogl:retain('ogl',['Renderer','Camera','Box','Program','Mesh']),shooosh:retain('shooosh/webgl2',['initEngine','createObject'])},
 {name:'fullscreen-app',three:threeMount,ogl:oglMount,shooosh:shoooshMount('shooosh/webgl2')},
 {name:'all-exports',three:namespace('three'),ogl:namespace('ogl'),shooosh:namespace('shooosh/webgl2')},
 {name:'dual-fullscreen-app',three:threeMount,ogl:oglMount,shooosh:shoooshMount('shooosh',true)},
 {name:'dual-all-exports',three:namespace('three'),ogl:namespace('ogl'),shooosh:namespace('shooosh')},
]
const variants=fixtures.map(fixture=>({...fixture,
 threeWebgpu:fixture.name.endsWith('fullscreen-app')?threeGpuMount:fixture.three.replaceAll("'three'","'three/webgpu'").replaceAll('"three"','"three/webgpu"').replaceAll('WebGLRenderer','WebGPURenderer').replaceAll('RawShaderMaterial','MeshBasicNodeMaterial').replaceAll(',Camera',',OrthographicCamera'),
 shoooshBothGpu:fixture.name.endsWith('fullscreen-app')?shoooshMount('shooosh',true,true):fixture.shooosh.replaceAll('shooosh/webgl2','shooosh'),
 shoooshBoth:fixture.name.endsWith('fullscreen-app')?shoooshMount('shooosh',true):fixture.shooosh.replaceAll('shooosh/webgl2','shooosh'),
 shoooshWebgpu:fixture.name.endsWith('fullscreen-app')?shoooshMount('shooosh/webgpu'):fixture.shooosh.replaceAll('shooosh/webgl2','shooosh/webgpu').replaceAll('"shooosh"','"shooosh/webgpu"'),
}))
try {
 await mkdir(join(temp,'node_modules'))
 const integrities: Record<string,string> = {}
 for (const [name,pinned] of [['ogl',version],['three',threeVersion]]) {
  const response=await fetch(`https://registry.npmjs.org/${name}/${pinned}`)
  if(!response.ok)throw Error(`Package metadata failed: ${name}`)
  const metadata=await response.json() as {dist:{tarball:string;integrity:string}}
  const download=await fetch(metadata.dist.tarball)
  if(!download.ok)throw Error(`Package download failed: ${name}`)
  const archive=Buffer.from(await download.arrayBuffer())
  const integrity='sha512-'+createHash('sha512').update(archive).digest('base64')
  if(integrity!==metadata.dist.integrity)throw Error(`${name} archive integrity mismatch`)
  integrities[name!]=integrity
  await writeFile(join(temp,`${name}.tgz`),archive)
  const destination=join(temp,'node_modules',name!);await mkdir(destination)
  const unpack=Bun.spawn(['tar','-xzf',join(temp,`${name}.tgz`),'-C',destination,'--strip-components=1'],{stdout:'ignore',stderr:'pipe'})
  if(await unpack.exited!==0)throw Error(await new Response(unpack.stderr).text())
 }
 await symlink(root,join(temp,'node_modules/shooosh'))
 await writeFile(join(temp,'package.json'),'{"type":"module"}')
 await mkdir(join(temp,'preview'))
 const results=[]
 for(const fixture of variants)for(const library of ['ogl','three','shooosh','shoooshBoth','shoooshWebgpu','threeWebgpu','shoooshBothGpu'] as const)for(const bundler of ['bun','vite']){
  const entry=join(temp,'entry.js');await writeFile(entry,fixture[library])
  let code:string
  if(bundler==='bun'){
   const output=await Bun.build({entrypoints:[entry],target:'browser',format:'esm',splitting:false,minify:true})
   if(!output.success)throw Error(output.logs.map(String).join('\n'))
   const files=output.outputs.filter(f=>f.path.endsWith('.js'));if(files.length!==1)throw Error('Expected one JS file')
   code=await files[0]!.text()
  }else{
   const output=await viteBuild({configFile:false,root:temp,logLevel:'silent',publicDir:false,build:{write:false,target:'esnext',minify:'esbuild',modulePreload:false,rollupOptions:{input:entry,output:{inlineDynamicImports:true}}}})
   if(Array.isArray(output)||!('output' in output))throw Error('Unexpected Vite output')
   const files=output.output.filter((f:{type:string})=>f.type==='chunk');if(files.length!==1)throw Error('Expected one JS file');code=files[0].code
  }
  if(library==='shooosh'&&!fixture.name.startsWith('dual')&&/requestAdapter|createRenderPipeline|Unable to locate fsMain/.test(code))throw Error('Unexpected GPU/compiler inclusion')
  if(library==='shoooshWebgpu'&&/createShader\(|shaderSource\(|Unable to locate fsMain/.test(code))throw Error('Unexpected GL/compiler inclusion')
  const row={fixture:fixture.name,library,bundler,minified:Buffer.byteLength(code),gzip:gzipSync(code,{level:9}).length};results.push(row)
  if(fixture.name==='fullscreen-app'&&bundler==='vite')await writeFile(join(temp,'preview',`${library}.js`),code)
 }
 const formats=[]
 for(const backend of ['both','webgl2','webgpu'])for(const format of ['cjs','iife']){
  if(format==='iife'&&backend!=='both')continue
  const file=format==='iife'?'dist/shooosh.min.js':`dist/${backend==='both'?'':backend+'/'}cjs.js`
  const data=await readFile(join(root,file))
  formats.push({backend,format,file,minified:data.length,gzip:gzipSync(data,{level:9}).length})
 }
 const report={shoooshVariants:{shooosh:'webgl2',shoooshBoth:'both',shoooshWebgpu:'webgpu',shoooshBothGpu:'both (WebGPU requested)'},threeVariants:{three:'WebGLRenderer',threeWebgpu:'WebGPURenderer with bundled WebGL2 fallback; WebGPU required by app fixture'},formats,capturedAt:new Date().toISOString(),oglVersion:version,oglIntegrity:integrities.ogl,threeVersion,threeIntegrity:integrities.three,bunVersion:Bun.version,viteVersion:JSON.parse(await readFile(join(root,'harness/node_modules/vite/package.json'),'utf8')).version,method:'Published ESM imports; browser target; minification; one complete JS file; gzip level 9. API fixtures retain callable exports, app fixtures retain full mounts.',results}
 await writeFile(join(root,'docs/audits/2026-09-09-library-comparison.json'),JSON.stringify(report,null,2)+'\n')
 console.table(results)
 if(process.argv.includes('--keep')){
  await writeFile(join(temp,'preview/index.html'),`<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{width:100vw;height:100vh}output{position:fixed;top:12px;left:12px}</style><canvas></canvas><output>Starting</output><script type="module">addEventListener('error',e=>document.querySelector('output').textContent=e.message);addEventListener('unhandledrejection',e=>document.querySelector('output').textContent=String(e.reason));const choice=new URLSearchParams(location.search).get('library');const library=['ogl','three','shoooshBoth','shoooshWebgpu','threeWebgpu','shoooshBothGpu'].includes(choice)?choice:'shooosh';try{await import('./'+library+'.js');const dispose=await globalThis.api[0](document.querySelector('canvas'));document.querySelector('output').textContent=library+' — '+(['shoooshWebgpu','threeWebgpu','shoooshBothGpu'].includes(library)?'WebGPU':'WebGL2');addEventListener('pagehide',dispose,{once:true});}catch(error){document.querySelector('output').textContent=String(error);throw error}</script>`)
  console.log('Preview directory:',join(temp,'preview'))
 }
}finally{if(!process.argv.includes('--keep'))await rm(temp,{recursive:true,force:true})}
