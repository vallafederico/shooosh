type WgslCompatOptions = {
  includeUv?: boolean;
  includeNormal?: boolean;
};

type ScalarOrVectorType = "float" | "int" | "uint" | "vec2" | "vec3" | "vec4" | "mat4";

function mapType(type: string) {
  const cleaned = type.trim();
  if (cleaned === "f32") return "float";
  if (cleaned === "i32") return "int";
  if (cleaned === "u32") return "uint";
  if (cleaned === "vec2f") return "vec2";
  if (cleaned === "vec3f") return "vec3";
  if (cleaned === "vec4f") return "vec4";
  if (cleaned === "mat4x4<f32>") return "mat4";
  return cleaned;
}

function maxVectorType(types: ScalarOrVectorType[]) {
  if (types.includes("vec4")) return "vec4";
  if (types.includes("vec3")) return "vec3";
  if (types.includes("vec2")) return "vec2";
  if (types.includes("mat4")) return "mat4";
  if (types.includes("uint")) return "uint";
  if (types.includes("int")) return "int";
  return "float";
}

function inferExprType(
  expr: string,
  symbols: Map<string, ScalarOrVectorType>,
  functionReturns: Map<string, ScalarOrVectorType>,
) {
  const value = expr.trim();
  if (/^mat[234]\(/.test(value)) return "mat4";
  if (/^vec4\(/.test(value)) return "vec4";
  if (/^vec3\(/.test(value)) return "vec3";
  if (/^vec2\(/.test(value)) return "vec2";
  if (/\bvUv\b/.test(value)) return "vec2";
  if (/\bvNormal\b/.test(value)) return "vec3";
  // Single-component swizzle (.x, .y, .r, etc.) yields float (after vec constructors)
  if (/\.(?![xyzwrgba]{2})[xyzwrgba]\b/.test(value)) return "float";
  if (/\.[xy]{2}\b/.test(value) || /\.[st]{2}\b/.test(value)) return "vec2";
  if (/\.[xyz]{3}\b/.test(value) || /\.[rgb]{3}\b/.test(value)) return "vec3";
  if (/\.[xyzw]{4}\b/.test(value) || /\.[rgba]{4}\b/.test(value)) return "vec4";
  if (/texture(Size)?\s*\(/.test(value)) return "vec2";
  if (/length\s*\(/.test(value)) return "float";

  const candidates: ScalarOrVectorType[] = [];
  for (const [name, type] of symbols.entries()) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(value)) {
      candidates.push(type);
    }
  }
  for (const [name, type] of functionReturns.entries()) {
    const pattern = new RegExp(`\\b${name}\\s*\\(`);
    if (pattern.test(value)) {
      candidates.push(type);
    }
  }
  if (/\bvec2\s*\(/.test(value)) candidates.push("vec2");
  if (/\bvec3\s*\(/.test(value)) candidates.push("vec3");
  if (/\bvec4\s*\(/.test(value)) candidates.push("vec4");
  if (/\bmat4\s*\(/.test(value)) candidates.push("mat4");
  if (candidates.length > 0) {
    return maxVectorType(candidates);
  }

  if (/^mat[234]\(/.test(value)) return "mat4";
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
  const fnMatch = /\b(?:fn|vec4)\s+fsMain\s*\(/.exec(source);
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

export function convertWgslFragmentToGlsl(
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
  out = out.replace(/\bf32\b/g, "float");
  out = out.replace(/\bi32\b/g, "int");
  out = out.replace(/\bu32\b/g, "uint");
  out = out.replace(/uUni\.values(\d+)/g, (_m, idx: string) => `uUni[${idx}]`);
  out = out.replace(/\bin\.uv\b/g, "vUv");
  out = out.replace(/\bin\.normal\b/g, "vNormal");
  out = convertFunctionSignatures(out);
  out.replace(
    /\b(vec2|vec3|vec4|float|int|uint|mat4)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g,
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
    /\b(let|var)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g,
    (_m, _kw: string, name: string, expr: string) => {
      const type = inferExprType(expr, symbols, functionReturns);
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

  const header = [
    "#version 300 es",
    "precision highp float;",
    options.includeUv ? "in vec2 vUv;" : "",
    options.includeNormal ? "in vec3 vNormal;" : "",
    "uniform vec4 uUni[4];",
    "out vec4 outColor;",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n${out}`;
}
