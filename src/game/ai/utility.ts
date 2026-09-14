import type { Command, GameState, Observation, ProductionItem, TechId, Tile, Unit } from '../core/types';
import { BUILDINGS, IMPROVEMENTS, RULES, TECHS, TERRAINS, UNITS } from '../data/balance';
import { hexDistance, neighborIds } from '../core/hex';
import { applyCommand } from '../core/engine';
import { getObservation, knownResource } from '../systems/world';

interface Candidate { command: Command; utility: number; }
const techOrder: TechId[] = ['writing', 'mining', 'agriculture', 'currency', 'education', 'masonry', 'archery', 'engineering', 'metallurgy', 'astronomy', 'synthesis', 'horseback'];
function war(obs: Observation, owner: number): boolean { return obs.relations.some(r => (r.a === owner || r.b === owner) && r.war); }
function canEnter(obs: Observation, unit: Unit, tile: Tile): boolean {
 if (!TERRAINS[tile.terrain].passable || (tile.owner !== null && tile.owner !== obs.actorId && !war(obs, tile.owner)) || (tile.cityId && tile.owner !== obs.actorId)) return false;
 return !obs.units.some(u => u.tile === tile.id && u.id !== unit.id && (u.owner !== unit.owner || UNITS[u.type].combat === UNITS[unit.type].combat));
}
function paths(obs: Observation, unit: Unit): { costs: Record<number, number>; previous: Record<number, number> } {
 const costs: Record<number, number> = { [unit.tile]: 0 }; const previous: Record<number, number> = {}; const pending = [unit.tile]; const settled = new Set<number>();
 for (let count = 0; pending.length && count < obs.tiles.length; count++) {
  pending.sort((a, b) => costs[a]! - costs[b]! || a - b); const id = pending.shift()!; settled.add(id);
  for (const n of neighborIds(obs.tiles[id]!, obs.settings.width, obs.settings.height)) {
   const tile = obs.tiles[n]; if (!tile || settled.has(n) || !canEnter(obs, unit, tile)) continue;
   const cost = costs[id]! + TERRAINS[tile.terrain].moveCost;
   if (costs[n] === undefined || cost < costs[n]!) { costs[n] = cost; previous[n] = id; if (!pending.includes(n)) pending.push(n); }
  }
 }
 return { costs, previous };
}
function moveToward(obs: Observation, unit: Unit, target: number, route: ReturnType<typeof paths>): number | null {
 if (route.costs[target] === undefined || target === unit.tile) return null;
 const path = [target]; for (let steps = 0; path[0] !== unit.tile && steps < obs.tiles.length; steps++) { const prev = route.previous[path[0]!]; if (prev === undefined) return null; path.unshift(prev); }
 return path.filter(id => route.costs[id]! <= unit.moves).at(-1) ?? null;
}
function settlementValue(obs: Observation, tile: Tile): number {
 if (!TERRAINS[tile.terrain].passable || (tile.owner !== null && tile.owner !== obs.actorId) || obs.cities.some(c => hexDistance(tile, obs.tiles[c.tile]!) < RULES.cityDistance)) return -Infinity;
 return obs.tiles.filter((t): t is Tile => t !== null && hexDistance(t, tile) <= 1).reduce((n, t) => n + TERRAINS[t.terrain].food * 2 + TERRAINS[t.terrain].production * 2 + (t.resource ? 3 : 0), 0);
}
export function chooseAICommand(obs: Observation, excluded: ReadonlySet<string> = new Set()): Command | null {
 const candidates: Candidate[] = []; const push = (command: Command, utility: number) => { if (!excluded.has(JSON.stringify(command))) candidates.push({ command, utility }); };
 const self = obs.self; const units = obs.units.filter(u => u.owner === obs.actorId); const military = units.filter(u => UNITS[u.type].combat); const ownCities = obs.ownCities;
 if (!self.research) { const preferred = self.personality === 'military' ? ['mining', 'archery', ...techOrder] as TechId[] : techOrder; const tech = preferred.find(id => !self.researched.includes(id) && TECHS[id].prerequisites.every(p => self.researched.includes(p))); if (tech) push({ type: 'SET_RESEARCH', tech }, 200); }
 if (!self.policy && self.culture >= 25) push({ type: 'SET_POLICY', policy: self.personality === 'military' ? 'mobilization' : self.personality === 'growth' ? 'cultivation' : 'scholarship' }, 190);
 for (const city of ownCities) {
  const preferredFocus = self.personality === 'growth' && city.population < 4 ? 'growth' : self.researched.includes('synthesis') ? 'production' : 'balanced';
  if (city.focus !== preferredFocus) push({ type: 'SET_FOCUS', cityId: city.id, focus: preferredFocus }, 120);
  if (city.queue.length) continue;
  let item: ProductionItem | undefined;
  const availableBuilding = (id: keyof typeof BUILDINGS) => !city.buildings.includes(id) && (!BUILDINGS[id].tech || self.researched.includes(BUILDINGS[id].tech!));
  if (self.researched.includes('synthesis') && !self.scienceProject) item = { kind: 'project', id: 'grandAcademy' };
  else if (units.filter(u => u.type === 'worker').length < Math.min(2, ownCities.length) && self.researched.includes('agriculture') && ownCities.some(c => obs.tiles.some(t => t?.owner === obs.actorId && !t.improvement && !t.cityId && hexDistance(t, obs.tiles[c.tile]!) <= 2))) item = { kind: 'unit', id: 'worker' };
  else if (military.length < (self.personality === 'military' && obs.round >= 10 && self.gold > 15 ? 4 : 2) || (obs.relations.some(r => r.war) && military.length < ownCities.length * 2 + 1 && self.gold > 10)) item = { kind: 'unit', id: self.researched.includes('archery') && military.filter(u => u.type === 'archer').length < Math.floor(military.length / 2) ? 'archer' : 'warrior' };
  else if (availableBuilding('library')) item = { kind: 'building', id: 'library' };
  else if (availableBuilding('workshop')) item = { kind: 'building', id: 'workshop' };
  else if (ownCities.length + units.filter(u => u.type === 'settler').length < 3 && city.population >= 2 && self.gold >= 12 && obs.round < 65) item = { kind: 'unit', id: 'settler' };
  else if (availableBuilding('academy')) item = { kind: 'building', id: 'academy' };
  else { const building = (['granary', 'market', 'monument', 'barracks', 'walls'] as const).find(availableBuilding); if (building) item = { kind: 'building', id: building }; }
  if (!item && military.length < ownCities.length * 2 + 2 && self.gold > 20) item = { kind: 'unit', id: self.researched.includes('horseback') && knownResource(self, 'horses') ? 'cavalry' : self.researched.includes('engineering') && !military.some(u => u.type === 'siege') ? 'siege' : 'warrior' };
  if (item) push({ type: 'QUEUE_PRODUCTION', cityId: city.id, item }, 150);
 }
 for (const rel of obs.relations) {
  const target = rel.a === obs.actorId ? rel.b : rel.a; if (!self.contacts.includes(target) || !obs.factions[target]?.alive) continue;
  if (!rel.war && rel.tradeUntil <= obs.round && rel.opinion >= -10) push({ type: 'TRADE_AGREEMENT', target }, 80);
  const seenCities = obs.cities.filter(c => c.owner === target);
  const near = seenCities.some(c => ownCities.some(o => hexDistance(obs.tiles[c.tile]!, obs.tiles[o.tile]!) < 12));
  if (!rel.war && obs.round >= rel.peaceUntil && obs.round >= (self.personality === 'military' ? 18 : 50) && military.length >= 4 && near && (self.personality === 'military' || rel.opinion < 0)) push({ type: 'DECLARE_WAR', target, confirmed: true }, 85);
  if (rel.war && military.length <= 1) push({ type: 'OFFER_PEACE', target }, 90);
 }
 for (const unit of units.filter(u => u.moves > 0 && !u.waiting)) {
  const at = obs.tiles[unit.tile]!; const data = UNITS[unit.type];
  if (unit.type === 'settler' && settlementValue(obs, at) > 0) { push({ type: 'FOUND_CITY', unitId: unit.id }, 250); continue; }
  if (unit.hp < data.hp * .55) { push({ type: 'HEAL', unitId: unit.id }, 110); continue; }
  if (unit.type === 'worker' && at.owner === obs.actorId && !at.improvement && !at.cityId) {
   const improvements = (at.resource === 'iron' ? ['mine', 'farm', 'tradingPost'] : at.resource === 'horses' ? ['farm', 'tradingPost', 'mine'] : ['farm', 'mine', 'tradingPost']) as (keyof typeof IMPROVEMENTS)[];
   const imp = improvements.find(i => self.researched.includes(IMPROVEMENTS[i].tech) && IMPROVEMENTS[i].terrains.includes(at.terrain));
   if (imp) { push({ type: 'IMPROVE', unitId: unit.id, improvement: imp }, 135); continue; }
  }
  if (data.combat && !unit.attacked) {
   const targets = [...obs.units.filter(u => u.owner !== obs.actorId && war(obs, u.owner) && self.visible.includes(u.tile)).map(u => ({ tile: u.tile, hp: u.hp, city: false })), ...obs.cities.filter(c => c.visible && c.owner !== obs.actorId && war(obs, c.owner)).map(c => ({ tile: c.tile, hp: c.hp, city: true }))].filter(t => hexDistance(at, obs.tiles[t.tile]!) <= data.range && (!t.city || t.hp > 0 || data.attack === 'melee')).sort((a, b) => a.hp - b.hp || a.tile - b.tile);
   if (targets[0]) { push({ type: 'ATTACK', unitId: unit.id, targetTile: targets[0].tile }, 130 + (targets[0].hp < 30 ? 20 : 0)); continue; }
  }
  const route = paths(obs, unit); const reachableTiles = Object.keys(route.costs).map(Number).map(id => obs.tiles[id]!);
  let goals: { tile: number; score: number }[] = [];
  if (unit.type === 'settler') goals = reachableTiles.map(t => ({ tile: t.id, score: settlementValue(obs, t) - route.costs[t.id]! * 2 })).filter(g => Number.isFinite(g.score));
  else if (unit.type === 'worker') goals = reachableTiles.filter(t => t.owner === obs.actorId && !t.improvement && !t.cityId && Object.values(IMPROVEMENTS).some(i => self.researched.includes(i.tech) && i.terrains.includes(t.terrain))).map(t => ({ tile: t.id, score: 40 + (t.resource ? 8 : 0) - route.costs[t.id]! * 3 }));
  else if (data.combat && obs.relations.some(r => r.war)) {
   const targets = [...obs.units.filter(u => u.owner !== obs.actorId && war(obs, u.owner)).map(u => u.tile), ...obs.cities.filter(c => c.owner !== obs.actorId && war(obs, c.owner)).map(c => c.tile)];
   if (targets.length) goals = reachableTiles.map(t => ({ tile: t.id, score: 100 - Math.min(...targets.map(id => hexDistance(t, obs.tiles[id]!))) * 9 - route.costs[t.id]! * .25 }));
  }
  if (!goals.length && unit.type !== 'worker') goals = reachableTiles.map(t => ({ tile: t.id, score: neighborIds(t, obs.settings.width, obs.settings.height).filter(id => !obs.tiles[id]).length * 12 + (t.ruin ? 20 : 0) - route.costs[t.id]! * .65 + ((t.id * 13 + obs.actorId * 29) % 17) * .02 })).filter(g => g.score > 0);
  goals.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const goal = goals.find(g => g.tile !== unit.tile); const next = goal ? moveToward(obs, unit, goal.tile, route) : null;
  if (next !== null && next !== unit.tile) push({ type: 'MOVE', unitId: unit.id, to: next }, unit.type === 'settler' ? 105 : unit.type === 'worker' ? 70 : 50);
  else push({ type: unit.hp < data.hp ? 'HEAL' : 'FORTIFY', unitId: unit.id }, 10);
 }
 candidates.sort((a, b) => b.utility - a.utility || JSON.stringify(a.command).localeCompare(JSON.stringify(b.command)));
 return candidates[0]?.command ?? null;
}
export function runAITurn(original: GameState, actorId: number): GameState {
 if ((original.phase !== 'ai' && original.phase !== 'player') || original.actorId !== actorId || original.result) return original;
 let state = original; const attempted = new Set<string>();
 for (let actions = 0; actions < RULES.maxActions && !state.result; actions++) {
  const command = chooseAICommand(getObservation(state, actorId), attempted); if (!command) break;
  attempted.add(JSON.stringify(command)); const result = applyCommand(state, actorId, command); if (result.ok) state = result.state;
 }
 if (!state.result && state.actorId === actorId) { const result = applyCommand(state, actorId, { type: 'END_TURN' }); if (result.ok) state = result.state; }
 return state;
}
