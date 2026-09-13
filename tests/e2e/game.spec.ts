import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { checkInvariants, reachable, updateVisibility } from '../../src/game';
import type { GameState, TechId } from '../../src/game/core/types';
import { RULES, TECHS } from '../../src/game/data/balance';
import { assignWorkers } from '../../src/game/systems/economy';
import { APP_ID, exportSave, importSave, validateSave } from '../../src/storage/saves';
import { addUnit, capitals, command } from '../support/fixtures';

async function savedState(page: Page, slot = 'auto'): Promise<GameState | null> {
  return page.evaluate(async ({ appId, selectedSlot }) => new Promise<GameState | null>((resolve, reject) => {
    const open = indexedDB.open(`${appId}-saves-v1`, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('saves')) { db.close(); resolve(null); return; }
      const request = db.transaction('saves', 'readonly').objectStore('saves').get(selectedSlot);
      request.onsuccess = () => { db.close(); resolve(request.result?.state ?? null); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), { appId: APP_ID, selectedSlot: slot });
}

async function hydrate(page: Page, state: GameState): Promise<void> {
  expect(checkInvariants(state)).toEqual([]);
  validateSave(state);
  await page.goto('./');
  await page.getByTestId('import-save').setInputFiles({ name: 'test-preparation.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByTestId('confirm-dialog').click();
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await expect.poll(async () => (await savedState(page))?.seed).toBe(state.seed);
}

async function endRound(page: Page, expectedRound?: number): Promise<void> {
  await page.getByTestId('end-turn').click();
  const confirmation = page.getByTestId('confirm-dialog');
  if (await confirmation.isVisible()) await confirmation.click();
  if (expectedRound !== undefined) {
    await expect.poll(async () => { const state = await savedState(page); return state?.phase === 'player' ? state.round : null; }).toBe(expectedRound);
    await expect(page.getByTestId('end-turn')).toBeEnabled();
  }
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: `artifacts/screenshots/${info.project.name}-${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('new game, found, produce, research, move, rounds, manual save, reload, export and import', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./');
  await capture(page, info, 'menu');
  await page.getByTestId('seed-input').fill('browser-playthrough');
  await page.getByLabel('첫 여정 안내와 함께 시작').uncheck();
  await page.getByTestId('start-game').click();
  await page.getByTestId('found-city').click();
  await page.getByTestId('production-open').click();
  await page.getByTestId('production-warrior').click();
  await page.getByTestId('research-open').click();
  await page.getByTestId('research-writing').click();
  await expect.poll(async () => (await savedState(page))?.factions[0]?.research).toBe('writing');
  const beforeMove = (await savedState(page))!;
  const scout = beforeMove.units.find(unit => unit.owner === 0 && unit.type === 'scout')!;
  const range = reachable(beforeMove, scout.id);
  const choices = [{ delta: 1, key: 'ArrowRight' }, { delta: -1, key: 'ArrowLeft' }, { delta: 24, key: 'ArrowDown' }, { delta: -24, key: 'ArrowUp' }];
  const target = choices.find(choice => {
    const id = scout.tile + choice.delta;
    return range[id] !== undefined && !beforeMove.tiles[id]?.cityId && !beforeMove.units.some(unit => unit.tile === id);
  })!;
  expect(target).toBeTruthy();
  await page.getByTestId(`unit-${scout.id}`).click();
  await page.getByTestId('map-canvas').press(target.key);
  await page.getByTestId('execute-action').click();
  await expect.poll(async () => (await savedState(page))?.units.find(unit => unit.id === scout.id)?.tile).toBe(scout.tile + target.delta);
  for (let round = 2; round <= 4; round += 1) await endRound(page, round);
  await capture(page, info, 'empire-round-4');
  const beforeSave = (await savedState(page))!;
  expect(beforeSave.cities.length).toBeGreaterThanOrEqual(4);
  expect(beforeSave.factions.slice(1).every(faction => faction.stats.founded > 0)).toBe(true);
  await page.getByTestId('save-open').click();
  await page.getByTestId('save-1').click();
  await expect.poll(async () => (await savedState(page, '1'))?.commandSeq).toBe(beforeSave.commandSeq);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-save').click();
  const download = await downloadPromise;
  const downloaded = await download.path();
  expect(downloaded).toBeTruthy();
  const exported = await readFile(downloaded!, 'utf8');
  expect(importSave(exported)).toEqual(beforeSave);
  await page.reload();
  await page.getByTestId('continue-game').click();
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  expect(await savedState(page)).toEqual(beforeSave);
  await endRound(page, 5);
  await page.getByTestId('import-save').setInputFiles({ name: 'round-four.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page.getByTestId('confirm-dialog').click();
  await expect.poll(async () => (await savedState(page))?.commandSeq).toBe(beforeSave.commandSeq);
  expect(await savedState(page)).toEqual(beforeSave);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('real map attack captures the last capital and produces conquest result', async ({ page }, info) => {
  const state = capitals();
  state.seed = 'browser-conquest';
  for (const city of state.cities.filter(candidate => candidate.owner === 2 || candidate.owner === 3)) { city.owner = 0; state.tiles[city.tile]!.owner = 0; }
  const target = state.cities.find(city => city.owner === 1)!;
  target.hp = 1;
  state.units = state.units.filter(unit => unit.tile !== target.tile && unit.tile !== target.tile - 1);
  const attacker = addUnit(state, 0, 'warrior', target.tile - 1);
  state.relations.find(relation => relation.a === 0 && relation.b === 1)!.war = true;
  assignWorkers(state); updateVisibility(state);
  await hydrate(page, state);
  await page.getByTestId(`unit-${attacker.id}`).click();
  await page.getByTestId('map-canvas').press('ArrowRight');
  await expect(page.getByTestId('execute-action')).toContainText('공격 실행');
  await capture(page, info, 'combat-preview');
  await page.getByTestId('execute-action').click();
  await expect.poll(async () => (await savedState(page))?.cities.find(city => city.id === target.id)?.owner).toBe(0);
  expect((await savedState(page))!.factions[0]!.stats.combats).toBe(1);
  await endRound(page);
  await expect(page.getByTestId('result-screen')).toContainText('정복 승리');
  await capture(page, info, 'conquest-result');
  const final = (await savedState(page))!;
  expect(final.result?.type).toBe('conquest');
  expect(final.factions[0]!.stats.captures).toBe(1);
  await page.getByTestId('restart-game').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('found-city')).toBeVisible();
});

test('a legal project completes through round settlement and displays science result', async ({ page }, info) => {
  let state = capitals();
  state.seed = 'browser-science';
  state.factions[0]!.researched = Object.keys(TECHS) as TechId[];
  state = command(state, { type: 'QUEUE_PRODUCTION', cityId: state.cities[0]!.id, item: { kind: 'project', id: 'grandAcademy' } });
  state.cities[0]!.progress['project:grandAcademy'] = RULES.projectCost - 1;
  await hydrate(page, state);
  await endRound(page);
  await expect(page.getByTestId('result-screen')).toContainText('과학 승리');
  await capture(page, info, 'science-result');
  expect((await savedState(page))!.factions[0]!.scienceProject).toBe(true);
});

test('the final configured round computes a score victory', async ({ page }, info) => {
  const state = capitals();
  state.seed = 'browser-score';
  state.settings.maxRounds = 1;
  state.factions[0]!.gold = 10000;
  await hydrate(page, state);
  await endRound(page);
  await expect(page.getByTestId('result-screen')).toContainText('점수 승리');
  await capture(page, info, 'score-result');
  expect((await savedState(page))!.lastSettledRound).toBe(1);
});

test('malformed import preserves current game and primary controls fit the viewport', async ({ page }, info) => {
  await page.goto('./');
  await page.getByTestId('start-game').click();
  await page.getByTestId('found-city').click();
  await expect.poll(async () => (await savedState(page))?.cities.length).toBe(1);
  const before = await savedState(page);
  await page.getByTestId('import-save').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('status')).toContainText('손상');
  expect(await savedState(page)).toEqual(before);
  const viewport = page.viewportSize()!;
  for (const id of ['end-turn', 'research-open', 'save-open', 'map-canvas']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  await page.getByTestId('research-open').click();
  await capture(page, info, 'research-panel');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
