export type RendererKind = "webgpu" | "webgl2";

export type ProbeRendererOptions = {
  /** Skip WebGPU even if the browser exposes it. */
  backend?: RendererKind | "auto";
};

function canCreateWebGl2() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  return Boolean(gl);
}

async function canCreateWebGpu() {
  const gpu = (
    globalThis as typeof globalThis & {
      navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } };
    }
  ).navigator?.gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/** Prefer WebGPU; fall back to WebGL2; `null` if neither is available. */
export async function probeRenderer(
  options: ProbeRendererOptions = {},
): Promise<RendererKind | null> {
  const prefer = options.backend ?? "auto";
  if (prefer === "webgpu") {
    return (await canCreateWebGpu()) ? "webgpu" : null;
  }
  if (prefer === "webgl2") {
    return canCreateWebGl2() ? "webgl2" : null;
  }
  if (await canCreateWebGpu()) return "webgpu";
  if (canCreateWebGl2()) return "webgl2";
  return null;
}
