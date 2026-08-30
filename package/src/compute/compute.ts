/**
 * createCompute — WebGPU compute session on an engine.
 *
 * How to use:
 *   const gpu = createCompute(engine)
 *   if (!gpu) return // WebGL2 / no internals
 *   const pipe = gpu.createPipeline(wgsl, "advect")
 *   const fields = gpu.createPingPong(w, h, "vel")
 *   gpu.setOnCompute(({ encoder }) => {
 *     gpu.dispatch(encoder, pipe, w, h, [
 *       { binding: 0, resource: fields.readView },
 *       { binding: 1, resource: fields.writeView },
 *     ])
 *     fields.swap()
 *   })
 *   gpu.setOnDisplay(({ pass }) => { pass.setPipeline(blit); pass.draw(3) })
 *
 * This is the generic hook for compute sims (fluids, particles, reaction-diffusion).
 * Domain loops (Stable Fluids, …) live in examples/ — copy fluid-sim.ts + fluid-shaders.ts.
 *
 * Returns null when the engine is not WebGPU.
 */

import type { WebGLEngine } from "../engine/engine";
import {
  GPU_BUFFER_USAGE,
  GPU_TEXTURE_USAGE,
  getGpuFrame,
  sceneDepthStencil,
  type GpuBindGroup,
  type GpuBindGroupEntryResource,
  type GpuComputePipeline,
  type GpuDevice,
  type GpuShaderModule,
} from "../engine/gpu-api";
import { getGpuInternals } from "../engine/gpu-internals";
import type {
  ComputePingPong,
  ComputeSession,
  CreateComputeOptions,
} from "./types";

export type {
  ComputeDisplayContext,
  ComputePingPong,
  ComputeSession,
  ComputeTickContext,
  CreateComputeOptions,
} from "./types";

const STORAGE_USAGE =
  GPU_TEXTURE_USAGE.TEXTURE_BINDING |
  GPU_TEXTURE_USAGE.STORAGE_BINDING |
  GPU_TEXTURE_USAGE.COPY_DST;

/** Identity ids for bind-group cache keys (views, samplers, buffers). */
const bindResourceIds = new WeakMap<object, number>();
let nextBindResourceId = 1;

function bindResourceId(resource: object) {
  let id = bindResourceIds.get(resource);
  if (!id) {
    id = nextBindResourceId++;
    bindResourceIds.set(resource, id);
  }
  return id;
}

/** Keep well past the two ping-pong combinations; reset if a caller churns views. */
const MAX_CACHED_BIND_GROUPS = 64;

function createPingPong(
  device: GpuDevice,
  width: number,
  height: number,
  label: string,
  format: string,
): ComputePingPong {
  const make = (suffix: string) =>
    device.createTexture({
      label: `${label}-${suffix}`,
      size: { width, height },
      format,
      usage: STORAGE_USAGE,
    });
  let read = make("a");
  let write = make("b");
  let readView = read.createView();
  let writeView = write.createView();
  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    get readView() {
      return readView;
    },
    get writeView() {
      return writeView;
    },
    swap() {
      const t = read;
      read = write;
      write = t;
      const v = readView;
      readView = writeView;
      writeView = v;
    },
    destroy() {
      read.destroy();
      write.destroy();
    },
  };
}

