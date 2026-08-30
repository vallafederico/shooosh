/**
 * convertWgslFragmentToGlsl — WGSL `fsMain` → GLSL 300 es (WebGL2 fallback).
 *
 * How to use:
 *   convertWgslFragmentToGlsl(wgsl, { includeUv: true })
 * Supported subset only. If it rejects, use skill `wgsl-to-glsl` and keep the
 * result inside the shader contract.
 *
 * Docs: docs/shader-translation.md · skill wgsl-to-glsl
 */

import { FIT_UV_GLSL, extractFunctionBody } from "./wgsl-wrap";

type WgslCompatOptions = {
  includeUv?: boolean;
  includeNormal?: boolean;
};

type ScalarOrVectorType =
  | "float"
  | "int"
  | "uint"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat2"
  | "mat3"
  | "mat4";

function mapType(type: string) {
  const cleaned = type.trim();
  if (cleaned === "f32") return "float";
  if (cleaned === "i32") return "int";
  if (cleaned === "u32") return "uint";
  if (cleaned === "vec2f") return "vec2";
  if (cleaned === "vec3f") return "vec3";
  if (cleaned === "vec4f") return "vec4";
  if (cleaned === "mat2x2<f32>") return "mat2";
  if (cleaned === "mat3x3<f32>") return "mat3";
  if (cleaned === "mat4x4<f32>") return "mat4";
  return cleaned;
}

function maxVectorType(types: ScalarOrVectorType[]) {
  if (types.includes("vec4")) return "vec4";
  if (types.includes("vec3")) return "vec3";
  if (types.includes("vec2")) return "vec2";
  if (types.includes("mat4")) return "mat4";
  if (types.includes("mat3")) return "mat3";
  if (types.includes("mat2")) return "mat2";
  if (types.includes("uint")) return "uint";
  if (types.includes("int")) return "int";
  return "float";
}

/** Per-symbol regexes are rebuilt constantly during inference — cache them. */
const patternCache = new Map<string, RegExp>();

function cachedRegex(pattern: string) {
  let regex = patternCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern);
    patternCache.set(pattern, regex);
  }
  return regex;
}

