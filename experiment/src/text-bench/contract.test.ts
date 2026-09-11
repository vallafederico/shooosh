import { expect, test } from 'bun:test';
import { stats, textAt } from './contract';
test('nearest-rank percentiles preserve tail stalls and do not mutate samples', () => {
  const values = [100, ...Array(19).fill(1)];
  expect(stats(values)).toEqual({ samples: 20, median: 1, p95: 1, max: 100 });
  expect(values[0]).toBe(100);
  for (const bad of [[], [NaN], [-1], [Infinity]]) expect(() => stats(bad)).toThrow();
});
test('changing workload preserves character count and repertoire', () => {
  expect(textAt(0).length).toBe(textAt(1).length);
  expect([...textAt(0)].sort()).toEqual([...textAt(1)].sort());
  expect(textAt(0)).not.toBe(textAt(1));
});
