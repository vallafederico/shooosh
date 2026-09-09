/** Analytic curl of a smooth 3D vector potential, evaluated entirely in WGSL. */
const shared = `
struct Params { step: vec4f, pointer: vec4f, viewport: vec4f }
struct Particle { position: vec4f, velocity: vec4f }
@group(0) @binding(0) var<uniform> u: Params;
fn fit() -> f32 { return min(1.0, u.step.z) * 0.84; }
`
export const computeShader = shared + `
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
fn hash(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += vec3f(dot(q, q.yzx + vec3f(33.33)));
  return fract((q.x + q.y) * q.z) * 2.0 - 1.0;
}
// Exact derivative of quintic-interpolated lattice value noise.
fn noiseGradient(p: vec3f) -> vec3f {
  let cell = floor(p);
  let f = fract(p);
  let w = f * f * f * (f * (f * 6.0 - vec3f(15.0)) + vec3f(10.0));
  let dw = 30.0 * f * f * (f - vec3f(1.0)) * (f - vec3f(1.0));
  var gradient = vec3f(0.0);
  for (var i = 0u; i < 8u; i++) {
    let corner = vec3f(f32(i & 1u), f32((i >> 1u) & 1u), f32((i >> 2u) & 1u));
    let weight = mix(vec3f(1.0) - w, w, corner);
    let derivative = dw * (corner * 2.0 - vec3f(1.0));
    gradient += hash(cell + corner) * vec3f(derivative.x * weight.y * weight.z, weight.x * derivative.y * weight.z, weight.x * weight.y * derivative.z);
  }
  return gradient;
}
fn curl(p: vec3f) -> vec3f {
  let gx = noiseGradient(p + vec3f(17.1, 3.7, 9.2));
  let gy = noiseGradient(p + vec3f(5.3, 29.4, 2.8));
  let gz = noiseGradient(p + vec3f(11.9, 8.6, 37.5));
  return vec3f(gz.y - gy.z, gx.z - gz.x, gy.x - gx.y);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 256u || id.y >= 128u) { return; }
  let index = id.y * 256u + id.x;
  if (u.step.w > 0.5) {
    // Fibonacci sphere: deterministic, approximately uniform surface coverage.
    let y = 1.0 - 2.0 * (f32(index) + 0.5) / 32768.0;
    let radius = sqrt(max(0.0, 1.0 - y * y));
    let angle = f32(index) * 2.39996323;
    particles[index] = Particle(vec4f(vec3f(cos(angle) * radius, y, sin(angle) * radius) * 0.82, 1.0), vec4f(0.0));
    return;
  }
  var particle = particles[index];
  let p = particle.position.xyz;
  let normal = p / max(length(p), 0.0001);
  let drift = vec3f(u.step.y * 0.12, -u.step.y * 0.09, u.step.y * 0.07);
  let flow = curl(p * 2.4 + drift) * 0.7 + curl(p * 4.8 - drift * 0.6) * 0.22;
  let tangent = flow - normal * dot(flow, normal);
  var force = tangent * 0.7 + normal * (0.82 - length(p)) * 12.0;
  let away = p.xy - u.pointer.xy / fit();
  let distance = length(away);
  let influence = (1.0 - smoothstep(0.0, 0.36, distance)) * u.pointer.z * smoothstep(-0.4, 0.35, p.z);
  let direction = away / max(distance, 0.002);
  force += vec3f(direction * 6.0 + vec2f(-direction.y, direction.x) * 3.0, 2.0) * influence;
  let dt = u.step.x;
  var velocity = (particle.velocity.xyz + force * dt) * exp(-1.6 * dt);
  velocity /= max(1.0, length(velocity) / 1.8);
  particle.position = vec4f(p + velocity * dt, 1.0);
  particle.velocity = vec4f(velocity, 0.0);
  particles[index] = particle;
}
`
export const displayShader = shared + `
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) color: vec3f }
@vertex fn vsMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0), vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));
  let particle = particles[instance];
  let p = particle.position.xyz;
  let speed = clamp(length(particle.velocity.xyz) * 1.2, 0.0, 1.0);
  let front = clamp(p.z / 1.64 + 0.5, 0.0, 1.0);
  let corner = corners[vertex];
  let size = u.viewport.z * (0.65 + front * 0.45);
  var out: Vertex;
  out.position = vec4f(p.xy * fit() / vec2f(u.step.z, 1.0) + corner * size * 2.0 / u.viewport.xy, clamp(0.5 - p.z * 0.2, 0.01, 0.99), 1.0);
  out.uv = corner;
  let hue = clamp(p.y * 0.5 + 0.5, 0.0, 1.0);
  let base = mix(vec3f(0.10,0.38,0.9), vec3f(0.36,0.95,0.8), hue);
  out.color = mix(base, vec3f(1.0,0.71,0.42), speed * 0.65) * (0.3 + front * 1.2);
  return out;
}
@fragment fn fsMain(in: Vertex) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  return vec4f(in.color * (1.0 - smoothstep(0.25, 1.15, d)), 1.0);
}
`
