/**
 * Bloom + grain + FXAA as applyEffect snippets — examples own the look.
 *
 * How to use:
 *   const scene = createScene(canvas, { screen: { shaders: { fragment } } })
 *   await scene.getInitPromise()
 *   const post = createPostProcessor()
 *   post.addFragmentEffect({
 *     fragmentShader: bloomEffect,          // GLSL — WebGL2
 *     fragmentShaderWgsl: bloomEffectWgsl,  // WGSL — WebGPU
 *     uni: { value1: 0.75, value2: 0.5, value3: 1.5 },
 *   })
 *   // Optional AA — usually after bloom, before grain:
 *   post.addFragmentEffect({
 *     fragmentShader: fxaaEffect,
 *     fragmentShaderWgsl: fxaaEffectWgsl,
 *     uni: { value1: 1, value2: 0.125 },
 *   })
 *   post.addFragmentEffect({
 *     fragmentShader: grainEffect,
 *     fragmentShaderWgsl: grainEffectWgsl,
 *     uni: { value1: 0.07, value2: 520 },
 *   })
 *
 * uni[0].xyz / uni.values0.xyz = intensity, threshold, radius (bloom)
 * uni[0].xy  / uni.values0.xy  = amount, scale (grain)
 * uni[0].xy  / uni.values0.xy  = strength, edgeThreshold (fxaa)
 *
 * GLSL samples `texture(uTexture, uv)`; WGSL samples
 * `textureSample(uTexture, uSampler, uv)` and reads time from `uni.time`.
 */

/** Single-pass bright-pass blur bloom. Not fsMain — post applyEffect. */
export const bloomEffect = `vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  float uIntensity = uni[0].x;
  float uThreshold = uni[0].y;
  float uRadius = max(0.25, uni[0].z);
  vec2 texel = 1.0 / resolution;
  vec2 o = texel * uRadius;
  vec3 c0 = texture(uTexture, uv + vec2(-o.x, -o.y)).rgb;
  vec3 c1 = texture(uTexture, uv + vec2(0.0, -o.y)).rgb;
  vec3 c2 = texture(uTexture, uv + vec2(o.x, -o.y)).rgb;
  vec3 c3 = texture(uTexture, uv + vec2(-o.x, 0.0)).rgb;
  vec3 c4 = color.rgb;
  vec3 c5 = texture(uTexture, uv + vec2(o.x, 0.0)).rgb;
  vec3 c6 = texture(uTexture, uv + vec2(-o.x, o.y)).rgb;
  vec3 c7 = texture(uTexture, uv + vec2(0.0, o.y)).rgb;
  vec3 c8 = texture(uTexture, uv + vec2(o.x, o.y)).rgb;
  vec3 blur = (c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8) / 9.0;
  float bright = max(max(blur.r, blur.g), blur.b);
  float mask = smoothstep(uThreshold, 1.0, bright);
  vec3 bloom = blur * mask * max(0.0, uIntensity);
  return vec4(c4 + bloom, color.a);
}
`

/** Film-grain overlay. Not fsMain — post applyEffect. */
export const grainEffect = `vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  float uAmount = uni[0].x;
  float uScale = max(1.0, uni[0].y);
  vec2 cell = floor(uv * uScale);
  float cellHash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float n = fract(sin(dot(vec2(cellHash, uTime * 1000.0), vec2(12.9898, 78.233))) * 43758.5453);
  float noise = (n - 0.5) * uAmount;
  return vec4(clamp(color.rgb + noise, 0.0, 1.0), color.a);
}
`

/**
 * Compact FXAA (edge-aware blur). Optional — add when you want AA without MSAA.
 * value1 = strength (0 = off, 1 = full). value2 = edge threshold (lower = more AA).
 * Copy/edit freely; place after bloom and before grain so film grain stays sharp.
 *
 * All texture fetches run unconditionally — WebGPU rejects textureSample behind
 * per-pixel branches (non-uniform control flow).
 */
