/** GPU-only particle state: one independent invocation per particle, no readback. */
const shared = `
struct Params {
  step: vec4f, // dt, time, aspect, reset
  pointer: vec4f, // x, y, active, radius (world units)
  viewport: vec4f, // physical width, height, point radius, unused
}
struct Particle { position: vec2f, velocity: vec2f }
@group(0) @binding(0) var<uniform> u: Params;
`

export const computeShader = shared + `
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
fn home(id: vec2u) -> vec2f {
  let uv = (vec2f(id) + vec2f(0.5)) / 256.0;
  return (uv * 2.0 - 1.0) * vec2f(u.step.z * 0.88, 0.78);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 256u || id.y >= 256u) { return; }
  let index = id.y * 256u + id.x;
  let origin = home(id.xy);
  if (u.step.w > 0.5) {
    particles[index] = Particle(origin, vec2f(0.0));
    return;
  }
  var p = particles[index];
  let t = u.step.y;
  let wave = vec2f(sin(origin.y * 7.0 + t * 0.7), cos(origin.x * 5.0 - t * 0.5)) * 0.025;
  var force = (origin + wave - p.position) * 3.5;
  let away = p.position - u.pointer.xy;
  let distance = length(away);
  let falloff = 1.0 - smoothstep(0.0, u.pointer.w, distance);
  let direction = away / max(distance, 0.002);
  force += (direction * 5.0 + vec2f(-direction.y, direction.x) * 2.2) * falloff * u.pointer.z;
  let dt = u.step.x;
  p.velocity = (p.velocity + force * dt) * exp(-2.2 * dt);
  p.velocity = p.velocity / max(1.0, length(p.velocity) / 2.5);
  p.position += p.velocity * dt;
  particles[index] = p;
}
`

export const displayShader = shared + `
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
}
@vertex fn vsMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0), vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));
  let p = particles[instance];
  let speed = clamp(length(p.velocity) * 1.5, 0.0, 1.0);
  let corner = corners[vertex];
  let radius = u.viewport.z * (1.0 + speed * 0.65);
  var out: Vertex;
  out.position = vec4f(p.position / vec2f(u.step.z, 1.0) + corner * radius * 2.0 / u.viewport.xy, 0.0, 1.0);
  out.uv = corner;
  let base = mix(vec3f(0.13,0.52,0.66), vec3f(0.45,0.84,0.70), f32(instance % 256u) / 255.0);
  out.color = mix(base, vec3f(1.0,0.79,0.35), speed);
  return out;
}
@fragment fn fsMain(in: Vertex) -> @location(0) vec4f {
  let distance = length(in.uv);
  if (distance > 1.0) { discard; }
  let brightness = 1.0 - smoothstep(0.35, 1.0, distance);
  return vec4f(in.color * (0.3 + brightness * 0.7), 1.0);
}
`
