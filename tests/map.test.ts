import { describe, expect, it } from 'vitest';
import { checkInvariants, createGame, validateMap } from '../src/game';
import { TERRAINS } from '../src/game/data/balance';
import { hexDistance, neighborIds } from '../src/game/core/hex';
import { auditState } from './support/invariants';

describe('seeded map fairness and connectivity', () => {
  it.each(Array.from({ length: 50 }, (_, index) => `map-audit-${String(index + 1).padStart(2, '0')}`))('validates %s independently', seed => {
    const state = createGame(seed);
    expect(state.tiles).toHaveLength(24 * 18);
    expect(state.starts).toHaveLength(4);
    expect(validateMap(state)).toEqual([]);
    expect(checkInvariants(state)).toEqual([]);
    expect(auditState(state)).toEqual([]);
    const reached = new Set<number>([state.starts[0]!]);
    const queue = [state.starts[0]!];
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of neighborIds(state.tiles[id]!, 24, 18)) {
        if (!reached.has(next) && TERRAINS[state.tiles[next]!.terrain].passable) { reached.add(next); queue.push(next); }
      }
    }
    expect(state.starts.every(id => reached.has(id))).toBe(true);
    for (const start of state.starts) {
      const surroundings = state.tiles.filter(tile => hexDistance(tile, state.tiles[start]!) <= 2 && TERRAINS[tile.terrain].passable);
      expect(surroundings.some(tile => TERRAINS[tile.terrain].food >= 2)).toBe(true);
      expect(surroundings.some(tile => TERRAINS[tile.terrain].production >= 1)).toBe(true);
      for (const other of state.starts.filter(id => id !== start)) expect(hexDistance(state.tiles[start]!, state.tiles[other]!)).toBeGreaterThanOrEqual(5);
    }
    expect(state).toEqual(createGame(seed));
  });
});
