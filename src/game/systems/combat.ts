import type { City, CombatPreview, GameState, Unit } from '../core/types';
import { hexDistance } from '../core/hex';
import { COMBAT_BALANCE as B, ECONOMY_BALANCE, TERRAINS, UNITS } from '../data/balance';
import { atWar, notify } from './world';
import { assignWorkers, cityMaxHp } from './economy';
export function combatTarget(state: GameState, attacker: Unit, targetTile: number): Unit | City | undefined {
 // The combat garrison is always hit before its city; civilians are last.
 return state.units.find(u => u.tile === targetTile && u.owner !== attacker.owner && UNITS[u.type].combat) ?? state.cities.find(c => c.tile === targetTile && c.owner !== attacker.owner) ?? state.units.find(u => u.tile === targetTile && u.owner !== attacker.owner);
}
export function previewCombat(state: GameState, unitId: string, targetTile: number): CombatPreview | null {
 const attacker = state.units.find(u => u.id === unitId); const tile = state.tiles[targetTile];
 if (!attacker || !tile || !state.factions[attacker.owner]!.visible.includes(targetTile)) return null;
 const data = UNITS[attacker.type]; const defender = combatTarget(state, attacker, targetTile);
 if (!defender || data.attack === 'none' || !atWar(state, attacker.owner, defender.owner) || hexDistance(state.tiles[attacker.tile]!, tile) > data.range) return null;
 const city = !('type' in defender); const f = state.factions[attacker.owner]!; const other = state.factions[defender.owner]!;
 let attack = data.strength * (B.healthBaseline + (1 - B.healthBaseline) * attacker.hp / data.hp) * (f.researched.includes('metallurgy') ? B.metallurgyMultiplier : 1) * (f.policy === 'mobilization' ? B.militaryPolicyMultiplier : 1);
 if (attacker.type === 'siege' && city) attack *= B.siegeCityMultiplier;
 const defense = city ? B.cityStrength * (defender.buildings.includes('walls') ? B.wallStrengthMultiplier : 1) : Math.max(B.civilianDefense, UNITS[defender.type].strength) * (B.healthBaseline + (1 - B.healthBaseline) * defender.hp / UNITS[defender.type].hp) * (1 + TERRAINS[tile.terrain].defense + (defender.fortified ? B.fortifiedDefense : 0)) * (other.researched.includes('metallurgy') ? B.metallurgyMultiplier : 1) * (other.policy === 'mobilization' ? B.militaryPolicyMultiplier : 1);
 const defenderDamage = Math.min(defender.hp, Math.max(B.minimumDamage, Math.round(B.damageScale * attack / defense)));
 const attackerDamage = data.attack === 'ranged' || (!city && !UNITS[defender.type].combat) ? 0 : Math.min(attacker.hp, Math.max(B.minimumRetaliation, Math.round(B.retaliationScale * defense / attack)));
 return { attackerDamage, defenderDamage, defenderId: defender.id, defenderKind: city ? 'city' : 'unit', canCapture: city && data.attack === 'melee' && defender.hp <= defenderDamage && attacker.hp > attackerDamage };
}
export function executeCombat(state: GameState, unit: Unit, targetTile: number): void {
 const preview = previewCombat(state, unit.id, targetTile)!; const target = combatTarget(state, unit, targetTile)!; const owner = target.owner;
 unit.hp -= preview.attackerDamage; unit.moves = 0; unit.attacked = true; unit.fortified = false; target.hp -= preview.defenderDamage;
 const stats = state.factions[unit.owner]!.stats; stats.combats = (stats.combats ?? 0) + 1;
 notify(state, unit.owner, `전투: 적 피해 ${preview.defenderDamage}, 아군 피해 ${preview.attackerDamage}`, 'combat', targetTile);
 if (state.factions[owner]!.visible.includes(unit.tile)) notify(state, owner, '시야 내 아군이 공격받았습니다.', 'combat', targetTile);
 if ('type' in target) {
  if (target.hp <= 0) { state.units = state.units.filter(u => u.id !== target.id); stats.kills++; }
 } else if (target.hp <= 0) {
  if (preview.canCapture && unit.hp > 0) captureCity(state, target, unit);
  else target.hp = 0;
 }
 if (unit.hp <= 0) { state.units = state.units.filter(u => u.id !== unit.id); state.factions[owner]!.stats.kills++; }
}
export function captureCity(state: GameState, city: City, unit: Unit): void {
 const oldOwner = city.owner; city.owner = unit.owner; city.hp = Math.ceil(cityMaxHp(city) * B.captureHpRatio); city.resistance = B.resistanceRounds; city.population = Math.max(ECONOMY_BALANCE.minimumPopulation, city.population - 1); city.food = 0; city.queue = []; city.progress = {}; city.lockedTiles = []; city.workedTiles = [];
 // Territory nearest to the captured city transfers; neighboring friendly cities keep their area.
 for (const tile of state.tiles.filter(t => t.owner === oldOwner)) {
  const nearest = state.cities.filter(c => c.owner === oldOwner || c.id === city.id).sort((a, b) => hexDistance(tile, state.tiles[a.tile]!) - hexDistance(tile, state.tiles[b.tile]!) || a.id.localeCompare(b.id))[0];
  if (nearest?.id === city.id) tile.owner = city.owner;
 }
 state.tiles[city.tile]!.owner = city.owner;
 state.units = state.units.filter(u => !(u.tile === city.tile && u.owner === oldOwner));
 unit.tile = city.tile; state.factions[unit.owner]!.stats.captures++;
 notify(state, unit.owner, `${city.name} 점령! 3라운드 동안 산출 50%.`, 'combat', city.tile);
 assignWorkers(state);
}
