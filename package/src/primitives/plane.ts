import { getDefaultEngine, resolveEngine, type EngineFrame } from "../engine/engine";
import {
  ensureWatchableUni,
  type UniValues,
  type UniWatchController,
} from "../engine/uni";
import { resolveTextureUvTransform, type TextureFitMode } from "../loaders/texture-loader";
import { convertWgslFragmentToGlsl } from "../shaders/wgsl-compat";
import { compileProgramAsync } from "../shaders/compile";

export type FullscreenPlaneGeometry = {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  indexCount: number;
  subdivisionsX: number;
  subdivisionsY: number;
};

export type FullscreenPlaneRenderFrame = Pick<EngineFrame, "canvas" | "gl">;

export type FullscreenPlaneTexture = {
  view?: unknown;
  sampler?: unknown | null;
  texture?: { createView: () => unknown };
  width: number;
  height: number;
  aspect: number;
};

export type FullscreenPlaneRenderOptions = {
  subdivisionsX?: number;
  subdivisionsY?: number;
  debugUv?: boolean;
  shaders?: FullscreenPlaneShaders;
  uni?: UniValues;
  texture?: FullscreenPlaneTexture | null;
  textureFit?: TextureFitMode;
  renderLayer?: number;
};

export type FullscreenPlaneInitOptions = {
  subdivisionsX?: number;
  subdivisionsY?: number;
  debugUv?: boolean;
  shaders?: FullscreenPlaneShaders;
  uni?: UniValues;
  texture?: FullscreenPlaneTexture | null;
  textureFit?: TextureFitMode;
  renderLayer?: number;
  onFrame?: (
    plane: FullscreenPlaneController,
    frame: EngineFrame,
  ) => FullscreenPlaneController | void;
};

export type FullscreenPlaneShaders = {
  wgsl?: string;
  vertex?: string;
  fragment?: string;
};

export type FullscreenPlaneController = {
  render: () => void;
  configure: (next: Partial<FullscreenPlaneInitOptions>) => void;
  destroy: () => void;
  getGeometry: () => FullscreenPlaneGeometry;
  setUni: (next: Partial<UniValues>) => void;
  getUni: () => UniValues;
};

export type FullscreenPlaneRenderer = {
  readonly geometry: FullscreenPlaneGeometry;
  render: (frame: FullscreenPlaneRenderFrame) => void;
  destroy: () => void;
};

type WebglDeviceHandle = {
  gl: WebGL2RenderingContext;
};

function clampSubdivisions(value: number | undefined) {
  const resolved = Math.floor(value ?? 1);
  return Math.max(1, resolved);
}

export function createFullscreenPlaneGeometry(
  options: { subdivisionsX?: number; subdivisionsY?: number } = {},
) {
  const subdivisionsX = clampSubdivisions(options.subdivisionsX);
  const subdivisionsY = clampSubdivisions(options.subdivisionsY);

  const columns = subdivisionsX + 1;
  const rows = subdivisionsY + 1;
  const vertexCount = columns * rows;
  const indexCount = subdivisionsX * subdivisionsY * 6;
  const vertices = new Float32Array(vertexCount * 4);

  // Vertex layout: [position.x, position.y, uv.x, uv.y]
  // uv.y starts at top of screen (0 at top, 1 at bottom).
  let vertexOffset = 0;
  for (let y = 0; y <= subdivisionsY; y++) {
    const v = y / subdivisionsY;
    const positionY = 1 - v * 2;

    for (let x = 0; x <= subdivisionsX; x++) {
      const u = x / subdivisionsX;
      const positionX = -1 + u * 2;

      vertices[vertexOffset++] = positionX;
      vertices[vertexOffset++] = positionY;
      vertices[vertexOffset++] = u;
      vertices[vertexOffset++] = v;
    }
  }

  const indices: Uint16Array | Uint32Array =
    vertexCount > 65535
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);

  let indexOffset = 0;
  for (let y = 0; y < subdivisionsY; y++) {
    for (let x = 0; x < subdivisionsX; x++) {
      const topLeft = y * columns + x;
      const topRight = topLeft + 1;
      const bottomLeft = (y + 1) * columns + x;
      const bottomRight = bottomLeft + 1;

      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topRight;

      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomRight;
    }
  }

  return {
    vertices,
    indices,
    vertexCount,
    indexCount,
    subdivisionsX,
    subdivisionsY,
  } satisfies FullscreenPlaneGeometry;
}

function getDefaultVertexShader() {
  return `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = aUv;
}`;
}

function getDefaultFragmentShader(debugUv: boolean) {
  if (debugUv) {
    return `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;
void main() {
  outColor = vec4(vUv, max(0.0, uUni[0].x), 1.0);
}`;
  }
  return `#version 300 es
precision highp float;
uniform vec4 uUni[4];
out vec4 outColor;
void main() {
  float c = max(0.0, uUni[0].x);
  outColor = vec4(vec3(c), 1.0);
}`;
}

function getDefaultTextureFragmentShader() {
  return `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
uniform sampler2D uTexture;
out vec4 outColor;

float hash21(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q.x + q.y) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  float time = uUni[0].w;
  vec2 uv = vUv * uUni[1].xy + uUni[1].zw;
  vec2 noiseUv = uv * 9.0 + vec2(time * 0.35, time * 0.22);
  float n = valueNoise(noiseUv);
  float offset = (n - 0.5) * 0.035;
  vec2 distortedUv = uv + vec2(offset, -offset * 0.65);
  outColor = texture(uTexture, distortedUv);
}`;
}

