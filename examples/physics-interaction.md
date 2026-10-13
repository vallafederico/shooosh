# Physics interaction: pointer, joints, stir and idle life

Extends [physics.md](./physics.md) (Rapier + `createObject`) for a floating,
touchable cluster: zero gravity, a pull to the centre, a pointer that pushes and
spins things, jointed parts, and life when nobody touches it. These are code
excerpts from the unisn.co `/webgl` scene.

## The world

```ts
const world = new RAPIER.World({ x: 0, y: 0, z: 0 }) // floating: no gravity
world.timestep = 1 / 120              // small steps keep light jointed chains closed
world.numSolverIterations = 12
// Each step: per body, an impulse towards the centre plus a slow swirl about Y,
// with linear damping ~1.8 and angular ~0.75 so things settle.
body.applyImpulse({ x: -x * attract * m * dt + -z * swirl * m * dt, … }, true)
```

Use each body's bounding box as its collider: cheap, and stable for tumbling.
Bodies whose pieces overlap at rest can be **compound bodies**, with one collider
per piece.

## The pointer as a ray

Unproject the hovered pixel into a world ray through the camera. Bodies within
`reach` of the ray are:
- **pushed out** from it, with a smooth falloff;
- **dragged** with the pointer's motion;
- **spun** about the axis a stroke of the hand would turn them:
  `(away-from-ray × pointer velocity)`, plus a little random wobble, so a nudge
  reads as touching an object, not a magnet.

```ts
const turn = SPIN * falloff * dt
body.setAngvel({ x: w.x + (uy * vz - uz * vy) * turn + noise(), … }, true)
```

Fade the ray's velocity out about 0.25 s after the last pointer move, so a
parked cursor rests.

## Joints and contact rules

- **Ball joints** (`JointData.spherical`) for parts that swing, like a phone's
  cord segments. Disable contacts between jointed neighbours
  (`setContactsEnabled(false)`).
- **Spring back to a rest lie:** each step, nudge the two bodies' relative
  rotation back toward how they started, mostly on the lighter body. That makes
  a cord that keeps its shape:

  ```ts
  let rel = multiply(conjugate(qa), qb)        // the turn between them, in a's frame
  const angle = 2 * atan2(|rel.xyz|, rel.w)
  // error (world) = qa · (rel.xyz · angle / sin) · qa*; then
  // Δω = (stiffness · error + damping · (ωb − ωa)) · dt, shared by inverse mass
  ```
- **Rope joints** (`JointData.rope`) to cap how far two objects can drift, e.g.
  the two ends of a cable. **Keep contacts on** for ropes, or the two objects
  pass through each other.
- **Contact hooks** to say who touches whom: set
  `ActiveHooks.FILTER_CONTACT_PAIRS` on the colliders that need rules, and pass
  `{ filterContactPair, filterIntersectionPair }` to `world.step(undefined, hooks)`.
  Return `null` to ignore a pair. Here, cables never touch each other or what
  they plug into.

## Stir: the view's turn as a force

When the camera turns, by drag or by following the mouse, take the turn since
the last frame as an angular velocity in world axes. Ease each body toward a
share of that motion, so the cluster swings with the view:

```ts
let d = multiply(conjugate(viewBefore), viewNow) // the turn, in the world's frame
const rate = (2 * atan2(|d.xyz|, d.w)) / |d.xyz| / dt // ω = d.xyz · rate
// per body: want = gain · (ω × r); v += (want − v) · min(1, dt / 0.25) · 0.5
```

**Ease, don't push.** Added as an impulse every frame, the turn built up 60× a
second and flung the cluster apart.

## Idle life

After the user leaves it alone for a random 2–5 s, nudge one to three random
bodies with a push and a spin; repeat after each new wait. Count "untouched" as
no drag and the mouse still for over a second. A cursor resting over a
full-page canvas is still "over" it, so don't use hover. Waiting for the
cluster to go still never fired, because the swirl and the cords never settle.

## View that follows the mouse

For pages with UI on top, replace drag-to-rotate with an eased follow:
`yaw = base − nx · π/2`, `pitch = base + ny · π/2` (clamped), with `nx`/`ny` the
pointer in −1…1, eased about 4.5% per frame. Listen on `window`, since the UI
covers parts of the canvas, and drop wheel zoom so the page still scrolls.
