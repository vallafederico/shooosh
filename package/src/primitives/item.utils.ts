/**
 * Element → clip-space verts for createItem. One canvas rect per frame.
 *
 * How to use: engines must call resetCanvasRectCache() at the start of each
 * render. Site code does not call this.
 */

export type ItemClipData = {
  vertices: Float32Array;
  isVisible: boolean;
  /** The element's getBoundingClientRect for this frame — reuse instead of re-querying. */
  rect: DOMRect;
};

// Module-level canvas rect cache — one getBoundingClientRect per canvas per frame.
// resetCanvasRectCache() must be called once at the start of each render frame.
let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCanvasRect: DOMRect | null = null;

export function resetCanvasRectCache() {
  cachedCanvas = null;
  cachedCanvasRect = null;
}

/** Per-frame cached canvas rect — shared by items, glyphs and particles. */
export function getCachedCanvasRect(canvas: HTMLCanvasElement): DOMRect {
  if (canvas !== cachedCanvas || cachedCanvasRect === null) {
    cachedCanvas = canvas;
    cachedCanvasRect = canvas.getBoundingClientRect();
  }
  return cachedCanvasRect;
}

const EMPTY_VERTICES = new Float32Array(0);

export function getElementClipData(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  /** Optional scratch Float32Array(16) — reused instead of allocating. */
  out?: Float32Array,
): ItemClipData {
  const elementRect = element.getBoundingClientRect();
  const canvasRect = getCachedCanvasRect(canvas);

  const left = elementRect.left - canvasRect.left;
  const right = elementRect.right - canvasRect.left;
  const top = elementRect.top - canvasRect.top;
  const bottom = elementRect.bottom - canvasRect.top;

  const canvasWidth = Math.max(1, canvasRect.width);
  const canvasHeight = Math.max(1, canvasRect.height);

  const overlapsCanvas =
    right > 0 && left < canvasWidth && bottom > 0 && top < canvasHeight;

  if (!overlapsCanvas) {
    return {
      isVisible: false,
      vertices: out ?? EMPTY_VERTICES,
      rect: elementRect,
    };
  }

  // place the quad at the element's real position, even off-canvas — the
  // gpu clips it; clamping to the viewport squeezed the texture instead
  const ndcLeft = (left / canvasWidth) * 2 - 1;
  const ndcRight = (right / canvasWidth) * 2 - 1;
  const ndcTop = 1 - (top / canvasHeight) * 2;
  const ndcBottom = 1 - (bottom / canvasHeight) * 2;

  // Vertex layout: [position.x, position.y, uv.x, uv.y]
  // 0: top-left, 1: bottom-left, 2: top-right, 3: bottom-right
  const vertices = out ?? new Float32Array(16);
  vertices[0] = ndcLeft;
  vertices[1] = ndcTop;
  vertices[2] = 0;
  vertices[3] = 0;
  vertices[4] = ndcLeft;
  vertices[5] = ndcBottom;
  vertices[6] = 0;
  vertices[7] = 1;
  vertices[8] = ndcRight;
  vertices[9] = ndcTop;
  vertices[10] = 1;
  vertices[11] = 0;
  vertices[12] = ndcRight;
  vertices[13] = ndcBottom;
  vertices[14] = 1;
  vertices[15] = 1;

  return {
    isVisible: true,
    vertices,
    rect: elementRect,
  };
}
