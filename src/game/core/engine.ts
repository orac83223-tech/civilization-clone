import type { City, Command, CommandResult, GameState, Unit } from './types';
import { BUILDINGS, ECONOMY_BALANCE, IMPROVEMENTS, POLICIES, RULES, TECHS, TERRAINS, UNITS } from '../data/balance';
import { hexDistance, neighborIds } from './hex';
import { canEnter, knownResource, notify, relation, resetFaction, updateVisibility } from '../systems/world';
import { assignWorkers, settleEconomy } from '../systems/economy';
import { executeCombat, previewCombat } from '../systems/combat';
import { findPath } from '../systems/movement';
import { checkElimination, checkVictory, finishIfHumanEliminated } from '../systems/victory';
import { runAITurn } from '../ai/utility';
class RuleError extends Error { constructor(public code: string, message: string) { super(message); } }
function requireRule(condition: unknown, code: string, message: string): asserts condition { if (!condition) throw new RuleError(code, message); }
function ownedUnit(state: GameState, actor: number, id: string): Unit { const unit = state.units.find(u => u.id === id && u.owner === actor); requireRule(unit, 'UNIT', '선택한 아군 유닛을 찾을 수 없습니다.'); return unit; }
function ownedCity(state: GameState, actor: number, id: string): City { const city = state.cities.find(c => c.id === id && c.owner === actor); requireRule(city, 'CITY', '선택한 아군 도시를 찾을 수 없습니다.'); return city; }
export function applyCommand(original: GameState, actorId: number, command: Command): CommandResult {
 try {
  requireRule(command && typeof command.type === 'string', 'COMMAND', '잘못된 명령입니다.');
  requireRule(!original.result && original.phase !== 'ended', 'ENDED', '이미 종료된 게임입니다.');
  requireRule((original.phase === 'player' || original.phase === 'ai') && original.actorId === actorId && original.factions[actorId]?.alive, 'PHASE', '현재 이 세력의 행동 차례가 아닙니다.');
  const state = structuredClone(original); const f = state.factions[actorId]!;
  switch (command.type) {
   case 'MOVE': {
    const unit = ownedUnit(state, actorId, command.unitId); requireRule(!unit.waiting && unit.moves > 0, 'MOVES', '남은 이동력이 없습니다.');
    requireRule(Number.isInteger(command.to) && command.to >= 0 && command.to < state.tiles.length && command.to !== unit.tile, 'TILE', '유효한 다른 타일을 선택하세요.');
    const path = findPath(state, unit.id, command.to); requireRule(path && path.cost <= unit.moves, 'PATH', '알려진 이동 경로가 없거나 이동력이 부족합니다.');
    requireRule(path.path.slice(1).every(id => canEnter(state, unit, id, false)), 'BLOCKED', '경로가 막혀 있습니다.');
    unit.tile = command.to; unit.moves -= path.cost; unit.fortified = false;
    for (const id of path.path.slice(1)) if (state.tiles[id]!.ruin) { state.tiles[id]!.ruin = false; f.gold += ECONOMY_BALANCE.ruinGold; notify(state, actorId, `옛 유적에서 금 ${ECONOMY_BALANCE.ruinGold}를 발견했습니다.`, 'economy', id); }
    break;
   }
   case 'FOUND_CITY': {
    const unit = ownedUnit(state, actorId, command.unitId); const tile = state.tiles[unit.tile]!;
    requireRule(unit.type === 'settler' && unit.moves > 0 && !unit.waiting, 'SETTLER', '행동 가능한 개척자가 필요합니다.');
    requireRule(TERRAINS[tile.terrain].passable && (tile.owner === null || tile.owner === actorId), 'FOUND_TERRAIN', '도시는 아군 또는 중립 육지에 세울 수 있습니다.');
    requireRule(state.cities.every(c => hexDistance(state.tiles[c.tile]!, tile) >= RULES.cityDistance), 'CITY_DISTANCE', '도시 간 거리는 최소 3칸이어야 합니다.');
    const id = `c${state.nextEntityId++}`; const isCapital = f.capitalId === null;
    const baseNames = ['새벽정원', '불꽃마루', '별빛샘', '금빛여울'];
    const name = command.name?.trim().slice(0, 24) || (f.stats.founded === 0 ? baseNames[actorId]! : `${baseNames[actorId]} ${f.stats.founded + 1}`);
    const city: City = { id, owner: actorId, name, tile: tile.id, originalCapitalOf: isCapital ? actorId : null, hp: RULES.cityHp, population: 1, food: 0, culture: 0, buildings: [], queue: [], progress: {}, focus: 'balanced', lockedTiles: [], workedTiles: [], resistance: 0 };
    state.cities.push(city); state.units = state.units.filter(u => u.id !== unit.id); tile.cityId = id; tile.owner = actorId; tile.ruin = false;
    for (const n of neighborIds(tile, state.settings.width, state.settings.height)) if (state.tiles[n]!.owner === null && TERRAINS[state.tiles[n]!.terrain].passable) state.tiles[n]!.owner = actorId;
    if (isCapital) f.capitalId = id; f.stats.founded++; notify(state, actorId, `${name} 건설`, 'economy', tile.id); assignWorkers(state); break;
   }
   case 'QUEUE_PRODUCTION': {
    const city = ownedCity(state, actorId, command.cityId); const item = command.item;
    requireRule(item && ['unit', 'building', 'project'].includes(item.kind), 'PRODUCTION', '올바른 생산 대상을 선택하세요.');
    if (item.kind === 'unit') { const data = UNITS[item.id]; requireRule(Object.hasOwn(UNITS, item.id), 'PRODUCTION', '알 수 없는 유닛입니다.'); requireRule(!data.tech || f.researched.includes(data.tech), 'TECH_REQUIRED', '선행 기술이 필요합니다.'); requireRule(!data.resource || knownResource(f, data.resource), 'RESOURCE', '개량된 전략 자원을 확보해야 합니다.'); }
    else if (item.kind === 'building') { const data = BUILDINGS[item.id]; requireRule(Object.hasOwn(BUILDINGS, item.id), 'PRODUCTION', '알 수 없는 건물입니다.'); requireRule(!data.tech || f.researched.includes(data.tech), 'TECH_REQUIRED', '선행 기술이 필요합니다.'); requireRule(!city.buildings.includes(item.id) && (!city.queue.some(i => i.kind === 'building' && i.id === item.id) || command.replace), 'DUPLICATE', '이미 건설했거나 대기 중인 건물입니다.'); }
    else { requireRule(item.id === 'grandAcademy' && f.researched.includes('synthesis') && !f.scienceProject, 'PROJECT', '지식통합 연구 후 대학술원 프로젝트를 시작할 수 있습니다.'); }
    requireRule(command.replace || city.queue.length < RULES.maxQueue, 'QUEUE_FULL', '생산 대기열은 최대 5개입니다.');
    if (command.replace) city.queue = []; city.queue.push({ ...item }); break;
   }
   case 'CANCEL_PRODUCTION': { const city = ownedCity(state, actorId, command.cityId); requireRule(Number.isInteger(command.index) && command.index >= 0 && command.index < city.queue.length, 'QUEUE_INDEX', '유효한 대기열 항목을 선택하세요.'); city.queue.splice(command.index, 1); break; }
   case 'SET_RESEARCH': { const data = TECHS[command.tech]; requireRule(data && !f.researched.includes(command.tech), 'RESEARCH', '연구 가능한 미완료 기술을 선택하세요.'); requireRule(data.prerequisites.every(p => f.researched.includes(p)), 'PREREQUISITE', '선행 기술을 먼저 연구해야 합니다.'); requireRule(f.research !== command.tech, 'DUPLICATE', '이미 연구 중입니다.'); f.research = command.tech; break; }
   case 'SET_FOCUS': { const city = ownedCity(state, actorId, command.cityId); requireRule(['balanced', 'growth', 'production', 'gold', 'science'].includes(command.focus), 'FOCUS', '지원하지 않는 노동 집중입니다.'); city.focus = command.focus; assignWorkers(state); break; }
   case 'TOGGLE_WORK_TILE': {
    const city = ownedCity(state, actorId, command.cityId); const tile = state.tiles[command.tile]; requireRule(tile && tile.owner === actorId && !tile.cityId && TERRAINS[tile.terrain].passable && hexDistance(tile, state.tiles[city.tile]!) <= RULES.cityRadius, 'WORK_TILE', '도시 반경 2칸 안 소유 타일을 선택하세요.');
    requireRule(!state.cities.some(c => c.id !== city.id && c.workedTiles.includes(tile.id)), 'WORKED', '다른 도시가 작업 중인 타일입니다.');
    if (city.lockedTiles.includes(tile.id)) city.lockedTiles = city.lockedTiles.filter(id => id !== tile.id); else { requireRule(city.lockedTiles.length < city.population, 'WORK_LIMIT', '인구보다 많은 타일을 잠글 수 없습니다.'); city.lockedTiles.push(tile.id); } assignWorkers(state); break;
   }
   case 'IMPROVE': {
    const unit = ownedUnit(state, actorId, command.unitId); const tile = state.tiles[unit.tile]!; const data = IMPROVEMENTS[command.improvement];
    requireRule(unit.type === 'worker' && unit.charges > 0 && unit.moves > 0 && !unit.waiting, 'WORKER', '행동 가능한 일꾼이 필요합니다.');
    requireRule(data && f.researched.includes(data.tech), 'TECH_REQUIRED', '개량에 필요한 기술이 없습니다.'); requireRule(tile.owner === actorId && !tile.cityId && data.terrains.includes(tile.terrain) && tile.improvement === null, 'IMPROVEMENT', '이미 개량했거나 이 타일에 건설할 수 없습니다.');
    tile.improvement = command.improvement; unit.moves = 0; unit.charges--; if (unit.charges === 0) state.units = state.units.filter(u => u.id !== unit.id); break;
   }
   case 'ATTACK': { const unit = ownedUnit(state, actorId, command.unitId); requireRule(unit.moves > 0 && !unit.attacked && !unit.waiting, 'ATTACK_USED', '이번 턴 공격을 마쳤거나 행동할 수 없습니다.'); requireRule(previewCombat(state, unit.id, command.targetTile), 'TARGET', '시야·사거리·전쟁 상태를 확인하세요. 공격하려면 먼저 선전포고해야 합니다.'); executeCombat(state, unit, command.targetTile); break; }
   case 'WAIT': case 'FORTIFY': case 'HEAL': { const unit = ownedUnit(state, actorId, command.unitId); requireRule(unit.moves > 0 && !unit.waiting, 'ACTION_USED', '이미 행동을 마쳤습니다.'); unit.waiting = true; unit.moves = 0; unit.fortified = command.type !== 'WAIT'; break; }
   case 'UPGRADE': {
    const unit = ownedUnit(state, actorId, command.unitId); const upgrade = unit.type === 'scout' ? 'warrior' : unit.type === 'warrior' ? 'cavalry' : null; requireRule(upgrade, 'UPGRADE', '이 유닛의 승급 경로가 없습니다.'); const data = UNITS[upgrade];
    requireRule(unit.moves > 0 && state.tiles[unit.tile]!.owner === actorId, 'UPGRADE_TERRITORY', '아군 영토에서 행동 가능한 유닛만 승급합니다.'); requireRule((!data.tech || f.researched.includes(data.tech)) && (!data.resource || knownResource(f, data.resource)), 'UPGRADE_TECH', '승급 기술 또는 전략 자원이 부족합니다.'); requireRule(f.gold >= ECONOMY_BALANCE.upgradeGold, 'GOLD', `승급에 금 ${ECONOMY_BALANCE.upgradeGold}이 필요합니다.`);
    f.gold -= ECONOMY_BALANCE.upgradeGold; unit.hp = Math.max(1, Math.floor(unit.hp / UNITS[unit.type].hp * data.hp)); unit.type = upgrade; unit.moves = 0; unit.attacked = true; break;
   }
   case 'SET_POLICY': { requireRule(command.policy === null || (POLICIES[command.policy] && f.culture >= POLICIES[command.policy].culture), 'POLICY', '누적 문화 25가 필요합니다.'); requireRule(f.policy !== command.policy, 'DUPLICATE', '이미 선택한 정책입니다.'); const cost = f.policy ? RULES.policySwapCost : 0; requireRule(f.gold >= cost, 'GOLD', '정책 교체에 금 20이 필요합니다.'); f.gold -= cost; f.policy = command.policy; break; }
   case 'DECLARE_WAR': case 'OFFER_PEACE': case 'TRADE_AGREEMENT': case 'GOLD_TRADE': {
    requireRule(Number.isInteger(command.target) && command.target !== actorId && f.contacts.includes(command.target) && state.factions[command.target]?.alive, 'CONTACT', '먼저 살아 있는 상대 세력을 발견해야 합니다.'); const other = state.factions[command.target]!; const rel = relation(state, actorId, other.id)!;
    if (command.type === 'DECLARE_WAR') { requireRule(command.confirmed === true, 'CONFIRM_WAR', '선전포고를 명시적으로 확인하세요.'); requireRule(!rel.war && state.round >= rel.peaceUntil, 'PEACE_LOCK', `강화 유지 기간(${rel.peaceUntil}라운드)에는 선전포고할 수 없습니다.`); rel.war = true; rel.tradeUntil = 0; rel.opinion -= 20; notify(state, actorId, `${other.name}에 선전포고했습니다.`, 'diplomacy'); notify(state, other.id, `${f.name}의 선전포고`, 'diplomacy'); }
    else if (command.type === 'OFFER_PEACE') {
     requireRule(rel.war, 'PEACE', '이미 평화 상태입니다.'); const ownForce = state.units.filter(u => u.owner === other.id && UNITS[u.type].combat).length; const observedThreat = state.units.filter(u => u.owner === actorId && other.visible.includes(u.tile) && UNITS[u.type].combat).length;
     requireRule(other.id === 0 || other.personality !== 'military' || observedThreat >= ownForce / 2 || state.round > 35 || rel.opinion > -25, 'REJECTED', '상대가 아직 강화 제안을 받아들이지 않았습니다.'); rel.war = false; rel.peaceUntil = state.round + RULES.peaceDuration; rel.opinion += 10; expelTrespassers(state, actorId, other.id); notify(state, actorId, `${other.name}과 강화: ${rel.peaceUntil}라운드까지 평화 보장`, 'diplomacy'); notify(state, other.id, `${f.name}과 강화 협정`, 'diplomacy');
    } else if (command.type === 'TRADE_AGREEMENT') { requireRule(!rel.war && rel.tradeUntil <= state.round, 'TRADE_ACTIVE', '전쟁 중이거나 기존 교역 협정이 유효합니다.'); requireRule(rel.opinion >= -10, 'REJECTED', '관계가 나빠 교역을 거절했습니다.'); rel.tradeUntil = state.round + RULES.tradeDuration; rel.opinion += 5; notify(state, actorId, `${other.name}과 12라운드 교역: 양측 금 +3/라운드`, 'diplomacy'); }
    else { requireRule(!rel.war && Number.isSafeInteger(command.give) && Number.isSafeInteger(command.receive) && command.give >= 0 && command.receive >= 0 && command.give + command.receive > 0, 'TRADE_AMOUNT', '평화 중 0 이상의 정수 금액을 거래하세요.'); requireRule(f.gold >= command.give && other.gold >= command.receive, 'BALANCE', '양측 중 한 세력의 보유 금이 부족합니다.'); requireRule(command.give >= command.receive, 'REJECTED', '상대는 이익이 없는 금 요구를 거절했습니다.'); f.gold += command.receive - command.give; other.gold += command.give - command.receive; rel.opinion += Math.min(20, Math.floor((command.give - command.receive) / 5)); }
    break;
   }
   case 'END_TURN': nextActor(state); break;
   default: throw new RuleError('COMMAND', '지원하지 않는 명령입니다.');
  }
  state.commandSeq++; updateVisibility(state); checkElimination(state); finishIfHumanEliminated(state);
  return { ok: true, state };
 } catch (error) { if (error instanceof RuleError) return { ok: false, state: original, error: { code: error.code, message: error.message } }; return { ok: false, state: original, error: { code: 'COMMAND', message: '잘못된 명령 데이터입니다.' } }; }
}
function expelTrespassers(state: GameState, a: number, b: number): void {
 for (const unit of state.units.filter(u => (u.owner === a && state.tiles[u.tile]!.owner === b) || (u.owner === b && state.tiles[u.tile]!.owner === a))) {
  const tile = state.tiles.filter(t => (t.owner === unit.owner || t.owner === null) && canEnter(state, unit, t.id, false)).sort((x, y) => hexDistance(x, state.tiles[unit.tile]!) - hexDistance(y, state.tiles[unit.tile]!) || x.id - y.id)[0];
  if (tile) { unit.tile = tile.id; unit.moves = 0; }
 }
}
function nextActor(state: GameState): void { const next = state.factions.find(f => f.id > state.actorId && f.alive); if (next) { state.phase = 'ai'; state.actorId = next.id; resetFaction(state, next.id); } else { state.phase = 'settlement'; } }
export function advanceTurn(original: GameState): GameState {
 if (original.phase === 'ai') return runAITurn(original, original.actorId);
 if (original.phase !== 'settlement') return original;
 const state = structuredClone(original);
 if (state.lastSettledRound < state.round) { settleEconomy(state); state.lastSettledRound = state.round; checkElimination(state); state.result = checkVictory(state); finishIfHumanEliminated(state); }
 state.commandSeq++;
 if (state.result) state.phase = 'ended'; else { state.round++; state.actorId = 0; state.phase = 'player'; resetFaction(state, 0); }
 updateVisibility(state); return state;
}
