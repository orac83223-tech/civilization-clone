import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/game';
import { RULES } from '../src/game/data/balance';
import { capitals, command } from './support/fixtures';

function contacted() {
  const state = capitals();
  for (const faction of state.factions) faction.contacts = state.factions.filter(other => other.id !== faction.id).map(other => other.id);
  state.factions[0]!.gold = 200;
  state.factions[1]!.gold = 100;
  return state;
}

describe('diplomacy and policy legality', () => {
  it('requires contact and explicit confirmation for war', () => {
    const state = capitals();
    expect(applyCommand(state, 0, { type: 'DECLARE_WAR', target: 1, confirmed: true }).ok).toBe(false);
    state.factions[0]!.contacts.push(1);
    expect(applyCommand(state, 0, { type: 'DECLARE_WAR', target: 1, confirmed: false }).ok).toBe(false);
    const next = command(state, { type: 'DECLARE_WAR', target: 1, confirmed: true });
    expect(next.relations.find(relation => relation.a === 0 && relation.b === 1)!.war).toBe(true);
  });
  it.each([{ give: -1, receive: 0 }, { give: 0, receive: -1 }, { give: 999, receive: 0 }, { give: 0, receive: 101 }, { give: NaN, receive: 0 }])('rejects invalid gold transfer atomically %j', values => {
    const state = contacted();
    const before = structuredClone(state);
    expect(applyCommand(state, 0, { type: 'GOLD_TRADE', target: 1, ...values }).ok).toBe(false);
    expect(state).toEqual(before);
  });
  it('transfers an accepted gift in one atomic state change', () => {
    const state = contacted();
    const next = command(state, { type: 'GOLD_TRADE', target: 1, give: 15, receive: 0 });
    expect(next.factions[0]!.gold).toBe(185);
    expect(next.factions[1]!.gold).toBe(115);
    expect(state.factions[0]!.gold).toBe(200);
  });
  it('prevents duplicate agreements and clears an agreement when war starts', () => {
    let state = contacted();
    state = command(state, { type: 'TRADE_AGREEMENT', target: 1 });
    const relation = state.relations.find(item => item.a === 0 && item.b === 1)!;
    expect(relation.tradeUntil).toBeGreaterThan(state.round);
    const until = relation.tradeUntil;
    expect(applyCommand(state, 0, { type: 'TRADE_AGREEMENT', target: 1 }).ok).toBe(false);
    expect(relation.tradeUntil).toBe(until);
    state = command(state, { type: 'DECLARE_WAR', target: 1, confirmed: true });
    expect(state.relations.find(item => item.a === 0 && item.b === 1)!.tradeUntil).toBeLessThanOrEqual(state.round);
  });
  it('honors minimum peace duration', () => {
    const state = contacted();
    const relation = state.relations.find(item => item.a === 0 && item.b === 1)!;
    relation.peaceUntil = state.round + RULES.peaceDuration;
    expect(applyCommand(state, 0, { type: 'DECLARE_WAR', target: 1, confirmed: true }).ok).toBe(false);
  });
  it('requires policy culture, applies one slot, and charges replacement cost', () => {
    let state = contacted();
    expect(applyCommand(state, 0, { type: 'SET_POLICY', policy: 'scholarship' }).ok).toBe(false);
    state.factions[0]!.culture = RULES.policyCulture;
    state = command(state, { type: 'SET_POLICY', policy: 'scholarship' });
    const gold = state.factions[0]!.gold;
    state = command(state, { type: 'SET_POLICY', policy: 'cultivation' });
    expect(state.factions[0]!.policy).toBe('cultivation');
    expect(state.factions[0]!.gold).toBe(gold - RULES.policySwapCost);
  });
});
