/**
 * GPU / shader errors. Catch these; do not unmount the canvas.
 *
 * How to use:
 *   GpuUnavailableError     — neither backend started (createEngine)
 *   WebGLUnavailableError   — WebGL2 context failed
 *   ShaderCompileError      — compile/link log (keep last good program)
 *
 * acquireLayer() returns null instead of throwing GpuUnavailableError.
 *
 * Docs: docs/api.md · docs/shader-contract.md
 */

export class WebGLUnavailableError extends Error {
  constructor(message = "WebGL2 is not available on this canvas.") {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

export class GpuUnavailableError extends Error {
  constructor(message = "No GPU backend is available (WebGPU or WebGL2).") {
    super(message);
    this.name = "GpuUnavailableError";
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
