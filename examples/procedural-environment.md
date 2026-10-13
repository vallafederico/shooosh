# A procedural environment for object reflections

An environment map computed at start from a list of lights, instead of an HDRI
download: each light is a soft glowing area, and the room is a gradient. Copy
[`procedural-environment.ts`](./procedural-environment.ts).

```ts
import { createEnvironment, ENV_WGSL } from "./procedural-environment"

const environment = await loadTexture(createEnvironment()) // 256 × 384 canvas, ~1 ms
createObject(null, { shape, shaders, envMap: environment, maskMap: yourMaps })
```

## The sheet

It's an equirectangular sheet in three bands, one light per channel, so a shader
can dim, tint or swap each light live (mood changes, shuffles):

| Band | R | G | B |
| --- | --- | --- | --- |
| 0 sharp | light 1 | light 2 | light 3 |
| 1 rough (cosine lobe) | light 1 | light 2 | light 3 |
| 2 | rim, sharp | rim, rough | room (ceiling to floor, a soft window) |

Values are stored as `sqrt(v)`; square them after sampling.

## Sampling

`ENV_WGSL` has `envUv(direction, band)`:
- **Reflections:** along the reflected view ray, so highlights slide over a
  turning object instead of sticking to the screen.
  `reflect(normalize(position − camera), normal)` needs the fragment's position
  ([proposal](../docs/proposals/object-scenes.md) §1); without it, use
  `vec3f(0.0, 0.0, -1.0)` as the view direction.
- **Room light:** along the normal, so up-facing surfaces catch the ceiling.
- **Rough reflections:** mix sharp and rough by roughness.
- **Backlight / rim:** brighten where a surface turns away from the camera toward
  the rim direction, `pow(1 − dot(n, toCamera), 2.5) × facing-the-rim`. It
  separates objects from a dark background.

## Why

- **Matched lighting:** a matcap baked from one view stops matching as soon as
  objects tumble. A direction-sampled environment stays right from every angle.
- **Lights that line up with a bake:** derive the sheet from the same light list
  you bake with (see [baked-lighting.md](./baked-lighting.md)), so baked shading
  and live reflections agree.

## Limits

- Directions are in view space. If you turn the arrangement for the camera (one
  fixed camera per object), the lights stay put relative to the viewer, as studio
  lights would.
- The objects' 2 textures: this sheet takes `envMap`, so your own maps go in
  `maskMap`.
