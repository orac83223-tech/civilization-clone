import { advanceTurn, applyCommand, createGame, updateVisibility } from '../../src/game';
import { UNITS } from '../../src/game/data/balance';
import type { Command, GameState, Unit, UnitType } from '../../src/game/core/types';

export function command(state: GameState, action: Command, actor = state.actorId): GameState {
  const result = applyCommand(state, actor, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.error.code}: ${result.error.message}`);
  return result.state;
}

export function flatGame(seed = 'test-fixture'): GameState {
  const state = createGame(seed);
  state.tiles.forEach(tile => { tile.terrain = 'plains'; tile.resource = null; tile.ruin = false; tile.improvement = null; });
  updateVisibility(state);
  return state;
}

export function capitals(): GameState {
  let state = flatGame();
  for (let owner = 0; owner < 4; owner += 1) {
    state.actorId = owner;
    state.phase = owner === 0 ? 'player' : 'ai';
    const settler = state.units.find(unit => unit.owner === owner && unit.type === 'settler')!;
    state = command(state, { type: 'FOUND_CITY', unitId: settler.id }, owner);
  }
  state.actorId = 0;
  state.phase = 'player';
  updateVisibility(state);
  return state;
}

export function addUnit(state: GameState, owner: number, type: UnitType, tile: number): Unit {
  const data = UNITS[type];
  const unit: Unit = { id: `fixture-${state.nextEntityId++}`, owner, type, tile, hp: data.hp, moves: data.moves, attacked: false, fortified: false, waiting: false, charges: type === 'worker' ? 3 : 0, bornRound: 0 };
  state.units.push(unit);
  updateVisibility(state);
  return unit;
}

export function settlement(state: GameState): GameState {
  state.phase = 'settlement';
  state.actorId = 0;
  return advanceTurn(state);
}
