fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let mouse = vec2f(uUni.values0.y, uUni.values0.z);
  let delta = vUv - mouse;
  let r = length(delta);
  let zoom = mix(1.0, 0.42, exp(-r * r * 22.0));
  let uv = mouse + delta * zoom;
  let q = uv * 2.0 - 1.0;
  let bands = sin(length(q) * 18.0 - t * 1.8);
  let lens = exp(-r * r * 14.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.1 + 0.18 * uv.y);
  color = mix(color, acid, smoothstep(0.15, 0.9, bands * 0.5 + 0.5) * 0.65);
  color = mix(color, paper, lens * 0.12);
  return vec4f(color, 1.0);
}
