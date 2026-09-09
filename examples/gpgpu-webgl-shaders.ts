/** GLSL counterparts of the particle WGSL kernels; transform feedback replaces storage writes. */
const uniforms = `
uniform vec4 uStep;
uniform vec4 uPointer;
uniform vec4 uViewport;
uniform int uCount;
layout(location=0) in vec4 aPosition;
layout(location=1) in vec4 aVelocity;
float fit() { return min(1.0, uStep.z) * 0.84; }
`
const noise = `
float hash3(vec3 p) {
  vec3 q = fract(p * 0.1031);
  q += vec3(dot(q, q.yzx + vec3(33.33)));
  return fract((q.x + q.y) * q.z) * 2.0 - 1.0;
}
vec3 noiseGradient(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  vec3 w = f*f*f*(f*(f*6.0-vec3(15.0))+vec3(10.0));
  vec3 dw = 30.0*f*f*(f-vec3(1.0))*(f-vec3(1.0));
  vec3 gradient = vec3(0.0);
  for (int i=0; i<8; i++) {
    vec3 corner = vec3(float(i&1), float((i>>1)&1), float((i>>2)&1));
    vec3 weight = mix(vec3(1.0)-w,w,corner);
    vec3 derivative = dw*(corner*2.0-vec3(1.0));
    gradient += hash3(cell+corner)*vec3(derivative.x*weight.y*weight.z,weight.x*derivative.y*weight.z,weight.x*weight.y*derivative.z);
  }
  return gradient;
}
vec3 curl(vec3 p) {
  vec3 gx=noiseGradient(p+vec3(17.1,3.7,9.2));
  vec3 gy=noiseGradient(p+vec3(5.3,29.4,2.8));
  vec3 gz=noiseGradient(p+vec3(11.9,8.6,37.5));
  return vec3(gz.y-gy.z,gx.z-gz.x,gy.x-gx.y);
}
`
export function updateVertex(sphere: boolean) {
  return `#version 300 es
precision highp float;
precision highp int;
${uniforms}
out vec4 nextPosition;
out vec4 nextVelocity;
${sphere ? noise : ""}
void main() {
  gl_Position=vec4(0.0,0.0,0.0,1.0);
  float dt=uStep.x;
  ${sphere ? `
  if (uStep.w>0.5) {
    float y=1.0-2.0*(float(gl_VertexID)+0.5)/float(uCount);
    float radius=sqrt(max(0.0,1.0-y*y));
    float angle=float(gl_VertexID)*2.39996323;
    nextPosition=vec4(vec3(cos(angle)*radius,y,sin(angle)*radius)*0.82,1.0);
    nextVelocity=vec4(0.0); return;
  }
  vec3 p=aPosition.xyz;
  vec3 normal=p/max(length(p),0.0001);
  vec3 drift=vec3(uStep.y*0.12,-uStep.y*0.09,uStep.y*0.07);
  vec3 flow=curl(p*2.4+drift)*0.7+curl(p*4.8-drift*0.6)*0.22;
  vec3 tangent=flow-normal*dot(flow,normal);
  vec3 force=tangent*0.7+normal*(0.82-length(p))*12.0;
  vec2 away=p.xy-uPointer.xy/fit();
  float distance=length(away);
  float influence=(1.0-smoothstep(0.0,0.36,distance))*uPointer.z*smoothstep(-0.4,0.35,p.z);
  vec2 direction=away/max(distance,0.002);
  force+=vec3(direction*6.0+vec2(-direction.y,direction.x)*3.0,2.0)*influence;
  vec3 velocity=(aVelocity.xyz+force*dt)*exp(-1.6*dt);
  velocity/=max(1.0,length(velocity)/1.8);
  nextPosition=vec4(p+velocity*dt,1.0);
  nextVelocity=vec4(velocity,0.0);
  ` : `
  vec2 uv=(vec2(float(gl_VertexID%128),float(gl_VertexID/128))+0.5)/128.0;
  vec2 origin=(uv*2.0-1.0)*vec2(uStep.z*0.88,0.78);
  if (uStep.w>0.5) { nextPosition=vec4(origin,0.0,1.0); nextVelocity=vec4(0.0); return; }
  vec2 p=aPosition.xy;
  vec2 wave=vec2(sin(origin.y*7.0+uStep.y*0.7),cos(origin.x*5.0-uStep.y*0.5))*0.025;
  vec2 force=(origin+wave-p)*3.5;
  vec2 away=p-uPointer.xy;
  float distance=length(away);
  float falloff=1.0-smoothstep(0.0,uPointer.w,distance);
  vec2 direction=away/max(distance,0.002);
  force+=(direction*5.0+vec2(-direction.y,direction.x)*2.2)*falloff*uPointer.z;
  vec2 velocity=(aVelocity.xy+force*dt)*exp(-2.2*dt);
  velocity/=max(1.0,length(velocity)/2.5);
  nextPosition=vec4(p+velocity*dt,0.0,1.0);
  nextVelocity=vec4(velocity,0.0,0.0);
  `}
}`
}
export function displayVertex(sphere: boolean) {
  return `#version 300 es
precision highp float;
precision highp int;
${uniforms}
out vec2 vUv;
out vec3 vColor;
void main() {
  vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  vec2 corner=corners[gl_VertexID];
  vUv=corner;
  ${sphere ? `
  vec3 p=aPosition.xyz;
  float speed=clamp(length(aVelocity.xyz)*1.2,0.0,1.0);
  float front=clamp(p.z/1.64+0.5,0.0,1.0);
  float size=uViewport.z*(0.65+front*0.45)*1.35;
  gl_Position=vec4(p.xy*fit()/vec2(uStep.z,1.0)+corner*size*2.0/uViewport.xy, -p.z*0.4,1.0);
  vec3 base=mix(vec3(0.10,0.38,0.9),vec3(0.36,0.95,0.8),clamp(p.y*0.5+0.5,0.0,1.0));
  vColor=mix(base,vec3(1.0,0.71,0.42),speed*0.65)*(0.3+front*1.2);
  ` : `
  float speed=clamp(length(aVelocity.xy)*1.5,0.0,1.0);
  float radius=uViewport.z*(1.0+speed*0.65)*1.25;
  gl_Position=vec4(aPosition.xy/vec2(uStep.z,1.0)+corner*radius*2.0/uViewport.xy,0.0,1.0);
  vec3 base=mix(vec3(0.13,0.52,0.66),vec3(0.45,0.84,0.70),float(gl_InstanceID%128)/127.0);
  vColor=mix(base,vec3(1.0,0.79,0.35),speed);
  `}
}`
}
export const discardFragment = `#version 300 es
precision highp float;
out vec4 color;
void main() { color=vec4(0.0); }
`
export function displayFragment(sphere: boolean) {
  return `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
out vec4 color;
void main() {
  float d=length(vUv);
  if(d>1.0) discard;
  color=vec4(vColor*${sphere ? '(1.0-smoothstep(0.25,1.15,d))' : '(0.3+(1.0-smoothstep(0.35,1.0,d))*0.7)'},1.0);
}`
}
