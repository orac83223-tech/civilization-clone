import { describe, expect, it } from 'vitest';
import { advanceTurn, chooseAICommand, createGame, getObservation, runAITurn, updateVisibility } from '../src/game';
import { RULES } from '../src/game/data/balance';
import { addUnit, capitals, command } from './support/fixtures';
import { auditState } from './support/invariants';

describe('observed-information utility AI', () => {
  it('chooses exactly the same action when only hidden authoritative information changes', () => {
    const state = createGame('ai-information');
    const before = getObservation(state, 0);
    const hidden = state.tiles.find(tile => !state.factions[0]!.explored.includes(tile.id) && tile.terrain !== 'ocean')!;
    hidden.resource = hidden.resource === 'iron' ? 'grain' : 'iron';
    state.factions[2]!.gold += 999;
    const enemy = state.units.find(unit => unit.owner === 2)!;
    enemy.hp = 1;
    const after = getObservation(state, 0);
    expect(after).toEqual(before);
    expect(chooseAICommand(after)).toEqual(chooseAICommand(before));
  });
  it('uses legal commands to found a capital, select research and queue production', () => {
    const state = createGame('ai-first-turn');
    const after = runAITurn(state, 0);
    expect(after.cities.some(city => city.owner === 0)).toBe(true);
    expect(after.factions[0]!.research).not.toBeNull();
    expect(after.cities.find(city => city.owner === 0)!.queue.length).toBeGreaterThan(0);
    expect(after.commandSeq - state.commandSeq).toBeLessThanOrEqual(RULES.maxActions + 1);
    expect(after.phase).toBe('ai');
    expect(after.actorId).toBe(1);
    expect(auditState(after)).toEqual([]);
  });
  it('always ends safely when units have no available actions', () => {
    let state = createGame('ai-no-actions');
    state = command(state, { type: 'SET_RESEARCH', tech: 'writing' });
    for (const unit of state.units.filter(unit => unit.owner === 0)) { unit.moves = 0; unit.waiting = true; }
    const after = runAITurn(state, 0);
    expect(after.actorId).toBe(1);
    expect(after.phase).toBe('ai');
    expect(after.commandSeq).toBe(state.commandSeq + 1);
  });
  it('replays the same command sequence and RNG after all faction boundaries', () => {
    let first = runAITurn(createGame('ai-replay'), 0);
    let restored = JSON.parse(JSON.stringify(first)) as typeof first;
    for (let i = 0; i < 4; i += 1) { first = advanceTurn(first); restored = advanceTurn(restored); expect(restored).toEqual(first); }
    expect(first.round).toBe(2);
    expect(first.lastSettledRound).toBe(1);
  });
  it('attacks a visible enemy while at war and preserves the action bound', () => {
    const state = capitals();
    const attacker = addUnit(state, 0, 'warrior', 24 * 7 + 10);
    const target = addUnit(state, 1, 'warrior', attacker.tile + 1);
    target.hp = 10;
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    updateVisibility(state);
    const after = runAITurn(state, 0);
    expect(after.factions[0]!.stats.combats).toBeGreaterThan(0);
    expect(after.units.some(unit => unit.id === target.id)).toBe(false);
    expect(after.commandSeq - state.commandSeq).toBeLessThanOrEqual(RULES.maxActions + 1);
  });
  it('completes a fixed-seed match with expanding, researching and fighting opponents', () => {
    let state = createGame('ai-match-01');
    let boundaries = 0;
    while (state.phase !== 'ended' && boundaries < 500) {
      state = state.phase === 'player' ? runAITurn(state, 0) : advanceTurn(state);
      boundaries += 1;
    }
    expect(state.phase).toBe('ended');
    expect(state.result).not.toBeNull();
    expect(state.round).toBeLessThanOrEqual(100);
    expect(state.factions.reduce((sum, faction) => sum + faction.stats.founded, 0)).toBeGreaterThan(4);
    expect(state.factions.reduce((sum, faction) => sum + (faction.stats.combats ?? 0), 0)).toBeGreaterThan(0);
    expect(state.factions.some(faction => faction.researched.length === 12)).toBe(true);
    expect(auditState(state)).toEqual([]);
  });
});
