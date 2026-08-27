export type ItemClipData = {
  vertices: Float32Array;
  isVisible: boolean;
};

// Module-level canvas rect cache — one getBoundingClientRect per canvas per frame.
// resetCanvasRectCache() must be called once at the start of each render frame.
let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCanvasRect: DOMRect | null = null;

export function resetCanvasRectCache() {
  cachedCanvas = null;
  cachedCanvasRect = null;
}

export function getElementClipData(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
): ItemClipData {
  const elementRect = element.getBoundingClientRect();
  if (canvas !== cachedCanvas || cachedCanvasRect === null) {
    cachedCanvas = canvas;
    cachedCanvasRect = canvas.getBoundingClientRect();
  }
  const canvasRect = cachedCanvasRect;

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
      vertices: new Float32Array(0),
    };
  }

  // place the quad at the element's real position, even off-canvas — the
  // gpu clips it; clamping to the viewport squeezed the texture instead
  const ndcLeft = (left / canvasWidth) * 2 - 1;
  const ndcRight = (right / canvasWidth) * 2 - 1;
  const ndcTop = 1 - (top / canvasHeight) * 2;
  const ndcBottom = 1 - (bottom / canvasHeight) * 2;

  return {
    isVisible: true,
    // Vertex layout: [position.x, position.y, uv.x, uv.y]
    // 0: top-left, 1: bottom-left, 2: top-right, 3: bottom-right
    vertices: new Float32Array([
      ndcLeft,
      ndcTop,
      0,
      0,
      ndcLeft,
      ndcBottom,
      0,
      1,
      ndcRight,
      ndcTop,
      1,
      0,
      ndcRight,
      ndcBottom,
      1,
      1,
    ]),
  };
}
