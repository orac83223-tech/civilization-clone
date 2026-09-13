import type { GameState } from '../game/core/types';
import { BUILDINGS, GAME_VERSION, IMPROVEMENTS, POLICIES, TECHS, TERRAINS, UNITS } from '../game/data/balance';

export const APP_ID = 'hex-empires-dawn';
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;
export type SaveSlot = 'auto' | 'auto-1' | 'auto-2' | '1' | '2' | '3';
export interface SaveInfo { slot: string; round: number; seed: string; savedAt: string }
interface Envelope { appId: typeof APP_ID; schemaVersion: 1; gameVersion: string; savedAt: string; state: GameState }
let pending: Promise<unknown> = Promise.resolve();

function fail(message: string): never { throw new Error(`저장 파일 오류: ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 자료형`);
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} 목록 크기`);
  return value;
}
function number(value: unknown, label: string, min = 0, max = 10000000, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label} 숫자 범위`);
  return value;
}
function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || value.length > max) fail(`${label} 문자열`);
  return value;
}
function boolean(value: unknown, label: string): void { if (typeof value !== 'boolean') fail(`${label} 참/거짓 값`); }
function oneOf(value: unknown, values: readonly unknown[], label: string): void { if (!values.includes(value)) fail(`${label} 허용되지 않은 값`); }
function unique(values: unknown[], label: string): void { if (new Set(values).size !== values.length) fail(`${label} 중복`); }
function numericRecord(value: unknown, keys: string[], label: string): void {
  const record = object(value, label);
  for (const [key, amount] of Object.entries(record)) { oneOf(key, keys, label); number(amount, label, 0, 10000000, false); }
}

