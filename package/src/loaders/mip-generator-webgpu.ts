/**
 * WebGPU mipmap generation. Not a public import — used by the WebGPU texture
 * upload when `sampler.mipmapFilter` is requested.
 *
 * WebGPU has no `generateMipmap`, so each level is rendered from the one above
 * it: a fullscreen-triangle pass samples level N-1 with a linear sampler into
 * level N's render attachment. The pipeline/sampler are cached per device (and
 * per format), so repeated loads reuse them; all levels of one texture are
 * encoded into a single command submission.
 *
 * The source texture must carry TEXTURE_BINDING | RENDER_ATTACHMENT usage —
 * the upload path guards this before calling in.
 */

import {
  GPU_SHADER_STAGE,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuSampler,
  type GpuTexture,
} from "../engine/gpu-api";

const MIP_WGSL = `struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) index: u32) -> VsOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[index];
  var out: VsOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var uSource: texture_2d<f32>;

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4f {
  return textureSample(uSource, uSampler, in.uv);
}
`;

type MipGenerator = {
  sampler: GpuSampler;
  layout: unknown;
  pipelines: Map<string, GpuRenderPipeline>;
};

const generators = new WeakMap<GpuDevice, MipGenerator>();

/** Full mip chain length for a width×height texture. */
export function mipLevelCountFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height, 1))) + 1;
}

function getGenerator(device: GpuDevice): MipGenerator {
  let generator = generators.get(device);
  if (!generator) {
    generator = {
      sampler: device.createSampler({
        label: "shooosh-mip-sampler",
        magFilter: "linear",
        minFilter: "linear",
      }),
      layout: device.createBindGroupLayout({
        label: "shooosh-mip-layout",
        entries: [
          { binding: 0, visibility: GPU_SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
          {
            binding: 1,
            visibility: GPU_SHADER_STAGE.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d" },
          },
        ],
      }),
      pipelines: new Map(),
    };
    generators.set(device, generator);
  }
  return generator;
}

function getPipeline(device: GpuDevice, format: string): GpuRenderPipeline {
  const generator = getGenerator(device);
  let pipeline = generator.pipelines.get(format);
  if (!pipeline) {
    const module = device.createShaderModule({
      label: "shooosh-mip-blit",
      code: MIP_WGSL,
    });
    pipeline = device.createRenderPipeline({
      label: `shooosh-mip-blit-${format}`,
      layout: device.createPipelineLayout({
        label: "shooosh-mip-pipeline-layout",
        bindGroupLayouts: [generator.layout],
      }),
      vertex: { module, entryPoint: "vsMain" },
      fragment: { module, entryPoint: "fsMain", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    generator.pipelines.set(format, pipeline);
  }
  return pipeline;
}

/** Render levels 1..mipLevelCount-1 of `texture` from level 0. */
export function generateWebGpuMipmaps(
  device: GpuDevice,
  texture: GpuTexture,
  format: string,
  mipLevelCount: number,
  label = "shooosh-texture",
): void {
  if (mipLevelCount < 2) return;
  const generator = getGenerator(device);
  const pipeline = getPipeline(device, format);
  const encoder = device.createCommandEncoder({ label: `${label}-mips` });

  let sourceView = texture.createView({ baseMipLevel: 0, mipLevelCount: 1 });
  for (let level = 1; level < mipLevelCount; level += 1) {
    const targetView = texture.createView({ baseMipLevel: level, mipLevelCount: 1 });
    const pass = encoder.beginRenderPass({
      label: `${label}-mip-${level}`,
      colorAttachments: [
        { view: targetView, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        label: `${label}-mip-${level}-bind`,
        layout: generator.layout,
        entries: [
          { binding: 0, resource: generator.sampler },
          { binding: 1, resource: sourceView },
        ],
      }),
    );
    pass.draw(3);
    pass.end();
    sourceView = targetView;
  }

  device.queue.submit([encoder.finish()]);
}
