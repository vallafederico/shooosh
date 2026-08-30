/**
 * createObjectGeometry — CPU meshes (rounded box, etc.) for createObject.
 *
 * How to use: pass the result as geometry. Not a scene graph.
 */

export type RoundedBoxParams = {
  type: "roundedBox";
  width: number;
  height: number;
  depth?: number;
  rounding: number;
};

export type ObjectShape =
  | "cube"
  | RoundedBoxParams
  | {
      type: "custom";
      vertices: Float32Array;
      indices: Uint16Array | Uint32Array;
      vertexStride?: 6 | 8;
    };

export type ObjectGeometry = {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexStride: 6 | 8;
};

export type ObjectPlacement = {
  isVisible: boolean;
  centerX: number;
  centerY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function createCubeGeometry(): ObjectGeometry {
  // Vertex layout: [position.x, position.y, position.z, normal.x, normal.y, normal.z]
  const vertices = new Float32Array([
    // +Z (front)
    -1, -1, 1, 0, 0, 1, 1, -1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, -1, 1, 1, 0, 0, 1,
    // -Z (back)
    1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, 1, -1, 0, 0, -1, 1, 1, -1,
    0, 0, -1,
    // -X (left)
    -1, -1, -1, -1, 0, 0, -1, -1, 1, -1, 0, 0, -1, 1, 1, -1, 0, 0, -1, 1, -1,
    -1, 0, 0,
    // +X (right)
    1, -1, 1, 1, 0, 0, 1, -1, -1, 1, 0, 0, 1, 1, -1, 1, 0, 0, 1, 1, 1, 1, 0, 0,
    // +Y (top)
    -1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, -1, 0, 1, 0, -1, 1, -1, 0, 1, 0,
    // -Y (bottom)
    -1, -1, -1, 0, -1, 0, 1, -1, -1, 0, -1, 0, 1, -1, 1, 0, -1, 0, -1, -1, 1,
    0, -1, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // +Z
    4, 5, 6, 4, 6, 7, // -Z
    8, 9, 10, 8, 10, 11, // -X
    12, 13, 14, 12, 14, 15, // +X
    16, 17, 18, 16, 18, 19, // +Y
    20, 21, 22, 20, 22, 23, // -Y
  ]);

  return { vertices, indices, vertexStride: 6 };
}

/**
 * Project a point on the sharp box surface onto a watertight rounded box.
 * Adjacent faces share the same edge / corner points (no face gaps).
 */
function projectRoundedBoxVertex(
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  r: number,
  faceNormal: [number, number, number],
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } {
  if (r <= 1e-8) {
    return {
      x,
      y,
      z,
      nx: faceNormal[0],
      ny: faceNormal[1],
      nz: faceNormal[2],
    };
  }
  const ix = Math.max(0, hx - r);
  const iy = Math.max(0, hy - r);
  const iz = Math.max(0, hz - r);
  const cx = Math.max(-ix, Math.min(ix, x));
  const cy = Math.max(-iy, Math.min(iy, y));
  const cz = Math.max(-iz, Math.min(iz, z));
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-8) {
    return {
      x: cx + faceNormal[0] * r,
      y: cy + faceNormal[1] * r,
      z: cz + faceNormal[2] * r,
      nx: faceNormal[0],
      ny: faceNormal[1],
      nz: faceNormal[2],
    };
  }
  const inv = r / len;
  return {
    x: cx + dx * inv,
    y: cy + dy * inv,
    z: cz + dz * inv,
    nx: dx / len,
    ny: dy / len,
    nz: dz / len,
  };
}

export function createRoundedBoxGeometry(params: {
  width: number;
  height: number;
  depth: number;
  rounding: number;
}): ObjectGeometry {
  const { width, height, depth, rounding } = params;
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const r = Math.max(0, Math.min(rounding, width / 2, height / 2, depth / 2));
  const N = 10;
  const verts: number[] = [];
  const inds: number[] = [];
  let baseIndex = 0;

  const faces: Array<{
    normal: [number, number, number];
    /** Sharp-box corner of the face, parameterized by (i,j) in [0,N]. */
    corner: (i: number, j: number) => [number, number, number];
    /** Flip winding when the face normal points toward -axis. */
    flip: boolean;
  }> = [
    {
      normal: [0, 0, 1],
      flip: false,
      corner: (i, j) => [-hx + (2 * hx * i) / N, -hy + (2 * hy * j) / N, hz],
    },
    {
      normal: [0, 0, -1],
      flip: true,
      corner: (i, j) => [-hx + (2 * hx * i) / N, -hy + (2 * hy * j) / N, -hz],
    },
    {
      normal: [1, 0, 0],
      flip: false,
      corner: (i, j) => [hx, -hy + (2 * hy * i) / N, -hz + (2 * hz * j) / N],
    },
    {
      normal: [-1, 0, 0],
      flip: true,
      corner: (i, j) => [-hx, -hy + (2 * hy * i) / N, -hz + (2 * hz * j) / N],
    },
    {
      normal: [0, 1, 0],
      flip: false,
      corner: (i, j) => [-hx + (2 * hx * i) / N, hy, -hz + (2 * hz * j) / N],
    },
    {
      normal: [0, -1, 0],
      flip: true,
      corner: (i, j) => [-hx + (2 * hx * i) / N, -hy, -hz + (2 * hz * j) / N],
    },
  ];

  for (const face of faces) {
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const [sx, sy, sz] = face.corner(i, j);
        const p = projectRoundedBoxVertex(sx, sy, sz, hx, hy, hz, r, face.normal);
        verts.push(p.x, p.y, p.z, p.nx, p.ny, p.nz);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = baseIndex + j * (N + 1) + i;
        const b = a + 1;
        const c = a + (N + 1);
        const d = c + 1;
        if (face.flip) {
          inds.push(a, d, b, a, c, d);
        } else {
          inds.push(a, b, d, a, d, c);
        }
      }
    }
    baseIndex += (N + 1) * (N + 1);
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(inds),
    vertexStride: 6,
  };
}

