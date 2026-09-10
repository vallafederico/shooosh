# shooosh landing page — content outline

Working content direction, combining the current engine and the intended product experience. Availability notes below guide publication; they are not proposed marketing copy.

## Core story

**From an idea to an interactive GPU experience, built for the web and the agents building it.**

The page should move from possibility to understanding to action: show what people can create, explain how it runs, demonstrate how they build it, and offer examples they can use immediately.

## 1. Intro — A little more extraordinary.

> GPU graphics for the websites you imagine.
>
> Build interactive shaders, images, interfaces, particles and 3D experiences with a WGSL-first engine, WebGPU and WebGL2 support, and workflows designed for coding agents.

Content:

- One strong interactive hero that demonstrates shooosh.
- A few selectable looks, with a **View source** affordance.
- Primary action: **Explore examples**.
- Secondary action: **Start building**.
- Copyable install command: `npm install shooosh`.
- GitHub link: <https://github.com/vallafederico/shooosh>.
- Small proof line: **WGSL-first · Two renderers · Zero browser runtime dependencies**.

The visual itself is the mini presentation. Keep the introductory copy short enough to leave room for it.

## 2. Features — Your page, with GPU superpowers.

Organise around what people can make. Give each capability a small live preview and a link to a complete recipe.

### Living backgrounds

Procedural gradients, noise, raymarched scenes, ambient effects and pointer interactions.

### Your DOM, reimagined

Mirror supported page elements into a GPU layer, track layout and scrolling, and add visual effects while preserving native interaction.

### Interactive images and interfaces

Pointer responses, hover effects, distortion and transitions connected to real page elements.

### Sharp text and shapes

Automatic SDF/MSDF preparation for supported text, icons and artwork, enabling crisp edges, outlines, glows and animated reveals.

### 3D on the page

Textured objects, lighting, materials and interactive product views.

### Motion at scale

Particles, GPU simulations and physics recipes.

### The finishing touches

Bloom, grain, antialiasing and composable post-processing.

Explain near the previews that visual looks are editable example code. Backend requirements and experimental status belong beside the relevant recipe.

## 3. Interactive demonstration — Same page. Another layer of possibility.

Show a small composition with an image, heading, icon and input. Let visitors switch between **Native / GPU**, then try hover, typing, scrolling and effect controls.

The demonstration should communicate:

- GPU visuals stay aligned with supported page elements.
- Native elements retain their interaction responsibilities.
- Text and icons can use distance-field effects.
- Visual treatment can change while the underlying page remains usable.

This section makes DOM mirroring, interaction and SDF/MSDF tangible before introducing the technical pipeline. Match the demonstration to implemented support and label prototype portions explicitly.

## 4. Pipeline — One API. Choose how it runs.

> Target WebGPU, target WebGL2, or ship both and let the browser’s capabilities decide.

Show three selectable paths:

| Build | What you ship | Runtime behaviour |
| --- | --- | --- |
| **Automatic** | Both renderers and matching shader variants | Prefer WebGPU; fall back to WebGL2 when WebGPU initialisation is unavailable |
| **WebGPU only** | WebGPU renderer and matching shader output | Requires WebGPU; excludes the WebGL2 fallback |
| **WebGL2 only** | WebGL2 renderer and matching shader output | Requires WebGL2; excludes WebGPU |

Visual flow:

**Author WGSL → prepare shaders at build time → render in the browser**

Supporting content:

- Shared scene, item and layer APIs across the renderers.
- Optional features stay separate; import what the page uses.
- Shader translation stays out of the default browser bundle.
- Native page content remains readable when GPU rendering is unavailable.
- Build target selection removes the excluded renderer; runtime selection alone does not remove it from emitted files.

A compact bundle comparison can make this concrete. Publish measured sizes with the consumer configuration, compression method and asset exclusions stated.

Scope the shader promise to supported translation paths. Compute simulations and some experimental effects have their own backend requirements; automatic renderer selection does not create a fallback for every effect.

## 5. Workflow — Made for the way you build now.

> Give your agent a page, an asset and an idea. Explicit APIs, asset tools and complete examples help it prepare, connect and verify the result.

Make agent-first development a concrete journey:

1. **Describe the interaction.** Start from a visual intention or an existing example.
2. **Prepare the assets.** Inspect, convert and optimise models and textures; generate distance-field assets where appropriate; compare the results.
3. **Build the look.** Adapt shaders, connect model parts, and bind visuals to the page.
4. **Verify and ship.** Check rendering, interaction, cleanup and backend behaviour.

