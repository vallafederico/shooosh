fn sdCapsule(p: vec2f, radius: f32) -> f32 {
  let a = vec2f(0.5, 0.28);
  let b = vec2f(0.5, 0.72);
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let d = sdCapsule(vUv, 0.16);
  let fill = 1.0 - smoothstep(-0.01, 0.01, d);
  let edge = 1.0 - smoothstep(0.0, 0.02, abs(d));
  let n = sin((vUv.x + vUv.y) * 18.0 + t * 2.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.08);
  color = mix(color, mix(acid, paper, n * 0.5 + 0.5), fill);
  color = mix(color, paper, edge);
  return vec4f(color, 1.0);
}
