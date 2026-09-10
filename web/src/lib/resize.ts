type ResizeCallback = (rect: DOMRectReadOnly) => void;

const callbacks = new Set<ResizeCallback>();
let observer: ResizeObserver | null = null;

function updateViewportHeight() {
  document.documentElement.style.setProperty("--100vh", `${window.innerHeight}px`);
}

function observe() {
  if (observer) return;
  updateViewportHeight();
  observer = new ResizeObserver(([entry]) => {
    updateViewportHeight();
    if (!entry) return;
    for (const callback of callbacks) callback(entry.contentRect);
  });
  observer.observe(document.body);
}

export function initViewport() {
  observe();
}

export function onResize(callback: ResizeCallback): () => void {
  observe();
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}
