import type { City, CityYieldDetails, GameState, ProductionItem, Tile, Yield } from '../core/types';
import { BUILDINGS, COMBAT_BALANCE, ECONOMY_BALANCE, IMPROVEMENTS, RULES, TECHS, TERRAINS, UNITS, ZERO_YIELD } from '../data/balance';
import { hexDistance, neighborIds } from '../core/hex';
import { canEnter, makeUnit, notify } from './world';
export function productionKey(item: ProductionItem): string { return `${item.kind}:${item.id}`; }
export function productionCost(item: ProductionItem): number { return item.kind === 'unit' ? UNITS[item.id].cost : item.kind === 'building' ? BUILDINGS[item.id].cost : RULES.projectCost; }
function add(a: Yield, b: Partial<Yield>): void { for (const key of Object.keys(a) as (keyof Yield)[]) a[key] += b[key] ?? 0; }
export function tileYields(tile: Tile): Yield {
 const t = TERRAINS[tile.terrain]; const yields: Yield = { food: t.food, production: t.production, gold: t.gold, science: 0, culture: 0 };
 if (tile.resource === 'grain') yields.food += 1; if (tile.resource === 'iron' || tile.resource === 'horses') yields.production += 1;
 if (tile.improvement) add(yields, IMPROVEMENTS[tile.improvement].yields);
 if (tile.improvement === 'farm' && tile.resource === 'grain') yields.food++;
 return yields;
}
function score(tile: Tile, focus: City['focus']): number { const y = tileYields(tile); return y.food * (focus === 'growth' ? 5 : 2.4) + y.production * (focus === 'production' ? 5 : 2) + y.gold * (focus === 'gold' ? 6 : 1.2) + y.science * (focus === 'science' ? 6 : 2); }
export function assignWorkers(state: GameState): void {
 const used = new Set(state.cities.map(c => c.tile));
 for (const c of [...state.cities].sort((a, b) => a.id.localeCompare(b.id))) {
  const eligible = state.tiles.filter(t => t.owner === c.owner && !used.has(t.id) && TERRAINS[t.terrain].passable && hexDistance(t, state.tiles[c.tile]!) <= RULES.cityRadius);
  const locked = c.lockedTiles.filter(id => eligible.some(t => t.id === id)).slice(0, c.population);
  c.lockedTiles = locked;
  c.workedTiles = [...locked, ...eligible.filter(t => !locked.includes(t.id)).sort((a, b) => score(b, c.focus) - score(a, c.focus) || a.id - b.id).map(t => t.id)].slice(0, c.population);
  for (const id of c.workedTiles) used.add(id);
 }
}
export function getCityYields(state: GameState, cityOrId: string | City): CityYieldDetails {
 const city = typeof cityOrId === 'string' ? state.cities.find(c => c.id === cityOrId) : cityOrId;
 if (!city) return { gross: { ...ZERO_YIELD }, netFood: 0, maintenance: 0, workedTiles: [], breakdown: [] };
 const f = state.factions[city.owner]!; const gross = { ...ZERO_YIELD }; const breakdown: CityYieldDetails['breakdown'] = [];
 const record = (label: string, partial: Partial<Yield>) => { const yields = { ...ZERO_YIELD, ...partial }; add(gross, yields); breakdown.push({ label, yields }); };
 record('도시 중심', ECONOMY_BALANCE.cityCenter);
 for (const id of city.workedTiles) record(`노동 타일 ${id}`, tileYields(state.tiles[id]!));
 record(`인구 ${city.population}`, { science: city.population, gold: Math.floor(city.population / 2) });
 for (const building of city.buildings) record(BUILDINGS[building].name, BUILDINGS[building].yields);
 record('세력 특성', f.personality === 'growth' ? { food: 1 } : f.personality === 'military' ? { production: 1 } : f.personality === 'science' ? { science: 1 } : { gold: 2 });
 if (f.policy) record('문화 정책', f.policy === 'cultivation' ? { food: 2, gold: 1 } : f.policy === 'scholarship' ? { science: 3 } : { production: 2 });
 if (f.researched.includes('engineering')) record('기계설계', { production: 1 });
 if (f.researched.includes('astronomy')) record('천체관측', { science: 3, gold: 1 });
 if (f.researched.includes('synthesis')) record('지식통합', { science: 2 });
 if (f.researched.includes('metallurgy') && city.workedTiles.some(id => state.tiles[id]!.resource === 'iron' && state.tiles[id]!.improvement === 'mine')) record('합금제련', { production: 1 });
 if (city.focus === 'science') { const converted = Math.floor(gross.production * ECONOMY_BALANCE.scienceConversion); record('과학 집중: 생산 25%를 연구로 전환', { production: -converted, science: converted }); }
 if (city.resistance > 0) { const penalty = { ...ZERO_YIELD }; for (const key of Object.keys(gross) as (keyof Yield)[]) penalty[key] = Math.floor(gross[key] * ECONOMY_BALANCE.resistanceMultiplier) - gross[key]; record('점령 저항: 산출 50%', penalty); }
 return { gross, netFood: gross.food - city.population * ECONOMY_BALANCE.foodPerPopulation, maintenance: RULES.cityMaintenance + city.buildings.reduce((n, b) => n + BUILDINGS[b].maintenance, 0), workedTiles: [...city.workedTiles], breakdown };
}
export function factionIncome(state: GameState, owner: number) { const yields = state.cities.filter(c => c.owner === owner).map(c => getCityYields(state, c)); const trade = state.relations.filter(r => (r.a === owner || r.b === owner) && !r.war && r.tradeUntil > state.round).length * RULES.tradeIncome; return { gold: yields.reduce((n, y) => n + y.gross.gold - y.maintenance, trade) - state.units.filter(u => u.owner === owner).reduce((n, u) => n + UNITS[u.type].maintenance, 0), science: yields.reduce((n, y) => n + y.gross.science, 0), culture: yields.reduce((n, y) => n + y.gross.culture, 0) }; }
export function cityMaxHp(city: City): number { return RULES.cityHp + (city.buildings.includes('walls') ? COMBAT_BALANCE.wallHp : 0); }
export function growthCost(population: number): number { return ECONOMY_BALANCE.growthBase + population * ECONOMY_BALANCE.growthPerPopulation; }
export function territoryCost(city: City): number { return ECONOMY_BALANCE.territoryBase + city.population * ECONOMY_BALANCE.territoryPerPopulation; }
export function settleEconomy(state: GameState): void {
 assignWorkers(state);
 const income = state.factions.map(f => factionIncome(state, f.id));
 const cityYields = new Map(state.cities.map(c => [c.id, getCityYields(state, c)]));
 for (const c of state.cities) {
  const y = cityYields.get(c.id)!;
  c.food += y.netFood;
  while (c.food >= growthCost(c.population) && c.population < ECONOMY_BALANCE.populationCap) { c.food -= growthCost(c.population); c.population++; notify(state, c.owner, `${c.name} 인구가 ${c.population}으로 성장했습니다.`, 'economy', c.tile); }
  if (c.food < 0) { if (c.population > ECONOMY_BALANCE.minimumPopulation) { c.population = Math.max(ECONOMY_BALANCE.minimumPopulation, c.population - ECONOMY_BALANCE.starvationLoss); notify(state, c.owner, `${c.name}: 식량 부족으로 인구 감소`, 'economy', c.tile); } c.food = 0; }
  c.culture += y.gross.culture;
  const cost = territoryCost(c);
  if (c.culture >= cost) {
   const claim = state.tiles.filter(t => t.owner === null && TERRAINS[t.terrain].passable && hexDistance(t, state.tiles[c.tile]!) <= ECONOMY_BALANCE.territoryRadius && neighborIds(t, state.settings.width, state.settings.height).some(id => state.tiles[id]!.owner === c.owner)).sort((a, b) => hexDistance(a, state.tiles[c.tile]!) - hexDistance(b, state.tiles[c.tile]!) || score(b, c.focus) - score(a, c.focus) || a.id - b.id)[0];
   if (claim) { claim.owner = c.owner; c.culture -= cost; }
  }
  const hadQueue = c.queue.length > 0;
  const alreadyComplete = hadQueue && (c.progress[productionKey(c.queue[0]!)] ?? 0) >= productionCost(c.queue[0]!);
  let available = (hadQueue && !alreadyComplete ? y.gross.production : 0) + (c.progress._overflow ?? 0); c.progress._overflow = 0;
  for (let completed = 0; completed < RULES.maxQueue && c.queue.length; completed++) {
   const item = c.queue[0]!; const key = productionKey(item); const cost = productionCost(item); const total = (c.progress[key] ?? 0) + available;
   if (total < cost) { c.progress[key] = total; available = 0; break; }
   if (item.kind === 'unit') {
    const candidate = { id: '__spawn', owner: c.owner, type: item.id, tile: c.tile, hp: 1, moves: 0, attacked: true, fortified: false, waiting: true, charges: 0, bornRound: state.round };
    const tile = [c.tile, ...neighborIds(state.tiles[c.tile]!, state.settings.width, state.settings.height)].find(id => canEnter(state, candidate, id, false) && (state.tiles[id]!.owner === null || state.tiles[id]!.owner === c.owner));
    if (tile === undefined || (item.id === 'settler' && c.population < RULES.settlerPopulation)) { c.progress[key] = cost; c.progress._overflow = total - cost; available = 0; break; }
    makeUnit(state, c.owner, item.id, tile); if (item.id === 'settler') c.population--;
    notify(state, c.owner, `${c.name}: ${UNITS[item.id].name} 생산 완료`, 'economy', tile);
   } else if (item.kind === 'building') { if (!c.buildings.includes(item.id)) c.buildings.push(item.id); if (item.id === 'walls') c.hp += COMBAT_BALANCE.wallHp; notify(state, c.owner, `${c.name}: ${BUILDINGS[item.id].name} 완공`, 'economy', c.tile); }
   else { state.factions[c.owner]!.scienceProject = true; notify(state, c.owner, `${c.name}: 대학술원 프로젝트 완성`, 'research', c.tile); }
   c.queue.shift(); delete c.progress[key]; available = total - cost;
  }
  if (available > 0 && c.queue.length === 0) c.progress._overflow = available;
  c.hp = Math.min(cityMaxHp(c), c.hp + ECONOMY_BALANCE.cityRegeneration); if (c.resistance > 0) c.resistance--;
 }
 for (const f of state.factions.filter(f => f.alive)) {
  const y = income[f.id]!; f.gold += y.gold; f.culture += y.culture;
  if (f.gold < 0) {
   f.gold = 0;
   const disband = state.units.filter(u => u.owner === f.id && u.type !== 'settler').sort((a, b) => UNITS[b.type].maintenance - UNITS[a.type].maintenance || a.id.localeCompare(b.id)).slice(0, ECONOMY_BALANCE.maximumBankruptcyDisband);
   for (const unit of disband) { state.units = state.units.filter(u => u.id !== unit.id); notify(state, f.id, `국고 부족: ${UNITS[unit.type].name} 1기가 해산했습니다.`, 'economy'); }
  }
  if (f.research) {
   const tech = f.research; const progress = (f.researchProgress[tech] ?? 0) + y.science + (f.researchOverflow ?? 0); f.researchOverflow = 0;
   if (progress >= TECHS[tech].cost) { f.researched.push(tech); f.researchProgress[tech] = TECHS[tech].cost; f.researchOverflow = progress - TECHS[tech].cost; f.research = null; notify(state, f.id, `${TECHS[tech].name} 연구 완료`, 'research'); }
   else f.researchProgress[tech] = progress;
  }
 }
 assignWorkers(state);
}
