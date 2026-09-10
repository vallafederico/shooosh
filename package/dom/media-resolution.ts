/** Bucket vector textures so small layout changes do not trigger uploads. */
export function mediaRasterSize(source: string, width: number, height: number, dpr: number) {
  if (!/\.svg(?:[?#]|$)|^data:image\/svg\+xml/i.test(source)) return 0;
  // Extra samples preserve small vector edges through filtering/post effects.
  const finite = (n: number, fallback: number) => Number.isFinite(n) && n > 0 ? n : fallback;
  const pixels = Math.max(finite(width, 1), finite(height, 1)) * Math.max(1, finite(dpr, 1)) * 2;
  return Math.min(4096, 2 ** Math.ceil(Math.log2(Math.max(32, pixels))));
}
