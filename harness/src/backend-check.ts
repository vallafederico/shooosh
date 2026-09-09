/** Published entry smoke surface; build the package before opening backend.html. */
import shader from '../../examples/gradient-shader'
const selected=new URLSearchParams(location.search).get('backend')==='webgl2'?'webgl2':'webgpu'
const api=await (selected==='webgl2'?import('shooosh/webgl2'):import('shooosh/webgpu'))
const domApi=await (selected==='webgl2'?import('shooosh/webgl2/dom'):import('shooosh/webgpu/dom'))
const report=document.querySelector('#report')!
try {
  const canvas=document.querySelector('canvas')!
  const source=document.createElement('canvas');source.width=source.height=32
  source.getContext('2d')!.fillRect(0,0,32,32)
  const scene=api.createScene(canvas,{autoInit:false,screen:{shaders:shader,textureUrl:source.toDataURL()},
    post:[api.effects.custom({
      fragmentShader:'vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) { return color; }',
      fragmentShaderWgsl:'fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f { return color; }',
    })]})
  await scene.init()
  const engine=scene.getEngine()!
  scene.addObject(null, { placement:{centerX:0.3,centerY:0,scale:1}, rotationX:0.4,rotationY:0.4 })
  scene.retain(api.createParticles({positions:new Float32Array([-0.8,0.5,-0.6,0.5]),size:16,color:[1,0.2,0.2,1]}))
  const dom=await domApi.createDomLayer({engine})
  const img=document.querySelector('img')!
  const bitmap=document.createElement('canvas');bitmap.width=bitmap.height=64
  const ctx=bitmap.getContext('2d')!;ctx.fillStyle='orange';ctx.fillRect(0,0,64,64)
  img.src=bitmap.toDataURL()

  await img.decode()
  const media=dom!.media(img)
  const ready=await media.ready
  let conflict=false
  try{await api.probeRenderer({backend:selected==='webgpu'?'webgl2':'webgpu'})}catch{conflict=true}
  report.textContent=JSON.stringify({selected,actual:engine.backend,post:!!scene.getPostProcessor(),media:ready.state,reason:ready.reason,conflict},null,2)
  window.addEventListener('pagehide',()=>{dom?.destroy();scene.destroy()},{once:true})
}catch(error){report.textContent=String(error)}