export const fxaaEffect = `float fxaaLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  float strength = clamp(uni[0].x, 0.0, 1.0);
  float edgeThreshold = max(0.0312, uni[0].y);
  vec2 texel = 1.0 / max(resolution, vec2(1.0));

  vec3 rgbN = texture(uTexture, uv + vec2(0.0, -texel.y)).rgb;
  vec3 rgbS = texture(uTexture, uv + vec2(0.0,  texel.y)).rgb;
  vec3 rgbE = texture(uTexture, uv + vec2( texel.x, 0.0)).rgb;
  vec3 rgbW = texture(uTexture, uv + vec2(-texel.x, 0.0)).rgb;
  vec3 rgbNe = texture(uTexture, uv + vec2( texel.x, -texel.y)).rgb;
  vec3 rgbNw = texture(uTexture, uv + vec2(-texel.x, -texel.y)).rgb;
  vec3 rgbSe = texture(uTexture, uv + vec2( texel.x,  texel.y)).rgb;
  vec3 rgbSw = texture(uTexture, uv + vec2(-texel.x,  texel.y)).rgb;

  float lM = fxaaLuma(color.rgb);
  float lN = fxaaLuma(rgbN);
  float lS = fxaaLuma(rgbS);
  float lE = fxaaLuma(rgbE);
  float lW = fxaaLuma(rgbW);
  float lNe = fxaaLuma(rgbNe);
  float lNw = fxaaLuma(rgbNw);
  float lSe = fxaaLuma(rgbSe);
  float lSw = fxaaLuma(rgbSw);
  float lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW)));
  float lRange = lMax - lMin;
  float edgeScale = lRange >= max(0.0625, lMax * edgeThreshold) ? 1.0 : 0.0;

  float edgeH = abs(lN + lS - 2.0 * lM) * 2.0
    + abs(lNe + lSe - 2.0 * lE)
    + abs(lNw + lSw - 2.0 * lW);
  float edgeV = abs(lE + lW - 2.0 * lM) * 2.0
    + abs(lNe + lNw - 2.0 * lN)
    + abs(lSe + lSw - 2.0 * lS);
  bool horz = edgeH >= edgeV;

  float l1 = horz ? lN : lW;
  float l2 = horz ? lS : lE;
  vec2 dir = horz ? vec2(0.0, texel.y) : vec2(texel.x, 0.0);
  dir = abs(l1 - lM) < abs(l2 - lM) ? -dir : dir;

  vec3 rgbA = 0.5 * (
    texture(uTexture, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(uTexture, uv + dir * (2.0 / 3.0 - 0.5)).rgb
  );
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(uTexture, uv + dir * -0.5).rgb +
    texture(uTexture, uv + dir * 0.5).rgb
  );
  float lB = fxaaLuma(rgbB);
  vec3 aa = (lB < lMin || lB > lMax) ? rgbA : rgbB;
  return vec4(mix(color.rgb, aa, strength * edgeScale), color.a);
}
`

/** WGSL bloom for the WebGPU post chain. Same uni packing as bloomEffect. */
export const bloomEffectWgsl = `fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  let intensity = max(0.0, uni.values0.x);
  let threshold = uni.values0.y;
  let radius = max(0.25, uni.values0.z);
  let o = radius / max(resolution, vec2f(1.0));
  var sum = vec3f(0.0);
  sum += textureSample(uTexture, uSampler, uv + vec2f(-o.x, -o.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(0.0, -o.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(o.x, -o.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(-o.x, 0.0)).rgb;
  sum += color.rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(o.x, 0.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(-o.x, o.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(0.0, o.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2f(o.x, o.y)).rgb;
  let blur = sum / 9.0;
  let bright = max(max(blur.r, blur.g), blur.b);
  let mask = smoothstep(threshold, 1.0, bright);
  return vec4f(color.rgb + blur * mask * intensity, color.a);
}
`

