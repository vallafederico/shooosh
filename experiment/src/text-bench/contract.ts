/** Harness-only contract. Adapters identify their actual implementation; no commercial SDK required. */
export type Config = {
  backend: "webgpu" | "webgl2"; width: number; height: number; dpr: number;
  count: number; fontSize: number; text: string;
}
export type Adapter = {
  name: string; version: string; fontIdentity: string;
  mount(canvas: HTMLCanvasElement, config: Config): Promise<{
    update(text: string): void;
    /** Synchronously submit one frame. Must not start an independent RAF loop. */
    render(): void;
    /** Wait for submitted work; used outside sampled CPU spans. */
    settle(): Promise<void>;
    startMeasurement?(): void;
    gpuSamples?(): number[] | null;
    destroy(): void;
  }>;
}
export function stats(values: number[]) {
  if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error("Invalid samples");
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  return { samples: values.length, median: percentile(.5), p95: percentile(.95), max: sorted.at(-1)! };
}
export function textAt(frame: number) { return frame % 2 ? "GPUtext0123456789" : "GPUtext9876543210"; }
