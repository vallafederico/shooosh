import type { Quaternion } from "shooosh/utils"

/**
 * Cables drawn live: a Verlet rope per cable, rendered as one `createObject` per link.
 * Copy set and limits: drawn-cables.md.
 *
 * Shooosh objects can't deform (no custom vertex stage, no geometry updates), so a cable
 * is many rigid links. Each link is a short tube with round ends, centred between its two
 * points and built a little longer than its rest length: the round caps close every bend,
 * and the overlap closes stretch. The rope has no gravity (it keeps the lie it was
 * given), is pinned at either end to a plug on a physics body, is pushed out of the
 * bodies' boxes, and by the pointer.
 */
export type Vec3 = [number, number, number]

/** The pointer as a ray into the scene (world metres) and its velocity (m/s). */
export interface PointerRay {
  origin: Vec3
  direction: Vec3
  velocity: Vec3
}

const ROPE = {
  /** Points per cable (links = points - 1). */
  points: 56,
  /** Velocity kept per step, constraint passes, and how stiffly it resists bending (0–1). */
  keep: 0.94,
  passes: 16,
  /** On how many of the last passes the boxes push the rope out. */
  collide: 4,
  bend: 0.25,
  /** Pointer: reach (m), push out (m/s²), drag (share of its velocity). */
  reach: 0.12,
  push: 3,
  drag: 0.6,
  /** Tube sides and cap rings. */
  sides: 8,
  rings: 3,
  /**
   * Each link's tube is centred between its two points and built this much longer than
   * its rest length: the extra (about 3 mm a side, near the cap's radius) hides inside
   * the neighbour's round cap, and overlap plus caps close a stretch of up to ~48% (the
   * worst measured under hard sweeps: 33–50%, typically under 40%). Anchored at one end and longer, links stuck
   * straight out past every bend (notches).
   */
  overlap: 1.28,
  /**
   * How far along the rope from a plug (metres) it may pass through its holder's box: a
   * plug often sits inside its holder's bounding box (e.g. a tapered back), and pushing the
   * points beside it out stretched those links into dashes. Beyond this the holder's box
   * holds the rope out like any other (or cables run through what they plug into).
   */
  plugFree: 0.18,
}

/** A cable's rest path (e.g. a centreline extracted from the model), tube radius and colour. */
export interface CablePath {
  name: string
  points: Vec3[]
  radius: number
  colour: Vec3
}

/** Where a rope's end is held: a body, and the plug in that body's frame. */
export interface Plug {
  body: number
  local: Vec3
}

/** A body's pose and box (its own frame) for the ropes to stay out of. */
export interface Obstacle {
  /** The body it belongs to: a rope ignores the bodies it plugs into. */
  body: number
  position: Vec3
  rotation: Quaternion
  min: Vec3
  max: Vec3
}

function rotate(v: Vec3, q: Quaternion): Vec3 {
  const [x, y, z] = v
  const ix = q.w * x + q.y * z - q.z * y
  const iy = q.w * y + q.z * x - q.x * z
  const iz = q.w * z + q.x * y - q.y * x
  const iw = -q.x * x - q.y * y - q.z * z
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  ]
}

function unrotate(v: Vec3, q: Quaternion): Vec3 {
  return rotate(v, { x: -q.x, y: -q.y, z: -q.z, w: q.w })
}

/** A rotation from orthonormal axes (columns x, y, z). */
function fromAxes(x: Vec3, y: Vec3, z: Vec3): Quaternion {
  const trace = x[0] + y[1] + z[2]
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return { w: 0.25 / s, x: (y[2] - z[1]) * s, y: (z[0] - x[2]) * s, z: (x[1] - y[0]) * s }
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2])
    return { w: (y[2] - z[1]) / s, x: 0.25 * s, y: (y[0] + x[1]) / s, z: (z[0] + x[2]) / s }
  }
  if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2])
    return { w: (z[0] - x[2]) / s, x: (y[0] + x[1]) / s, y: 0.25 * s, z: (z[1] + y[2]) / s }
  }
  const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1])
  return { w: (x[1] - y[0]) / s, x: (z[0] + x[2]) / s, y: (z[1] + y[2]) / s, z: 0.25 * s }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1))

