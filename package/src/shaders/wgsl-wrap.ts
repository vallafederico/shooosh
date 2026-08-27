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

/** Wrap a user `fn fsMain` so it can run as a WebGPU fragment entry. */
export function wrapWgslFragment(source: string) {
  const stripped = source.replace(/\r/g, "").replace(/@fragment\s+/g, "");
  return `${UNI_AND_VERTEX}${stripped}\n${FS_ENTRY}`;
}

export function resolveWgslFragment(options: {
  fragment?: string;
  debugUv?: boolean;
  kind?: "screen" | "item";
}) {
  const raw = options.fragment?.trim() ?? "";
  if (raw && !isGlsl300(raw)) {
    return wrapWgslFragment(raw);
  }
  if (raw && isGlsl300(raw)) {
    console.warn(
      "shooosh: GLSL #version 300 es is a WebGL2 escape hatch and is ignored on WebGPU. Using the default WGSL fragment.",
    );
  }
  const user = options.kind === "item"
    ? defaultItemWgslFragment(Boolean(options.debugUv))
    : defaultWgslFragment(Boolean(options.debugUv));
  return wrapWgslFragment(user);
}
