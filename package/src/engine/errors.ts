export class WebGLUnavailableError extends Error {
  constructor(message = "WebGL2 is not available on this canvas.") {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

export class ShaderCompileError extends Error {
  readonly label: string;
  readonly log: string;

  constructor(label: string, log: string) {
    super(`Shader "${label}" failed to compile or link:\n${log}`);
    this.name = "ShaderCompileError";
    this.label = label;
    this.log = log;
  }
}

export function formatShaderFailure(
  label: string,
  programLog: string,
  vertexLog = "",
  fragmentLog = "",
) {
  return new ShaderCompileError(
    label,
    [programLog, vertexLog, fragmentLog].filter(Boolean).join("\n"),
  );
}
