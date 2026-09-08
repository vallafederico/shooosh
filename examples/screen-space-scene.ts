/** Shared synthetic scene for SSS/SSAO. WGSL, orthographic-free perspective camera.
 * Four analytic spheres and a floor avoid model downloads and repeated mesh draws.
 * Outputs: diffuse RGB + material ID, world normal XYZ + ray distance. Linear HDR.
 * This is example-owned geometry preparation, not an engine G-buffer API.
 */
export const sceneCommon = /* wgsl */ `
struct Params { sizeRadius: vec4f, settings: vec4f }
@group(0) @binding(0) var<uniform> p: Params;
fn eye() -> vec3f { return vec3f(sin(p.settings.x)*6.0, 2.8, cos(p.settings.x)*6.0); }
fn forward() -> vec3f { return normalize(-eye()); }
fn right() -> vec3f { return normalize(cross(forward(), vec3f(0,1,0))); }
fn up() -> vec3f { return cross(right(), forward()); }
fn ray(uv: vec2f) -> vec3f {
 let xy = (uv*2.0-1.0)*vec2f(p.sizeRadius.x/p.sizeRadius.y, -1.0);
 return normalize(forward()*1.8 + right()*xy.x + up()*xy.y);
}
fn project(pos: vec3f) -> vec2f {
 let d = pos-eye(); let z = max(dot(d,forward()),0.001);
 return vec2f(dot(d,right())*1.8/(z*p.sizeRadius.x/p.sizeRadius.y), -dot(d,up())*1.8/z)*0.5+0.5;
}
fn light() -> vec3f { return normalize(vec3f(-0.7, 0.8, p.settings.y)); }
`
export const sceneShader =
  sceneCommon +
  /* wgsl */ `
@group(0) @binding(1) var diffuseOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var geometryOut: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid: vec3u) {
 let dims=textureDimensions(diffuseOut); if(any(gid.xy>=dims)){return;}
 let uv=(vec2f(gid.xy)+0.5)/vec2f(dims); let ro=eye(); let rd=ray(uv);
 var t=100.0; var normal=vec3f(0,1,0); var id=0.0; var albedo=vec3f(0.85);
 if(rd.y < -0.001) { let floorT=(-1.0-ro.y)/rd.y; if(floorT>0.0){t=floorT;id=5.0;} }
 let spheres=array<vec4f,4>(vec4f(-1.25,-0.12,0.0,0.88),vec4f(0.32,-0.38,0.35,0.62),vec4f(0.32,0.78,0.25,0.58),vec4f(1.5,-0.2,-0.65,0.8));
 let colors=array<vec3f,4>(vec3f(0.85,0.2,0.09),vec3f(0.14,0.48,0.75),vec3f(0.85,0.55,0.13),vec3f(0.22,0.55,0.36));
 for(var i=0u;i<4u;i++) {
  let sphere=spheres[i];let oc=ro-sphere.xyz;let b=dot(oc,rd);let c=dot(oc,oc)-sphere.w*sphere.w;let h=b*b-c;
  if(h>0.0){let hit=-b-sqrt(h);if(hit>0.0 && hit<t){t=hit;normal=normalize(ro+rd*t-sphere.xyz);id=f32(i+1u);albedo=colors[i];}}
 }
 if(id==0.0 || t>40.0){textureStore(diffuseOut,vec2i(gid.xy),vec4f(0.045,0.052,0.065,0));textureStore(geometryOut,vec2i(gid.xy),vec4f(0));return;}
 let hitPosition=ro+rd*t;
 var pattern=1.0;
 if(p.settings.w<0.5 && id<5.0){pattern=0.08+0.92*smoothstep(-0.05,0.05,sin(hitPosition.x*18.0+hitPosition.y*4.0));}
 let irradiance=0.045 + max(dot(normal,light()),0.0)*1.15*pattern;
 textureStore(diffuseOut,vec2i(gid.xy),vec4f(albedo*irradiance,id));
 textureStore(geometryOut,vec2i(gid.xy),vec4f(normal,t));
}
`
export const displayShader =
  sceneCommon +
  /* wgsl */ `
@group(0) @binding(1) var diffuseTex: texture_2d<f32>;
@group(0) @binding(2) var geometryTex: texture_2d<f32>;
@group(0) @binding(3) var effectTex: texture_2d<f32>;
struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vsMain(@builtin(vertex_index) i:u32)->VertexOut {
 let xy=vec2f(f32((i<<1u)&2u),f32(i&2u));var o:VertexOut;o.position=vec4f(xy*2.0-1.0,0,1);o.uv=vec2f(xy.x,1.0-xy.y);return o;
}
fn geometryAt(uv:vec2f)->vec4f {let d=vec2i(textureDimensions(geometryTex));return textureLoad(geometryTex,clamp(vec2i(uv*vec2f(d)),vec2i(0),d-1),0);}
fn resolveEffect(uv:vec2f,center:vec4f)->vec3f {
 let d=vec2i(textureDimensions(effectTex));let coord=uv*vec2f(d)-0.5;let base=vec2i(floor(coord));let f=fract(coord);
 var total=vec3f(0);var weights=0.0;
 for(var y=0;y<2;y++){for(var x=0;x<2;x++){
  let q=clamp(base+vec2i(x,y),vec2i(0),d-1);let g=geometryAt((vec2f(q)+0.5)/vec2f(d));
  let bilinear=select(1.0-f.x,f.x,x==1)*select(1.0-f.y,f.y,y==1);
  let edge=exp(-abs(g.w-center.w)*18.0)*pow(max(dot(g.xyz,center.xyz),0.0),8.0);
  let w=bilinear*edge+0.000001;total+=textureLoad(effectTex,q,0).rgb*w;weights+=w;
 }}return total/weights;
}
@fragment fn fsMain(in:VertexOut)->@location(0) vec4f {
 let uv=in.uv;let d=vec2i(textureDimensions(diffuseTex));let q=clamp(vec2i(uv*vec2f(d)),vec2i(0),d-1);
 let base=textureLoad(diffuseTex,q,0);let g=geometryAt(uv);let effect=resolveEffect(uv,g);
 let view=i32(p.settings.z);let isSSS=SSS_MODE;
 var color=base.rgb;
 if(isSSS){color=mix(base.rgb,effect,p.sizeRadius.w);}else{color=base.rgb*pow(clamp(effect.r,0.0,1.0),p.sizeRadius.w);}
 if(view==1 || (view==5 && uv.x<0.5)){color=base.rgb;}
 if(base.a>0.0 && view!=2 && view!=3 && view!=4){
  let halfVector=normalize(light()-ray(uv));let spec=pow(max(dot(g.xyz,halfVector),0.0),80.0)*0.5;color+=vec3f(spec);
 }
 if(view==2){color=effect;}if(view==3){color=g.xyz*0.5+0.5;}if(view==4){color=vec3f(g.w/12.0);}
 if(view==5 && abs(uv.x-0.5)<0.0015){color=vec3f(1);}
 return vec4f(pow(max(color,vec3f(0)),vec3f(1.0/2.2)),1);
}
`
