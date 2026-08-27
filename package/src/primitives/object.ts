import { getDefaultEngine, resolveEngine, type EngineFrame } from "../engine/engine";
import {
  ensureWatchableUni,
  type UniWatchController,
  type UniValues,
} from "../engine/uni";
import {
  createObjectGeometry,
  getElementObjectPlacement,
  mat4Multiply,
  mat4Perspective,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scale,
  mat4Translation,
  type ObjectPlacement,
  type ObjectShape,
} from "./object.utils";
import { convertWgslFragmentToGlsl } from "../shaders/wgsl-compat";
import { compileProgramAsync } from "../shaders/compile";

type ObjectRenderer = {
  render: (frame: EngineFrame) => boolean;
  destroy: () => void;
};

export type ObjectShaders = {
  wgsl?: string;
  vertex?: string;
  fragment?: string;
  /** Use a raw GLSL fragment shader (WebGL2). */
  fragmentGlsl?: string;
};

type ObjectEnvMapHandle = {
  texture: WebGLTexture;
  gl: WebGL2RenderingContext;
};

type ObjectMaskMapHandle = {
  texture: WebGLTexture;
  gl: WebGL2RenderingContext;
};

/** Explicit placement when not using a DOM element. NDC: centerX/centerY in [-1, 1]. scale: multiplier of default size (1 = default, 2 = twice as big). */
export type ScreenPlacement = {
  centerX?: number;
  centerY?: number;
  scale?: number;
};

export type ObjectOptions = {
  layer?: number;
  shaders?: ObjectShaders;
  frustumCulling?: boolean;
  shape?: ObjectShape;
  scale?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  /** When set, object is placed by this instead of a DOM element. Use with createObject(null, options). */
  placement?: ScreenPlacement;
  onFrame?: (
    object: ObjectManager,
    frame: EngineFrame,
  ) => ObjectManager | void;
  camera?: {
    enabled?: boolean;
    fov?: number;
    near?: number;
    far?: number;
    distance?: number;
  };
  uni?: UniValues;
  /** Optional environment map used by fragment shaders that sample uEnvMap. */
  envMap?: ObjectEnvMapHandle | null;
  /** Optional mask map used by fragment shaders that sample uMaskMap. */
  maskMap?: ObjectMaskMapHandle | null;
};

const UNIT_CUBE_CORNERS: Array<[number, number, number]> = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1],
];

function transformPoint(m: Float32Array, x: number, y: number, z: number) {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
    w: m[3] * x + m[7] * y + m[11] * z + m[15],
  };
}

function isMvpVisible(mvp: Float32Array) {
  let outsideLeft = true;
  let outsideRight = true;
  let outsideBottom = true;
  let outsideTop = true;
  let outsideNear = true;
  let outsideFar = true;

  for (const [x, y, z] of UNIT_CUBE_CORNERS) {
    const p = transformPoint(mvp, x, y, z);
    outsideLeft = outsideLeft && p.x < -p.w;
    outsideRight = outsideRight && p.x > p.w;
    outsideBottom = outsideBottom && p.y < -p.w;
    outsideTop = outsideTop && p.y > p.w;
    outsideNear = outsideNear && p.z < 0;
    outsideFar = outsideFar && p.z > p.w;
  }

  return !(
    outsideLeft ||
    outsideRight ||
    outsideBottom ||
    outsideTop ||
    outsideNear ||
    outsideFar
  );
}

export class ObjectManager {
  private static pending = new Set<ObjectManager>();
  private static pendingRafId = 0;

  private element: HTMLElement | null;
  private options: ObjectOptions;
  private uni: UniWatchController;
  private transform = {
    scale: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  };
  private renderer: ObjectRenderer | null = null;
  private unsubscribeRender: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private destroyed = false;

  constructor(element: HTMLElement | null, options: ObjectOptions = {}) {
    this.element = element;
    this.options = options;
    this.uni = ensureWatchableUni(options.uni ?? { value1: 1 });
    this.transform.scale = options.scale ?? 1;
    this.transform.rotationX = options.rotationX ?? 0;
    this.transform.rotationY = options.rotationY ?? 0;
    this.transform.rotationZ = options.rotationZ ?? 0;
    this.connectOrQueue();
  }

  setUni(next: Partial<UniValues>) {
    this.uni.set(next);
  }

  getUni() {
    return this.uni.target;
  }

  setTransform(next: Partial<typeof this.transform>) {
    if (typeof next.scale === "number") this.transform.scale = next.scale;
    if (typeof next.rotationX === "number")
      this.transform.rotationX = next.rotationX;
    if (typeof next.rotationY === "number")
      this.transform.rotationY = next.rotationY;
    if (typeof next.rotationZ === "number")
      this.transform.rotationZ = next.rotationZ;
  }