export function createCompute(
  engine: WebGLEngine,
  options: CreateComputeOptions = {},
): ComputeSession | null {
  const internals = getGpuInternals(engine);
  if (!internals) {
    console.warn("shooosh: createCompute requires the WebGPU engine.");
    return null;
  }

  const { device, format, onPreRender } = internals;
  const canvas = engine.canvas;

  let onCompute = options.onCompute ?? null;
  let onDisplay = options.onDisplay ?? null;
  let displayLayer = options.displayLayer ?? -100;
  let failed = false;
  let unsubscribeDisplay: (() => void) | null = null;

  const onGpuError = (event: Event) => {
    const message =
      (event as { error?: { message?: string } }).error?.message ?? "uncaptured GPU error";
    console.warn("shooosh: compute GPU error:", message);
  };
  (
    device as GpuDevice & {
      addEventListener?: (type: string, listener: (event: Event) => void) => void;
    }
  ).addEventListener?.("uncapturederror", onGpuError);

  const unsubscribePre = onPreRender((ctx) => {
    if (failed || !onCompute) return;
    try {
      onCompute({
        device: ctx.device,
        encoder: ctx.encoder,
        canvas: ctx.canvas,
        now: ctx.now,
        delta: ctx.delta,
      });
    } catch (error) {
      failed = true;
      console.warn("shooosh: compute tick failed:", error);
    }
  });

  const attachDisplay = () => {
    unsubscribeDisplay?.();
    unsubscribeDisplay = null;
    if (!onDisplay) return;
    const draw = onDisplay;
    unsubscribeDisplay = engine.onRender(
      () => {
        if (failed) return;
        const frame = getGpuFrame();
        if (!frame) return;
        try {
          draw({ pass: frame.pass, device, format });
        } catch (error) {
          failed = true;
          console.warn("shooosh: compute display failed:", error);
        }
      },
      { layer: displayLayer },
    );
  };
  attachDisplay();

  // Surface WGSL typos at creation with a label instead of a vague
  // uncapturederror at first dispatch (same pattern as gpu-compile.ts).
  const reportPipelineErrors = (module: GpuShaderModule, label: string) => {
    void (async () => {
      try {
        const [info, error] = await Promise.all([
          module.getCompilationInfo?.() ?? Promise.resolve(null),
          device.popErrorScope(),
        ]);
        const errors = info?.messages.filter((message) => message.type === "error") ?? [];
        if (errors.length > 0) {
          console.warn(
            `[shader] "${label}" failed to compile:\n${errors.map((entry) => entry.message).join("\n")}`,
          );
        }
        if (error) {
          console.warn(`[shader] "${label}" failed to create pipeline:\n${error.message}`);
        }
      } catch {
        // device lost — nothing useful to report
      }
    })();
  };

  // dispatch() bind-group cache — ping-pong dispatches alternate between two
  // stable resource combinations; never rebuild those every frame.
  const bindGroupCache = new WeakMap<GpuComputePipeline, Map<string, GpuBindGroup>>();

  const bindGroupFor = (
    pipeline: GpuComputePipeline,
    entries: Array<{ binding: number; resource: GpuBindGroupEntryResource }>,
  ) => {
    let key = "";
    for (const entry of entries) {
      const resource = entry.resource as { buffer?: object; offset?: number; size?: number };
      key +=
        resource && typeof resource === "object" && resource.buffer
          ? `${entry.binding}:b${bindResourceId(resource.buffer)}:${resource.offset ?? 0}:${resource.size ?? -1};`
          : `${entry.binding}:r${bindResourceId(entry.resource as object)};`;
    }
    let groups = bindGroupCache.get(pipeline);
    if (!groups) {
      groups = new Map();
      bindGroupCache.set(pipeline, groups);
    }
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= MAX_CACHED_BIND_GROUPS) groups.clear();
      group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries,
      });
      groups.set(key, group);
    }
    return group;
  };

  const session: ComputeSession = {
    device,
    format,
    canvas,

    requestFrame() {
      engine.requestFrame();
    },

    createPipeline(code, label = "compute") {
      device.pushErrorScope("validation");
      const module = device.createShaderModule({ code, label });
      const pipeline = device.createComputePipeline({
        label,
        layout: "auto",
        compute: { module, entryPoint: "main" },
      });
      reportPipelineErrors(module, label);
      return pipeline;
    },

    createDisplayPipeline(code, label = "compute-display") {
      device.pushErrorScope("validation");
      const module = device.createShaderModule({ code, label });
      const pipeline = device.createRenderPipeline({
        label,
        layout: "auto",
        vertex: { module, entryPoint: "vsMain" },
        fragment: {
          module,
          entryPoint: "fsMain",
          targets: [{ format }],
        },
        primitive: { topology: "triangle-list" },
        // The scene pass always carries a depth attachment; a display pipeline
        // without matching depth state fails validation.
        depthStencil: sceneDepthStencil(),
      });
      reportPipelineErrors(module, label);
      return pipeline;
    },

    createPingPong(width, height, label = "pp", texFormat = "rgba16float") {
      return createPingPong(device, width, height, label, texFormat);
    },

    createStorageTexture(width, height, label = "storage", texFormat = "rgba16float") {
      return device.createTexture({
        label,
        size: { width, height },
        format: texFormat,
        usage: STORAGE_USAGE,
      });
    },

    createUniformBuffer(byteSize, label = "uniform") {
      return device.createBuffer({
        label,
        size: byteSize,
        usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      });
    },

    writeBuffer(buffer, data, offset = 0) {
      device.queue.writeBuffer(buffer, offset, data);
    },

    dispatch(encoder, pipeline, width, height, entries, label) {
      const pass = encoder.beginComputePass(label ? { label } : undefined);
      pass.setPipeline(pipeline);
      // Entries are cached per pipeline + resources; a prebuilt bind group
      // (from createBindGroup on the device) is used as-is.
      const group = Array.isArray(entries) ? bindGroupFor(pipeline, entries) : entries;
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      pass.end();
    },

    setOnCompute(callback) {
      onCompute = callback;
      failed = false;
      engine.requestFrame();
    },

    setOnDisplay(callback, layer) {
      onDisplay = callback;
      if (typeof layer === "number") displayLayer = layer;
      failed = false;
      attachDisplay();
      engine.requestFrame();
    },

    destroy() {
      unsubscribePre();
      unsubscribeDisplay?.();
      unsubscribeDisplay = null;
      onCompute = null;
      onDisplay = null;
      (
        device as GpuDevice & {
          removeEventListener?: (type: string, listener: (event: Event) => void) => void;
        }
      ).removeEventListener?.("uncapturederror", onGpuError);
    },
  };

  engine.requestFrame();
  return session;
}
