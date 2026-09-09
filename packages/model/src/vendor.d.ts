declare module "draco3dgltf" {
  const draco: {
    createDecoderModule(): Promise<unknown>
    createEncoderModule(): Promise<unknown>
  }
  export default draco
}
declare module "gltf-validator" {
  export function validateBytes(
    bytes: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<{
    issues: { numErrors: number; numWarnings: number; messages: unknown[] }
    [key: string]: unknown
  }>
  export function validateString(
    json: string,
    options?: Record<string, unknown>,
  ): Promise<{
    issues: { numErrors: number; numWarnings: number; messages: unknown[] }
    [key: string]: unknown
  }>
}
