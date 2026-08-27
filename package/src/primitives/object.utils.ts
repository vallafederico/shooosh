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

/** Map (u,v) in [-1,1]^2 to position and normal on rounded rect (halfW, halfH, corner radius r). */
function roundedRect(
  u: number,
  v: number,
  halfW: number,
  halfH: number,
  r: number,
): { px: number; py: number; nx: number; ny: number } {
  const eps = 1e-6;
  const innerW = Math.max(0, halfW - r);
  const innerH = Math.max(0, halfH - r);
  const ax = Math.abs(u);
  const ay = Math.abs(v);
  const sx = u >= 0 ? 1 : -1;
  const sy = v >= 0 ? 1 : -1;
  if (ax < eps && ay < eps) {
    return { px: 0, py: 0, nx: 0, ny: 0 };
  }
  const tFlat = Math.min(
    halfW > 0 && ax > eps ? innerW / ax : 1e10,
    halfH > 0 && ay > eps ? innerH / ay : 1e10,
  );
  let tCircle = 1e10;
  if (r > 0) {
    const A = u * u + v * v;
    const B = u * (innerW * sx) + v * (innerH * sy);
    const C = innerW * innerW + innerH * innerH - r * r;
    const disc = B * B - A * C;
    if (disc >= 0 && A > eps) {
      tCircle = (B + Math.sqrt(disc)) / A;
    }
  }
  const t = Math.min(tFlat, tCircle);
  const px = t * u;
  const py = t * v;
  let nx: number, ny: number;
  const onCircle =
    r > 0 &&
    tCircle < 1e9 &&
    t >= tCircle - 0.001 &&
    (px - innerW * sx) ** 2 + (py - innerH * sy) ** 2 > eps;
  if (onCircle) {
    const cx = innerW * sx;
    const cy = innerH * sy;
    const d = Math.hypot(px - cx, py - cy) || 1;
    nx = (px - cx) / d;
    ny = (py - cy) / d;
  } else {
    if (tFlat <= (halfW > 0 && ax > eps ? innerW / ax : 1e10) + 0.001) {
      nx = sx;
      ny = 0;
    } else {
      nx = 0;
      ny = sy;
    }
  }
  return { px, py, nx, ny };
}

export function createRoundedBoxGeometry(params: {
  width: number;
  height: number;
  depth: number;
  rounding: number;
}): ObjectGeometry {
  const { width, height, depth, rounding } = params;
  const bx = width / 2;
  const by = height / 2;
  const bz = depth / 2;
  const r = Math.max(0, Math.min(rounding, width / 2, height / 2, depth / 2));
  const N = 10;
  const verts: number[] = [];
  const inds: number[] = [];
  let baseIndex = 0;

  const faces: Array<{
    axis: "x" | "y" | "z";
    sign: number;
    halfA: number;
    halfB: number;
    posC: number;
    outNorm: [number, number, number];
    flatNorm: [number, number, number];
  }> = [
    { axis: "z", sign: 1, halfA: bx, halfB: by, posC: bz, outNorm: [0, 0, 1], flatNorm: [0, 0, 1] },
    { axis: "z", sign: -1, halfA: bx, halfB: by, posC: -bz, outNorm: [0, 0, -1], flatNorm: [0, 0, -1] },
    { axis: "x", sign: 1, halfA: by, halfB: bz, posC: bx, outNorm: [1, 0, 0], flatNorm: [1, 0, 0] },
    { axis: "x", sign: -1, halfA: by, halfB: bz, posC: -bx, outNorm: [-1, 0, 0], flatNorm: [-1, 0, 0] },
    { axis: "y", sign: 1, halfA: bx, halfB: bz, posC: by, outNorm: [0, 1, 0], flatNorm: [0, 1, 0] },
    { axis: "y", sign: -1, halfA: bx, halfB: bz, posC: -by, outNorm: [0, -1, 0], flatNorm: [0, -1, 0] },
  ];

  for (const face of faces) {
    const { halfA, halfB, posC, outNorm, flatNorm } = face;
    const uSign = face.axis === "z" ? 1 : face.axis === "x" ? 1 : 1;
    const vSign = face.sign;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1;
        const v = ((j / N) * 2 - 1) * vSign;
        const { px, py, nx, ny } = roundedRect(u, v, halfA, halfB, r);
        const onFlat =
          Math.abs(Math.abs(nx) - 1) < 0.001 || Math.abs(Math.abs(ny) - 1) < 0.001;
        let x: number, y: number, z: number;
        if (face.axis === "z") {
          x = px * uSign;
          y = py;
          z = posC;
        } else if (face.axis === "x") {
          x = posC;
          y = px * uSign;
          z = py;
        } else {
          x = px * uSign;
          y = posC;
          z = py;
        }
        if (Math.hypot(px, py) < 1e-6) {
          verts.push(x, y, z, flatNorm[0], flatNorm[1], flatNorm[2]);
          continue;
        }
        let n0: number, n1: number, n2: number;
        if (face.axis === "z") {
          if (onFlat) {
            n0 = flatNorm[0];
            n1 = flatNorm[1];
            n2 = flatNorm[2];
          } else {
            n0 = nx * uSign;
            n1 = ny;
            n2 = 0;
          }
        } else if (face.axis === "x") {
          if (onFlat) {
            n0 = flatNorm[0];
            n1 = flatNorm[1];
            n2 = flatNorm[2];
          } else {
            n0 = 0;
            n1 = nx * uSign;
            n2 = ny;
          }
        } else {
          if (onFlat) {
            n0 = flatNorm[0];
            n1 = flatNorm[1];
            n2 = flatNorm[2];
          } else {
            n0 = nx * uSign;
            n1 = 0;
            n2 = ny;
          }
        }
        const len = Math.hypot(n0, n1, n2) || 1;
        verts.push(x, y, z, n0 / len, n1 / len, n2 / len);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = baseIndex + j * (N + 1) + i;
        const b = a + 1;
        const c = a + (N + 1);
        const d = c + 1;
        if (face.sign > 0) {
          inds.push(a, b, d, a, d, c);
        } else {
          inds.push(a, d, b, a, c, d);
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

export function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0, //
    0, 1, 0, 0, //
    0, 0, 1, 0, //
    0, 0, 0, 1,
  ]);
}

export function mat4Multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Translation(x: number, y: number, z: number) {
  const out = mat4Identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

export function mat4Scale(x: number, y: number, z: number) {
  const out = mat4Identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

export function mat4RotationX(angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0, //
    0, c, s, 0, //
    0, -s, c, 0, //
    0, 0, 0, 1,
  ]);
}

export function mat4RotationY(angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0, //
    0, 1, 0, 0, //
    s, 0, c, 0, //
    0, 0, 0, 1,
  ]);
}

export function mat4RotationZ(angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, s, 0, 0, //
    -s, c, 0, 0, //
    0, 0, 1, 0, //
    0, 0, 0, 1,
  ]);
}

export function mat4Perspective(fovRad: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0, //
    0, f, 0, 0, //
    0, 0, (far + near) * nf, -1, //
    0, 0, 2 * far * near * nf, 0,
  ]);
}
