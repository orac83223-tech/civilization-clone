import type { BuildingType, Improvement, PolicyId, Settings, TechId, Terrain, UnitType, Yield } from '../core/types';
export const GAME_VERSION = '0.1.0';
export const DEFAULT_SETTINGS: Settings = { width: 24, height: 18, maxRounds: 100, difficulty: 'normal' };
export const RULES = { cityDistance: 3, cityRadius: 2, workerCharges: 3, projectCost: 160, cityHp: 100, maxActions: 72, peaceDuration: 8, tradeDuration: 12, tradeIncome: 3, policyCulture: 25, policySwapCost: 20, maxQueue: 5, cityMaintenance: 2, settlerPopulation: 2 };
export const ZERO_YIELD: Yield = { food: 0, production: 0, gold: 0, science: 0, culture: 0 };
export const ECONOMY_BALANCE = { cityCenter: { food: 3, production: 2, gold: 3, science: 2, culture: 1 }, foodPerPopulation: 2, growthBase: 12, growthPerPopulation: 7, populationCap: 30, minimumPopulation: 1, starvationLoss: 1, maximumBankruptcyDisband: 1, territoryBase: 12, territoryPerPopulation: 3, territoryRadius: 3, scienceConversion: .25, resistanceMultiplier: .5, cityRegeneration: 8, startingGold: 30, ruinGold: 12, upgradeGold: 30 };
export const COMBAT_BALANCE = { cityStrength: 19, wallStrengthMultiplier: 1.3, wallHp: 50, fortifiedDefense: .25, metallurgyMultiplier: 1.15, militaryPolicyMultiplier: 1.1, siegeCityMultiplier: 1.5, damageScale: 30, retaliationScale: 24, minimumDamage: 8, minimumRetaliation: 6, civilianDefense: 6, healthBaseline: .5, captureHpRatio: .4, resistanceRounds: 3, healFriendly: 18, healAway: 10 };
export const SCORE_WEIGHTS = { city: 30, population: 5, building: 3, technology: 12, cultureDivisor: 5, goldDivisor: 10, capture: 10 };
export const DIPLOMACY_LIMITS = { opinionMin: -1000, opinionMax: 1000 };
export interface TerrainData { name: string; color: string; food: number; production: number; gold: number; moveCost: number; defense: number; passable: boolean; }
export const TERRAINS: Record<Terrain, TerrainData> = {
 grassland: { name: '초원', color: '#80a77a', food: 3, production: 0, gold: 0, moveCost: 1, defense: 0, passable: true },
 plains: { name: '평원', color: '#b5b17c', food: 2, production: 1, gold: 0, moveCost: 1, defense: 0, passable: true },
 forest: { name: '숲', color: '#426f5a', food: 1, production: 2, gold: 0, moveCost: 2, defense: 0.25, passable: true },
 hills: { name: '언덕', color: '#b1a18a', food: 1, production: 2, gold: 0, moveCost: 2, defense: 0.2, passable: true },
 mountain: { name: '산', color: '#7c8587', food: 0, production: 0, gold: 0, moveCost: 99, defense: 0, passable: false },
 desert: { name: '사막', color: '#d1b887', food: 0, production: 1, gold: 1, moveCost: 1, defense: 0, passable: true },
 ocean: { name: '바다', color: '#4a7b92', food: 0, production: 0, gold: 0, moveCost: 99, defense: 0, passable: false },
};
export interface UnitData { name: string; description: string; cost: number; moves: number; hp: number; sight: number; maintenance: number; combat: boolean; attack: 'none' | 'melee' | 'ranged'; strength: number; range: number; tech?: TechId; resource?: 'iron' | 'horses'; }
export const UNITS: Record<UnitType, UnitData> = {
 settler: { name: '개척자', description: '도시를 세우며 소모됩니다. 생산 완료 시 인구 1 소모(인구 2 이상).', cost: 36, moves: 2, hp: 65, sight: 2, maintenance: 1, combat: false, attack: 'none', strength: 0, range: 0 },
 scout: { name: '정찰병', description: '넓은 시야와 빠른 이동. 근접 공격으로 점령 가능.', cost: 18, moves: 3, hp: 80, sight: 3, maintenance: 1, combat: true, attack: 'melee', strength: 9, range: 1 },
 worker: { name: '일꾼', description: '소유 타일을 3회 개량한 뒤 소모됩니다.', cost: 22, moves: 2, hp: 60, sight: 2, maintenance: 1, combat: false, attack: 'none', strength: 0, range: 0 },
 warrior: { name: '전사', description: '자원 조건 없는 기본 근접 병력.', cost: 24, moves: 2, hp: 100, sight: 2, maintenance: 1, combat: true, attack: 'melee', strength: 17, range: 1 },
 archer: { name: '궁병', description: '2칸 원거리 공격. 직접 반격을 받지 않으며 도시 점령 불가.', cost: 28, moves: 2, hp: 80, sight: 2, maintenance: 1, combat: true, attack: 'ranged', strength: 18, range: 2, tech: 'archery' },
 cavalry: { name: '기병', description: '말을 확보해야 생산. 빠르고 강력한 근접 병력.', cost: 42, moves: 4, hp: 100, sight: 2, maintenance: 2, combat: true, attack: 'melee', strength: 25, range: 1, tech: 'horseback', resource: 'horses' },
 siege: { name: '공성병', description: '도시 공격력 50% 증가. 직접 점령 불가.', cost: 46, moves: 2, hp: 75, sight: 2, maintenance: 2, combat: true, attack: 'ranged', strength: 23, range: 2, tech: 'engineering' },
};
export interface BuildingData { name: string; description: string; cost: number; maintenance: number; yields: Partial<Yield>; tech?: TechId; }
export const BUILDINGS: Record<BuildingType, BuildingData> = {
 granary: { name: '곡물창고', description: '식량 +2', cost: 22, maintenance: 0, yields: { food: 2 }, tech: 'agriculture' },
 workshop: { name: '작업장', description: '생산력 +3', cost: 28, maintenance: 1, yields: { production: 3 }, tech: 'mining' },
 market: { name: '시장', description: '금 +5', cost: 32, maintenance: 1, yields: { gold: 5 }, tech: 'currency' },
 library: { name: '도서관', description: '과학 +4', cost: 26, maintenance: 1, yields: { science: 4 }, tech: 'writing' },
 monument: { name: '기념비', description: '문화 +2', cost: 18, maintenance: 0, yields: { culture: 2 } },
 barracks: { name: '병영', description: '생산력 +1', cost: 26, maintenance: 1, yields: { production: 1 }, tech: 'archery' },
 walls: { name: '성벽', description: '도시 최대 체력 +50, 도시 방어력 +30%', cost: 30, maintenance: 1, yields: {}, tech: 'masonry' },
 academy: { name: '학술원', description: '과학 +7, 문화 +1', cost: 48, maintenance: 2, yields: { science: 7, culture: 1 }, tech: 'education' },
};
export interface TechData { name: string; description: string; era: 1 | 2 | 3; cost: number; prerequisites: TechId[]; }
export const TECHS: Record<TechId, TechData> = {
 agriculture: { name: '경작법', description: '농장·곡물창고 해금', era: 1, cost: 12, prerequisites: [] },
 mining: { name: '채광술', description: '광산·작업장 해금', era: 1, cost: 12, prerequisites: [] },
 writing: { name: '기록술', description: '도서관 해금', era: 1, cost: 16, prerequisites: [] },
 archery: { name: '탄성공학', description: '궁병·병영 해금', era: 1, cost: 16, prerequisites: [] },
 masonry: { name: '축조술', description: '성벽 해금', era: 2, cost: 24, prerequisites: ['mining'] },
 horseback: { name: '기마술', description: '말 확보 시 기병 해금', era: 2, cost: 28, prerequisites: ['agriculture'] },
 currency: { name: '교환체계', description: '시장·교역소 해금', era: 2, cost: 28, prerequisites: ['writing'] },
 engineering: { name: '기계설계', description: '공성병 해금, 도시 생산력 +1', era: 2, cost: 36, prerequisites: ['masonry', 'archery'] },
 education: { name: '공공학문', description: '학술원 해금', era: 3, cost: 48, prerequisites: ['writing', 'currency'] },
 metallurgy: { name: '합금제련', description: '모든 전투 유닛 공격력 +15%, 개량 철 도시 생산력 +1', era: 3, cost: 44, prerequisites: ['mining', 'engineering'] },
 astronomy: { name: '천체관측', description: '도시 과학 +3, 금 +1', era: 3, cost: 52, prerequisites: ['education'] },
 synthesis: { name: '지식통합', description: '대학술원 프로젝트(생산력 160) 해금, 도시 과학 +2', era: 3, cost: 70, prerequisites: ['astronomy', 'metallurgy'] },
};
export const IMPROVEMENTS: Record<Improvement, { name: string; description: string; tech: TechId; terrains: Terrain[]; yields: Partial<Yield> }> = {
 farm: { name: '농장', description: '식량 +2. 곡물 보너스 +1 식량 추가.', tech: 'agriculture', terrains: ['grassland', 'plains', 'desert'], yields: { food: 2 } },
 mine: { name: '광산', description: '생산력 +2. 철 자원을 확보합니다.', tech: 'mining', terrains: ['hills', 'plains', 'desert'], yields: { production: 2 } },
 tradingPost: { name: '교역소', description: '금 +3. 말 자원을 확보합니다.', tech: 'currency', terrains: ['grassland', 'plains', 'forest', 'hills', 'desert'], yields: { gold: 3 } },
};
export const POLICIES: Record<PolicyId, { name: string; description: string; culture: number }> = {
 cultivation: { name: '공동 경작', description: '모든 도시 식량 +2, 금 +1', culture: 25 },
 scholarship: { name: '열린 학당', description: '모든 도시 과학 +3', culture: 25 },
 mobilization: { name: '시민 수비대', description: '모든 도시 생산력 +2, 전투력 +10%', culture: 25 },
};
export const FACTIONS = [
 { id: 0, name: '새잎 연맹', color: '#76c896', emblem: '잎', personality: 'growth' as const, description: '도시 식량 +1' },
 { id: 1, name: '붉은모루 공국', color: '#e18b74', emblem: '모루', personality: 'military' as const, description: '도시 생산력 +1' },
 { id: 2, name: '별샘 학회', color: '#94a7ed', emblem: '별', personality: 'science' as const, description: '도시 과학 +1' },
 { id: 3, name: '황금돛 조합', color: '#dec775', emblem: '돛', personality: 'trade' as const, description: '도시 금 +2' },
];
