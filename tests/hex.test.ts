import { describe, expect, it } from 'vitest';
import { hashSeed, hexDistance, neighborIds, randomStep } from '../src/game/core/hex';

describe('axial hex coordinates and deterministic random state', () => {
  it('measures all six neighbors at distance one and is symmetric', () => {
    const origin = { q: 4, r: 4 };
    for (const id of neighborIds(origin, 10, 10)) {
      const neighbor = { q: id % 10, r: Math.floor(id / 10) };
      expect(hexDistance(origin, neighbor)).toBe(1);
      expect(hexDistance(neighbor, origin)).toBe(1);
    }
    expect(hexDistance(origin, origin)).toBe(0);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 3 })).toBe(5);
    expect(hexDistance({ q: 0, r: 3 }, { q: 3, r: 0 })).toBe(3);
  });
  it('clips edge neighbors without wrapping rows', () => {
    expect(neighborIds({ q: 0, r: 0 }, 4, 4).sort()).toEqual([1, 4]);
    expect(neighborIds({ q: 3, r: 3 }, 4, 4).sort((a, b) => a - b)).toEqual([11, 14]);
  });
  it('restores the same RNG sequence after serializing state', () => {
    let rng = hashSeed('고정 시드');
    for (let i = 0; i < 17; i += 1) rng = randomStep(rng)[1];
    const saved: number = JSON.parse(JSON.stringify(rng));
    expect(randomStep(saved)).toEqual(randomStep(rng));
    expect(hashSeed('고정 시드')).toBe(hashSeed('고정 시드'));
    expect(hashSeed('다른 시드')).not.toBe(rng);
    const [value, next] = randomStep(rng);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(next).toBeGreaterThan(0);
  });
});
