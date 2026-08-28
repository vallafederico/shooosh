/**
 * WebGPU post chain. Not a public import — loaded by createPostProcessor.
 *
 * How to use: PostProcessor dynamic-imports this when `frame.backend` is
 * `"webgpu"`. Effects are WGSL, mirroring the GLSL contract:
 *
 *   fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f
 *
 * Injected: `uTexture` / `uSampler` (the previous pass), `uUni` (values0..3 plus
 * resolution / time / delta / passIndex). Sample with
 * `textureSample(uTexture, uSampler, uv)`. `uv` is top-origin and screen-aligned,
 * so no flips are needed anywhere in the chain.
 *
 * Ping-pong targets use the canvas format, so one pipeline format covers the
 * intermediate passes and the final present. While pipelines compile (or if the
 * copy pipeline fails) the scene is copied straight to the canvas — never blank.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post · examples/post-shaders.ts
 */

import type { EnginePostFrame, WebGpuRenderTarget } from "../engine/engine";
import {
  getGpuPostFrame,
  GPU_BUFFER_USAGE,
  GPU_SHADER_STAGE,
  GPU_TEXTURE_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
  type GpuCommandEncoder,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuSampler,
  type GpuTexture,
  type GpuTextureView,
} from "../engine/gpu-api";
import { compileGpuPipeline, type GpuProgram } from "../shaders/gpu-compile";
import type { InternalEffect, PostBackend } from "./types";

/** uni (4 × vec4f) + resolution/time/delta/passIndex, padded to 16 bytes. */
const UNIFORM_FLOATS = 24;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

const POST_PREAMBLE = `struct Uni {
  values0: vec4f,
  values1: vec4f,
  values2: vec4f,
  values3: vec4f,
  resolution: vec2f,
  time: f32,
  delta: f32,
  passIndex: f32,
}

@group(0) @binding(0) var<uniform> uUni: Uni;
@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var uTexture: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) index: u32) -> VsOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[index];
  var out: VsOut;
  out.position = vec4f(p, 0.0, 1.0);
  // Top-origin uv: matches the framebuffer row order, so passes never flip.
  out.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}
`;

const POST_ENTRY = `
@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  let color = textureSample(uTexture, uSampler, in.uv);
  return applyEffect(color, in.uv, uUni.resolution, uUni);
}
`;

/** Wrap a WGSL `applyEffect` into a full post pass module. */
export function wrapWgslPostEffect(source: string) {
  const stripped = source.replace(/\r/g, "").replace(/@fragment\s+/g, "");
  return `${POST_PREAMBLE}${stripped}\n${POST_ENTRY}`;
}

/** Pass-through plumbing when the chain has no author effects yet. */
const COPY_EFFECT = `fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  return color;
}
`;

type PingPongTarget = {
  texture: GpuTexture;
  view: GpuTextureView;
};

type ResolvedPass = {
  effect: InternalEffect | null;
  pipeline: GpuRenderPipeline;
  passIndex: number;
  key: string;
};

class WebGpuPostBackend implements PostBackend {
  private device: GpuDevice | null = null;
  private format = "";
  private bindGroupLayout: unknown = null;
  private pipelineLayout: unknown = null;
  private sampler: GpuSampler | null = null;
  private corePrograms = new Map<string, GpuProgram>();
  private effectPrograms = new Map<string, GpuProgram>();
  private failedEffects = new Set<string>();
  private targets: PingPongTarget[] = [];
  private targetWidth = 0;
  private targetHeight = 0;
  private uniformBuffers = new Map<string, GpuBuffer>();
  private bindGroups = new Map<string, GpuBindGroup>();
  private scratch = new Float32Array(UNIFORM_FLOATS);
  private warnedOnce = new Set<string>();
  private lastSceneView: unknown = null;

  invalidate(id: string) {
    this.failedEffects.delete(id);
    this.effectPrograms.get(id)?.destroy();
    this.effectPrograms.delete(id);
    for (const key of [...this.bindGroups.keys()]) {
      if (key.startsWith(`${id}:`)) this.bindGroups.delete(key);
    }
    for (const [key, buffer] of [...this.uniformBuffers.entries()]) {
      if (!key.startsWith(`${id}:`)) continue;
      buffer.destroy();
      this.uniformBuffers.delete(key);
    }
  }

  destroy() {
    for (const program of this.corePrograms.values()) program.destroy();
    for (const program of this.effectPrograms.values()) program.destroy();
    this.corePrograms.clear();
    this.effectPrograms.clear();
    for (const buffer of this.uniformBuffers.values()) buffer.destroy();
    this.uniformBuffers.clear();
    this.releaseTargets();
    this.bindGroups.clear();
    this.failedEffects.clear();
    this.warnedOnce.clear();
    this.device = null;
    this.sampler = null;
    this.bindGroupLayout = null;
    this.pipelineLayout = null;
  }

