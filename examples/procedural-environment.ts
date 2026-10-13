/**
 * A room as an environment map, computed at start: your lights as glowing areas round
 * the scene plus a soft room gradient, in an equirectangular sheet object shaders sample
 * by direction. No HDRI download, and every light keeps its own channel, so a shader can
 * dim, tint or swap them live. Copy set and limits: procedural-environment.md.
 *
 * Three bands, top to bottom (`ENV_WGSL` reads them):
 *   0  sharp: one light per channel (R, G, B), each a soft-edged disc (radiance 1)
 *   1  rough: the same lights through a broad cosine lobe, at their share of the energy
 *      (rough reflections, and a round thing's diffuse light along its normal)
 *   2  R a fourth light sharp (a rim behind), G the same rough, B the room
 * Values are stored as sqrt(v) for more steps in the darks; square them when sampled.
 */
export type Vec3 = [number, number, number]

export interface AreaLight {
  /** Towards the light from the scene's centre, in view space (Y up, +Z to the camera). */
  direction: Vec3
  /** Angular radius of the glowing area, radians. */
  radius: number
}

export interface EnvironmentLights {
  /** Up to three lights in R, G, B, and a rim light (often behind and above). */
  lights: [AreaLight, AreaLight, AreaLight]
  rim: AreaLight
  /** Sharpness of the rough lobe (cosine power). */
  roughness?: number
  /** A soft window or bright wall, as a direction, its sharpness and strength. */
  window?: { direction: Vec3; power: number; strength: number }
}

export const DEFAULT_ENVIRONMENT: EnvironmentLights = {
  lights: [
    { direction: [-0.55, 0.62, 0.56], radius: 0.24 },
    { direction: [0.78, 0.32, 0.53], radius: 0.24 },
    { direction: [0.05, -0.32, 0.95], radius: 0.3 },
  ],
  rim: { direction: [0.12, 0.55, -0.83], radius: 0.38 },
  roughness: 10,
  window: { direction: [-0.7, 0.45, 0.2], power: 6, strength: 0.5 },
}

const normalise = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** The direction an equirectangular texel looks along (u round from −Z, v down from +Y). */
function direction(u: number, v: number): Vec3 {
  const phi = (u - 0.5) * Math.PI * 2
  const theta = v * Math.PI
  return [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)]
}

function sharp(d: Vec3, area: AreaLight) {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(d, normalise(area.direction)))))
  const edge = area.radius * 0.25
  const t = Math.min(1, Math.max(0, (area.radius + edge - angle) / (2 * edge)))
  return t * t * (3 - 2 * t)
}

function rough(d: Vec3, area: AreaLight, power: number) {
  // The disc's energy (≈ π r²) spread over a cosine-power lobe (2π / (n + 1)).
  const share = (area.radius * area.radius * (power + 1)) / 2
  return Math.pow(Math.max(0, dot(d, normalise(area.direction))), power) * share
}

function room(d: Vec3, window: EnvironmentLights["window"]) {
  const up = d[1]
  const sky = up > 0 ? 0.45 + 0.55 * Math.pow(up, 0.6) : 0.45 * Math.pow(1 + up, 2.2) + 0.04
  const glow = window ? Math.pow(Math.max(0, dot(d, normalise(window.direction))), window.power) * window.strength : 0
  return Math.min(1, sky * 0.85 + glow)
}

/** The sheet as a canvas (`width` × 1.5·`width`) for `loadTexture`. 256 is plenty. */
export function createEnvironment(setup: EnvironmentLights = DEFAULT_ENVIRONMENT, width = 256): HTMLCanvasElement {
  const height = width / 2
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height * 3
  const context = canvas.getContext("2d")
  if (!context) return canvas
  const image = context.createImageData(width, height * 3)
  const power = setup.roughness ?? 10
  const [a, b, c] = setup.lights
  const put = (x: number, y: number, band: number, rgb: Vec3) => {
    const index = ((band * height + y) * width + x) * 4
    rgb.forEach((value, channel) => {
      image.data[index + channel] = Math.round(Math.sqrt(Math.min(1, Math.max(0, value))) * 255)
    })
    image.data[index + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = direction((x + 0.5) / width, (y + 0.5) / height)
      put(x, y, 0, [sharp(d, a), sharp(d, b), sharp(d, c)])
      put(x, y, 1, [rough(d, a, power), rough(d, b, power), rough(d, c, power)])
      put(x, y, 2, [sharp(d, setup.rim), rough(d, setup.rim, power), room(d, setup.window)])
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * The shader side: paste into an object `fsMain` that binds the sheet as `uEnvMap`.
 * Reflections follow the reflected view ray, so highlights slide over a turning object;
 * the room's light follows the normal. Without the fragment's position (`vPosition`,
 * proposed upstream), use `vec3f(0.0, 0.0, -1.0)` as the view direction.
 */
export const ENV_WGSL = /* wgsl */ `
fn envUv(d: vec3f, band: f32) -> vec2f {
  let u: f32 = atan2(d.x, d.z) / 6.2831853 + 0.5;
  let v: f32 = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
  return vec2f(u, (band + clamp(v, 0.004, 0.996)) / 3.0);
}
`
