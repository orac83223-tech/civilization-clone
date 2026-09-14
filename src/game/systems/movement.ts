import type { GameState, PathResult } from '../core/types';
import { neighborIds } from '../core/hex';
import { TERRAINS } from '../data/balance';
import { canEnter } from './world';
function search(state: GameState, unitId: string, budget: number) {
 const unit = state.units.find(u => u.id === unitId); const costs: Record<number, number> = {}; const previous: Record<number, number> = {};
 if (!unit) return { costs, previous };
 costs[unit.tile] = 0; const pending = [unit.tile]; const settled = new Set<number>();
 for (let count = 0; pending.length && count < state.tiles.length; count++) {
  pending.sort((a, b) => costs[a]! - costs[b]! || a - b); const id = pending.shift()!; if (settled.has(id)) continue; settled.add(id);
  for (const n of neighborIds(state.tiles[id]!, state.settings.width, state.settings.height)) {
   if (settled.has(n) || !canEnter(state, unit, n)) continue;
   const tile = state.factions[unit.owner]!.memory[n] ?? state.tiles[n]!; const cost = costs[id]! + TERRAINS[tile.terrain].moveCost;
   if (cost <= budget && (costs[n] === undefined || cost < costs[n]!)) { costs[n] = cost; previous[n] = id; if (!pending.includes(n)) pending.push(n); }
  }
 }
 return { costs, previous };
}
export function reachable(state: GameState, unitId: string): Record<number, number> { const u = state.units.find(x => x.id === unitId); return search(state, unitId, u?.moves ?? 0).costs; }
export function findPath(state: GameState, unitId: string, to: number): PathResult | null {
 const unit = state.units.find(u => u.id === unitId); if (!unit) return null;
 const { costs, previous } = search(state, unitId, Infinity); if (costs[to] === undefined) return null;
 const path = [to]; for (let count = 0; path[0] !== unit.tile && count < state.tiles.length; count++) { const before = previous[path[0]!]; if (before === undefined) return null; path.unshift(before); }
 return { path, cost: costs[to]! };
}