/** Validate every persisted rule field before it can replace a live game or an IndexedDB slot. */
export function validateSave(input: unknown): GameState {
  const s = object(input, '게임 상태');
  if (s.schemaVersion !== 1) fail('지원하지 않는 스키마 버전');
  if (s.gameVersion !== GAME_VERSION) fail('지원하지 않는 게임 버전');
  string(s.seed, '시드', 200);
  const settings = object(s.settings, '설정');
  const width = number(settings.width, '너비', 12, 40);
  const height = number(settings.height, '높이', 10, 30);
  const maxRounds = number(settings.maxRounds, '최대 라운드', 1, 100);
  oneOf(settings.difficulty, ['normal'], '난이도');
  const size = width * height;
  const round = number(s.round, '라운드', 1, maxRounds + 1);
  number(s.commandSeq, '명령 순번', 0, 10000000);
  number(s.rngState, 'RNG 상태', 0, 4294967295);
  number(s.nextEntityId, '엔티티 순번', 1, 10000000);
  number(s.lastSettledRound, '정산 라운드', 0, round);
  oneOf(s.phase, ['player', 'ai', 'settlement', 'ended'], '페이즈');
  const actor = number(s.actorId, '행동 세력', 0, 3);
  if (s.phase === 'player' && actor !== 0) fail('플레이어 페이즈의 행동 세력');
  const tileRef = (v: unknown): number => number(v, '타일 참조', 0, size - 1);
  const owner = (v: unknown): void => { if (v !== null) number(v, '세력 참조', 0, 3); };
  const id = (v: unknown): string => { const text = string(v, '식별자', 64); if (!/^[a-zA-Z0-9_-]+$/.test(text)) fail('식별자 형식'); return text; };
  const tileList = (v: unknown, label: string): unknown[] => { const list = array(v, label, size); unique(list, label); list.forEach(tileRef); return list; };
  const validateTile = (value: unknown): Record<string, unknown> => {
    const t = object(value, '타일'); tileRef(t.id);
    number(t.q, '육각 q', -height, width + height); number(t.r, '육각 r', 0, height - 1);
    oneOf(t.terrain, Object.keys(TERRAINS), '지형'); oneOf(t.resource, [null, 'grain', 'iron', 'horses'], '자원');
    oneOf(t.improvement, [null, ...Object.keys(IMPROVEMENTS)], '개량'); owner(t.owner);
    if (t.cityId !== null) id(t.cityId); boolean(t.ruin, '유적'); return t;
  };
  const tiles = array(s.tiles, '타일', size).map(validateTile);
  if (tiles.length !== size) fail('지도 타일 개수');
  tiles.forEach((t, i) => { if (t.id !== i || t.q !== i % width || t.r !== Math.floor(i / width)) fail('타일 순서/좌표'); });
  unique(tiles.map(t => `${t.q},${t.r}`), '육각 좌표');
  const starts = tileList(s.starts, '시작 위치'); if (starts.length !== 4) fail('시작 세력 수');
  const units = array(s.units, '유닛', 2000).map(v => {
    const u = object(v, '유닛'); id(u.id); number(u.owner, '유닛 세력', 0, 3); tileRef(u.tile);
    oneOf(u.type, Object.keys(UNITS), '유닛 종류');
    const data = UNITS[u.type as keyof typeof UNITS];
    number(u.hp, '유닛 체력', 1, data.hp, false); number(u.moves, '이동력', 0, data.moves, false);
    boolean(u.attacked, '공격 여부'); boolean(u.fortified, '방어 여부'); boolean(u.waiting, '대기 여부');
    number(u.charges, '일꾼 작업 횟수', 0, 3); number(u.bornRound, '생산 라운드', 0, round);
    if (!TERRAINS[tiles[u.tile as number].terrain as keyof typeof TERRAINS].passable) fail('유닛의 통과 불가 지형');
    return u;
  });
  unique(units.map(u => u.id), '유닛 식별자');
  unique(units.map(u => `${u.owner}:${u.tile}:${UNITS[u.type as keyof typeof UNITS].combat}`), '유닛 중첩');
  for (const u of units) if (units.some(other => other.tile === u.tile && other.owner !== u.owner)) fail('서로 다른 세력의 중첩');
  const productionKeys = [...Object.keys(UNITS).map(v => `unit:${v}`), ...Object.keys(BUILDINGS).map(v => `building:${v}`), 'project:grandAcademy'];
  const cities = array(s.cities, '도시', 200).map(v => {
    const c = object(v, '도시'); id(c.id); number(c.owner, '도시 세력', 0, 3); tileRef(c.tile); string(c.name, '도시 이름', 80);
    owner(c.originalCapitalOf); number(c.hp, '도시 체력', 0, 150, false); number(c.population, '인구', 1, 200);
    number(c.food, '식량', 0, 10000000, false); number(c.culture, '도시 문화', 0, 10000000, false);
    const buildings = array(c.buildings, '건물', 8); buildings.forEach(b => oneOf(b, Object.keys(BUILDINGS), '건물')); unique(buildings, '건물');
    for (const q of array(c.queue, '생산 대기열', 5)) {
      const item = object(q, '생산 항목'); oneOf(item.kind, ['unit', 'building', 'project'], '생산 종류');
      oneOf(`${item.kind}:${item.id}`, productionKeys, '생산 항목');
    }
    numericRecord(c.progress, [...productionKeys, '_overflow'], '생산 진척'); oneOf(c.focus, ['balanced', 'growth', 'production', 'gold', 'science'], '노동 집중');
    tileList(c.lockedTiles, '잠금 타일'); tileList(c.workedTiles, '노동 타일'); number(c.resistance, '점령 저항', 0, 10);
    if (tiles[c.tile as number].cityId !== c.id || tiles[c.tile as number].owner !== c.owner) fail('도시 중심 참조');
    return c;
  });
  unique(cities.map(c => c.id), '도시 식별자'); unique(cities.map(c => c.tile), '도시 위치');
  unique([...units, ...cities].map(e => e.id), '전체 엔티티 식별자');
  for (const entity of [...units, ...cities]) {
    const match = /^.[0-9]+$/.test(entity.id as string);
    if (match && Number((entity.id as string).slice(1)) >= (s.nextEntityId as number)) fail('엔티티 생성 순번');
  }
  const capitals = cities.filter(c => c.originalCapitalOf !== null); unique(capitals.map(c => c.originalCapitalOf), '원래 수도');
  const cityIds = new Set(cities.map(c => c.id));
  for (const t of tiles) if (t.cityId !== null && !cityIds.has(t.cityId)) fail('없는 도시 참조');
  const worked = cities.flatMap(c => c.workedTiles as number[]); unique(worked, '도시 사이 중복 노동');
  for (const c of cities) {
    for (const tileId of [...c.workedTiles as number[], ...c.lockedTiles as number[]]) {
      const t = tiles[tileId]; const center = tiles[c.tile as number];
      const dq = (t.q as number) - (center.q as number); const dr = (t.r as number) - (center.r as number);
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 2 || t.owner !== c.owner || t.cityId !== null) fail('노동 타일 소유권/거리');
    }
  }
  const validateObservedCity = (value: unknown): void => {
    const c = object(value, '마지막 확인 도시'); id(c.id); number(c.owner, '확인 도시 세력', 0, 3); string(c.name, '확인 도시 이름', 80);
    tileRef(c.tile); number(c.hp, '확인 도시 체력', 0, 150, false); owner(c.originalCapitalOf); number(c.lastSeen, '마지막 확인 라운드', 1, round); boolean(c.visible, '도시 시야');
    if (c.population !== undefined) number(c.population, '확인 도시 인구', 1, 200);
    if (c.buildings !== undefined) array(c.buildings, '확인 도시 건물', 8).forEach(b => oneOf(b, Object.keys(BUILDINGS), '건물'));
  };
  const factions = array(s.factions, '세력', 4).map((value, i) => {
    const f = object(value, '세력'); if (f.id !== i) fail('세력 식별자/순서'); string(f.name, '세력명', 80); string(f.color, '세력색', 20); string(f.emblem, '세력 문장', 20);
    if (!/^#[0-9a-fA-F]{6}$/.test(f.color as string)) fail('세력색 형식');
    oneOf(f.personality, ['growth', 'military', 'science', 'trade'], '세력 성격'); number(f.gold, '금', 0, 10000000, false); number(f.culture, '세력 문화', 0, 10000000, false);
    const researched = array(f.researched, '완료 연구', 12); unique(researched, '연구'); researched.forEach(t => oneOf(t, Object.keys(TECHS), '기술'));
    for (const tech of researched) for (const p of TECHS[tech as keyof typeof TECHS].prerequisites) if (!researched.includes(p)) fail('완료 연구 선행 조건');
    oneOf(f.research, [null, ...Object.keys(TECHS)], '선택 연구'); numericRecord(f.researchProgress, Object.keys(TECHS), '연구 진척');
    if (f.researchOverflow !== undefined) number(f.researchOverflow, '연구 초과분', 0, 10000000, false);
    if (f.research !== null && (researched.includes(f.research) || TECHS[f.research as keyof typeof TECHS].prerequisites.some(p => !researched.includes(p)))) fail('선택 연구 선행 조건');
    oneOf(f.policy, [null, ...Object.keys(POLICIES)], '정책'); boolean(f.alive, '생존'); boolean(f.scienceProject, '과학 프로젝트');
    if (f.capitalId !== null && !cityIds.has(id(f.capitalId))) fail('수도 참조');
    if (f.capitalId !== null && !cities.some(c => c.id === f.capitalId && c.originalCapitalOf === f.id)) fail('원래 수도 식별');
    const contacts = array(f.contacts, '접촉 세력', 3); unique(contacts, '접촉'); contacts.forEach(v => { number(v, '접촉 세력', 0, 3); if (v === i) fail('자기 접촉'); });
    const explored = tileList(f.explored, '탐험 타일'); const visible = tileList(f.visible, '시야 타일'); for (const t of visible) if (!explored.includes(t)) fail('시야/탐험 불일치');
    const memory = object(f.memory, '타일 기억'); if (Object.keys(memory).length > size) fail('타일 기억 크기');
    for (const [k, v] of Object.entries(memory)) { const t = validateTile(v); if (String(t.id) !== k || !explored.includes(t.id)) fail('타일 기억 참조'); }
    const cityMemory = object(f.cityMemory, '도시 기억'); if (Object.keys(cityMemory).length > 200) fail('도시 기억 크기');
    for (const [k, v] of Object.entries(cityMemory)) { validateObservedCity(v); if (object(v, '도시 기억').id !== k) fail('도시 기억 식별자'); }
    const stats = object(f.stats, '통계'); for (const k of ['founded', 'captures', 'kills', 'explored']) number(stats[k], `통계 ${k}`);
    if (stats.combats !== undefined) number(stats.combats, '전투 횟수');
    return f;
  });
  if (factions.length !== 4) fail('세력 수');
  const relations = array(s.relations, '외교 관계', 6).map(v => {
    const r = object(v, '외교'); const a = number(r.a, '외교 세력', 0, 3); const b = number(r.b, '외교 상대', 0, 3); if (a >= b) fail('외교 쌍 순서');
    boolean(r.war, '전쟁'); number(r.peaceUntil, '강화 만료', 0, 200); number(r.tradeUntil, '교역 만료', 0, 200); number(r.opinion, '관계', -1000, 1000, false); return r;
  });
  if (relations.length !== 6) fail('외교 쌍 개수'); unique(relations.map(r => `${r.a}:${r.b}`), '외교 관계');
  const notifications = array(s.notifications, '알림', 2000).map(v => {
    const n = object(v, '알림'); number(n.id, '알림 식별자'); number(n.round, '알림 라운드', 1, round); number(n.owner, '알림 세력', -1, 3);
    string(n.text, '알림 내용', 1000); oneOf(n.kind, ['info', 'combat', 'economy', 'research', 'diplomacy'], '알림 종류'); if (n.tile !== undefined) tileRef(n.tile); return n;
  }); unique(notifications.map(n => n.id), '알림 식별자');
  if (s.result !== null) {
    const result = object(s.result, '결과'); number(result.winner, '승자', 0, 3); oneOf(result.type, ['conquest', 'science', 'score', 'defeat'], '승리 종류'); number(result.round, '종료 라운드', 1, maxRounds + 1); string(result.reason, '종료 사유', 1000);
    const scores = array(result.scores, '점수', 4); if (scores.length !== 4) fail('결과 점수 수');
    scores.forEach(v => { const score = object(v, '점수'); number(score.faction, '점수 세력', 0, 3); number(score.score, '최종 점수', 0, 100000000, false); });
    unique(scores.map(v => object(v, '점수').faction), '점수 세력'); if (s.phase !== 'ended') fail('결과 페이즈');
  } else if (s.phase === 'ended') fail('종료 결과 누락');
  return structuredClone(input) as GameState;
}

