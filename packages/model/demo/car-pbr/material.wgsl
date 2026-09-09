// Demo-owned GGX shader. Atlas tiles: base color, object-space normal, metallic/roughness, emissive.
fn tile(offset: vec2f) -> vec4f {
  return textureSample(uEnvMap, uSampler, (clamp(vUv, vec2f(0.001), vec2f(0.999)) + offset) * 0.5);
}
fn rotateNormal(n: vec3f) -> vec3f {
  let cx: f32 = cos(uUni.values0.x);
  let sx: f32 = sin(uUni.values0.x);
  let cy: f32 = cos(uUni.values0.y);
  let sy: f32 = sin(uUni.values0.y);
  let p: vec3f = vec3f(n.x, n.y * cx - n.z * sx, n.y * sx + n.z * cx);
  return normalize(vec3f(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy));
}
fn fresnel(c: f32, f0: vec3f) -> vec3f { return f0 + (vec3f(1.0) - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
fn light(n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, albedo: vec3f, metal: f32, rough: f32) -> vec3f {
  let h: vec3f = normalize(v + l);
  let nl: f32 = max(dot(n,l),0.0);
  let nv: f32 = max(dot(n,v),0.001);
  let nh: f32 = max(dot(n,h),0.0);
  let vh: f32 = max(dot(v,h),0.0);
  let a: f32 = rough * rough;
  let a2: f32 = a*a;
  let d: f32 = a2 / max(3.14159265 * pow(nh*nh*(a2-1.0)+1.0,2.0),0.00001);
  let k: f32 = (rough+1.0)*(rough+1.0)/8.0;
  let g: f32 = (nv / (nv*(1.0-k)+k)) * (nl/(nl*(1.0-k)+k));
  let f: vec3f = fresnel(vh,mix(vec3f(0.04),albedo,metal));
  return ((vec3f(1.0)-f)*(1.0-metal)*albedo/3.14159265 + d*g*f/max(4.0*nv*nl,0.0001))*radiance*nl;
}
fn studio(r: vec3f, rough: f32) -> vec3f {
  let sky: vec3f = mix(vec3f(0.05,0.06,0.09),vec3f(0.45,0.56,0.72),clamp(r.y*0.5+0.5,0.0,1.0));
  let sharpness: f32 = mix(95.0,3.0,rough);
  let key: f32 = pow(max(dot(r,normalize(vec3f(-0.8,1.0,0.8))),0.0),sharpness);
  let rim: f32 = pow(max(dot(r,normalize(vec3f(1.0,0.4,-0.5))),0.0),sharpness*0.7);
  return sky + vec3f(5.5,5.0,4.0)*key + vec3f(1.5,2.8,4.5)*rim;
}
fn fsMain() -> vec4f {
  let base: vec4f = tile(vec2f(0.0,0.0));
  let packed: vec4f = tile(vec2f(0.0,1.0));
  let baked: vec3f = tile(vec2f(1.0,0.0)).xyz*2.0-vec3f(1.0);
  let n: vec3f = normalize(mix(normalize(vNormal),rotateNormal(baked),uUni.values1.x*tile(vec2f(1.0,0.0)).a));
  let v: vec3f = normalize(vec3f(0.0,0.12,1.0));
  let albedo: vec3f = pow(max(base.rgb,vec3f(0.0)),vec3f(2.2));
  let rough: f32 = clamp(packed.g*uUni.values1.y,0.08,1.0);
  let metal: f32 = clamp(packed.b,0.0,1.0);
  let f0: vec3f = mix(vec3f(0.04),albedo,metal);
  let reflected: vec3f = reflect(-v,n);
  let envF: vec3f = fresnel(max(dot(n,v),0.0),f0);
  let emission: vec3f = pow(tile(vec2f(1.0,1.0)).rgb,vec3f(2.2))*uUni.values0.w;
  var color: vec3f = albedo*(1.0-metal)*(0.13+0.2*max(n.y,0.0));
  color += studio(reflected,rough)*envF*(1.0-rough*0.55)*uUni.values1.z;
  color += light(n,v,normalize(vec3f(-0.7,0.9,1.1)),vec3f(3.0,2.7,2.2),albedo,metal,rough);
  color += light(n,v,normalize(vec3f(0.8,0.4,-0.6)),vec3f(1.0,1.9,3.2),albedo,metal,rough);
  color += emission;
  color *= uUni.values0.z;
  color = clamp((color*(2.51*color+vec3f(0.03)))/(color*(2.43*color+vec3f(0.59))+vec3f(0.14)),vec3f(0.0),vec3f(1.0));
  return vec4f(pow(color,vec3f(0.454545)),1.0);
}