/** The path resampled to `count` points at equal steps along it. */
function resample(points: Vec3[], count: number) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    lengths.push((lengths[i - 1] ?? 0) + (a && b ? Math.hypot(...sub(b, a)) : 0))
  }
  const total = lengths[lengths.length - 1] ?? 0
  const out: Vec3[] = []
  let j = 1
  for (let k = 0; k < count; k++) {
    const at = (total * k) / (count - 1)
    while (j < points.length - 1 && (lengths[j] ?? 0) < at) j++
    const a = points[j - 1] ?? [0, 0, 0]
    const b = points[j] ?? a
    const span = (lengths[j] ?? 0) - (lengths[j - 1] ?? 0)
    const t = span > 0 ? (at - (lengths[j - 1] ?? 0)) / span : 0
    out.push(add(a, scale(sub(b, a), Math.min(1, Math.max(0, t)))))
  }
  return { points: out, length: total }
}

/**
 * One link's mesh: a tube of `radius` along +Y, centred on its origin (−length/2 to
 * +length/2), capped with half spheres, stride 8 (position, normal, UV; the UV is unused:
 * the sheet is one colour).
 */
export function linkMesh(length: number, radius: number) {
  const { sides, rings } = ROPE
  const vertices: number[] = []
  const indices: number[] = []
  // Rows bottom cap pole → bottom ring … top ring → top cap pole, as latitude angles.
  const rows: { y: number; lat: number }[] = []
  const half = length / 2
  for (let r = rings; r >= 1; r--) rows.push({ y: -half, lat: -(Math.PI / 2) * (r / rings) })
  rows.push({ y: -half, lat: 0 }, { y: half, lat: 0 })
  for (let r = 1; r <= rings; r++) rows.push({ y: half, lat: (Math.PI / 2) * (r / rings) })
  for (const { y, lat } of rows) {
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2
      const n: Vec3 = [Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)]
      vertices.push(n[0] * radius, y + n[1] * radius, n[2] * radius, ...n, 0, 0)
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * (sides + 1) + s
      const b = a + sides + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), vertexStride: 8 as const }
}

/** One cable: its rope and each link's pose for the frame. */
export class Rope {
  readonly name: string
  readonly radius: number
  readonly colour: Vec3
  readonly link: number
  /** How much longer each link's tube is than its rest length (`ROPE.overlap`). */
  readonly overlap = ROPE.overlap
  #now: Vec3[]
  #before: Vec3[]
  #ends: [Plug | null, Plug | null]

  /** `points` in the physics world's frame; `ends` the plugs holding either end. */
  constructor(path: CablePath, points: Vec3[], ends: [Plug | null, Plug | null]) {
    const { points: rope, length } = resample(points, ROPE.points)
    this.name = path.name
    this.radius = path.radius
    this.colour = path.colour
    this.link = length / (ROPE.points - 1)
    this.#now = rope
    this.#before = rope.map((point) => [...point])
    this.#ends = ends
  }

  get links() {
    return ROPE.points - 1
  }

