/** Separable screen-space scattering of diffuse lighting. Material IDs prevent
 * cross-object color leaks; depth/normal weights protect silhouettes. Specular is
 * recombined after filtering. Artistic RGB diffusion, not physical transmission.
 */
import { sceneCommon, displayShader } from "./screen-space-scene"
const blur =
  sceneCommon +
  /* wgsl */ `
@group(0) @binding(1) var diffuseTex:texture_2d<f32>;
@group(0) @binding(2) var geometryTex:texture_2d<f32>;
@group(0) @binding(3) var inputTex:texture_2d<f32>;
@group(0) @binding(4) var outputTex:texture_storage_2d<rgba16float,write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 let dims=textureDimensions(outputTex);if(any(gid.xy>=dims)){return;}let d=vec2i(dims);let q=vec2i(gid.xy);
 let base=textureLoad(diffuseTex,q,0);let center=textureLoad(geometryTex,q,0);
 if(base.a==0.0 || base.a==5.0){textureStore(outputTex,q,base);return;}
 var sum=vec3f(0);var total=vec3f(0);
 for(var i=-4;i<=4;i++){
  let offset=vec2i(DIRECTION* f32(i)*p.sizeRadius.z/4.0);let at=clamp(q+offset,vec2i(0),d-1);
  let material=textureLoad(diffuseTex,at,0);let g=textureLoad(geometryTex,at,0);
  let x=f32(i)/4.0;let profile=exp(-vec3f(2.0,5.0,10.0)*x*x);
  let edge=exp(-abs(g.w-center.w)*12.0)*pow(max(dot(g.xyz,center.xyz),0.0),2.0);
  let weight=profile*edge*select(0.0,1.0,material.a==base.a);
  sum+=textureLoad(inputTex,at,0).rgb*weight;total+=weight;
 }
 textureStore(outputTex,q,vec4f(sum/max(total,vec3f(0.00001)),base.a));
}
`
export const sssShaders = {
  effect: /* @__PURE__ */ blur.replace("DIRECTION", "vec2f(1,0)"),
  blur: /* @__PURE__ */ blur.replace("DIRECTION", "vec2f(0,1)"),
  display: /* @__PURE__ */ displayShader.replace("SSS_MODE", "true"),
}
