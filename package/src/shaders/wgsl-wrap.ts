/**
 * Wrap a site fragment into a WebGPU module.
 *
 * How to use: pass `fn fsMain() -> vec4f` (no @vertex, no pipeline).
 * Injects Uni, vsMain, vUv (top-origin), fsEntry. Strips @fragment on fsMain.
 *
 * With a texture, `uSampler` / `uTexture` are injected at @binding(1) / (2) —
 * sample with `textureSample(uTexture, uSampler, fitUv(vUv))` for CSS-like
 * cover/contain (value5–8). They are only declared when the fragment actually
 * names `uTexture`, because `layout: "auto"` drops unused bindings and the
 * bind group must match.
 *
 * `#version 300 es` is detected and ignored on WebGPU (debug fallback).
 * Convert those with convertGlslFragmentToWgsl instead.
 *
 * Docs: docs/shader-contract.md
 */

const UNI_AND_VERTEX = `struct Uni {
  values0: vec4f,
  values1: vec4f,
  values2: vec4f,
  values3: vec4f,
}

@group(0) @binding(0) var<uniform> uUni: Uni;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@location(0) aPosition: vec2f, @location(1) aUv: vec2f) -> VsOut {
  var out: VsOut;
  out.position = vec4f(aPosition, 0.0, 1.0);
  out.uv = aUv;
  return out;
}

var<private> vUv: vec2f;
`;

const TEXTURE_BINDINGS = `@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var uTexture: texture_2d<f32>;

fn fitUv(uv: vec2f) -> vec2f {
  return uv * uUni.values1.xy + uUni.values1.zw;
}
`;

/**
 * GLSL twin of the WGSL fitUv in TEXTURE_BINDINGS above (uUni.values1 ↔
 * uUni[1]). Injected by convertWgslFragmentToGlsl for the WebGL2 fallback —
 * keep the two bodies in lockstep.
 */
export const FIT_UV_GLSL = `vec2 fitUv(vec2 uv) {
  return uv * uUni[1].xy + uUni[1].zw;
}`;

/**
 * Find a function by signature regex and return its brace-balanced body.
 * Shared by wgsl-compat (fsMain) and glsl-compat (main) so the depth-counting
 * extractor cannot drift between the two converters.
 */
export function extractFunctionBody(source: string, nameRegex: RegExp) {
  const fnMatch = nameRegex.exec(source);
  if (!fnMatch || typeof fnMatch.index !== "number") return null;
  const fnStart = fnMatch.index;
  const braceStart = source.indexOf("{", fnStart);
  if (braceStart < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  return {
    fnStart,
    braceStart,
    fnEnd: end + 1,
    body: source.slice(braceStart + 1, end),
  };
}

const FS_ENTRY = `
@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  vUv = in.uv;
  return fsMain();
}
`;

export function isGlsl300(source: string) {
  return /^\s*#version\s+300\s+es/.test(source);
}

/** True when a fragment samples the injected uTexture binding. */
export function referencesWgslTexture(source: string) {
  return /\buTexture\b/.test(source);
}

export function defaultWgslFragment(debugUv: boolean) {
  if (debugUv) {
    return `fn fsMain() -> vec4f {
  return vec4f(vUv, max(0.0, uUni.values0.x), 1.0);
}
`;
  }
  return `fn fsMain() -> vec4f {
  let c = max(0.0, uUni.values0.x);
  return vec4f(c, c, c, 1.0);
}
`;
}

export function defaultItemWgslFragment(debugUv: boolean) {
  if (debugUv) {
    return `fn fsMain() -> vec4f {
  return vec4f(vUv, 0.5 + 0.5 * uUni.values0.x, 1.0);
}
`;
  }
  return defaultWgslFragment(false);
}

/**
 * Default look when a texture is set but no fragment is given — mirrors the
 * WebGL2 default (value-noise distorted sample, uv transform in values1).
 */
export function defaultTextureWgslFragment() {
  return `fn hash21(p: vec2f) -> f32 {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q.x + q.y) * 43758.5453);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i + vec2f(0.0, 0.0));
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fsMain() -> vec4f {
  let time = uUni.values0.w;
  let uv = fitUv(vUv);
  let noiseUv = uv * 9.0 + vec2f(time * 0.35, time * 0.22);
  let n = valueNoise(noiseUv);
  let offset = (n - 0.5) * 0.035;
  let distortedUv = uv + vec2f(offset, -offset * 0.65);
  return textureSample(uTexture, uSampler, distortedUv);
}
`;
}

/** Wrap a user `fn fsMain` so it can run as a WebGPU fragment entry. */
export function wrapWgslFragment(source: string, options: { hasTexture?: boolean } = {}) {
  const stripped = source.replace(/\r/g, "").replace(/@fragment\s+/g, "");
  const bindings = options.hasTexture ? TEXTURE_BINDINGS : "";
  return `${UNI_AND_VERTEX}${bindings}${stripped}\n${FS_ENTRY}`;
}

export type ResolveWgslOptions = {
  fragment?: string;
  debugUv?: boolean;
  kind?: "screen" | "item";
  /** A texture is bound — allow the fragment to sample uTexture. */
  hasTexture?: boolean;
};

/**
 * Pick the fragment source, wrap it, and report whether the module ended up
 * using the texture bindings (the caller must match that in its bind group).
 */
export function resolveWgslModule(options: ResolveWgslOptions) {
  const raw = options.fragment?.trim() ?? "";
  if (raw && isGlsl300(raw)) {
    console.warn(
      "shooosh: GLSL #version 300 es is a WebGL2 escape hatch and is ignored on WebGPU. Using the default WGSL fragment.",
    );
  }

  const source =
    raw && !isGlsl300(raw)
      ? raw
      : options.hasTexture
        ? defaultTextureWgslFragment()
        : options.kind === "item"
          ? defaultItemWgslFragment(Boolean(options.debugUv))
          : defaultWgslFragment(Boolean(options.debugUv));

  const usesTexture = Boolean(options.hasTexture) && referencesWgslTexture(source);
  return {
    code: wrapWgslFragment(source, { hasTexture: usesTexture }),
    usesTexture,
  };
}

export function resolveWgslFragment(options: ResolveWgslOptions) {
  return resolveWgslModule(options).code;
}