function inferExprType(
  expr: string,
  symbols: Map<string, ScalarOrVectorType>,
  functionReturns: Map<string, ScalarOrVectorType>,
) {
  const value = expr.trim();
  const matCtor = /^mat([234])\(/.exec(value);
  if (matCtor) return `mat${matCtor[1]}` as ScalarOrVectorType;
  if (/^vec4\(/.test(value)) return "vec4";
  if (/^vec3\(/.test(value)) return "vec3";
  if (/^vec2\(/.test(value)) return "vec2";
  for (const [name, type] of functionReturns.entries()) {
    if (cachedRegex(`^${name}\\s*\\(`).test(value)) return type;
  }
  if (/\bmix\s*\(/.test(value)) {
    const mixed: ScalarOrVectorType[] = [];
    for (const [name, type] of symbols.entries()) {
      if (cachedRegex(`\\b${name}\\b`).test(value)) mixed.push(type);
    }
    const vectors = mixed.filter(
      (type) => type.startsWith("vec") || type.startsWith("mat"),
    );
    if (vectors.length > 0) return maxVectorType(vectors);
  }
  // A lone .x/.y swizzle is float. `mix(a, b, vUv.y)` must stay a vector.
  if (
    /\.(?![xyzwrgba]{2})[xyzwrgba]\b/.test(value) &&
    !/\b(mix|vec[234])\s*\(/.test(value)
  ) {
    return "float";
  }
  if (/\.[xy]{2}\b/.test(value) || /\.[st]{2}\b/.test(value)) return "vec2";
  if (/\.[xyz]{3}\b/.test(value) || /\.[rgb]{3}\b/.test(value)) return "vec3";
  if (/\.[xyzw]{4}\b/.test(value) || /\.[rgba]{4}\b/.test(value)) return "vec4";
  if (/texture(Sample|Size)?\s*\(/.test(value)) {
    if (/textureSize\s*\(/.test(value)) return "vec2";
    return "vec4";
  }
  if (/\b(length|dot|exp|log|sqrt)\s*\(/.test(value)) return "float";
  if (
    /\b(sin|cos|tan|atan|pow)\s*\(/.test(value) &&
    !/\bvec[234]\s*\(/.test(value)
  ) {
    return "float";
  }

  const candidates: ScalarOrVectorType[] = [];
  for (const [name, type] of symbols.entries()) {
    if (cachedRegex(`\\b${name}\\b`).test(value)) {
      candidates.push(type);
    }
  }
  for (const [name, type] of functionReturns.entries()) {
    if (cachedRegex(`\\b${name}\\s*\\(`).test(value)) {
      candidates.push(type);
    }
  }
  if (/\bvec2\s*\(/.test(value)) candidates.push("vec2");
  if (/\bvec3\s*\(/.test(value)) candidates.push("vec3");
  if (/\bvec4\s*\(/.test(value)) candidates.push("vec4");
  if (/\bmat2\s*\(/.test(value)) candidates.push("mat2");
  if (/\bmat3\s*\(/.test(value)) candidates.push("mat3");
  if (/\bmat4\s*\(/.test(value)) candidates.push("mat4");
  if (candidates.length > 0) {
    return maxVectorType(candidates);
  }

  // Bare integer literals: `var i = 0` must stay int — GLSL ES 3.00 has no
  // implicit int→float, and `float i = 0` breaks every integer for-loop.
  if (/^-?\d+u$/.test(value)) return "uint";
  if (/^-?\d+i?$/.test(value)) return "int";
  return "float";
}

function convertFunctionSignatures(source: string) {
  return source.replace(
    /fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*->\s*([A-Za-z0-9_<>\[\]]+)\s*\{/g,
    (_, fnName: string, params: string, returnType: string) => {
      const mappedParams = params
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const chunks = part.split(":");
          if (chunks.length !== 2) return part;
          const name = chunks[0]?.trim() ?? "arg";
          const type = mapType(chunks[1] ?? "");
          return `${type} ${name}`;
        })
        .join(", ");
      return `${mapType(returnType)} ${fnName}(${mappedParams}) {`;
    },
  );
}

function extractFsMainBody(source: string) {
  return extractFunctionBody(source, /\b(?:fn|vec4)\s+fsMain\s*\(/);
}

/** Identifiers illegal as GLSL ES 3.00 names — WGSL authors use them freely. */
const GLSL_RESERVED_IDENTIFIERS = [
  "sample",
  "input",
  "output",
  "common",
  "partition",
  "active",
  "filter",
  "row_major",
  "column_major",
] as const;

const GLSL_RESERVED_PATTERN = new RegExp(
  `\\b(${GLSL_RESERVED_IDENTIFIERS.join("|")})\\b`,
  "g",
);

function renameGlslReservedIdentifiers(source: string) {
  return source.replace(GLSL_RESERVED_PATTERN, "_$1");
}

function convertWgslFragmentToGlslUncached(
  source: string,
  options: WgslCompatOptions = {},
) {
  const symbols = new Map<string, ScalarOrVectorType>();
  symbols.set("vUv", "vec2");
  symbols.set("vNormal", "vec3");
  const functionReturns = new Map<string, ScalarOrVectorType>();

  let out = source.replace(/\r/g, "");
  out = out.replace(/@fragment/g, "");
  out = out.replace(/@location\(\d+\)\s*/g, "");
  out = out.replace(/\bvec2f\b/g, "vec2");
  out = out.replace(/\bvec3f\b/g, "vec3");
  out = out.replace(/\bvec4f\b/g, "vec4");
  // Matrices first — the scalar f32 pass below must not see `mat4x4<f32>`.
  out = out.replace(/\bmat(\d)x(\d)(?:<f32>|f\b)/g, (_m, cols: string, rows: string) =>
    cols === rows ? `mat${cols}` : `mat${cols}x${rows}`,
  );
  out = out.replace(/\bf32\b/g, "float");
  out = out.replace(/\bi32\b/g, "int");
  out = out.replace(/\bu32\b/g, "uint");
  out = out.replace(/uUni\.values(\d+)/g, (_m, idx: string) => `uUni[${idx}]`);
  out = out.replace(/\bin\.uv\b/g, "vUv");
  out = out.replace(/\bin\.normal\b/g, "vNormal");
  out = out.replace(/\batan2\s*\(/g, "atan(");
  // WGSL textureSample(tex, sampler, uv) → GLSL texture(tex, uv)
  out = out.replace(
    /\btextureSample\s*\(\s*([A-Za-z_]\w*)\s*,\s*[A-Za-z_]\w*\s*,\s*([^)]+)\)/g,
    (_m, tex: string, uv: string) => `texture(${tex}, ${uv.trim()})`,
  );
  // GLSL ES 3 reserved identifiers (e.g. `let sample = …`) — rename after
  // textureSample rewrite so `textureSample` / `uSampler` stay intact.
  out = renameGlslReservedIdentifiers(out);
  // Injected cover/contain helper (header) — keep let/var inference correct.
  if (/\buTexture\b/.test(out)) functionReturns.set("fitUv", "vec2");
  out = convertFunctionSignatures(out);
  out.replace(
    /\b(vec2|vec3|vec4|float|int|uint|mat2|mat3|mat4)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g,
    (_m, returnType: ScalarOrVectorType, fnName: string, params: string) => {
      functionReturns.set(fnName, returnType);
      params
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const match = /^([A-Za-z0-9_]+)\s+([A-Za-z_]\w*)$/.exec(part);
          if (!match) return;
          const rawType = match[1] as ScalarOrVectorType;
          const name = match[2] ?? "";
          if (name) symbols.set(name, rawType);
        });
      return _m;
    },
  );

  out = out.replace(
    /\b(let|var)\s+([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_][\w<>]*)\s*)?=\s*([^;]+);/g,
    (_m, _kw: string, name: string, declared: string | undefined, expr: string) => {
      // `let t: f32 = …` — trust the annotation; infer only when it is absent.
      const type = declared
        ? (mapType(declared) as ScalarOrVectorType)
        : inferExprType(expr, symbols, functionReturns);
      symbols.set(name, type);
      return `${type} ${name} = ${expr};`;
    },
  );

  const fsMain = extractFsMainBody(out);
  if (!fsMain) {
    throw new Error("Unable to locate fsMain in WGSL fragment shader.");
  }

  const mainBody = fsMain.body.replace(
    /\breturn\s+([^;]+);/g,
    (_m, expr: string) => `outColor = ${expr};\n  return;`,
  );
  out = `${out.slice(0, fsMain.fnStart)}void main() {${mainBody}\n}${out.slice(fsMain.fnEnd)}`;

  const samplers: string[] = [];
  if (/\buTexture\b/.test(out)) samplers.push("uniform sampler2D uTexture;");
  if (/\buEnvMap\b/.test(out)) samplers.push("uniform sampler2D uEnvMap;");
  if (/\buMaskMap\b/.test(out)) samplers.push("uniform sampler2D uMaskMap;");

  const helpers: string[] = [];
  // Cover/contain helper — same as WGSL wrap when uTexture is bound.
  // Skip if the author already defined fitUv in the fragment.
  if (/\buTexture\b/.test(out) && !/\bvec2\s+fitUv\s*\(/.test(out)) {
    helpers.push(FIT_UV_GLSL);
  }

  const header = [
    "#version 300 es",
    "precision highp float;",
    options.includeUv ? "in vec2 vUv;" : "",
    options.includeNormal ? "in vec3 vNormal;" : "",
    "uniform vec4 uUni[4];",
    ...samplers,
    "out vec4 outColor;",
    "",
    ...helpers,
  ]
    .filter(Boolean)
    .join("\n");

  return helpers.length > 0 ? `${header}\n\n${out}` : `${header}\n${out}`;
}

/** Conversion is pure — memoize so N identical items transpile once. */
const conversionCache = new Map<string, string>();
const CONVERSION_CACHE_LIMIT = 64;

export function convertWgslFragmentToGlsl(
  source: string,
  options: WgslCompatOptions = {},
) {
  const key = `${options.includeUv ? 1 : 0}${options.includeNormal ? 1 : 0}\u0000${source}`;
  const cached = conversionCache.get(key);
  if (cached !== undefined) return cached;
  const result = convertWgslFragmentToGlslUncached(source, options);
  if (conversionCache.size >= CONVERSION_CACHE_LIMIT) conversionCache.clear();
  conversionCache.set(key, result);
  return result;
}
