fn fsMain() -> vec4f {
  let fill: vec4f = uUni.values0;
  let radii: vec4f = uUni.values1;
  let size: vec2f = uUni.values2.xy;
  let right: f32 = step(0.5, vUv.x);
  let bottom: f32 = step(0.5, vUv.y);
  let radius: f32 = mix(mix(radii.x, radii.y, right), mix(radii.w, radii.z, right), bottom);
  let px: vec2f = vUv * max(size, vec2f(1.0));
  let halfSize: vec2f = size * 0.5;
  let q: vec2f = abs(px - halfSize) - halfSize + vec2f(radius);
  let d: f32 = min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
  let alpha: f32 = 1.0 - smoothstep(-1.0, 1.0, d);
  let a: f32 = fill.a * alpha;
  return vec4f(fill.rgb * a, a);
}
