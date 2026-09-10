export function easeOutExpo(value: number): number {
  return value === 1 ? 1 : 1 - 2 ** (-10 * value);
}
