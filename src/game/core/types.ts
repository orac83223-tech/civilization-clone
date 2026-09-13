export type Terrain = 'grassland' | 'plains' | 'forest' | 'hills' | 'mountain' | 'desert' | 'ocean';
export type Resource = 'grain' | 'iron' | 'horses';
export type Improvement = 'farm' | 'mine' | 'tradingPost';
export type UnitType = 'settler' | 'scout' | 'worker' | 'warrior' | 'archer' | 'cavalry' | 'siege';
export type BuildingType = 'granary' | 'workshop' | 'market' | 'library' | 'monument' | 'barracks' | 'walls' | 'academy';
export type TechId = 'agriculture' | 'mining' | 'writing' | 'archery' | 'masonry' | 'horseback' | 'currency' | 'engineering' | 'education' | 'metallurgy' | 'astronomy' | 'synthesis';
export type PolicyId = 'cultivation' | 'scholarship' | 'mobilization';
export type Focus = 'balanced' | 'growth' | 'production' | 'gold' | 'science';
export type Yield = { food: number; production: number; gold: number; science: number; culture: number };
export interface Settings { width: number; height: number; maxRounds: number; difficulty: 'normal'; }
export interface Tile { id: number; q: number; r: number; terrain: Terrain; resource: Resource | null; improvement: Improvement | null; owner: number | null; cityId: string | null; ruin: boolean; }
export interface Unit { id: string; owner: number; type: UnitType; tile: number; hp: number; moves: number; attacked: boolean; fortified: boolean; waiting: boolean; charges: number; bornRound: number; }
export type ProductionItem = { kind: 'unit'; id: UnitType } | { kind: 'building'; id: BuildingType } | { kind: 'project'; id: 'grandAcademy' };
export interface City { id: string; owner: number; name: string; tile: number; originalCapitalOf: number | null; hp: number; population: number; food: number; culture: number; buildings: BuildingType[]; queue: ProductionItem[]; progress: Record<string, number>; focus: Focus; lockedTiles: number[]; workedTiles: number[]; resistance: number; }
export interface Faction { id: number; name: string; color: string; emblem: string; personality: 'growth' | 'military' | 'science' | 'trade'; gold: number; culture: number; researched: TechId[]; research: TechId | null; researchProgress: Partial<Record<TechId, number>>; researchOverflow?: number; policy: PolicyId | null; alive: boolean; capitalId: string | null; scienceProject: boolean; contacts: number[]; explored: number[]; visible: number[]; memory: Record<number, Tile>; cityMemory: Record<string, ObservedCity>; stats: { founded: number; captures: number; kills: number; explored: number; combats?: number; }; }
export interface Relation { a: number; b: number; war: boolean; peaceUntil: number; tradeUntil: number; opinion: number; }
export interface Notification { id: number; round: number; owner: number; text: string; kind: 'info' | 'combat' | 'economy' | 'research' | 'diplomacy'; tile?: number; }
export interface GameResult { winner: number; type: 'conquest' | 'science' | 'score' | 'defeat'; round: number; scores: { faction: number; score: number }[]; reason: string; }
export interface GameState { schemaVersion: 1; gameVersion: string; seed: string; settings: Settings; round: number; phase: 'player' | 'ai' | 'settlement' | 'ended'; actorId: number; commandSeq: number; rngState: number; nextEntityId: number; tiles: Tile[]; starts: number[]; units: Unit[]; cities: City[]; factions: Faction[]; relations: Relation[]; notifications: Notification[]; result: GameResult | null; lastSettledRound: number; }
export interface ObservedCity { id: string; owner: number; name: string; tile: number; hp: number; originalCapitalOf: number | null; lastSeen: number; visible: boolean; population?: number; buildings?: BuildingType[]; }
export interface Observation { seed: string; round: number; settings: Settings; actorId: number; self: Faction; tiles: (Tile | null)[]; units: Unit[]; cities: ObservedCity[]; ownCities: City[]; factions: { id: number; name: string; color: string; emblem: string; alive: boolean }[]; relations: Relation[]; }
export type Command =
 | { type: 'MOVE'; unitId: string; to: number }
 | { type: 'FOUND_CITY'; unitId: string; name?: string }
 | { type: 'QUEUE_PRODUCTION'; cityId: string; item: ProductionItem; replace?: boolean }
 | { type: 'CANCEL_PRODUCTION'; cityId: string; index: number }
 | { type: 'SET_RESEARCH'; tech: TechId }
 | { type: 'SET_FOCUS'; cityId: string; focus: Focus }
 | { type: 'TOGGLE_WORK_TILE'; cityId: string; tile: number }
 | { type: 'IMPROVE'; unitId: string; improvement: Improvement }
 | { type: 'ATTACK'; unitId: string; targetTile: number }
 | { type: 'WAIT' | 'FORTIFY' | 'HEAL'; unitId: string }
 | { type: 'UPGRADE'; unitId: string }
 | { type: 'SET_POLICY'; policy: PolicyId | null }
 | { type: 'DECLARE_WAR'; target: number; confirmed: boolean }
 | { type: 'OFFER_PEACE'; target: number }
 | { type: 'TRADE_AGREEMENT'; target: number }
 | { type: 'GOLD_TRADE'; target: number; give: number; receive: number }
 | { type: 'END_TURN' };
export type CommandResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: { code: string; message: string } };
export interface PathResult { path: number[]; cost: number; }
export interface CombatPreview { attackerDamage: number; defenderDamage: number; defenderId: string; defenderKind: 'unit' | 'city'; canCapture: boolean; }
export interface CityYieldDetails { gross: Yield; netFood: number; maintenance: number; workedTiles: number[]; breakdown: { label: string; yields: Yield }[]; }
