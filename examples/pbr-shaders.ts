/**
 * Cook–Torrance GGX PBR fragment for createObject — examples own the look.
 *
 * How to use:
 *   import { pbrFragment } from "./pbr-shaders"
 *   createObject(null, {
 *     shape: { type: "roundedBox", … },
 *     envMap: env.texture,
 *     shaders: { fragment: pbrFragment },
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
export const pbrFragment = `
fn DistributionGGX(NdotH: f32, roughness: f32) -> f32 {
  let a = max(roughness * roughness, 0.001);
  let a2 = a * a;
  let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d + 0.0001);
}

fn GeometrySchlickGGX(NdotX: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotX / (NdotX * (1.0 - k) + k + 0.0001);
}

fn GeometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
  return GeometrySchlickGGX(NdotV, roughness) * GeometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
  let one = vec3f(1.0, 1.0, 1.0);
  return F0 + (one - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn envSample(dir: vec3f) -> vec3f {
  let d = normalize(dir);
  let uv = d.xy * 0.5 + vec2f(0.5, 0.5);
  return textureSample(uEnvMap, uSampler, uv).rgb;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let metallic = clamp(uUni.values0.y, 0.0, 1.0);
  let roughness = clamp(uUni.values0.z, 0.045, 1.0);
  let albedo = vec3f(uUni.values1.x, uUni.values1.y, uUni.values1.z);

  let N = normalize(vNormal);
  let V = normalize(vec3f(0.0, 0.2, 1.0));
  let L = normalize(vec3f(sin(t * 0.65) * 0.85, 0.65, cos(t * 0.65) * 0.85));
  let H = normalize(V + L);

  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.001);
  let NdotH = max(dot(N, H), 0.0);
  let HdotV = max(dot(H, V), 0.0);

  let F0base = vec3f(0.04, 0.04, 0.04);
  let F0 = mix(F0base, albedo, metallic);
  let D = DistributionGGX(NdotH, roughness);
  let G = GeometrySmith(NdotV, NdotL, roughness);
  // Direct specular uses the half-vector Fresnel; IBL uses NdotV so dark
  // sides still pick up the env lobe (key-light HdotV under-fills there).
  let F = fresnelSchlick(HdotV, F0);
  let Fenv = fresnelSchlick(NdotV, F0);

  let one = vec3f(1.0, 1.0, 1.0);
  let kS = F;
  let kD = (one - kS) * (1.0 - metallic);
  let specular = (D * G * F) / (4.0 * NdotV * NdotL + 0.0001);
  let lightColor = vec3f(3.2, 2.9, 2.5);
  let Lo = (kD * albedo / 3.14159265 + specular) * lightColor * NdotL;

  let R = reflect(-V, N);
  let env = envSample(R);
  let envStrength = mix(0.35, 1.15, metallic) * (1.0 - roughness * 0.85);
  let ambient = kD * albedo * 0.12 + env * Fenv * envStrength;

  var color = Lo + ambient;
  color = color / (color + one);
  color = pow(color, vec3f(0.45454545, 0.45454545, 0.45454545));
  return vec4f(color, 1.0);
}
`.trim()
