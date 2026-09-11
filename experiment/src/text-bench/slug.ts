/** Free reference Slug coverage algorithm, harness-only WebGL2 port. */
import fragment from './slug.frag.glsl?raw';
import {assets,identity,position} from './assets';
import {gpuTimer} from './timer';
import type {Adapter} from './contract';
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 rect;
layout(location=1) in vec4 coords;
layout(location=2) in vec4 transform;
layout(location=3) in float glyphRow;
uniform vec2 viewport;
out vec2 em;flat out vec4 band;flat out int row;
void main(){
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 uv=corners[gl_VertexID];vec2 p=mix(rect.xy,rect.zw,uv);
 gl_Position=vec4(p/viewport*vec2(2,-2)+vec2(-1,1),0,1);
 em=mix(coords.xy,coords.zw,uv);band=transform;row=int(glyphRow);
}`;
export const slug:Adapter={name:'Slug reference (WebGL2 port)',version:'be3c13eb7d63f9e8aa5c583e42d92c374cb91d98',fontIdentity:identity,
 async mount(canvas,c){
  if(c.backend!=='webgl2')throw new Error('Slug reference benchmark currently supports WebGL2. Select WebGL2 for matched A/B.');
  const {slug:a}=await assets("slug");
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true})!;
  if(!gl)throw new Error('WebGL2 unavailable');
  const textures:WebGLTexture[]=[],shaders:WebGLShader[]=[];
  const program=gl.createProgram()!,buffer=gl.createBuffer()!,vao=gl.createVertexArray()!,timer=gpuTimer(gl);
  const destroy=()=>{timer.destroy();textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.getExtension('WEBGL_lose_context')?.loseContext();};
  try{
   for(const [type,src] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)??'Slug compile failed');gl.attachShader(program,s);
   }
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'Slug link failed');
   gl.useProgram(program);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,i===3?1:4,gl.FLOAT,false,52,i*16);gl.vertexAttribDivisor(i,1);}
   const binary=async(name:string)=>{const r=await fetch(`/text-bench/${name}.bin`);if(!r.ok)throw new Error(`Missing ${name}`);return new Uint16Array(await r.arrayBuffer());};
   const [curves,bands]=await Promise.all([binary('abel-curves'),binary('abel-bands')]);
   if(curves.byteLength!==4096*a.rows*8||bands.byteLength!==4096*a.rows*4)throw new Error('Invalid prepared texture dimensions');
   for(let i=0;i<2;i++){
    const t=gl.createTexture()!;textures.push(t);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,i?gl.RG16UI:gl.RGBA16F,4096,a.rows,0,i?gl.RG_INTEGER:gl.RGBA,i?gl.UNSIGNED_SHORT:gl.HALF_FLOAT,i?bands:curves);
   }
   gl.uniform1i(gl.getUniformLocation(program,'curveTexture'),0);gl.uniform1i(gl.getUniformLocation(program,'bandTexture'),1);
   gl.uniform2f(gl.getUniformLocation(program,'viewport'),c.width,c.height);
   gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   const data=new Float32Array(c.count*13),pad=1/(c.dpr*c.fontSize);
   const update=(text:string)=>{
    for(let i=0;i<c.count;i++){
     const g=a.glyphs[text[i%text.length]!]!;if(!g)throw new Error('Missing glyph');
     const [x,y]=position(i,c),[l,b,r,t]=g.bounds;
     data.set([x!+(l!-pad)*c.fontSize,y!-(t!+pad)*c.fontSize,x!+(r!+pad)*c.fontSize,y!-(b!-pad)*c.fontSize,l!-pad,t!+pad,r!+pad,b!-pad,...g.bandTransform,g.row],i*13);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
   };
   const render=()=>{const q=timer.begin();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArraysInstanced(gl.TRIANGLES,0,6,c.count);timer.end(q);timer.collect();};
   update(c.text);render();gl.finish();if(gl.getError()!==gl.NO_ERROR)throw new Error('Slug GL initialization failed');
   return{update,render,startMeasurement:()=>timer.start(),gpuSamples:()=>timer.collect(),settle:async()=>{gl.finish();},destroy};
  }catch(e){destroy();throw e;}
 }
};
