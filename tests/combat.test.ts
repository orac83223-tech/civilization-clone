import { describe, expect, it } from 'vitest';
import { applyCommand, previewCombat, updateVisibility } from '../src/game';
import { addUnit, capitals, command } from './support/fixtures';
import type { UnitType } from '../src/game/core/types';

function duel(type: UnitType = 'warrior') {
  const state = capitals();
  const origin = 24 * 8 + 9;
  const attacker = addUnit(state, 0, type, origin);
  const defender = addUnit(state, 1, 'warrior', origin + 1);
  state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
  updateVisibility(state);
  return { state, attacker, defender };
}

describe('deterministic combat and city capture', () => {
  it('applies the exact melee damage preview to both sides and ends movement', () => {
    const { state, attacker, defender } = duel();
    const preview = previewCombat(state, attacker.id, defender.tile)!;
    expect(preview).toEqual(previewCombat(state, attacker.id, defender.tile));
    const result = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile });
    expect(result.units.find(unit => unit.id === attacker.id)!.hp).toBe(attacker.hp - preview.attackerDamage);
    expect(result.units.find(unit => unit.id === defender.id)!.hp).toBe(defender.hp - preview.defenderDamage);
    expect(result.units.find(unit => unit.id === attacker.id)!.moves).toBe(0);
    expect(result.units.find(unit => unit.id === attacker.id)!.attacked).toBe(true);
    expect(result.factions[0]!.stats.combats).toBe(1);
  });
  it('ranged attacks do not take direct retaliation and cannot attack twice', () => {
    const { state, attacker, defender } = duel('archer');
    const result = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile });
    expect(result.units.find(unit => unit.id === attacker.id)!.hp).toBe(attacker.hp);
    expect(applyCommand(result, 0, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile }).ok).toBe(false);
  });
  it('includes defender terrain and fortification in damage prediction', () => {
    const { state, attacker, defender } = duel();
    const plain = previewCombat(state, attacker.id, defender.tile)!;
    state.tiles[defender.tile]!.terrain = 'forest';
    defender.fortified = true;
    const protectedPreview = previewCombat(state, attacker.id, defender.tile)!;
    expect(protectedPreview.defenderDamage).toBeLessThan(plain.defenderDamage);
    expect(protectedPreview.attackerDamage).toBeGreaterThan(plain.attackerDamage);
  });
  it('accounts for injured attacker strength and metallurgy bonuses', () => {
    const { state, attacker, defender } = duel();
    const normal = previewCombat(state, attacker.id, defender.tile)!;
    attacker.hp = 30;
    const hurt = previewCombat(state, attacker.id, defender.tile)!;
    expect(hurt.defenderDamage).toBeLessThan(normal.defenderDamage);
    attacker.hp = 100;
    state.factions[0]!.researched.push('metallurgy');
    expect(previewCombat(state, attacker.id, defender.tile)!.defenderDamage).toBeGreaterThan(normal.defenderDamage);
  });
  it('handles simultaneous deaths and removes both entities', () => {
    const { state, attacker, defender } = duel();
    attacker.hp = 1; defender.hp = 1;
    const result = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile });
    expect(result.units.some(unit => unit.id === attacker.id || unit.id === defender.id)).toBe(false);
    expect(result.factions[0]!.stats.kills).toBe(1);
    expect(result.factions[1]!.stats.kills).toBe(1);
  });
  it('does not counterattack with a civilian', () => {
    const { state, attacker, defender } = duel();
    defender.type = 'worker'; defender.hp = 60;
    expect(previewCombat(state, attacker.id, defender.tile)!.attackerDamage).toBe(0);
    const result = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile });
    expect(result.units.find(unit => unit.id === attacker.id)!.hp).toBe(attacker.hp);
  });
  it('attacks a combat garrison before the city', () => {
    const state = capitals();
    const city = state.cities.find(candidate => candidate.owner === 1)!;
    state.units = state.units.filter(unit => unit.tile !== city.tile && unit.tile !== city.tile - 1);
    const garrison = addUnit(state, 1, 'warrior', city.tile);
    const attacker = addUnit(state, 0, 'warrior', city.tile - 1);
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    updateVisibility(state);
    const preview = previewCombat(state, attacker.id, city.tile)!;
    expect(preview.defenderId).toBe(garrison.id);
    expect(preview.defenderKind).toBe('unit');
    const result = command(state, { type: 'ATTACK', unitId: attacker.id, targetTile: city.tile });
    expect(result.cities.find(candidate => candidate.id === city.id)!.hp).toBe(city.hp);
  });
  it('leaves a ranged-reduced zero HP city for a surviving melee unit to capture', () => {
    let state = capitals();
    const city = state.cities.find(candidate => candidate.owner === 1)!;
    state.units = state.units.filter(unit => unit.tile !== city.tile && unit.tile !== city.tile - 1 && unit.tile !== city.tile - 2);
    city.hp = 1; city.population = 3; city.queue = [{ kind: 'unit', id: 'warrior' }]; city.progress = { 'unit:warrior': 15 };
    const archer = addUnit(state, 0, 'archer', city.tile - 2);
    const warrior = addUnit(state, 0, 'warrior', city.tile - 1);
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    updateVisibility(state);
    state = command(state, { type: 'ATTACK', unitId: archer.id, targetTile: city.tile });
    expect(state.cities.find(candidate => candidate.id === city.id)!.hp).toBe(0);
    expect(state.cities.find(candidate => candidate.id === city.id)!.owner).toBe(1);
    const preview = previewCombat(state, warrior.id, city.tile)!;
    expect(preview.canCapture).toBe(true);
    state = command(state, { type: 'ATTACK', unitId: warrior.id, targetTile: city.tile });
    const captured = state.cities.find(candidate => candidate.id === city.id)!;
    expect(captured.owner).toBe(0);
    expect(captured.originalCapitalOf).toBe(1);
    expect(state.factions[1]!.capitalId).toBe(captured.id);
    expect(captured.queue).toEqual([]);
    expect(captured.progress).toEqual({});
    expect(captured.resistance).toBe(3);
    expect(captured.population).toBe(2);
    expect(state.units.find(unit => unit.id === warrior.id)!.tile).toBe(city.tile);
    expect(state.tiles[city.tile]!.owner).toBe(0);
  });
  it('does not provide attack previews for unseen targets or peaceful factions', () => {
    const { state, attacker, defender } = duel();
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = false;
    expect(previewCombat(state, attacker.id, defender.tile)).toBeNull();
    expect(applyCommand(state, 0, { type: 'ATTACK', unitId: attacker.id, targetTile: defender.tile }).ok).toBe(false);
    state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
    state.factions[0]!.visible = [];
    expect(previewCombat(state, attacker.id, defender.tile)).toBeNull();
  });
});
