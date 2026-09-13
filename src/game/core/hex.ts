import type { Tile } from './types';
export const HEX_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
export function hexDistance(a: Pick<Tile, 'q' | 'r'>, b: Pick<Tile, 'q' | 'r'>): number { const q = a.q - b.q; const r = a.r - b.r; return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; }
export function neighborIds(tile: Pick<Tile, 'q' | 'r'>, width: number, height: number): number[] { return HEX_DIRECTIONS.map(([dq, dr]) => [tile.q + dq, tile.r + dr]).filter(([q, r]) => q! >= 0 && q! < width && r! >= 0 && r! < height).map(([q, r]) => r! * width + q!); }
export const neighbors = neighborIds;
export function hashSeed(seed: string): number { let value = 2166136261; for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619); return value >>> 0 || 1; }
export function randomStep(state: number): [number, number] { let x = state | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return [(x >>> 0) / 4294967296, x >>> 0]; }
