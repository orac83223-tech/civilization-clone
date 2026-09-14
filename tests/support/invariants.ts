import type { GameState } from '../../src/game/core/types';

/** Extra audit independent of the engine's own invariant checker. */
export function auditState(state: GameState): string[] {
  const problems: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number' && !Number.isFinite(value)) problems.push(`${path}: non-finite number`);
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(state, 'state');
  const ids = [...state.units.map(unit => unit.id), ...state.cities.map(city => city.id)];
  if (new Set(ids).size !== ids.length) problems.push('duplicate entity ID');
  const tileIds = new Set(state.tiles.map(tile => tile.id));
  const factionIds = new Set(state.factions.map(faction => faction.id));
  const stacks = new Set<string>();
  for (const unit of state.units) {
    if (!tileIds.has(unit.tile)) problems.push(`unit ${unit.id}: missing tile`);
    if (!factionIds.has(unit.owner)) problems.push(`unit ${unit.id}: missing owner`);
    if (unit.hp <= 0 || unit.hp > 100) problems.push(`unit ${unit.id}: invalid health ${unit.hp}`);
    if (unit.moves < 0) problems.push(`unit ${unit.id}: negative movement`);
    const civilian = ['settler', 'worker'].includes(unit.type);
    const key = `${unit.owner}:${unit.tile}:${civilian ? 'civilian' : 'combat'}`;
    if (stacks.has(key)) problems.push(`invalid stack ${key}`);
    stacks.add(key);
  }
  const worked = new Set<number>();
  for (const city of state.cities) {
    if (!tileIds.has(city.tile)) problems.push(`city ${city.id}: missing tile`);
    if (!factionIds.has(city.owner)) problems.push(`city ${city.id}: missing owner`);
    const tile = state.tiles.find(candidate => candidate.id === city.tile);
    if (tile?.cityId !== city.id || tile.owner !== city.owner) problems.push(`city ${city.id}: inconsistent center`);
    if (city.population < 1 || !Number.isInteger(city.population)) problems.push(`city ${city.id}: invalid population`);
    if (new Set(city.buildings).size !== city.buildings.length) problems.push(`city ${city.id}: duplicate building`);
    for (const tileId of city.workedTiles) {
      if (worked.has(tileId)) problems.push(`tile ${tileId}: worked twice`);
      worked.add(tileId);
    }
  }
  for (const tile of state.tiles) {
    if (tile.cityId && !state.cities.some(city => city.id === tile.cityId)) problems.push(`tile ${tile.id}: missing city`);
  }
  for (const faction of state.factions) {
    if (faction.gold < 0) problems.push(`faction ${faction.id}: negative treasury`);
    if (faction.visible.some(tile => !faction.explored.includes(tile))) problems.push(`faction ${faction.id}: visible unexplored tile`);
    if (new Set(faction.researched).size !== faction.researched.length) problems.push(`faction ${faction.id}: duplicate technology`);
  }
  if (state.round < 1 || state.round > state.settings.maxRounds) problems.push(`invalid round ${state.round}`);
  if (state.lastSettledRound > state.round) problems.push('settlement ahead of round');
  if (state.phase === 'ended' && !state.result) problems.push('ended without result');
  return problems;
}

export function auditTransition(before: GameState, after: GameState): string[] {
  const problems: string[] = [];
  if (after.commandSeq < before.commandSeq) problems.push('command sequence regressed');
  if (after.lastSettledRound < before.lastSettledRound) problems.push('settlement counter regressed');
  if (after.lastSettledRound > before.lastSettledRound + 1) problems.push('multiple round settlements');
  if (after.round > before.round + 1) problems.push('multiple round advances');
  if (after.round !== before.round && after.lastSettledRound !== before.round) problems.push('round advanced without exactly one settlement');
  return problems;
}
