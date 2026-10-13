# Drawn cables: ropes of rigid links

Cables, leads and cords that bend, swing and stay plugged in, without mesh
deformation. Copy [`drawn-cables.ts`](./drawn-cables.ts) (`Rope`, `linkMesh`) with
a physics world for the objects they plug into (see [physics.md](./physics.md)
and [physics-interaction.md](./physics-interaction.md)).

Shooosh objects can't deform: there's no custom vertex stage and no geometry
update. See [the proposal](../docs/proposals/object-scenes.md) §4. So each cable
is a **Verlet rope** of points simulated in JS, drawn as one `createObject` per
link.

## Setup

1. **A rest path per cable**: points along its centreline, its tube radius and
   colour. Extract them from the source model offline (for a modelled tube:
   order its vertices by geodesic distance from one end and average them in
   rings), then drop the cable mesh from the export.
2. **Plugs**: each end's body index and its point in that body's frame. A cable
   can hang free at one end.
3. **One object per link**, all sharing `linkMesh(rope.link * rope.overlap, radius)`.
4. Each frame, after the physics step:

```ts
rope.step(seconds, poses, obstacles, pointerRay)
rope.poses().forEach(({ position, rotation }, i) => {
  // compose with your view rotation, as for any physics body
  links[i].setTransform({ scale, ...toEuler(rotation), positionX, positionY, positionZ })
})
```

`obstacles` are the bodies' boxes, posed. They act as the rope's own cheap
hitboxes; the rope is never part of an object's collider.

Also tie each cable's two plugged objects with a Rapier **rope joint** as long as
the cable (`JointData.rope`). A light Verlet chain can't hold two heavy objects
apart by itself. Keep the joint's contacts enabled, or the two objects pass
through each other.

## What makes it look right (each one learned the hard way)

- **No gaps:** links are centred between their two points, with round caps, and
  built a little longer than their rest length (`overlap` 1.28). The caps close
  every bend, and the overlap closes stretch. Anchored at one end and built
  longer, links stuck out past every bend like bamboo notches.
- **No dashes near plugs:** a plug often sits *inside* its holder's bounding box
  (a tapered back). Pushing the points beside it out to the box's face stretched
  those links into dashes. The holder's box is ignored within `plugFree` (18 cm)
  of the plug.
- **No cables through objects:** ignoring the holder's box *everywhere* let
  cables run straight through it. Only that near stretch is free.
- **Cheap collisions:** test only boxes whose bounding sphere reaches the rope's
  bounds, and only on the last few of the constraint passes. That cut
  main-thread time about in half (from about 45% to 23% of a frame).
- **Shading:** a moving tube has no baked light. Shade it from its normal (a
  Lambert term per light and the room) with a faint grazing sheen; a strong one
  outlines thin tubes like a halo.

## Measured

Hard pointer sweeps over three 1.0–1.3 m cables, 56 points each:
- worst link stretch 33–50%, typically under 40%. The caps plus 28% overlap close
  up to about 48%.
- points ending up inside a box: none to a few, briefly, where the cluster
  squeezes a cable between touching objects.

## Limits

- Rigid links: a sharp kink shows faceting, so use more points for smoother
  curves. About 55 objects per cable is fine on desktop.
- Pinned plugs, unstretchable links and solid boxes can't always all hold when
  objects squeeze together; the rope gives a little.
- A coiled cord reads better as its modelled mesh cut into a few rigid segments
  on spring-back ball joints ([physics-interaction.md](./physics-interaction.md)).