  getTransform() {
    return this.transform;
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribeRender?.();
    this.unsubscribeRender = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.canvas = null;
    ObjectManager.pending.delete(this);
  }

  private connectOrQueue() {
    if (this.destroyed) return;

    const webgl = getDefaultEngine();
    if (webgl) {
      this.attach();
      return;
    }

    ObjectManager.pending.add(this);
    ObjectManager.ensurePendingLoop();
  }

  private attach() {
    if (this.destroyed || this.unsubscribeRender) return;

    this.unsubscribeRender = getDefaultEngine()!.onRender(
      (frame) => {
        if (this.destroyed) return;

        if (!this.canvas) {
          this.canvas = frame.canvas;
        }
        if (this.canvas !== frame.canvas) {
          return;
        }

        if (!this.renderer) {
          this.renderer = createObjectRenderer(
            this.element,
            frame,
            this.options,
            this.uni,
            this.transform,
          );
        }
        const didRender = this.renderer.render(frame);
        if (didRender) {
          this.options.onFrame?.(this, frame);
        }
      },
      { layer: this.options.layer ?? 20 },
    );
  }

  private static ensurePendingLoop() {
    if (ObjectManager.pendingRafId) return;

    const step = () => {
      ObjectManager.pendingRafId = 0;
      if (ObjectManager.pending.size === 0) return;

      const webgl = getDefaultEngine();
      if (!webgl) {
        ObjectManager.pendingRafId = window.requestAnimationFrame(step);
        return;
      }

      const pendingNow = Array.from(ObjectManager.pending);
      ObjectManager.pending.clear();
      pendingNow.forEach((item) => item.attach());
    };

    ObjectManager.pendingRafId = window.requestAnimationFrame(step);
  }
}

function getDefaultVertexShader() {
  return `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
out vec3 vNormal;
out vec2 vUv;
void main() {
  gl_Position = uMvp * vec4(aPosition, 1.0);
  vNormal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
  vUv = aUv;
}`;
}

/** Default material: visualize normals as RGB (normal * 0.5 + 0.5). */
function getDefaultFragmentShader() {
  return `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = vec4(mix(normalize(vNormal) * 0.5 + vec3(0.5), vec3(vUv, 0.0), 0.0), 1.0);
}`;
}

function getSolidTexture(
  gl: WebGL2RenderingContext,
  rgba: [number, number, number, number],
) {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create fallback WebGL texture.");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const pixel = new Uint8Array(rgba);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function getShaderSource(options: ObjectOptions) {
  if (options.shaders?.fragmentGlsl) {
    return {
      vertex: getDefaultVertexShader(),
      fragment: options.shaders.fragmentGlsl,
    };
  }
  const wgslFragment =
    options.shaders?.fragment ?? options.shaders?.wgsl ?? null;
  if (wgslFragment) {
    try {
      return {
        vertex: getDefaultVertexShader(),
        fragment: convertWgslFragmentToGlsl(wgslFragment, {
          includeUv: true,
          includeNormal: true,
        }),
      };
    } catch (error) {
      console.warn(
        "Failed to compile custom WGSL fragment for WebGL, using default shader:",
        error,
      );
    }
  }
  if (options.shaders?.vertex) {
    console.warn(
      "Custom WGSL vertex shaders are not supported on the WebGL runtime.",
    );
  }
  return {
    vertex: getDefaultVertexShader(),
    fragment: getDefaultFragmentShader(),
  };
}

function getScreenPlacement(
  canvas: HTMLCanvasElement,
  screenPlacement: ScreenPlacement | undefined,
): ObjectPlacement {
  const centerX = screenPlacement?.centerX ?? 0;
  const centerY = screenPlacement?.centerY ?? 0;
  const baseScale =
    (0.25 * Math.min(canvas.width, canvas.height)) /
    Math.max(canvas.width, canvas.height);
  const scale = (screenPlacement?.scale ?? 1) * baseScale;
  return {
    isVisible: true,
    centerX,
    centerY,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    scale: Math.max(0.001, scale),
  };
}