  /** One step of `seconds`: move, then hold to the plugs, the link lengths, out of the boxes. */
  step(seconds: number, poses: { position: Vec3; rotation: Quaternion }[], obstacles: Obstacle[], pointer: PointerRay | null) {
    const now = this.#now
    const before = this.#before
    for (let i = 0; i < now.length; i++) {
      const p = now[i]
      const q = before[i]
      if (!p || !q) continue
      let next = add(p, scale(sub(p, q), ROPE.keep))
      if (pointer) next = add(next, this.#pointer(p, pointer, seconds))
      before[i] = p
      now[i] = next
    }
    const plugs = this.#ends.map((end) => {
      const pose = end ? poses[end.body] : undefined
      return end && pose ? add(pose.position, rotate(end.local, pose.rotation)) : null
    })
    const last = now.length - 1
    const near = this.#near(obstacles)
    for (let pass = 0; pass < ROPE.passes; pass++) {
      if (plugs[0]) now[0] = plugs[0]
      if (plugs[1]) now[last] = plugs[1]
      for (let i = 0; i < last; i++) this.#hold(i, i + 1, this.link, 0.5)
      for (let i = 0; i < last - 1; i++) this.#hold(i, i + 2, this.link * 2, ROPE.bend * 0.5)
      // The boxes on the last few passes only: the links settle first, then step out.
      if (pass < ROPE.passes - ROPE.collide || !near.length) continue
      for (let i = 1; i < last; i++) {
        const p = now[i]
        if (p) now[i] = this.#outside(p, near, i)
      }
    }
    if (plugs[0]) now[0] = plugs[0]
    if (plugs[1]) now[last] = plugs[1]
  }

  /** Each link's middle and rotation (+Y along it), with frames carried link to link. */
  poses() {
    const out: { position: Vec3; rotation: Quaternion }[] = []
    let side: Vec3 = [1, 0, 0]
    for (let i = 0; i < this.#now.length - 1; i++) {
      const a = this.#now[i]
      const b = this.#now[i + 1]
      if (!a || !b) continue
      const y = norm(sub(b, a))
      // Parallel transport: the last side, made square to this link.
      let x = sub(side, scale(y, dot(side, y)))
      if (Math.hypot(...x) < 1e-4) x = Math.abs(y[0]) < 0.9 ? cross([1, 0, 0], y) : cross([0, 1, 0], y)
      x = norm(x)
      const z = cross(x, y)
      side = x
      out.push({ position: scale(add(a, b), 0.5), rotation: fromAxes(x, y, z) })
    }
    return out
  }

  /** Moves points `i` and `j` towards `rest` apart (a share each; plugged ends stay). */
  #hold(i: number, j: number, rest: number, share: number) {
    const a = this.#now[i]
    const b = this.#now[j]
    if (!a || !b) return
    const delta = sub(b, a)
    const distance = Math.hypot(...delta) || 1e-6
    const fix = scale(delta, ((distance - rest) / distance) * share)
    const last = this.#now.length - 1
    const pinnedA = i === 0 && !!this.#ends[0]
    const pinnedB = j === last && !!this.#ends[1]
    if (!pinnedA) this.#now[i] = add(a, pinnedB ? scale(fix, 2) : fix)
    if (!pinnedB) this.#now[j] = sub(b, pinnedA ? scale(fix, 2) : fix)
  }

  /**
   * The boxes worth testing this step, each with its bounding sphere: those whose sphere
   * reaches the rope's bounds (its holders' too: `#outside` frees only the stretch next
   * to each plug, `plugFree`).
   */
  #near(obstacles: Obstacle[]) {
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const p of this.#now) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k] ?? 0, p[k] ?? 0)
        hi[k] = Math.max(hi[k] ?? 0, p[k] ?? 0)
      }
    }
    const out: (Obstacle & { reach: number })[] = []
    for (const box of obstacles) {
      const reach = Math.hypot(...[0, 1, 2].map((k) => Math.max(Math.abs(box.min[k] ?? 0), Math.abs(box.max[k] ?? 0)))) + this.radius
      const gap = Math.hypot(...[0, 1, 2].map((k) => Math.max(0, (lo[k] ?? 0) - (box.position[k] ?? 0), (box.position[k] ?? 0) - (hi[k] ?? 0))))
      if (gap <= reach) out.push({ ...box, reach })
    }
    return out
  }

  /** A point inside a box (grown by the cable's radius) leaves by its nearest face. */
  #outside(point: Vec3, obstacles: (Obstacle & { reach: number })[], index: number): Vec3 {
    let p = point
    const fromStart = index * this.link
    const fromEnd = (this.#now.length - 1 - index) * this.link
    for (const box of obstacles) {
      if (box.body === this.#ends[0]?.body && fromStart < ROPE.plugFree) continue
      if (box.body === this.#ends[1]?.body && fromEnd < ROPE.plugFree) continue
      const dx = p[0] - box.position[0]
      const dy = p[1] - box.position[1]
      const dz = p[2] - box.position[2]
      if (dx * dx + dy * dy + dz * dz > box.reach * box.reach) continue
      const local = unrotate(sub(p, box.position), box.rotation)
      let axis = -1
      let depth = Infinity
      let target = 0
      for (let k = 0; k < 3; k++) {
        const lo = (box.min[k] ?? 0) - this.radius
        const hi = (box.max[k] ?? 0) + this.radius
        const v = local[k] ?? 0
        if (v <= lo || v >= hi) {
          axis = -2
          break
        }
        if (v - lo < depth) [axis, depth, target] = [k, v - lo, lo]
        if (hi - v < depth) [axis, depth, target] = [k, hi - v, hi]
      }
      if (axis < 0) continue
      local[axis] = target
      p = add(box.position, rotate(local, box.rotation))
    }
    return p
  }

  /** The pointer's push out from its ray and drag, as a displacement for this step. */
  #pointer(p: Vec3, pointer: PointerRay, seconds: number): Vec3 {
    const along = dot(sub(p, pointer.origin), pointer.direction)
    if (along <= 0) return [0, 0, 0]
    const away = sub(sub(p, pointer.origin), scale(pointer.direction, along))
    const distance = Math.hypot(...away)
    if (distance >= ROPE.reach) return [0, 0, 0]
    const t = 1 - distance / ROPE.reach
    const falloff = t * t * (3 - 2 * t)
    const out = scale(away, (ROPE.push * falloff * seconds * seconds) / Math.max(distance, 1e-3))
    return add(out, scale(pointer.velocity, ROPE.drag * falloff * seconds))
  }
}
