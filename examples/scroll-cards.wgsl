fn sdRoundedBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let id = uUni.values0.y;
  let p = vUv * 2.0 - 1.0;
  let d = sdRoundedBox(p, vec2f(0.82, 0.72), 0.18);
  let fill = 1.0 - smoothstep(-0.02, 0.02, d);
  let edge = 1.0 - smoothstep(0.0, 0.03, abs(d));
  let bands = sin((vUv.x * 6.0 + vUv.y * 4.0) + t * 1.4 + id);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.1);
  color = mix(color, mix(acid, paper, bands * 0.5 + 0.5), fill * 0.92);
  color = mix(color, paper, edge * 0.65);
  return vec4f(color, 1.0);
}
