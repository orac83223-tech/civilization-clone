import { describe, expect, it } from 'vitest';
import { advanceTurn, applyCommand, getCityYields, updateVisibility } from '../src/game';
import { UNITS } from '../src/game/data/balance';
import { addUnit, capitals, command, settlement } from './support/fixtures';

describe('unit orders, production editing and policy yields', () => {
  it('heals once at the next own turn and resets attack and movement once', () => {
    let state = capitals();
    const unit = state.units.find(candidate => candidate.owner === 0 && candidate.type === 'warrior')!;
    unit.hp = 40;
    state.tiles[unit.tile]!.owner = 0;
    state = command(state, { type: 'HEAL', unitId: unit.id });
    expect(state.units.find(candidate => candidate.id === unit.id)!.hp).toBe(40);
    state = settlement(state);
    const healed = state.units.find(candidate => candidate.id === unit.id)!;
    expect(healed.hp).toBe(58);
    expect(healed.moves).toBe(UNITS.warrior.moves);
    expect(healed.attacked).toBe(false);
    expect(advanceTurn(state)).toBe(state);
    expect(healed.hp).toBe(58);
  });
  it('charges a scout upgrade and preserves its health fraction', () => {
    let state = capitals();
    const unit = state.units.find(candidate => candidate.owner === 0 && candidate.type === 'scout')!;
    unit.hp = 40;
    state.tiles[unit.tile]!.owner = 0;
    state.factions[0]!.gold = 50;
    state = command(state, { type: 'UPGRADE', unitId: unit.id });
    const upgraded = state.units.find(candidate => candidate.id === unit.id)!;
    expect(upgraded.type).toBe('warrior');
    expect(upgraded.hp).toBe(50);
    expect(upgraded.moves).toBe(0);
    expect(state.factions[0]!.gold).toBe(20);
    expect(applyCommand(state, 0, { type: 'UPGRADE', unitId: unit.id }).ok).toBe(false);
  });
  it('requires an improved owned strategic resource for cavalry while basic troops stay available', () => {
    let state = capitals();
    const cityId = state.cities[0]!.id;
    state.factions[0]!.researched = ['agriculture', 'horseback', 'archery'];
    expect(applyCommand(state, 0, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'cavalry' } }).ok).toBe(false);
    expect(applyCommand(state, 0, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'warrior' } }).ok).toBe(true);
    expect(applyCommand(state, 0, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'archer' } }).ok).toBe(true);
    const resourceTile = state.tiles.find(tile => tile.owner === 0 && tile.cityId === null)!;
    resourceTile.resource = 'horses'; resourceTile.improvement = 'farm';
    updateVisibility(state);
    state = command(state, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'cavalry' } });
    expect(state.cities[0]!.queue[0]!.id).toBe('cavalry');
  });
  it('consumes a worker after its third and final work charge', () => {
    let state = capitals();
    state.factions[0]!.researched = ['agriculture'];
    const tile = state.tiles.find(candidate => candidate.owner === 0 && !candidate.cityId && !state.units.some(unit => unit.tile === candidate.id))!;
    const worker = addUnit(state, 0, 'worker', tile.id);
    worker.charges = 1;
    state = command(state, { type: 'IMPROVE', unitId: worker.id, improvement: 'farm' });
    expect(state.units.some(unit => unit.id === worker.id)).toBe(false);
    expect(state.tiles[tile.id]!.improvement).toBe('farm');
  });
  it('bounds the queue and preserves canceled progress', () => {
    let state = capitals();
    const cityId = state.cities[0]!.id;
    for (let index = 0; index < 5; index += 1) state = command(state, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'warrior' } });
    expect(applyCommand(state, 0, { type: 'QUEUE_PRODUCTION', cityId, item: { kind: 'unit', id: 'warrior' } }).ok).toBe(false);
    state.cities[0]!.progress['unit:warrior'] = 9;
    expect(applyCommand(state, 0, { type: 'CANCEL_PRODUCTION', cityId, index: -1 }).ok).toBe(false);
    state = command(state, { type: 'CANCEL_PRODUCTION', cityId, index: 0 });
    expect(state.cities[0]!.queue).toHaveLength(4);
    expect(state.cities[0]!.progress['unit:warrior']).toBe(9);
  });
  it('science focus converts production into science and its breakdown remains additive under resistance', () => {
    let state = capitals();
    const cityId = state.cities[0]!.id;
    state.cities[0]!.buildings = ['workshop'];
    const before = getCityYields(state, cityId);
    state = command(state, { type: 'SET_FOCUS', cityId, focus: 'science' });
    const after = getCityYields(state, cityId);
    const converted = Math.floor(before.gross.production / 4);
    expect(after.gross.production).toBe(before.gross.production - converted);
    expect(after.gross.science).toBe(before.gross.science + converted);
    state.cities[0]!.resistance = 2;
    const resisted = getCityYields(state, cityId);
    for (const key of ['food', 'production', 'gold', 'science', 'culture'] as const) expect(resisted.breakdown.reduce((sum, row) => sum + row.yields[key], 0)).toBe(resisted.gross[key]);
  });
  it('peace expels trespassers to legal land and forbids immediate redeclaration', () => {
    let state = capitals();
    const relation = state.relations.find(candidate => candidate.a === 0 && candidate.b === 1)!;
    relation.war = true; relation.opinion = 0;
    state.factions[0]!.contacts = [1]; state.factions[1]!.contacts = [0];
    const target = state.tiles.find(tile => tile.owner === 1 && !tile.cityId && !state.units.some(unit => unit.tile === tile.id))!;
    const scout = addUnit(state, 0, 'scout', target.id);
    state = command(state, { type: 'OFFER_PEACE', target: 1 });
    const expelled = state.units.find(unit => unit.id === scout.id)!;
    expect(state.tiles[expelled.tile]!.owner).not.toBe(1);
    expect(expelled.moves).toBe(0);
    expect(state.relations.find(candidate => candidate.a === 0 && candidate.b === 1)!.war).toBe(false);
    expect(applyCommand(state, 0, { type: 'DECLARE_WAR', target: 1, confirmed: true }).ok).toBe(false);
  });
});
