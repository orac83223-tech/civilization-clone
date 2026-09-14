import type { GameState, GameResult } from '../core/types';
import { notify } from './world';
import { SCORE_WEIGHTS as W } from '../data/balance';
export function scoreFaction(state: GameState, id: number): number { const f = state.factions[id]!; const cities = state.cities.filter(c => c.owner === id); return cities.length * W.city + cities.reduce((n, c) => n + c.population * W.population + c.buildings.length * W.building, 0) + f.researched.length * W.technology + Math.floor(f.culture / W.cultureDivisor) + Math.floor(f.gold / W.goldDivisor) + f.stats.captures * W.capture; }
export function checkElimination(state: GameState): void {
 for (const f of state.factions.filter(f => f.alive)) if (!state.cities.some(c => c.owner === f.id) && !state.units.some(u => u.owner === f.id && u.type === 'settler')) {
  f.alive = false; state.units = state.units.filter(u => u.owner !== f.id); for (const tile of state.tiles) if (tile.owner === f.id) tile.owner = null; notify(state, 0, `${f.name} 세력이 탈락했습니다.`);
 }
}
export function checkVictory(state: GameState): GameResult | null {
 const scores = state.factions.map(f => ({ faction: f.id, score: scoreFaction(state, f.id) })).sort((a, b) => b.score - a.score || a.faction - b.faction);
 const alive = state.factions.filter(f => f.alive);
 const science = alive.filter(f => f.scienceProject && f.researched.includes('synthesis')).sort((a, b) => scoreFaction(state, b.id) - scoreFaction(state, a.id) || a.id - b.id)[0];
 const pendingCapital = alive.some(f => !f.capitalId);
 const capitals = state.factions.filter(f => f.capitalId).map(f => state.cities.find(c => c.id === f.capitalId));
 const conquest = pendingCapital ? undefined : alive.find(f => capitals.length > 0 && capitals.every(c => c?.owner === f.id));
 const winner = conquest?.id ?? science?.id ?? (state.round >= state.settings.maxRounds ? scores.find(s => state.factions[s.faction]!.alive)?.faction ?? scores[0]!.faction : undefined);
 if (winner === undefined) return null;
 const type = conquest ? 'conquest' : science ? 'science' : 'score';
 return { winner, type, round: state.round, scores, reason: type === 'conquest' ? '모든 원래 수도를 동시에 지배했습니다.' : type === 'science' ? '지식통합을 연구하고 대학술원 프로젝트를 완성했습니다.' : `${state.settings.maxRounds}라운드 종료: 공개 점수 합산에서 선두입니다.` };
}
export function finishIfHumanEliminated(state: GameState): void {
 if (state.factions[0]!.alive || state.result) return;
 const scores = state.factions.map(f => ({ faction: f.id, score: scoreFaction(state, f.id) })).sort((a, b) => b.score - a.score || a.faction - b.faction);
 state.result = { winner: scores.find(s => state.factions[s.faction]!.alive)?.faction ?? 0, type: 'defeat', round: state.round, scores, reason: '모든 도시와 개척자를 잃었습니다.' }; state.phase = 'ended';
}
