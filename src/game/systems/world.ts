import { COMBAT_BALANCE, DEFAULT_SETTINGS, ECONOMY_BALANCE, FACTIONS, GAME_VERSION, TERRAINS, UNITS } from '../data/balance';
import { hashSeed, hexDistance, neighborIds, randomStep } from '../core/hex';
import type { Faction, GameState, Observation, Settings, Terrain, Unit, UnitType } from '../core/types';

export function makeUnit(state: GameState, owner: number, type: UnitType, tile: number, ready = false): Unit {
 const data = UNITS[type];
 const unit: Unit = { id: `u${state.nextEntityId++}`, owner, type, tile, hp: data.hp, moves: ready ? data.moves : 0, attacked: !ready, fortified: false, waiting: !ready, charges: type === 'worker' ? 3 : 0, bornRound: ready ? 0 : state.round };
 state.units.push(unit); return unit;
}
export function createGame(seed: string, options: Partial<Settings> = {}): GameState {
 const settings = { ...DEFAULT_SETTINGS, ...options };
 settings.width = Math.max(16, Math.min(40, Math.trunc(settings.width) || 24));
 settings.height = Math.max(12, Math.min(30, Math.trunc(settings.height) || 18));
 settings.maxRounds = Math.max(1, Math.min(100, Math.trunc(settings.maxRounds) || 100));
 const state: GameState = { schemaVersion: 1, gameVersion: GAME_VERSION, seed: seed || 'dawn', settings, round: 1, phase: 'player', actorId: 0, commandSeq: 0, rngState: hashSeed(seed || 'dawn'), nextEntityId: 1, tiles: [], starts: [], units: [], cities: [], factions: [], relations: [], notifications: [], result: null, lastSettledRound: 0 };
 function rng(): number { const [value, next] = randomStep(state.rngState); state.rngState = next; return value; }
 for (let r = 0; r < settings.height; r++) for (let q = 0; q < settings.width; q++) {
  const edge = q === 0 || r === 0 || q === settings.width - 1 || r === settings.height - 1;
  const roll = rng();
  const terrain: Terrain = edge ? 'ocean' : roll < .31 ? 'grassland' : roll < .54 ? 'plains' : roll < .72 ? 'forest' : roll < .89 ? 'hills' : roll < .94 ? 'desert' : 'mountain';
  const resourceRoll = rng();
  const resource = !TERRAINS[terrain].passable ? null : resourceRoll < .055 ? 'grain' : resourceRoll < .095 ? 'iron' : resourceRoll < .135 ? 'horses' : null;
  state.tiles.push({ id: r * settings.width + q, q, r, terrain, resource, improvement: null, owner: null, cityId: null, ruin: !edge && rng() < .023 });
 }
 const coordinates = [[3, 3], [settings.width - 4, 3], [settings.width - 4, settings.height - 4], [3, settings.height - 4]];
 state.starts = coordinates.map(([q, r]) => r! * settings.width + q!);
 // Start rings are deliberately normalized; small faction bonuses never repair unfair starts.
 for (const start of state.starts) {
  const tile = state.tiles[start]!;
  for (const t of state.tiles.filter(t => hexDistance(t, tile) <= 2)) { t.terrain = (t.id + start) % 3 === 0 ? 'hills' : (t.id + start) % 2 === 0 ? 'grassland' : 'plains'; t.ruin = false; t.resource = null; }
  tile.terrain = 'plains';
  const around = neighborIds(tile, settings.width, settings.height);
  state.tiles[around[0]!]!.terrain = 'grassland'; state.tiles[around[0]!]!.resource = 'grain';
  state.tiles[around[1]!]!.terrain = 'hills'; state.tiles[around[1]!]!.resource = 'iron';
  state.tiles[around[2]!]!.terrain = 'plains'; state.tiles[around[2]!]!.resource = 'horses';
 }
 // A bounded deterministic safety pass joins every walkable component to the primary landmass.
 for (let pass = 0; pass < state.tiles.length; pass++) {
  const connected = flood(state, state.starts[0]!);
  const isolated = state.tiles.find(t => TERRAINS[t.terrain].passable && !connected.has(t.id));
  if (!isolated) break;
  let current = isolated;
  const target = state.tiles[state.starts[0]!]!;
  for (let step = 0; step < settings.width + settings.height; step++) {
   if (connected.has(current.id)) break;
   const next = neighborIds(current, settings.width, settings.height).map(id => state.tiles[id]!).filter(t => t.q > 0 && t.r > 0 && t.q < settings.width - 1 && t.r < settings.height - 1).sort((a, b) => hexDistance(a, target) - hexDistance(b, target) || a.id - b.id)[0];
   if (!next) break; if (!TERRAINS[next.terrain].passable) { next.terrain = 'plains'; next.resource = null; } current = next;
  }
 }
 state.factions = FACTIONS.map(f => ({ ...f, gold: ECONOMY_BALANCE.startingGold, culture: 0, researched: [], research: null, researchProgress: {}, policy: null, alive: true, capitalId: null, scienceProject: false, contacts: [], explored: [], visible: [], memory: {}, cityMemory: {}, stats: { founded: 0, captures: 0, kills: 0, explored: 0 } }));
 for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) state.relations.push({ a, b, war: false, peaceUntil: 1, tradeUntil: 0, opinion: 0 });
 for (let owner = 0; owner < 4; owner++) {
  const start = state.starts[owner]!; const near = neighborIds(state.tiles[start]!, settings.width, settings.height).filter(id => TERRAINS[state.tiles[id]!.terrain].passable);
  makeUnit(state, owner, 'settler', start, true); makeUnit(state, owner, 'scout', near[0]!, true); makeUnit(state, owner, 'warrior', near[1]!, true);
 }
 updateVisibility(state); return state;
}
function flood(state: GameState, start: number): Set<number> { const seen = new Set([start]); const queue = [start]; for (let i = 0; i < queue.length; i++) for (const n of neighborIds(state.tiles[queue[i]!]!, state.settings.width, state.settings.height)) if (!seen.has(n) && TERRAINS[state.tiles[n]!.terrain].passable) { seen.add(n); queue.push(n); } return seen; }
export function validateMap(state: GameState): string[] {
 const errors: string[] = []; const connected = flood(state, state.starts[0]!);
 for (let i = 0; i < state.starts.length; i++) {
  const start = state.tiles[state.starts[i]!]!; if (!connected.has(start.id)) errors.push(`시작점 ${i} 고립`);
  for (let j = i + 1; j < state.starts.length; j++) if (hexDistance(start, state.tiles[state.starts[j]!]!) < 5) errors.push('시작점 간격 부족');
  const near = state.tiles.filter(t => hexDistance(start, t) <= 2); if (near.filter(t => TERRAINS[t.terrain].food >= 2).length < 4 || near.filter(t => TERRAINS[t.terrain].production >= 2).length < 2) errors.push('시작 산출 부족');
 }
 if (state.tiles.some(t => TERRAINS[t.terrain].passable && !connected.has(t.id))) errors.push('고립 육지'); return errors;
}
export function updateVisibility(state: GameState): void {
 for (const f of state.factions) {
  const visible = new Set<number>();
  const sources = [...state.units.filter(u => u.owner === f.id).map(u => ({ tile: u.tile, radius: UNITS[u.type].sight })), ...state.cities.filter(c => c.owner === f.id).map(c => ({ tile: c.tile, radius: 3 }))];
  for (const source of sources) for (const tile of state.tiles) if (hexDistance(state.tiles[source.tile]!, tile) <= source.radius) visible.add(tile.id);
  f.visible = [...visible].sort((a, b) => a - b); f.explored = [...new Set([...f.explored, ...f.visible])].sort((a, b) => a - b); f.stats.explored = f.explored.length;
  // A polity always knows its own borders and any loss of territory, without observing enemy forces.
  for (const tile of state.tiles) if (tile.owner === f.id || f.memory[tile.id]?.owner === f.id) f.memory[tile.id] = { ...(f.memory[tile.id] ?? tile), owner: tile.owner, improvement: tile.owner === f.id ? tile.improvement : f.memory[tile.id]?.improvement ?? null };
  for (const id of f.visible) f.memory[id] = { ...state.tiles[id]! };
  for (const city of state.cities) if (visible.has(city.tile)) f.cityMemory[city.id] = { id: city.id, tile: city.tile, name: city.name, owner: city.owner, hp: city.hp, originalCapitalOf: city.originalCapitalOf, visible: true, lastSeen: state.round };
  for (const [id, city] of Object.entries(f.cityMemory)) { city.visible = visible.has(city.tile); if (city.visible && !state.cities.some(c => c.id === id)) delete f.cityMemory[id]; }
 }
 for (const f of state.factions) for (const other of state.factions) {
  if (f.id === other.id || f.contacts.includes(other.id)) continue;
  const seen = state.units.some(u => u.owner === other.id && f.visible.includes(u.tile)) || state.cities.some(c => c.owner === other.id && f.visible.includes(c.tile));
  if (seen) { f.contacts.push(other.id); if (!other.contacts.includes(f.id)) other.contacts.push(f.id); notify(state, f.id, `${other.name}과 첫 접촉했습니다.`, 'diplomacy'); notify(state, other.id, `${f.name}과 첫 접촉했습니다.`, 'diplomacy'); }
 }
}
export function getObservation(state: GameState, actorId: number): Observation {
 const f = state.factions[actorId]!; const visible = new Set(f.visible);
 return structuredClone({ seed: state.seed, round: state.round, settings: state.settings, actorId, self: f, tiles: state.tiles.map(t => visible.has(t.id) ? t : f.memory[t.id] ?? null), units: state.units.filter(u => u.owner === actorId || visible.has(u.tile)), cities: Object.values(f.cityMemory).map(c => ({ ...c, ...(c.owner === actorId ? { population: state.cities.find(x => x.id === c.id)?.population, buildings: state.cities.find(x => x.id === c.id)?.buildings } : {}) })), ownCities: state.cities.filter(c => c.owner === actorId), factions: state.factions.map(x => ({ id: x.id, name: x.name, color: x.color, emblem: x.emblem, alive: x.alive })), relations: state.relations.filter(r => r.a === actorId || r.b === actorId) });
}
export function notify(state: GameState, owner: number, text: string, kind: GameState['notifications'][number]['kind'] = 'info', tile?: number): void { state.notifications.push({ id: (state.notifications.at(-1)?.id ?? 0) + 1, round: state.round, owner, text, kind, ...(tile === undefined ? {} : { tile }) }); if (state.notifications.length > 100) state.notifications.splice(0, state.notifications.length - 100); }
export function relation(state: GameState, a: number, b: number) { return state.relations.find(r => r.a === Math.min(a, b) && r.b === Math.max(a, b)); }
export function atWar(state: GameState, a: number, b: number): boolean { return a !== b && !!relation(state, a, b)?.war; }
export function canEnter(state: GameState, unit: Unit, tileId: number, observedOnly = true): boolean {
 const f = state.factions[unit.owner]!; const tile = observedOnly && !f.visible.includes(tileId) ? f.memory[tileId] : state.tiles[tileId];
 if (!tile || !TERRAINS[tile.terrain].passable) return false;
 if (tile.owner !== null && tile.owner !== unit.owner && !atWar(state, unit.owner, tile.owner)) return false;
 if (tile.cityId && tile.owner !== null && tile.owner !== unit.owner) return false;
 return !state.units.some(u => u.id !== unit.id && u.tile === tileId && (!observedOnly || f.visible.includes(tileId) || u.owner === unit.owner) && (u.owner !== unit.owner || UNITS[u.type].combat === UNITS[unit.type].combat));
}
export function resetFaction(state: GameState, actorId: number): void { for (const u of state.units.filter(u => u.owner === actorId)) { if (u.fortified || u.waiting) u.hp = Math.min(UNITS[u.type].hp, u.hp + (state.tiles[u.tile]!.owner === actorId ? COMBAT_BALANCE.healFriendly : COMBAT_BALANCE.healAway)); u.moves = UNITS[u.type].moves; u.attacked = false; u.waiting = false; } }
export function knownResource(faction: Faction, resource: string): boolean { return Object.values(faction.memory).some(t => t.owner === faction.id && t.resource === resource && (resource === 'iron' ? t.improvement === 'mine' : t.improvement !== null)); }
