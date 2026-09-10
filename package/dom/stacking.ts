/** CSS stacking subset for supported, untransformed DOM painters. */
type Level = { element: HTMLElement; z: number; context: boolean };

export function orderDomPaint<T extends { el: HTMLElement }>(entries: T[], styles: Map<Element, CSSStyleDeclaration>) {
  const get = (el: HTMLElement) => {
    let style = styles.get(el);
    if (!style) { style = getComputedStyle(el); styles.set(el, style); }
    return style;
  };
  const paths = new Map<HTMLElement, Level[]>();
  const path = (el: HTMLElement): Level[] => {
    const known = paths.get(el); if (known) return known;
    const inherited = el.parentElement ? path(el.parentElement).filter(level => level.context) : [];
    const style = get(el), parent = el.parentElement ? get(el.parentElement) : null;
    const positioned = style.position !== "static";
    const flexOrGrid = !!parent && /^(inline-)?(flex|grid)$/.test(parent.display);
    const explicitZ = style.zIndex !== "auto" && Number.isFinite(Number(style.zIndex));
    const context = (explicitZ && (positioned || flexOrGrid)) ||
      style.position === "fixed" || style.position === "sticky" || style.isolation === "isolate";
    const levels = [...inherited, { element: el, z: context && explicitZ ? Number(style.zIndex) : 0, context }];
    paths.set(el, levels); return levels;
  };
  const domOrder = (a: HTMLElement, b: HTMLElement) => a === b ? 0 :
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  return [...entries].sort((a, b) => {
    const left = path(a.el), right = path(b.el);
    let i = 0;
    while (i < left.length && i < right.length && left[i]!.element === right[i]!.element) i++;
    // A context's own background precedes its children, including negative z.
    if (i === left.length || i === right.length) return left.length - right.length;
    const x = left[i]!, y = right[i]!;
    if (x.z !== y.z) return x.z - y.z;
    // At level zero, normal flow precedes positioned/isolated contexts.
    if (x.context !== y.context) return x.context ? 1 : -1;
    return domOrder(x.element, y.element);
  });
}
