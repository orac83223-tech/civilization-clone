import { describe, expect, it } from 'vitest';
import { advanceTurn, applyCommand, checkInvariants, createGame, updateVisibility } from '../src/game';
import { RULES, TECHS } from '../src/game/data/balance';
import { checkElimination, checkVictory, scoreFaction } from '../src/game/systems/victory';
import type { TechId } from '../src/game/core/types';
import { addUnit, capitals, command, settlement } from './support/fixtures';

describe('victory, elimination and round settlement', () => {
  it('produces science victory only by completing a legal production project', () => {
    let state = capitals();
    state.factions[0]!.researched = Object.keys(TECHS) as TechId[];
    const city = state.cities[0]!;
    state = command(state, { type: 'QUEUE_PRODUCTION', cityId: city.id, item: { kind: 'project', id: 'grandAcademy' } });
    state.cities[0]!.progress['project:grandAcademy'] = RULES.projectCost - 1;
    expect(state.result).toBeNull();
    state = settlement(state);
    expect(state.factions[0]!.scienceProject).toBe(true);
    expect(state.result?.type).toBe('science');
    expect(state.result?.winner).toBe(0);
    expect(state.phase).toBe('ended');
    expect(checkInvariants(state)).toEqual([]);
  });
  it('does not allow science projects before the final technology', () => {
    const state = capitals();
    expect(applyCommand(state, 0, { type: 'QUEUE_PRODUCTION', cityId: state.cities[0]!.id, item: { kind: 'project', id: 'grandAcademy' } }).ok).toBe(false);
    state.factions[0]!.scienceProject = true;
    expect(checkVictory(state)).toBeNull();
  });
  it('requires all original capitals and awards conquest after a real final capture', () => {
    let state = capitals();
    for (const city of state.cities.filter(candidate => candidate.owner === 2 || candidate.owner === 3)) {
      city.owner = 0;
      state.tiles[city.tile]!.owner = 0;
    }
    const last = state.cities.find(city => city.owner === 1)!;
    last.hp = 1;
    state.units = state.units.filter(unit => unit.tile !== last.tile && unit.tile !== last.tile - 1);
    const attacker = addUnit(state, 0, 'warrior', last.tile - 1);
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    updateVisibility(state);
    expect(checkVictory(state)).toBeNull();
    state = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: last.tile });
    state = settlement(state);
    expect(state.result?.type).toBe('conquest');
    expect(state.result?.winner).toBe(0);
    expect(state.cities.every(city => city.owner === 0)).toBe(true);
  });
  it('defers conquest while a living faction has not settled', () => {
    let state = createGame('unsettled');
    const settler = state.units.find(unit => unit.owner === 0 && unit.type === 'settler')!;
    state = command(state, { type: 'FOUND_CITY', unitId: settler.id });
    expect(checkVictory(state)).toBeNull();
    state.units = state.units.filter(unit => unit.owner === 0);
    checkElimination(state);
    expect(checkVictory(state)?.type).toBe('conquest');
  });
  it('prioritizes conquest over simultaneous science', () => {
    const state = capitals();
    for (const city of state.cities) { city.owner = 0; state.tiles[city.tile]!.owner = 0; }
    state.factions[0]!.researched = Object.keys(TECHS) as TechId[];
    state.factions[0]!.scienceProject = true;
    expect(checkVictory(state)?.type).toBe('conquest');
  });
  it('resolves simultaneous science by public score then faction ID', () => {
    const state = capitals();
    for (const owner of [0, 1]) {
      state.factions[owner]!.researched = Object.keys(TECHS) as TechId[];
      state.factions[owner]!.scienceProject = true;
    }
    expect(scoreFaction(state, 0)).toBe(scoreFaction(state, 1));
    expect(checkVictory(state)?.winner).toBe(0);
    state.factions[1]!.culture = 100;
    expect(checkVictory(state)?.winner).toBe(1);
  });
  it('settles the final round before checking score and stops at the configured cap', () => {
    let state = capitals();
    state.settings.maxRounds = 1;
    state = settlement(state);
    expect(state.result?.type).toBe('score');
    expect(state.round).toBe(1);
    expect(state.lastSettledRound).toBe(1);
    expect(state.result!.scores).toEqual(state.factions.map(faction => ({ faction: faction.id, score: scoreFaction(state, faction.id) })).sort((a, b) => b.score - a.score || a.faction - b.faction));
    expect(advanceTurn(state)).toBe(state);
  });
  it('uses the lower faction ID to resolve an exact score tie', () => {
    const state = capitals();
    state.settings.maxRounds = 1;
    expect(new Set(state.factions.map(faction => scoreFaction(state, faction.id))).size).toBe(1);
    expect(checkVictory(state)?.winner).toBe(0);
  });
  it('does not settle twice when an already advanced state is submitted again', () => {
    const pending = capitals();
    pending.phase = 'settlement';
    const after = advanceTurn(pending);
    expect(after.round).toBe(2);
    expect(after.lastSettledRound).toBe(1);
    expect(advanceTurn(after)).toBe(after);
    expect(advanceTurn(pending)).toEqual(after);
  });
  it('ends with human defeat when its last settler is killed before settling', () => {
    let state = createGame('defeat-fixture');
    const settler = state.units.find(unit => unit.owner === 0 && unit.type === 'settler')!;
    settler.hp = 1;
    state.units = state.units.filter(unit => unit.tile !== settler.tile - 1);
    const attacker = addUnit(state, 1, 'warrior', settler.tile - 1);
    state.actorId = 1; state.phase = 'ai';
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    updateVisibility(state);
    state = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: settler.tile }, 1);
    expect(state.factions[0]!.alive).toBe(false);
    expect(state.units.some(unit => unit.owner === 0)).toBe(false);
    expect(state.result?.type).toBe('defeat');
    expect(state.phase).toBe('ended');
  });
});
