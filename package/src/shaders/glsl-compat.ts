/**
 * convertGlslFragmentToWgsl — GLSL 300 es escape hatch → WGSL `fsMain`.
 *
 * How to use: port a `#version 300 es` site shader so WebGPU can run it.
 * Supported subset only. Skill `glsl-to-wgsl` for anything the converter rejects.
 *
 * Docs: docs/shader-translation.md · skill glsl-to-wgsl
 */

import { isGlsl300 } from "./wgsl-wrap";

const GLSL_TYPES = "void|f32|i32|u32|vec2f|vec3f|vec4f|mat4x4<f32>";

function extractFunction(source: string, name: string) {
  const fnMatch = new RegExp(`\\b(?:void|fn)\\s+${name}\\s*\\(`).exec(source);
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
    fnEnd: end + 1,
    body: source.slice(braceStart + 1, end),
  };
}

function convertHelperSignatures(source: string) {
  return source.replace(
    new RegExp(`\\b(${GLSL_TYPES})\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{`, "g"),
    (_m, returnType: string, fnName: string, params: string) => {
      if (fnName === "main") return _m;
      const mappedParams = params
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const chunks = part.split(/\s+/);
          if (chunks.length < 2) return part;
          const type = chunks[0] ?? "f32";
          const name = chunks[chunks.length - 1] ?? "arg";
          return `${name}: ${type}`;
        })
        .join(", ");
      if (returnType === "void") {
        return `fn ${fnName}(${mappedParams}) {`;
      }
      return `fn ${fnName}(${mappedParams}) -> ${returnType} {`;
    },
  );
}

function convertTypedDeclarations(source: string) {
  return source.replace(
    new RegExp(`\\b(?:const\\s+)?(${GLSL_TYPES})\\s+([A-Za-z_]\\w*)\\s*=\\s*([^;]+);`, "g"),
    (_m, type: string, name: string, expr: string) => {
      if (type === "void") return _m;
      return `var ${name}: ${type} = ${expr};`;
    },
  );
}

function convertMainBody(body: string) {
  let out = body.replace(/\boutColor\s*=\s*([^;]+);/g, "return $1;");
  out = out.replace(/^\s*return\s*;\s*$/gm, "");
  return out.trim();
}

/**
 * Convert a GLSL 300 es fragment (`void main` + `outColor`) into a shooosh
 * WGSL `fn fsMain`. Inverse of `convertWgslFragmentToGlsl` for the supported subset.
 */
export function convertGlslFragmentToWgsl(source: string) {
  const raw = source.replace(/\r/g, "");
  if (/\bfn\s+fsMain\s*\(/.test(raw) && !isGlsl300(raw)) {
    return raw.trim();
  }

  let out = raw;
  out = out.replace(/^\s*#version[^\n]*\n/gm, "");
  out = out.replace(/^\s*precision\s+\w+\s+\w+\s*;\s*$/gm, "");
  out = out.replace(/^\s*(?:in|out|uniform)\s+[\w\s\[\]]+\s+[A-Za-z_]\w*(?:\[[^\]]+\])?\s*;\s*$/gm, "");
  out = out.replace(/\b(?:highp|mediump|lowp)\s+/g, "");
  out = out.replace(/\buUni\[(\d+)\]/g, "uUni.values$1");
  out = out.replace(/\batan\s*\(([^,()]+),([^()]+)\)/g, "atan2($1,$2)");

  out = out.replace(/\bvec4\b/g, "vec4f");
  out = out.replace(/\bvec3\b/g, "vec3f");
  out = out.replace(/\bvec2\b/g, "vec2f");
  out = out.replace(/\bfloat\b/g, "f32");
  out = out.replace(/\buint\b/g, "u32");
  out = out.replace(/\bint\b/g, "i32");
  out = out.replace(/\bmat4\b/g, "mat4x4<f32>");

  out = convertHelperSignatures(out);
  out = convertTypedDeclarations(out);

  const main = extractFunction(out, "main");
  if (!main) {
    throw new Error("Unable to locate void main() in GLSL fragment shader.");
  }

  const helpers = `${out.slice(0, main.fnStart).trim()}\n${out.slice(main.fnEnd).trim()}`.trim();
  const fsMain = `fn fsMain() -> vec4f {\n  ${convertMainBody(main.body).replace(/\n/g, "\n  ")}\n}`;
  return [helpers, fsMain].filter(Boolean).join("\n\n").trim() + "\n";
}