function getShaderSource(options: {
  debugUv: boolean;
  shaders?: FullscreenPlaneShaders;
  hasTexture?: boolean;
}) {
  const wgslFragment =
    options.shaders?.fragment ??
    options.shaders?.wgsl ??
    null;
  if (wgslFragment) {
    // raw GLSL passthrough — full #version 300 es sources skip the WGSL shim
    if (/^\s*#version\s+300\s+es/.test(wgslFragment)) {
      return {
        vertex: getDefaultVertexShader(),
        fragment: wgslFragment,
      };
    }
    try {
      return {
        vertex: getDefaultVertexShader(),
        fragment: convertWgslFragmentToGlsl(wgslFragment, { includeUv: true }),
      };
    } catch (error) {
      console.warn(
        "Failed to compile custom WGSL fragment for WebGL, using default shader:",
        error,
      );
    }
  }
  if (options.shaders?.vertex) {
    console.warn("Custom WGSL vertex shaders are not supported on the WebGL runtime.");
  }
  return {
    vertex: getDefaultVertexShader(),
    fragment: options.hasTexture
      ? getDefaultTextureFragmentShader()
      : getDefaultFragmentShader(options.debugUv),
  };
}

export function createFullscreenPlaneRenderer(
  frame: FullscreenPlaneRenderFrame,
  options: FullscreenPlaneRenderOptions = {},
  uni?: UniWatchController,
) {
  const geometry = createFullscreenPlaneGeometry(options);
  const gl = frame.gl;

  const uniWatch = uni ?? ensureWatchableUni(options.uni ?? { value1: 1 });
  let uniValues = uniWatch.toFloat32(16);
  const unsubscribeUni = uniWatch.subscribe(() => {
    uniValues = uniWatch.toFloat32(16);
  });

  const texture = options.texture ?? null;
  const glTexture = (
    texture?.view as { texture?: WebGLTexture } | undefined
  )?.texture;

  const shaderSource = getShaderSource({
    debugUv: Boolean(options.debugUv),
    shaders: options.shaders,
    hasTexture: Boolean(glTexture),
  });
  const usesTexture = Boolean(glTexture);
  const asyncProgram = compileProgramAsync(
    gl,
    shaderSource.vertex,
    shaderSource.fragment,
    "plane",
  );
  let program: WebGLProgram | null = null;
  let uUniLoc: WebGLUniformLocation | null = null;
  let uTextureLoc: WebGLUniformLocation | null = null;

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Failed to create WebGL buffers.");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const indexType = geometry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

  return {
    geometry,
    render(nextFrame: FullscreenPlaneRenderFrame) {
      if (!program) {
        program = asyncProgram.poll();
        if (!program) return; // shader still compiling — skip this frame
        uUniLoc = gl.getUniformLocation(program, "uUni");
        uTextureLoc = gl.getUniformLocation(program, "uTexture");
      }
      uniWatch.set({
        value4: performance.now() * 0.001,
      });
      if (texture) {
        const targetAspect = nextFrame.canvas.width / Math.max(1, nextFrame.canvas.height);
        const uvTransform = resolveTextureUvTransform(
          texture.aspect,
          targetAspect,
          options.textureFit ?? "cover",
        );
        uniWatch.set({
          value5: uvTransform.scaleX,
          value6: uvTransform.scaleY,
          value7: uvTransform.offsetX,
          value8: uvTransform.offsetY,
        });
      }

      gl.disable(gl.DEPTH_TEST);
      // premultiplied-alpha blending: stacked planes composite instead of
      // overwriting lower layers with their transparent pixels
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      if (uUniLoc) {
        gl.uniform4fv(uUniLoc, uniValues);
      }
      if (usesTexture && glTexture && uTextureLoc) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.uniform1i(uTextureLoc, 0);
      }
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, geometry.indexCount, indexType, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      if (usesTexture) {
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    },
    destroy() {
      unsubscribeUni();
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
      asyncProgram.destroy();
    },
  } satisfies FullscreenPlaneRenderer;
}

export function initFullscreenPlane(
  options: FullscreenPlaneInitOptions = {},
): FullscreenPlaneController {
  let config: FullscreenPlaneInitOptions = {
    subdivisionsX: options.subdivisionsX ?? 1,
    subdivisionsY: options.subdivisionsY ?? 1,
    debugUv: options.debugUv ?? false,
    shaders: options.shaders,
    uni: options.uni,
    texture: options.texture ?? null,
    textureFit: options.textureFit ?? "cover",
    renderLayer: options.renderLayer ?? 0,
    onFrame: options.onFrame,
  };
  let renderer: FullscreenPlaneRenderer | null = null;
  const uni = ensureWatchableUni(options.uni ?? { value1: 1 });
  let controller: FullscreenPlaneController | null = null;

  const renderFromFrame = (frame: EngineFrame) => {
    if (!renderer) {
      renderer = createFullscreenPlaneRenderer(frame, config, uni);
    }
    if (controller) {
      config.onFrame?.(controller, frame);
    }
    renderer.render(frame);
  };

  let unsubscribe: (() => void) | null = null;
  const subscribeRender = () => {
    unsubscribe?.();
    unsubscribe = getDefaultEngine()!.onRender(renderFromFrame, {
      layer: config.renderLayer ?? 0,
    });
  };
  subscribeRender();

  controller = {
    render() {
      getDefaultEngine()?.render();
    },
    configure(next) {
      config = {
        ...config,
        ...next,
      };
      subscribeRender();

      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
    },
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
    },
    getGeometry() {
      return renderer?.geometry ?? createFullscreenPlaneGeometry(config);
    },
    setUni(next) {
      uni.set(next);
    },
    getUni() {
      return uni.target;
    },
  };
  return controller;
}