### Four entry points

| Start with | Workflow |
| --- | --- |
| **DOM** | Bind elements → mirror supported visuals → apply shaders → retain native behaviour |
| **Images, text and icons** | Import → prepare textures or SDF/MSDF assets → style and animate |
| **3D models** | Inspect → convert and optimise → generate typed part controls → interact |
| **Shaders** | Author or adapt → translate supported shader code → build for the selected backend |

### Example agent brief

> Turn this model into a draggable product hero, optimise its textures, and add a subtle shader background. Connect the page’s image and heading to the visual treatment while keeping the page usable.

Show the ingredients the agent receives:

- Machine-readable documentation and task-oriented entry points.
- Explicit API and shader contracts.
- Complete recipes with dependencies, mount instructions and cleanup.
- Model and texture inspection, conversion and verification tools.
- SDF/MSDF generation tools and the intended automatic preparation workflow.
- Backend limits and validation guidance.

### Supporting workflow details

- **Models:** source asset → inspected geometry → optimised asset → typed part controls.
- **Images:** inspect → convert/compress → compare → use.
- **Text and icons:** source font or artwork → distance-field generation → atlas/texture → shader styling.
- **Shaders:** author WGSL, or adapt existing GLSL with the supported translation tools and agent guidance → prepare output for the target backend.

Present asset preparation as optional tooling in the shooosh ecosystem. Model conversion and image codecs run during preparation, outside the browser runtime.

## 6. Examples — Start somewhere interesting.

A generous visual gallery with a small selection of contrasting experiences:

- Refractive glass.
- Curl particles.
- Volumetric clouds.
- DOM image distortion and interaction.
- SDF/MSDF text and icons.
- A 3D product studio.
- Scroll-bound effects.

Every example should expose **Live demo · Source · Copy guide · Backend support**.

Primary action: **Explore all examples**.

Current gallery destination: <https://shooosh-web.vercel.app/examples>.

## 7. In use — Out in the wild.

Feature real websites with a screenshot or short recording and one sentence describing what shooosh contributes.

Each entry contains:

- Project name.
- The interaction or visual contribution.
- A live website link.

Until enough external projects are available, use **What you can build** with clearly labelled showcases. Add **Submit your site** when there is a submission destination.

## 8. Closing — What will you make move?

Repeat **Start building**, **Explore examples**, and **GitHub**, with a direct **Agent docs** link and the install command.

Optional supporting line:

> Start with a look. Make it yours. Put it on the page.

## Availability and publication notes

Keep the full ambition visible while distinguishing available features, unreleased work and planned capabilities. Verify the release and hosted documentation before publishing final claims.

| Capability | Current basis | How to present it |
| --- | --- | --- |
| Dual renderers and backend-specific builds | Implemented in the repository | Explain automatic selection and build-time exclusion separately |
| DOM mirroring | Public DOM image binding and tracking exist | Say **supported elements**; do not imply arbitrary HTML capture |
| Broader DOM interaction | Input mirroring is a source-only prototype with native fallback for unsupported cases | Label the interface demonstration as a prototype where applicable |
| SDF/MSDF | Node/Bun generation tools for fonts, icons and distance-field assets exist | Describe existing generation tools accurately |
| Automatic SDF/MSDF preparation | Intended integrated workflow | Label automatic integration as planned until implemented; define supported inputs |
| Model and texture workflows | Optional tools are documented as unreleased | Identify the separate tooling and release status |
| Rig utilities | Bone, pose, sampling, socket and palette utilities exist | Do not imply automatic skinned-mesh rendering |
| Visual effects | Copyable recipes; some are experimental or WebGPU-only | Put status and backend support beside each example |
| Shader translation | Build-time translation supports a defined fragment subset | Avoid implying universal conversion of compute, vertex or post shaders |

Keep a small **Coming next** strip near the footer for shader hot swapping, named uniforms, richer shader tooling, broader DOM support and automatic asset preparation. Reconcile this list with implementation status before publication.

## Repository references

- [Machine index](../llms.txt)
- [Example catalog](../examples/README.md)
- [Agent-first workflows](./agent-first.md)
- [Model, texture and rig entry guide](./agent-usage.md)
- [DOM guide](./dom.md)
- [SDF/MSDF guide](./msdf.md)
- [Build-time shaders](./shader-build.md)
- [Backend builds and bundle measurements](./bundle-setup.md)
- [Roadmap](../ROADMAP.md)
