/**
 * ObjectManager — mesh draw on both backends. Not a public import.
 *
 * How to use: createObject() wraps this. WebGPU goes through gpu-object.ts
 * (loaded on the first webgpu frame) and depth-tests against the engine's scene
 * depth buffer; WebGL2 keeps the GLSL path below.
 *
 * Docs: docs/api.md
 */

import { getDefaultEngine, type EngineFrame } from "../engine/engine";
import {
  ensureWatchableUni,
  type UniWatchController,
  type UniValues,
} from "../engine/uni";
import {
  createObjectGeometry,
  getElementObjectPlacement,
  getScreenObjectPlacement,
  isMvpVisible,
  mat4Multiply,
  mat4Perspective,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scale,
  mat4Translation,
  type ObjectShape,
} from "./object.utils";
import { convertWgslFragmentToGlsl } from "../shaders/wgsl-compat";
import { compileProgramAsync } from "../shaders/compile";
import { createLazyGpuFactory, createPendingAttachQueue } from "./pending-attach";

const ensureGpuObjectFactory = createLazyGpuFactory({
  label: "object",
  load: () => import("./gpu-object").then((m) => m.createGpuObjectRenderer),
});

const pendingObjects = createPendingAttachQueue<ObjectManager>((object) => {
  object.attachFromPending();
});

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

/**
 * Env/mask maps: pass `loadTexture(...).texture` (TextureHandle) or the full
 * loader result. WebGL2 matches on `gl`; WebGPU uses `createView()`.
 */
type ObjectEnvMapHandle = {
  texture?: unknown;
  gl?: WebGL2RenderingContext;
  createView?: () => unknown;
  backend?: string;
};

type ObjectMaskMapHandle = ObjectEnvMapHandle;

/** Resolve a WebGL2 texture from a TextureHandle or nested loader result. */
function resolveGlMapTexture(
  handle: ObjectEnvMapHandle | null | undefined,
  gl: WebGL2RenderingContext,
  fallback: WebGLTexture,
): WebGLTexture {
  if (!handle) return fallback;
  const inner =
    typeof handle.createView === "function"
      ? handle
      : ((handle.texture as ObjectEnvMapHandle | undefined) ?? null);
  if (!inner || inner.gl !== gl) return fallback;
  const tex = inner.texture;
  if (!tex || typeof (tex as { createView?: unknown }).createView === "function") {
    return fallback;
  }
  return tex as WebGLTexture;
}

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

export class ObjectManager {
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
    let changed = false;
    if (typeof next.scale === "number" && next.scale !== this.transform.scale) {
      this.transform.scale = next.scale;
      changed = true;
    }
    if (
      typeof next.rotationX === "number" &&
      next.rotationX !== this.transform.rotationX
    ) {
      this.transform.rotationX = next.rotationX;
      changed = true;
    }
    if (
      typeof next.rotationY === "number" &&
      next.rotationY !== this.transform.rotationY
    ) {
      this.transform.rotationY = next.rotationY;
      changed = true;
    }
    if (
      typeof next.rotationZ === "number" &&
      next.rotationZ !== this.transform.rotationZ
    ) {
      this.transform.rotationZ = next.rotationZ;
      changed = true;
    }
    if (changed) getDefaultEngine()?.requestFrame();
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
    pendingObjects.dequeue(this);
  }

  private connectOrQueue() {
    if (this.destroyed) return;

    const webgl = getDefaultEngine();
    if (webgl) {
      this.attach();
      return;
    }

    pendingObjects.enqueue(this);
  }

  /** @internal pending-attach queue */
  attachFromPending() {
    this.attach();
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
          if (frame.backend === "webgpu") {
            const createGpuRenderer = ensureGpuObjectFactory();
            if (!createGpuRenderer) return;
            this.renderer = createGpuRenderer(
              this.element,
              this.options,
              this.uni,
              this.transform,
            );
          } else if (frame.gl) {
            this.renderer = createObjectRenderer(
              this.element,
              frame,
              this.options,
              this.uni,
              this.transform,
            );
          } else {
            return;
          }
        }
        // Match createItem: onFrame first so setTransform/setUni keep the settle
        // loop hot before (and even if) this draw is skipped.
        this.options.onFrame?.(this, frame);
        this.renderer.render(frame);
      },
      { layer: this.options.layer ?? 20 },
    );
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
  if (!gl) {
    return { render: () => false, destroy() {} };
  }

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
  let uUniLoc: WebGLUniformLocation | null = null;
  const fallbackWhiteTexture = getSolidTexture(gl, [255, 255, 255, 255]);
  const fallbackBlackTexture = getSolidTexture(gl, [0, 0, 0, 255]);
  const envMapTexture = resolveGlMapTexture(
    options.envMap,
    gl,
    fallbackWhiteTexture,
  );
  const maskMapTexture = resolveGlMapTexture(
    options.maskMap,
    gl,
    fallbackBlackTexture,
  );
  let uniValues = uni.toFloat32(16);
  const unsubscribeUni = uni.subscribe(() => {
    uniValues = uni.toFloat32(16);
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
        uUniLoc = gl.getUniformLocation(program, "uUni");
      }
      const placement = useScreenPlacement
        ? getScreenObjectPlacement(nextFrame.canvas, screenPlacement)
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
      // Match WebGPU objects (cullMode: "none") — shared geometry winding
      // disagrees with GL's default CCW cull and punched holes in undersides.
      gl.disable(gl.CULL_FACE);
      gl.useProgram(program!);
      if (uMvpLoc) gl.uniformMatrix4fv(uMvpLoc, false, mvp);
      if (uModelLoc) gl.uniformMatrix4fv(uModelLoc, false, model);
      if (uUniLoc) gl.uniform4fv(uUniLoc, uniValues);
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
