/** SSAO: depth-projected hemisphere samples, stable pixel rotation, bilateral blur.
 * Inspired by N8AO's performance strategy; original WGSL, not a package port.
 * No history/temporal accumulation: camera or object changes cannot ghost.
 */
import { sceneCommon, displayShader } from "./screen-space-scene"
export const aoShader =
  sceneCommon +
  /* wgsl */ `
@group(0) @binding(1) var geometryTex:texture_2d<f32>;
@group(0) @binding(2) var outputTex:texture_storage_2d<rgba16float,write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 let dims=textureDimensions(outputTex);if(any(gid.xy>=dims)){return;}
 let uv=(vec2f(gid.xy)+0.5)/vec2f(dims);let full=vec2i(textureDimensions(geometryTex));
 let center=textureLoad(geometryTex,clamp(vec2i(uv*vec2f(full)),vec2i(0),full-1),0);
 if(center.w==0.0){textureStore(outputTex,vec2i(gid.xy),vec4f(1));return;}
 let pos=eye()+ray(uv)*center.w;let n=center.xyz;
 let axis=select(vec3f(0,1,0),vec3f(1,0,0),abs(n.y)>0.9);let tangent=normalize(cross(axis,n));let bitangent=cross(n,tangent);
 let rotation=fract(sin(dot(vec2f(gid.xy),vec2f(12.9898,78.233)))*43758.5453)*6.2831853;
 let count=u32(p.settings.w);var occlusion=0.0;
 for(var i=0u;i<16u;i++){
  if(i>=count){break;}let f=(f32(i)+0.5)/f32(count);let angle=f32(i)*2.399963+rotation;
  let z=0.15+0.85*f;let r=sqrt(1.0-z*z);let direction=tangent*cos(angle)*r+bitangent*sin(angle)*r+n*z;
  let samplePos=pos+direction*p.sizeRadius.z*(0.2+0.8*f*f);let projected=project(samplePos);
  if(any(projected<vec2f(0)) || any(projected>=vec2f(1))){continue;}
  let g=textureLoad(geometryTex,clamp(vec2i(projected*vec2f(full)),vec2i(0),full-1),0);
  let delta=distance(samplePos,eye())-g.w;
  if(g.w>0.0 && delta>0.025){occlusion+=1.0-smoothstep(p.sizeRadius.z*0.35,p.sizeRadius.z*2.0,abs(center.w-g.w));}
 }
 textureStore(outputTex,vec2i(gid.xy),vec4f(vec3f(1.0-occlusion/f32(count)),1));
}
`
export const aoBlurShader =
  sceneCommon +
  /* wgsl */ `
@group(0) @binding(1) var geometryTex:texture_2d<f32>;
@group(0) @binding(2) var inputTex:texture_2d<f32>;
@group(0) @binding(3) var outputTex:texture_storage_2d<rgba16float,write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 let dims=textureDimensions(outputTex);if(any(gid.xy>=dims)){return;}let d=vec2i(dims);let full=vec2i(textureDimensions(geometryTex));
 let uv=(vec2f(gid.xy)+0.5)/vec2f(dims);let center=textureLoad(geometryTex,clamp(vec2i(uv*vec2f(full)),vec2i(0),full-1),0);
 var sum=0.0;var total=0.0;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let q=clamp(vec2i(gid.xy)+vec2i(x,y),vec2i(0),d-1);let sampleUV=(vec2f(q)+0.5)/vec2f(d);
  let g=textureLoad(geometryTex,clamp(vec2i(sampleUV*vec2f(full)),vec2i(0),full-1),0);
  let weight=exp(-f32(x*x+y*y)*0.7-abs(g.w-center.w)*(10.0/max(p.sizeRadius.z,0.05)))*pow(max(dot(g.xyz,center.xyz),0.0),8.0)+0.000001;
  sum+=textureLoad(inputTex,q,0).r*weight;total+=weight;
 }}textureStore(outputTex,vec2i(gid.xy),vec4f(vec3f(sum/total),1));
}
`
export const ssaoShaders = {
  effect: aoShader,
  blur: aoBlurShader,
  display: /* @__PURE__ */ displayShader.replace("SSS_MODE", "false"),
}
