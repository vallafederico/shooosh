/** Optional runtime/build compiler. Importing shooosh never imports this module. */
import { convertWgslFragmentToGlsl } from "../src/shaders/wgsl-compat"
export { convertWgslFragmentToGlsl }
export { convertGlslFragmentToWgsl } from "../src/shaders/glsl-compat"
export type ShaderArtifact = Readonly<{ fragment: string; fragmentGlsl: string }>
/** Compile the supported fsMain fragment subset; browser drivers still validate/link. */
export function compileShader(source: string): ShaderArtifact {
  if (!/\bfn\s+fsMain\s*\(/.test(source)) throw new Error("Expected a WGSL fsMain fragment")
  return { fragment: source, fragmentGlsl: convertWgslFragmentToGlsl(source, {
    includeUv: true, includeNormal: /\bvNormal\b/.test(source),
  }) }
}
