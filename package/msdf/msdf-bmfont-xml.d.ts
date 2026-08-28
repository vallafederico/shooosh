declare module "msdf-bmfont-xml" {
  type Callback = (
    error: Error | null,
    textures: { filename: string; texture: Buffer }[],
    font: { filename: string; data: string },
  ) => void;

  export default function generateBMFont(
    fontPath: string,
    options: Record<string, unknown>,
    callback: Callback,
  ): void;
}
