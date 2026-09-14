import { describe, expect, it } from 'vitest';
import { findPath, reachable, updateVisibility } from '../src/game';
import { TERRAINS } from '../src/game/data/balance';
import { hexDistance } from '../src/game/core/hex';
import { addUnit, capitals, command } from './support/fixtures';

describe('hex Dijkstra and exploration rewards', () => {
  it('returns a contiguous minimum cost route that respects mountain blocks', () => {
    const state = capitals();
    const unit = addUnit(state, 0, 'scout', 24 * 7 + 8);
    const blocked = unit.tile + 1;
    state.tiles[blocked]!.terrain = 'mountain';
    updateVisibility(state);
    const path = findPath(state, unit.id, unit.tile + 2)!;
    expect(path.path[0]).toBe(unit.tile);
    expect(path.path.at(-1)).toBe(unit.tile + 2);
    expect(path.path).not.toContain(blocked);
    expect(path.cost).toBe(3);
    expect(path.cost).toBe(path.path.slice(1).reduce((sum, tile) => sum + TERRAINS[state.tiles[tile]!.terrain].moveCost, 0));
    for (let index = 1; index < path.path.length; index += 1) expect(hexDistance(state.tiles[path.path[index - 1]!]!, state.tiles[path.path[index]!]!)).toBe(1);
  });
  it('never reveals an unexplored route and reports all reachable costs within budget', () => {
    const state = capitals();
    const unit = state.units.find(candidate => candidate.owner === 0 && candidate.type === 'scout')!;
    const unknown = state.tiles.find(tile => !state.factions[0]!.explored.includes(tile.id))!;
    expect(findPath(state, unit.id, unknown.id)).toBeNull();
    expect(Object.values(reachable(state, unit.id)).every(cost => cost <= unit.moves)).toBe(true);
    expect(findPath(state, 'missing', 0)).toBeNull();
    expect(reachable(state, 'missing')).toEqual({});
  });
  it('collects each ruin reward once even after revisiting the tile', () => {
    let state = capitals();
    const scout = addUnit(state, 0, 'scout', 24 * 7 + 8);
    const target = scout.tile + 1;
    state.tiles[target]!.ruin = true;
    updateVisibility(state);
    const gold = state.factions[0]!.gold;
    state = command(state, { type: 'MOVE', unitId: scout.id, to: target });
    expect(state.factions[0]!.gold).toBe(gold + 12);
    state = command(state, { type: 'MOVE', unitId: scout.id, to: scout.tile });
    state = command(state, { type: 'MOVE', unitId: scout.id, to: target });
    expect(state.factions[0]!.gold).toBe(gold + 12);
    expect(state.tiles[target]!.ruin).toBe(false);
  });
});
