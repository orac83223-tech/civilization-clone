import { describe, expect, it } from 'vitest';
import { advanceTurn, applyCommand, getObservation, updateVisibility } from '../src/game';
import { neighborIds } from '../src/game/core/hex';
import { addUnit, capitals, command, flatGame } from './support/fixtures';
import type { Command } from '../src/game/core/types';

describe('commands, movement, founding and observation', () => {
  it('returns a structured error without changing state for an unauthorized actor', () => {
    const state = flatGame();
    const before = structuredClone(state);
    const result = applyCommand(state, 1, { type: 'END_TURN' });
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(before);
    expect(state).toEqual(before);
    if (!result.ok) expect(result.error.message).toBeTruthy();
  });
  it('rejects invalid entity and tile references without throwing', () => {
    const state = flatGame();
    const original = structuredClone(state);
    expect(applyCommand(state, 0, { type: 'MOVE', unitId: 'missing-unit', to: -1 }).ok).toBe(false);
    const unit = state.units.find(candidate => candidate.owner === 0 && candidate.type === 'warrior')!;
    expect(applyCommand(state, 0, { type: 'MOVE', unitId: unit.id, to: 99999 }).ok).toBe(false);
    expect(state).toEqual(original);
  });
  it.each(['constructor', 'toString'])('rejects prototype property %s as a production ID', id => {
    const state = capitals();
    const malformed = { type: 'QUEUE_PRODUCTION', cityId: state.cities[0]!.id, item: { kind: 'unit', id } } as unknown as Command;
    const before = structuredClone(state);
    expect(applyCommand(state, 0, malformed).ok).toBe(false);
    expect(state).toEqual(before);
  });
  it('consumes a settler and permanently identifies its first capital', () => {
    let state = flatGame();
    const settler = state.units.find(unit => unit.owner === 0 && unit.type === 'settler')!;
    const initial = structuredClone(state);
    state = command(state, { type: 'FOUND_CITY', unitId: settler.id });
    expect(initial.cities).toHaveLength(0);
    expect(state.units.some(unit => unit.id === settler.id)).toBe(false);
    const city = state.cities[0]!;
    expect(city.originalCapitalOf).toBe(0);
    expect(state.factions[0]!.capitalId).toBe(city.id);
    expect(state.tiles[settler.tile]!.cityId).toBe(city.id);
    expect(state.tiles[settler.tile]!.owner).toBe(0);
  });
  it('enforces city minimum distance and impassable terrain', () => {
    const state = capitals();
    const city = state.cities.find(candidate => candidate.owner === 0)!;
    const next = neighborIds(state.tiles[city.tile]!, 24, 18)[0]!;
    const settler = addUnit(state, 0, 'settler', next);
    expect(applyCommand(state, 0, { type: 'FOUND_CITY', unitId: settler.id }).ok).toBe(false);
    state.tiles[next]!.terrain = 'ocean';
    expect(applyCommand(state, 0, { type: 'FOUND_CITY', unitId: settler.id }).ok).toBe(false);
    state.tiles[next]!.terrain = 'mountain';
    expect(applyCommand(state, 0, { type: 'FOUND_CITY', unitId: settler.id }).ok).toBe(false);
  });
  it('charges terrain movement cost across split movement', () => {
    let state = capitals();
    state.units = state.units.filter(unit => unit.owner !== 0);
    const unit = addUnit(state, 0, 'warrior', 24 * 7 + 7);
    const to = unit.tile + 1;
    state.tiles[to]!.terrain = 'hills';
    updateVisibility(state);
    state = command(state, { type: 'MOVE', unitId: unit.id, to });
    expect(state.units.find(candidate => candidate.id === unit.id)!.moves).toBe(0);
    const before = structuredClone(state);
    expect(applyCommand(state, 0, { type: 'MOVE', unitId: unit.id, to: to + 1 }).ok).toBe(false);
    expect(state).toEqual(before);
  });
  it('allows a combat/civilian pair while preventing same-category stacks', () => {
    let state = flatGame();
    state.units = state.units.filter(unit => unit.owner !== 0);
    const warrior = addUnit(state, 0, 'warrior', 24 * 7 + 7);
    const settler = addUnit(state, 0, 'settler', warrior.tile + 1);
    state = command(state, { type: 'MOVE', unitId: warrior.id, to: settler.tile });
    expect(state.units.filter(unit => unit.tile === settler.tile)).toHaveLength(2);
    const scout = addUnit(state, 0, 'scout', settler.tile + 1);
    expect(applyCommand(state, 0, { type: 'MOVE', unitId: scout.id, to: settler.tile }).ok).toBe(false);
  });
  it('prevents trespass at peace and does not implicitly declare war', () => {
    const state = capitals();
    state.units = state.units.filter(unit => unit.owner !== 0);
    const warrior = addUnit(state, 0, 'warrior', 24 * 7 + 7);
    const target = warrior.tile + 1;
    state.tiles[target]!.owner = 1;
    updateVisibility(state);
    expect(applyCommand(state, 0, { type: 'MOVE', unitId: warrior.id, to: target }).ok).toBe(false);
    expect(state.relations.every(relation => !relation.war)).toBe(true);
  });
  it('hides unseen units, resources and current enemy city internals', () => {
    const state = capitals();
    const observation = getObservation(state, 0);
    const enemyCity = state.cities.find(city => city.owner === 2)!;
    expect(observation.tiles[enemyCity.tile]).toBeNull();
    expect(observation.units.some(unit => unit.owner === 2)).toBe(false);
    const scout = state.units.find(unit => unit.owner === 0 && unit.type === 'scout')!;
    scout.tile = enemyCity.tile + 1;
    updateVisibility(state);
    const visible = getObservation(state, 0).cities.find(city => city.id === enemyCity.id)!;
    expect(visible.visible).toBe(true);
    expect(visible.population).toBeUndefined();
    expect(visible.buildings).toBeUndefined();
    scout.tile = state.starts[0]!;
    state.round += 1;
    updateVisibility(state);
    enemyCity.hp = 12;
    const remembered = getObservation(state, 0).cities.find(city => city.id === enemyCity.id)!;
    expect(remembered.visible).toBe(false);
    expect(remembered.lastSeen).toBe(1);
    expect(remembered.hp).not.toBe(12);
  });
  it('separates observed data from mutable authoritative state', () => {
    const state = flatGame();
    const observation = getObservation(state, 0);
    observation.self.gold = 9999;
    observation.units[0]!.hp = 1;
    expect(state.factions[0]!.gold).toBe(30);
    expect(state.units[0]!.hp).not.toBe(1);
  });
  it('ignores a duplicate end turn and rejects player commands during AI processing', () => {
    let state = flatGame();
    state = command(state, { type: 'END_TURN' });
    expect(state.phase).toBe('ai');
    expect(state.actorId).toBe(1);
    const before = structuredClone(state);
    expect(applyCommand(state, 0, { type: 'END_TURN' }).ok).toBe(false);
    expect(applyCommand(state, 0, { type: 'SET_RESEARCH', tech: 'writing' }).ok).toBe(false);
    expect(state).toEqual(before);
    expect(advanceTurn(state).actorId).not.toBe(0);
  });
});
