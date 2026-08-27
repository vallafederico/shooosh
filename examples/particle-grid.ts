/**
 * Clip-space particle grid — aiuis ParticleGrid.
 *
 * When: decorative dots over the page (not DOM-tracked).
 * Backend: WebGL2 only. Needs a default engine (createScene or acquireLayer first).
 *
 * positions is [x,y,x,y,…] in clip space. Recreate if the count changes;
 * setPositions on scroll is cheaper than destroy/create.
 *
 * Docs: docs/site-patterns.md
 */

import { createParticles, createScene } from "shooosh"

function grid(cols: number, rows: number) {
  const positions = new Float32Array(cols * rows * 2)
  let i = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      positions[i++] = (x / (cols - 1)) * 2 - 1
      positions[i++] = (y / (rows - 1)) * 2 - 1
    }
  }
  return positions
}

export async function mount(canvas: HTMLCanvasElement) {
  const scene = createScene(canvas, {
    autoInit: false,
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
  })
  await scene.init()

  const dots = createParticles({
    positions: grid(24, 14),
    size: 3,
    color: [0.85, 1, 0.24, 0.85],
    layer: 10,
  })

  return () => {
    dots.destroy()
    scene.destroy()
  }
}