function createObjectRenderer(
  element: HTMLElement | null,
  frame: EngineFrame,
  options: ObjectOptions,
  uni: UniWatchController,
  transform: {
    scale: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
  },
): ObjectRenderer {
  const gl = frame.gl;

  const useScreenPlacement = element == null;
  const screenPlacement: ScreenPlacement | undefined = useScreenPlacement
    ? (options.placement ?? { centerX: 0, centerY: 0, scale: 1 })
    : undefined;

  const geometry = createObjectGeometry(options.shape ?? "cube");

  const shader = getShaderSource(options);
  const asyncProgram = compileProgramAsync(
    gl,
    shader.vertex,
    shader.fragment,
    "object",
  );
  let program: WebGLProgram | null = null;

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Failed to create WebGL buffers.");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
  const strideBytes = geometry.vertexStride * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, strideBytes, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, strideBytes, 12);
  if (geometry.vertexStride >= 8) {
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, strideBytes, 24);
  } else {
    gl.disableVertexAttribArray(2);
    gl.vertexAttrib2f(2, 0.0, 0.0);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const indexType =
    geometry.indices instanceof Uint32Array
      ? gl.UNSIGNED_INT
      : gl.UNSIGNED_SHORT;

  let uMvpLoc: WebGLUniformLocation | null = null;
  let uModelLoc: WebGLUniformLocation | null = null;
  let uEnvMapLoc: WebGLUniformLocation | null = null;
  let uMaskMapLoc: WebGLUniformLocation | null = null;
  let uHasUvLoc: WebGLUniformLocation | null = null;
  let uValue1Loc: WebGLUniformLocation | null = null;
  const fallbackWhiteTexture = getSolidTexture(gl, [255, 255, 255, 255]);
  const fallbackBlackTexture = getSolidTexture(gl, [0, 0, 0, 255]);
  const envMapTexture =
    options.envMap?.gl === gl ? options.envMap.texture : fallbackWhiteTexture;
  const maskMapTexture =
    options.maskMap?.gl === gl ? options.maskMap.texture : fallbackBlackTexture;
  const unsubscribeUni = uni.subscribe(() => {
    // Keep API parity; custom uni values are tracked but not consumed by default WebGL shaders.
  });

  return {
    render(nextFrame) {
      if (!program) {
        program = asyncProgram.poll();
        if (!program) return false; // shader still compiling — skip this frame
        uMvpLoc = gl.getUniformLocation(program, "uMvp");
        uModelLoc = gl.getUniformLocation(program, "uModel");
        uEnvMapLoc = gl.getUniformLocation(program, "uEnvMap");
        uMaskMapLoc = gl.getUniformLocation(program, "uMaskMap");
        uHasUvLoc = gl.getUniformLocation(program, "uHasUv");
        uValue1Loc = gl.getUniformLocation(program, "uValue1");
      }
      const placement = useScreenPlacement
        ? getScreenPlacement(nextFrame.canvas, screenPlacement)
        : getElementObjectPlacement(element!, nextFrame.canvas);
      if (!placement.isVisible) return false;

      const objectScale = Math.max(0.001, placement.scale * transform.scale);
      const s = mat4Scale(objectScale, objectScale, objectScale);
      const rx = mat4RotationX(transform.rotationX);
      const ry = mat4RotationY(transform.rotationY);
      const rz = mat4RotationZ(transform.rotationZ);
      const model = mat4Multiply(rz, mat4Multiply(ry, mat4Multiply(rx, s)));

      const cameraEnabled = options.camera?.enabled ?? true;
      const mvp = (() => {
        if (!cameraEnabled) {
          return model;
        }

        const canvas = nextFrame.canvas;
        const aspect = Math.max(0.0001, canvas.width / canvas.height);
        const fov = ((options.camera?.fov ?? 50) * Math.PI) / 180;
        const near = options.camera?.near ?? 0.1;
        const far = options.camera?.far ?? 10;
        const distance = options.camera?.distance ?? 2.6;
        const projection = mat4Perspective(fov, aspect, near, far);
        const view = mat4Translation(0, 0, -distance);
        const vp = mat4Multiply(projection, view);
        const objectClip = mat4Multiply(vp, model);
        const clipOffset = mat4Translation(
          placement.centerX,
          placement.centerY,
          0,
        );
        return mat4Multiply(clipOffset, objectClip);
      })();

      const cullingEnabled =
        !useScreenPlacement && (options.frustumCulling ?? true);
      if (cullingEnabled && !isMvpVisible(mvp)) {
        return false;
      }

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.useProgram(program!);
      if (uMvpLoc) gl.uniformMatrix4fv(uMvpLoc, false, mvp);
      if (uModelLoc) gl.uniformMatrix4fv(uModelLoc, false, model);
      if (uEnvMapLoc) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, envMapTexture);
        gl.uniform1i(uEnvMapLoc, 0);
      }
      if (uMaskMapLoc) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskMapTexture);
        gl.uniform1i(uMaskMapLoc, 1);
      }
      if (uHasUvLoc) {
        gl.uniform1f(uHasUvLoc, geometry.vertexStride >= 8 ? 1 : 0);
      }
      if (uValue1Loc) {
        gl.uniform1f(uValue1Loc, uni.target.value1 ?? 0);
      }
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, geometry.indices.length, indexType, 0);
      gl.bindVertexArray(null);
      return true;
    },
    destroy() {
      unsubscribeUni();
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
      asyncProgram.destroy();
      gl.deleteTexture(fallbackWhiteTexture);
      gl.deleteTexture(fallbackBlackTexture);
    },
  };
}