  private warnOnce(key: string, message: string) {
    if (this.warnedOnce.has(key)) return;
    this.warnedOnce.add(key);
    console.warn(message);
  }

  private releaseTargets() {
    for (const target of this.targets) target.texture.destroy();
    this.targets = [];
    this.targetWidth = 0;
    this.targetHeight = 0;
  }

  private ensureDevice(device: GpuDevice, format: string) {
    if (this.device === device && this.format === format) return;
    // First frame, or the device changed under us — rebuild everything.
    this.destroy();
    this.device = device;
    this.format = format;
    this.bindGroupLayout = device.createBindGroupLayout({
      label: "post-bind-layout",
      entries: [
        { binding: 0, visibility: GPU_SHADER_STAGE.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPU_SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
        {
          binding: 2,
          visibility: GPU_SHADER_STAGE.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({
      label: "post-pipeline-layout",
      bindGroupLayouts: [this.bindGroupLayout],
    });
    this.sampler = device.createSampler({
      label: "post-sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    this.corePrograms.set("copy", this.compile(COPY_EFFECT, "post:copy"));
  }

  private compile(effectSource: string, label: string) {
    return compileGpuPipeline(
      this.device!,
      wrapWgslPostEffect(effectSource),
      this.format,
      label,
      {
        layout: this.pipelineLayout,
        vertexBuffers: null,
        blend: null,
      },
    );
  }

  private ensureTargets(width: number, height: number) {
    if (this.targets.length === 2 && this.targetWidth === width && this.targetHeight === height) {
      return;
    }
    this.releaseTargets();
    this.bindGroups.clear();
    const device = this.device!;
    const make = (suffix: string): PingPongTarget => {
      const texture = device.createTexture({
        label: `post-target-${suffix}`,
        size: { width, height },
        format: this.format,
        usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.TEXTURE_BINDING,
      });
      return { texture, view: texture.createView() };
    };
    this.targets = [make("a"), make("b")];
    this.targetWidth = width;
    this.targetHeight = height;
  }

  /** WGSL source for this effect, ignoring the GLSL-only variant. */
  private getEffectSource(effect: InternalEffect) {
    const wgsl = effect.fragmentShaderWgsl?.trim();
    if (wgsl) return wgsl;
    const shared = effect.fragmentShader?.trim();
    // A GLSL applyEffect cannot run here — the site must supply a WGSL variant.
    if (shared && !/\bfn\s+applyEffect/.test(shared)) {
      this.warnOnce(
        `glsl-only:${effect.id}`,
        `[post] Effect "${effect.id}" only ships a GLSL applyEffect; add fragmentShaderWgsl to run it on WebGPU.`,
      );
      return null;
    }
    return shared ?? null;
  }

  private resolveEffectPipeline(effect: InternalEffect) {
    if (this.failedEffects.has(effect.id)) return null;
    let program = this.effectPrograms.get(effect.id);
    if (!program) {
      const source = this.getEffectSource(effect);
      if (!source) return null;
      program = this.compile(source, `post:${effect.id}`);
      this.effectPrograms.set(effect.id, program);
    }
    if (program.status() === "failed") {
      this.failedEffects.add(effect.id);
      console.error(
        `[post] Effect "${effect.id}" WGSL failed to compile and was disabled. See shader log above.`,
      );
      return null;
    }
    return program.poll();
  }

  private getUniformBuffer(key: string) {
    let buffer = this.uniformBuffers.get(key);
    if (!buffer) {
      buffer = this.device!.createBuffer({
        label: `post-uni-${key}`,
        size: UNIFORM_BYTES,
        usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      });
      this.uniformBuffers.set(key, buffer);
    }
    return buffer;
  }

  /**
   * One bind group per (pass, source) pair. Every pass in a frame needs its own
   * uniform buffer: queue writes land before the submit, so a shared buffer
   * would give every pass the last pass's values.
   */
  private getBindGroup(key: string, sourceKey: string, buffer: GpuBuffer, view: GpuTextureView) {
    const cacheKey = `${key}|${sourceKey}`;
    let group = this.bindGroups.get(cacheKey);
    if (!group) {
      group = this.device!.createBindGroup({
        label: `post-bind-${cacheKey}`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer } },
          { binding: 1, resource: this.sampler! },
          { binding: 2, resource: view },
        ],
      });
      this.bindGroups.set(cacheKey, group);
    }
    return group;
  }

  private writeUniforms(
    buffer: GpuBuffer,
    values: Float32Array | null,
    width: number,
    height: number,
    frame: EnginePostFrame,
    passIndex: number,
  ) {
    const out = this.scratch;
    out.fill(0);
    if (values) {
      out.set(values.subarray(0, 16), 0);
    }
    out[16] = width;
    out[17] = height;
    out[18] = frame.now * 0.001;
    out[19] = frame.delta * 0.001;
    out[20] = passIndex;
    this.device!.queue.writeBuffer(buffer, 0, out);
  }

  /** Built-in kinds were removed — fragment effects pack uni via uniWatch. */
  private fragmentUniforms(effect: InternalEffect | null) {
    return effect?.uniWatch.toFloat32(16) ?? null;
  }

  render(frame: EnginePostFrame, effects: InternalEffect[]) {
    const gpu = getGpuPostFrame();
    if (!gpu) return;
    const scene = frame.inputTexture;
    if (scene.backend !== "webgpu") return;

    this.ensureDevice(gpu.device, gpu.format);
    const width = Math.max(1, frame.canvas.width);
    const height = Math.max(1, frame.canvas.height);
    const sceneView = scene.view as GpuTextureView;
    if (this.lastSceneView !== sceneView) {
      this.bindGroups.clear();
      this.lastSceneView = sceneView;
    }

    const copyPipeline = this.corePrograms.get("copy")?.poll() ?? null;
    if (!copyPipeline) {
      // Pipelines are still compiling (or the copy pass failed): show the scene
      // instead of an empty canvas.
      this.presentSceneDirectly(gpu.encoder, scene, gpu.getTargetTexture(), width, height);
      return;
    }

    const passes: ResolvedPass[] = [];
    for (const effect of effects) {
      if (!effect.enabled || this.failedEffects.has(effect.id)) continue;
      if (effect.kind !== "fragment") {
        this.warnOnce(
          `unsupported:${effect.id}`,
          `[post] Effect "${effect.id}" needs fragmentShader / fragmentShaderWgsl (no named package presets).`,
        );
        continue;
      }
      if (effect.textureUniforms && Object.keys(effect.textureUniforms).length > 0) {
        this.warnOnce(
          `texture-uniforms:${effect.id}`,
          `[post] Effect "${effect.id}" declares textureUniforms, which the WebGPU post chain does not bind yet. Sample the extra texture from a createItem / createScreen fragment instead.`,
        );
      }
      const pipeline = this.resolveEffectPipeline(effect);
      if (!pipeline) continue;
      const passCount = Math.max(1, Math.floor(effect.passes ?? 1));
      for (let index = 0; index < passCount; index++) {
        passes.push({
          effect,
          pipeline,
          passIndex: index,
          key: `${effect.id}:${index}`,
        });
      }
    }

    if (passes.length === 0) {
      passes.push({
        effect: null,
        pipeline: copyPipeline,
        passIndex: 0,
        key: "copy:0",
      });
    }

    if (passes.length > 1) {
      this.ensureTargets(width, height);
    }

    let sourceView = sceneView;
    let sourceKey = "scene";
    let writeIndex = 0;
    passes.forEach((entry, index) => {
      const isLast = index === passes.length - 1;
      const target = isLast ? null : this.targets[writeIndex % 2];
      if (!isLast && !target) return;
      const values = this.fragmentUniforms(entry.effect);
      const buffer = this.getUniformBuffer(entry.key);
      this.writeUniforms(buffer, values, width, height, frame, entry.passIndex);
      const bindGroup = this.getBindGroup(entry.key, sourceKey, buffer, sourceView);

      const pass = gpu.encoder.beginRenderPass({
        label: `post-${entry.key}`,
        colorAttachments: [
          {
            view: isLast ? gpu.getTargetView() : target!.view,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(entry.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();

      if (!isLast && target) {
        sourceView = target.view;
        sourceKey = writeIndex % 2 === 0 ? "a" : "b";
        writeIndex += 1;
      }
    });
  }

  /** Fail-soft path: raw texture copy while the post pipelines compile. */
  private presentSceneDirectly(
    encoder: GpuCommandEncoder,
    scene: WebGpuRenderTarget,
    targetTexture: GpuTexture,
    width: number,
    height: number,
  ) {
    if (!encoder.copyTextureToTexture) return;
    if (scene.format !== this.format) return;
    try {
      encoder.copyTextureToTexture(
        { texture: scene.texture as GpuTexture },
        { texture: targetTexture },
        { width: Math.min(width, scene.width), height: Math.min(height, scene.height) },
      );
    } catch (error) {
      this.warnOnce("copy-fallback", `[post] Could not copy the scene to the canvas: ${error}`);
    }
  }
}

export function createWebGpuPostBackend(): PostBackend {
  return new WebGpuPostBackend();
}
