/**
 * Shader data comes from .wgsl build imports; see docs/shader-build.md.
 * Cook–Torrance GGX PBR fragment for createObject — examples own the look.
 *
 * How to use:
 *   import { pbrFragment } from "./pbr-shaders"
 *   createObject(null, {
 *     shape: { type: "roundedBox", … },
 *     envMap: env.texture,
 *     shaders: shader,
 *     onFrame(self, frame) {
 *       self.setUni({
 *         value1: t,           // seconds — orbits the key light
 *         value2: metallic,    // 0 dielectric … 1 metal
 *         value3: roughness,   // 0.04 mirror … 1 matte
 *         value5: albedoR,
 *         value6: albedoG,
 *         value7: albedoB,
 *       })
 *     },
 *   })
 *
 * Samples `uEnvMap` for a cheap specular IBL lobe (same binding as object-env).
 * Stays in the WGSL↔GLSL converter subset so both backends run it.
 */

/** Full material + helpers. Pass as `shaders.fragment`. */
export { fragment as pbrFragment } from "./pbr.wgsl"
