import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { advanceTurn, createGame } from '../src/game';
import { APP_ID, MAX_SAVE_BYTES, exportSave, importSave, listSaves, loadGame, saveGame, validateSave } from '../src/storage/saves';
import { capitals, command } from './support/fixtures';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

async function corruptSlot(slot: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(`${APP_ID}-saves-v1`, 1);
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({ state: { corrupted: true } }, slot);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('save validation and deterministic restore', () => {
  it('round-trips initial, founded and AI-boundary states including RNG and command sequence', () => {
    let state = capitals();
    state = command(state, { type: 'SET_RESEARCH', tech: 'writing' });
    expect(importSave(exportSave(state))).toEqual(state);
    state = command(state, { type: 'END_TURN' });
    const restored = importSave(exportSave(state));
    expect(restored.rngState).toBe(state.rngState);
    expect(restored.commandSeq).toBe(state.commandSeq);
    expect(advanceTurn(restored)).toEqual(advanceTurn(state));
    expect(validateSave(createGame('storage-initial'))).toEqual(createGame('storage-initial'));
  });
  it('returns a detached copy so imported state does not alias its input', () => {
    const state = createGame('copy');
    const valid = validateSave(state);
    valid.factions[0]!.gold = 1000;
    expect(state.factions[0]!.gold).toBe(30);
  });
  it.each([
    ['unsupported schema', (state: ReturnType<typeof createGame>) => { (state as unknown as { schemaVersion: number }).schemaVersion = 999; }],
    ['NaN resource', (state: ReturnType<typeof createGame>) => { state.factions[0]!.gold = NaN; }],
    ['missing tile reference', (state: ReturnType<typeof createGame>) => { state.units[0]!.tile = 9999; }],
    ['duplicate unit ID', (state: ReturnType<typeof createGame>) => { state.units[1]!.id = state.units[0]!.id; }],
    ['duplicate unit stack', (state: ReturnType<typeof createGame>) => { state.units[2]!.tile = state.units[1]!.tile; }],
    ['out-of-range movement', (state: ReturnType<typeof createGame>) => { state.units[0]!.moves = 9999; }],
    ['unmet completed prerequisites', (state: ReturnType<typeof createGame>) => { state.factions[0]!.researched = ['synthesis']; }],
    ['unsupported terrain', (state: ReturnType<typeof createGame>) => { (state.tiles[0] as unknown as { terrain: string }).terrain = 'lava'; }],
    ['result without ended phase', (state: ReturnType<typeof createGame>) => { state.result = { winner: 0, type: 'science', round: 1, scores: [0, 1, 2, 3].map(faction => ({ faction, score: 0 })), reason: 'fixture' }; }],
    ['dead active AI actor', (state: ReturnType<typeof createGame>) => { state.phase = 'ai'; state.actorId = 1; state.factions[1]!.alive = false; }],
    ['already settled player round', (state: ReturnType<typeof createGame>) => { state.lastSettledRound = state.round; }],
    ['city memory on unexplored tile', (state: ReturnType<typeof createGame>) => {
      const tile = state.tiles.find(candidate => !state.factions[1]!.explored.includes(candidate.id))!;
      state.factions[1]!.cityMemory.ghost = { id: 'ghost', owner: 0, tile: tile.id, name: 'ghost', hp: 100, originalCapitalOf: 0, lastSeen: 1, visible: false };
    }],
  ] as const)('rejects %s before state can replace the live game', (_, corrupt) => {
    const state = createGame('corrupt');
    corrupt(state);
    expect(() => validateSave(state)).toThrow();
  });
  it('rejects malformed JSON, oversized text and a foreign app envelope', () => {
    expect(() => importSave('{broken')).toThrow();
    expect(() => importSave(' '.repeat(MAX_SAVE_BYTES + 1))).toThrow(/5MB/);
    const envelope = JSON.parse(exportSave(createGame('foreign'))) as { appId: string };
    envelope.appId = `${APP_ID}-different`;
    expect(() => importSave(JSON.stringify(envelope))).toThrow();
  });
  it('rejects broken city centers and double labor assignment', () => {
    const state = capitals();
    const city = state.cities[0]!;
    state.tiles[city.tile]!.cityId = null;
    expect(() => validateSave(state)).toThrow();
    state.tiles[city.tile]!.cityId = city.id;
    const tile = state.tiles.find(candidate => candidate.owner === city.owner && candidate.cityId === null)!;
    city.workedTiles = [tile.id];
    state.cities[1]!.workedTiles = [tile.id];
    expect(() => validateSave(state)).toThrow();
  });
});

describe('IndexedDB ordering, history, slots and failure recovery', () => {
  it('keeps all three manual slots separate and lists them', async () => {
    for (const slot of ['1', '2', '3']) await saveGame(createGame(`slot-${slot}`), slot);
    expect((await listSaves()).map(info => info.slot).sort()).toEqual(['1', '2', '3']);
    expect((await loadGame('2'))?.seed).toBe('slot-2');
    expect(await loadGame()).toBeNull();
  });
  it('serializes autosaves and preserves the two preceding snapshots', async () => {
    const first = createGame('ordered');
    const second = command(first, { type: 'SET_RESEARCH', tech: 'writing' });
    const third = command(second, { type: 'SET_RESEARCH', tech: 'agriculture' });
    await Promise.all([saveGame(first), saveGame(second), saveGame(third)]);
    expect(await loadGame()).toEqual(third);
    expect(await loadGame('auto-1')).toEqual(second);
    expect(await loadGame('auto-2')).toEqual(first);
  });
  it('takes an immediate detached snapshot before asynchronous writes', async () => {
    const state = createGame('snapshot');
    const save = saveGame(state);
    state.factions[0]!.gold = 777;
    await save;
    expect((await loadGame())!.factions[0]!.gold).toBe(30);
  });
  it('leaves normal autosaves intact when corrupt input fails', async () => {
    const state = createGame('preserved');
    await saveGame(state);
    const corrupt = structuredClone(state);
    corrupt.factions[0]!.gold = -500;
    await expect(saveGame(corrupt)).rejects.toThrow();
    expect(await loadGame()).toEqual(state);
  });
  it('recovers a corrupted primary autosave from the newest valid backup', async () => {
    const first = createGame('recover-1');
    const second = createGame('recover-2');
    await saveGame(first); await saveGame(second);
    await corruptSlot('auto');
    expect(await loadGame()).toEqual(first);
    const third = createGame('recover-3');
    await saveGame(third);
    expect(await loadGame()).toEqual(third);
    expect(await loadGame('auto-1')).toEqual(first);
  });
  it('uses the second recovery copy if primary and first backup are damaged', async () => {
    const first = createGame('last-good-copy');
    await saveGame(first); await saveGame(createGame('second')); await saveGame(createGame('third'));
    await corruptSlot('auto'); await corruptSlot('auto-1');
    expect(await loadGame()).toEqual(first);
    await corruptSlot('auto-2');
    await expect(loadGame()).rejects.toThrow();
  });
  it('rejects storage blocking while keeping the game exportable and recovering later', async () => {
    const state = createGame('storage-blocked');
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Storage disabled', 'SecurityError'); });
    await expect(saveGame(state)).rejects.toThrow();
    expect(importSave(exportSave(state))).toEqual(state);
    spy.mockRestore();
    await expect(saveGame(state)).resolves.toBeUndefined();
    expect(await loadGame()).toEqual(state);
  });
  it('handles QuotaExceededError without losing the last save or in-memory export', async () => {
    const original = createGame('quota-recovery');
    await saveGame(original);
    const updated = command(original, { type: 'SET_RESEARCH', tech: 'writing' });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The storage quota was exceeded', 'QuotaExceededError');
    });
    try {
      await expect(saveGame(updated)).rejects.toMatchObject({ name: 'QuotaExceededError' });
      expect(importSave(exportSave(updated))).toEqual(updated);
    } finally { put.mockRestore(); }
    expect(await loadGame()).toEqual(original);
    expect(await loadGame('auto-1')).toBeNull();
    const continued = command(updated, { type: 'SET_RESEARCH', tech: 'agriculture' });
    await expect(saveGame(continued)).resolves.toBeUndefined();
    expect(await loadGame()).toEqual(continued);
  });
});