function envelope(state: GameState): Envelope { return { appId: APP_ID, schemaVersion: 1, gameVersion: GAME_VERSION, savedAt: new Date().toISOString(), state: validateSave(state) }; }
export function exportSave(state: GameState): string { return JSON.stringify(envelope(state), null, 2); }
export function importSave(text: string): GameState {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) fail('최대 5MB를 초과했습니다');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail('JSON 형식이 손상되었습니다'); }
  const data = object(parsed, '저장 봉투');
  if (data.appId !== APP_ID || data.schemaVersion !== 1 || data.gameVersion !== GAME_VERSION) fail('지원하지 않는 앱/버전');
  string(data.savedAt, '저장 시각', 40);
  return validateSave(data.state);
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('이 환경에서 브라우저 저장소를 사용할 수 없습니다. 파일로 내보내세요.')); return; }
    const request = indexedDB.open(`${APP_ID}-saves-v1`, 1);
    let blocked = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('saves')) request.result.createObjectStore('saves'); };
    request.onerror = () => reject(request.error ?? new Error('저장소를 열 수 없습니다.'));
    request.onblocked = () => { blocked = true; reject(new Error('다른 탭이 저장소 갱신을 막고 있습니다. 파일로 내보내세요.')); };
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function completed(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('저장에 실패했습니다.')); transaction.onabort = () => reject(transaction.error ?? new Error('저장이 취소되었습니다.')); }); }
function checkSlot(slot: string): void { if (!['auto', 'auto-1', 'auto-2', '1', '2', '3'].includes(slot)) throw new Error('잘못된 저장 슬롯입니다.'); }
export function saveGame(state: GameState, slot = 'auto'): Promise<void> {
  checkSlot(slot);
  // Take the immutable snapshot now, before awaiting older writes.
  let data: Envelope;
  try { data = envelope(state); } catch (error) { return Promise.reject(error); }
  const write = pending.catch(() => undefined).then(async () => {
    const db = await openDatabase();
    try {
      const tx = db.transaction('saves', 'readwrite'); const done = completed(tx); const store = tx.objectStore('saves');
      if (slot === 'auto') {
        const old = store.get('auto'); const older = store.get('auto-1');
        old.onsuccess = () => { if (old.result) { try { importSave(JSON.stringify(old.result)); store.put(old.result, 'auto-1'); } catch { /* Keep the last healthy backup. */ } } };
        older.onsuccess = () => { if (older.result) { try { importSave(JSON.stringify(older.result)); store.put(older.result, 'auto-2'); } catch { /* A corrupt backup must not overwrite a healthy one. */ } } };
      }
      store.put(data, slot); await done;
    } finally { db.close(); }
  });
  pending = write;
  return write;
}
export async function loadGame(slot = 'auto'): Promise<GameState | null> {
  checkSlot(slot); await pending.catch(() => undefined); const db = await openDatabase();
  try {
    let corruption: unknown;
    for (const candidate of slot === 'auto' ? ['auto', 'auto-1', 'auto-2'] : [slot]) {
      const data: unknown = await requestValue(db.transaction('saves', 'readonly').objectStore('saves').get(candidate));
      if (!data) continue;
      try { return importSave(JSON.stringify(data)); } catch (error) { corruption = error; }
    }
    if (corruption) throw corruption;
    return null;
  } finally { db.close(); }
}
export async function listSaves(): Promise<SaveInfo[]> {
  await pending.catch(() => undefined); const db = await openDatabase();
  try {
    const store = db.transaction('saves', 'readonly').objectStore('saves');
    const [keys, values] = await Promise.all([requestValue(store.getAllKeys()), requestValue(store.getAll())]);
    return values.flatMap((value: unknown, i) => {
      try { const data = object(value, '슬롯'); const state = validateSave(data.state); return [{ slot: String(keys[i]), round: state.round, seed: state.seed, savedAt: String(data.savedAt) }]; } catch { return []; }
    });
  } finally { db.close(); }
}
