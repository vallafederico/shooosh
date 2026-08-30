/**
 * probeRenderer — which GPU can this page use?
 *
 * How to use:
 *   const kind = await probeRenderer()                 // "webgpu" | "webgl2" | null
 *   await probeRenderer({ backend: "webgl2" })         // skip WebGPU
 *
 * `null` is valid. Do not throw; leave the page readable.
 * createEngine / acquireLayer call this; site code rarely needs to.
 *
 * Docs: docs/api.md
 */

import type { GpuAdapter } from "./gpu-api";

export type RendererKind = "webgpu" | "webgl2";

export type ProbeRendererOptions = {
  /** Skip WebGPU even if the browser exposes it. */
  backend?: RendererKind | "auto";
};

function canCreateWebGl2() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  // Release the throwaway probe context — browsers cap live WebGL contexts.
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return Boolean(gl);
}

// Adapter from the last successful probe, handed to createWebGpuEngine so
// startup does not request it twice. Consumed once — an adapter is spent after
// requestDevice — and never caches a failure, so retries probe fresh.
let probedGpuAdapter: GpuAdapter | null = null;

/** Take (and clear) the adapter cached by the last successful WebGPU probe. */
export function takeProbedGpuAdapter(): GpuAdapter | null {
  const adapter = probedGpuAdapter;
  probedGpuAdapter = null;
  return adapter;
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
    if (adapter) probedGpuAdapter = adapter as unknown as GpuAdapter;
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