export function createObjectGeometry(shape: ObjectShape = "cube"): ObjectGeometry {
  if (shape === "cube") {
    return createCubeGeometry();
  }
  if (typeof shape === "object" && shape.type === "roundedBox") {
    const depth = shape.depth ?? Math.min(shape.width, shape.height);
    return createRoundedBoxGeometry({
      width: shape.width,
      height: shape.height,
      depth,
      rounding: shape.rounding,
    });
  }
  if (typeof shape === "object" && shape.type === "custom") {
    return {
      vertices: shape.vertices,
      indices: shape.indices,
      vertexStride: shape.vertexStride ?? 6,
    };
  }
  return createCubeGeometry();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getElementObjectPlacement(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
): ObjectPlacement {
  const elementRect = element.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const leftCss = elementRect.left - canvasRect.left;
  const rightCss = elementRect.right - canvasRect.left;
  const topCss = elementRect.top - canvasRect.top;
  const bottomCss = elementRect.bottom - canvasRect.top;

  const canvasWidthCss = Math.max(1, canvasRect.width);
  const canvasHeightCss = Math.max(1, canvasRect.height);

  const overlapsCanvas =
    rightCss > 0 &&
    leftCss < canvasWidthCss &&
    bottomCss > 0 &&
    topCss < canvasHeightCss;

  if (!overlapsCanvas) {
    return {
      isVisible: false,
      centerX: 0,
      centerY: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scale: 0,
    };
  }

  const pixelRatioX = canvas.width / canvasWidthCss;
  const pixelRatioY = canvas.height / canvasHeightCss;
  // Do not clamp center in NDC; clamping causes sticky edge behavior
  // when elements are partially outside of the canvas.
  const centerX = (((leftCss + rightCss) * 0.5 * 2) / canvasWidthCss) - 1;
  const centerY = 1 - (((topCss + bottomCss) * 0.5 * 2) / canvasHeightCss);
  const x = Math.floor(clamp(leftCss, 0, canvasWidthCss) * pixelRatioX);
  const y = Math.floor(clamp(topCss, 0, canvasHeightCss) * pixelRatioY);
  // Keep object sizing stable even when wrapper is partially out of view:
  // visibility uses clipped overlap, but scale/aspect use the full DOM box size.
  const width = Math.max(1, Math.floor(elementRect.width * pixelRatioX));
  const height = Math.max(1, Math.floor(elementRect.height * pixelRatioY));

  const scale = Math.max(0.001, Math.min(width, height) / Math.max(canvas.width, canvas.height));

  return {
    isVisible: true,
    centerX,
    centerY,
    x,
    y,
    width,
    height,
    scale,
  };
}

// All mat4 helpers accept an optional `out` (Float32Array(16)) so per-frame
// callers can reuse scratch matrices; the no-arg form still allocates.

export function mat4Identity(out?: Float32Array) {
  const m = out ?? new Float32Array(16);
  m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
  m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
  m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
  m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  return m;
}

/** `out` must not alias `a` or `b`. */
export function mat4Multiply(a: Float32Array, b: Float32Array, out?: Float32Array) {
  const m = out ?? new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      m[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return m;
}

export function mat4Translation(x: number, y: number, z: number, out?: Float32Array) {
  const m = mat4Identity(out);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mat4Scale(x: number, y: number, z: number, out?: Float32Array) {
  const m = mat4Identity(out);
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function mat4RotationX(angle: number, out?: Float32Array) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity(out);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function mat4RotationY(angle: number, out?: Float32Array) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity(out);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mat4RotationZ(angle: number, out?: Float32Array) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity(out);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

export function mat4Perspective(
  fovRad: number,
  aspect: number,
  near: number,
  far: number,
  out?: Float32Array,
) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  const m = out ?? new Float32Array(16);
  m.fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/** Same projection with clip z in [0, 1] — WebGPU's depth range. */
export function mat4PerspectiveZeroToOne(
  fovRad: number,
  aspect: number,
  near: number,
  far: number,
  out?: Float32Array,
) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  const m = out ?? new Float32Array(16);
  m.fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far * nf;
  m[11] = -1;
  m[14] = far * near * nf;
  return m;
}

// Flat [x, y, z, …] corner list — iterated without destructuring allocations.
const UNIT_CUBE_CORNERS = new Float32Array([
  -1, -1, -1,
  1, -1, -1,
  -1, 1, -1,
  1, 1, -1,
  -1, -1, 1,
  1, -1, 1,
  -1, 1, 1,
  1, 1, 1,
]);

/** Conservative unit-cube frustum test. Works for both clip z ranges. */
export function isMvpVisible(mvp: Float32Array) {
  let outsideLeft = true;
  let outsideRight = true;
  let outsideBottom = true;
  let outsideTop = true;
  let outsideNear = true;
  let outsideFar = true;

  for (let i = 0; i < UNIT_CUBE_CORNERS.length; i += 3) {
    const x = UNIT_CUBE_CORNERS[i]!;
    const y = UNIT_CUBE_CORNERS[i + 1]!;
    const z = UNIT_CUBE_CORNERS[i + 2]!;
    const px = mvp[0]! * x + mvp[4]! * y + mvp[8]! * z + mvp[12]!;
    const py = mvp[1]! * x + mvp[5]! * y + mvp[9]! * z + mvp[13]!;
    const pz = mvp[2]! * x + mvp[6]! * y + mvp[10]! * z + mvp[14]!;
    const pw = mvp[3]! * x + mvp[7]! * y + mvp[11]! * z + mvp[15]!;
    outsideLeft = outsideLeft && px < -pw;
    outsideRight = outsideRight && px > pw;
    outsideBottom = outsideBottom && py < -pw;
    outsideTop = outsideTop && py > pw;
    outsideNear = outsideNear && pz < 0;
    outsideFar = outsideFar && pz > pw;
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

// ─── Shared per-frame matrix block ───────────────────────────────────────────

export type ObjectTransformState = {
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
};

export type ObjectCameraOptions = {
  enabled?: boolean;
  fov?: number;
  near?: number;
  far?: number;
  distance?: number;
};

/** Per-renderer scratch matrices so computeObjectMatrices allocates nothing. */
export type ObjectMatrixScratch = {
  model: Float32Array;
  mvp: Float32Array;
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
};

export function createObjectMatrixScratch(): ObjectMatrixScratch {
  return {
    model: new Float32Array(16),
    mvp: new Float32Array(16),
    a: new Float32Array(16),
    b: new Float32Array(16),
    c: new Float32Array(16),
  };
}

/**
 * Model + MVP for one object frame — shared by the WebGL2 and WebGPU
 * renderers, which differ only in the projection's clip z range.
 * Results live in `scratch` and are valid until the next call.
 */
export function computeObjectMatrices(options: {
  placement: ObjectPlacement;
  transform: ObjectTransformState;
  camera: ObjectCameraOptions | undefined;
  canvas: { width: number; height: number };
  /** WebGPU clip z is [0, 1]; WebGL2 is [-1, 1]. */
  zeroToOneDepth: boolean;
  scratch: ObjectMatrixScratch;
}): { model: Float32Array; mvp: Float32Array } {
  const { placement, transform, camera, canvas, scratch } = options;

  const objectScale = Math.max(0.001, placement.scale * transform.scale);
  const s = mat4Scale(objectScale, objectScale, objectScale, scratch.a);
  const rx = mat4RotationX(transform.rotationX, scratch.b);
  const rxs = mat4Multiply(rx, s, scratch.c);
  const ry = mat4RotationY(transform.rotationY, scratch.a);
  const ryrxs = mat4Multiply(ry, rxs, scratch.b);
  const rz = mat4RotationZ(transform.rotationZ, scratch.a);
  const model = mat4Multiply(rz, ryrxs, scratch.model);

  const cameraEnabled = camera?.enabled ?? true;
  if (!cameraEnabled) {
    return { model, mvp: model };
  }

  const aspect = Math.max(0.0001, canvas.width / canvas.height);
  const fov = ((camera?.fov ?? 50) * Math.PI) / 180;
  const near = camera?.near ?? 0.1;
  const far = camera?.far ?? 10;
  const distance = camera?.distance ?? 2.6;
  const projection = options.zeroToOneDepth
    ? mat4PerspectiveZeroToOne(fov, aspect, near, far, scratch.a)
    : mat4Perspective(fov, aspect, near, far, scratch.a);
  const view = mat4Translation(0, 0, -distance, scratch.b);
  const vp = mat4Multiply(projection, view, scratch.c);
  const objectClip = mat4Multiply(vp, model, scratch.a);
  const clipOffset = mat4Translation(placement.centerX, placement.centerY, 0, scratch.b);
  const mvp = mat4Multiply(clipOffset, objectClip, scratch.mvp);
  return { model, mvp };
}

/** Placement for createObject(null, …) — centred in NDC, no DOM element. */
export function getScreenObjectPlacement(
  canvas: HTMLCanvasElement,
  screenPlacement: { centerX?: number; centerY?: number; scale?: number } | undefined,
): ObjectPlacement {
  const centerX = screenPlacement?.centerX ?? 0;
  const centerY = screenPlacement?.centerY ?? 0;
  const baseScale =
    (0.4 * Math.min(canvas.width, canvas.height)) /
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
