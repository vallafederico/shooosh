import { expect, test } from "bun:test"
import { createRoundedBoxGeometry } from "./object.utils"

test("rounded box edge vertices from adjacent faces coincide", () => {
  const geo = createRoundedBoxGeometry({
    width: 1.15,
    height: 1.15,
    depth: 1.15,
    rounding: 0.16,
  })
  const stride = geo.vertexStride
  const N = 10
  const faceVerts = (N + 1) * (N + 1)

  // +Z face (0) and +X face (2) share the edge at i=N on +Z / i varies on +X.
  // +Z corner(N, j) and +X corner(j matching y, …) — compare mid-edge j=N/2.
  const zFace = 0
  const xFace = 2
  const j = Math.floor(N / 2)
  const zIndex = (zFace * faceVerts + j * (N + 1) + N) * stride
  // +X face: corner(i,j) = [hx, -hy+…i, -hz+…j]; y matches +Z's y when i=j_z
  // +Z corner(N,j) y = -hy + 2*hy*j/N. On +X, i selects y: i=j.
  // +Z z=hz maps to +X's j where -hz+2*hz*j/N = hz → j=N.
  const xIndex = (xFace * faceVerts + N * (N + 1) + j) * stride

  const zx = geo.vertices[zIndex]!
  const zy = geo.vertices[zIndex + 1]!
  const zz = geo.vertices[zIndex + 2]!
  const xx = geo.vertices[xIndex]!
  const xy = geo.vertices[xIndex + 1]!
  const xz = geo.vertices[xIndex + 2]!

  expect(Math.hypot(zx - xx, zy - xy, zz - xz)).toBeLessThan(1e-5)
})

test("rounded box with zero rounding matches sharp extents", () => {
  const geo = createRoundedBoxGeometry({
    width: 2,
    height: 2,
    depth: 2,
    rounding: 0,
  })
  let maxAbs = 0
  for (let i = 0; i < geo.vertices.length; i += geo.vertexStride) {
    maxAbs = Math.max(
      maxAbs,
      Math.abs(geo.vertices[i]!),
      Math.abs(geo.vertices[i + 1]!),
      Math.abs(geo.vertices[i + 2]!),
    )
  }
  expect(maxAbs).toBeCloseTo(1, 5)
})