/** WGSL film grain for the WebGPU post chain. Time comes from uni.time. */
export const grainEffectWgsl = `fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  let amount = uni.values0.x;
  let scale = max(1.0, uni.values0.y);
  let cell = floor(uv * scale);
  let n = hash21(vec2f(hash21(cell), uni.time * 1000.0));
  let rgb = clamp(color.rgb + (n - 0.5) * amount, vec3f(0.0), vec3f(1.0));
  return vec4f(rgb, color.a);
}
`

/** WGSL FXAA twin of fxaaEffect. Same uni packing. All samples are unbranched. */
export const fxaaEffectWgsl = `fn fxaaLuma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  let strength = clamp(uni.values0.x, 0.0, 1.0);
  let edgeThreshold = max(0.0312, uni.values0.y);
  let texel = 1.0 / max(resolution, vec2f(1.0));

  // Sample first — textureSample requires uniform control flow on WebGPU.
  let rgbN = textureSample(uTexture, uSampler, uv + vec2f(0.0, -texel.y)).rgb;
  let rgbS = textureSample(uTexture, uSampler, uv + vec2f(0.0, texel.y)).rgb;
  let rgbE = textureSample(uTexture, uSampler, uv + vec2f(texel.x, 0.0)).rgb;
  let rgbW = textureSample(uTexture, uSampler, uv + vec2f(-texel.x, 0.0)).rgb;
  let rgbNe = textureSample(uTexture, uSampler, uv + vec2f(texel.x, -texel.y)).rgb;
  let rgbNw = textureSample(uTexture, uSampler, uv + vec2f(-texel.x, -texel.y)).rgb;
  let rgbSe = textureSample(uTexture, uSampler, uv + vec2f(texel.x, texel.y)).rgb;
  let rgbSw = textureSample(uTexture, uSampler, uv + vec2f(-texel.x, texel.y)).rgb;

  let lM = fxaaLuma(color.rgb);
  let lN = fxaaLuma(rgbN);
  let lS = fxaaLuma(rgbS);
  let lE = fxaaLuma(rgbE);
  let lW = fxaaLuma(rgbW);
  let lNe = fxaaLuma(rgbNe);
  let lNw = fxaaLuma(rgbNw);
  let lSe = fxaaLuma(rgbSe);
  let lSw = fxaaLuma(rgbSw);
  let lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  let lMax = max(lM, max(max(lN, lS), max(lE, lW)));
  let lRange = lMax - lMin;
  let edgeScale = select(0.0, 1.0, lRange >= max(0.0625, lMax * edgeThreshold));

  let edgeH = abs(lN + lS - 2.0 * lM) * 2.0
    + abs(lNe + lSe - 2.0 * lE)
    + abs(lNw + lSw - 2.0 * lW);
  let edgeV = abs(lE + lW - 2.0 * lM) * 2.0
    + abs(lNe + lNw - 2.0 * lN)
    + abs(lSe + lSw - 2.0 * lS);
  let horz = edgeH >= edgeV;

  let l1 = select(lW, lN, horz);
  let l2 = select(lE, lS, horz);
  let baseDir = select(vec2f(texel.x, 0.0), vec2f(0.0, texel.y), horz);
  let dir = select(baseDir, -baseDir, abs(l1 - lM) < abs(l2 - lM));

  let rgbA = 0.5 * (
    textureSample(uTexture, uSampler, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
    textureSample(uTexture, uSampler, uv + dir * (2.0 / 3.0 - 0.5)).rgb
  );
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSample(uTexture, uSampler, uv + dir * -0.5).rgb +
    textureSample(uTexture, uSampler, uv + dir * 0.5).rgb
  );
  let lB = fxaaLuma(rgbB);
  let aa = select(rgbB, rgbA, lB < lMin || lB > lMax);
  return vec4f(mix(color.rgb, aa, strength * edgeScale), color.a);
}
`
