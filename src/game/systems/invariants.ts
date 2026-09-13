import type { GameState } from '../core/types';
import { hexDistance } from '../core/hex';
import { TERRAINS, UNITS } from '../data/balance';

/** Headless post-transition audit. This reports violations; it never repairs or mutates state. */
export function checkInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number' && !Number.isFinite(value)) errors.push(`${path}: non-finite number`);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(state, 'state');
  const duplicates = (values: (number | string)[], label: string): void => { if (new Set(values).size !== values.length) errors.push(`${label}: duplicate`); };
  const { tiles, cities, units, factions } = state;
  if (tiles.length !== state.settings.width * state.settings.height) errors.push('map dimensions');
  if (factions.length !== 4) errors.push('faction count');
  duplicates([...units, ...cities].map(e => e.id), 'entity IDs');
  duplicates(cities.map(c => c.tile), 'city tiles');
  duplicates(cities.filter(c => c.originalCapitalOf !== null).map(c => c.originalCapitalOf!), 'original capitals');
  duplicates(tiles.map(t => `${t.q}:${t.r}`), 'hex coordinates');
  const cityMap = new Map(cities.map(c => [c.id, c]));
  const stacks = new Map<string, string>(); const occupants = new Map<number, number>();
  for (const tile of tiles) {
    if (tiles[tile.id] !== tile || tile.id < 0) errors.push(`tile ${tile.id}: id/index mismatch`);
    if (tile.owner !== null && !factions[tile.owner]) errors.push(`tile ${tile.id}: missing owner`);
    if (tile.cityId !== null && cityMap.get(tile.cityId)?.tile !== tile.id) errors.push(`tile ${tile.id}: missing city`);
  }
  for (const u of units) {
    const tile = tiles[u.tile]; const data = UNITS[u.type];
    if (!factions[u.owner]) errors.push(`${u.id}: missing owner`);
    if (!tile || !TERRAINS[tile.terrain]?.passable) errors.push(`${u.id}: invalid tile`);
    if (!data) { errors.push(`${u.id}: unknown unit type`); continue; }
    if (u.hp <= 0 || u.hp > data.hp || u.moves < 0 || u.moves > data.moves) errors.push(`${u.id}: hp/movement bounds`);
    if (u.charges < 0 || u.charges > 3 || u.bornRound > state.round) errors.push(`${u.id}: charge/birth bounds`);
    if (u.attacked && u.moves > 0) errors.push(`${u.id}: moved after attack`);
    const key = `${u.tile}:${u.owner}:${data.combat}`;
    if (stacks.has(key)) errors.push(`${u.id}: unit stacking`); else stacks.set(key, u.id);
    if (occupants.has(u.tile) && occupants.get(u.tile) !== u.owner) errors.push(`${u.id}: enemy stacking`); else occupants.set(u.tile, u.owner);
  }
  const worked = new Set<number>();
  for (const c of cities) {
    const tile = tiles[c.tile];
    if (!factions[c.owner] || !tile || tile.cityId !== c.id || tile.owner !== c.owner) errors.push(`${c.id}: city reference`);
    if (c.population < 1 || !Number.isInteger(c.population) || c.food < 0 || c.culture < 0 || c.hp < 0 || c.hp > (c.buildings.includes('walls') ? 150 : 100)) errors.push(`${c.id}: city bounds`);
    duplicates(c.buildings, `${c.id}: buildings`); duplicates(c.lockedTiles, `${c.id}: locked tiles`);
    if (c.workedTiles.length > c.population) errors.push(`${c.id}: excessive workers`);
    for (const id of c.workedTiles) {
      const workerTile = tiles[id];
      if (worked.has(id)) errors.push(`${c.id}: duplicate labor`); worked.add(id);
      if (!tile || !workerTile || workerTile.owner !== c.owner || workerTile.cityId !== null || hexDistance(tile, workerTile) > 2) errors.push(`${c.id}: invalid labor tile`);
    }
    if (c.queue.length > 5 || Object.values(c.progress).some(n => n < 0)) errors.push(`${c.id}: production bounds`);
  }
  for (const f of factions) {
    if (f.id < 0 || factions[f.id] !== f) errors.push('faction id/index mismatch');
    if (f.gold < 0 || f.culture < 0 || Object.values(f.researchProgress).some(n => n !== undefined && n < 0)) errors.push(`${f.id}: economy bounds`);
    duplicates(f.researched, `${f.id}: researched`); duplicates(f.contacts, `${f.id}: contacts`);
    duplicates(f.explored, `${f.id}: explored`); duplicates(f.visible, `${f.id}: visible`);
    if (f.capitalId !== null && cityMap.get(f.capitalId)?.originalCapitalOf !== f.id) errors.push(`${f.id}: original capital reference`);
    const explored = new Set(f.explored);
    if (f.visible.some(id => !tiles[id] || !explored.has(id))) errors.push(`${f.id}: visibility/exploration mismatch`);
    if (f.explored.some(id => !tiles[id])) errors.push(`${f.id}: explored reference`);
  }
  if (state.round < 1 || state.round > state.settings.maxRounds + 1 || state.lastSettledRound > state.round) errors.push('round bounds');
  if (!factions[state.actorId] || (state.phase === 'player' && state.actorId !== 0)) errors.push('phase actor');
  if ((state.phase === 'ended') !== (state.result !== null)) errors.push('phase result');
  if (state.commandSeq < 0 || !Number.isInteger(state.commandSeq) || state.rngState < 0 || state.rngState > 4294967295) errors.push('sequence/RNG bounds');
  duplicates(state.relations.map(r => `${Math.min(r.a, r.b)}:${Math.max(r.a, r.b)}`), 'diplomacy');
  for (const r of state.relations) if (r.a === r.b || !factions[r.a] || !factions[r.b] || (r.war && r.tradeUntil > state.round)) errors.push('invalid diplomatic relation');
  return errors;
}
