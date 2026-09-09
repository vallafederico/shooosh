declare module "*.wgsl" {
  export const fragment: string
  export const fragmentGlsl: string
  const shader: { fragment: string; fragmentGlsl: string }
  export default shader
}
