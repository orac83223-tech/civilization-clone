import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { advanceTurn, applyCommand, checkInvariants, createGame, runAITurn, validateMap } from '../src/game';
import type { GameState } from '../src/game/core/types';
import { auditState, auditTransition } from '../tests/support/invariants';
import { exportSave, importSave } from '../src/storage/saves';

const mapSeeds = Array.from({ length: 50 }, (_, index) => `map-audit-${String(index + 1).padStart(2, '0')}`);
const matchSeeds = Array.from({ length: 20 }, (_, index) => `ai-match-${String(index + 1).padStart(2, '0')}`);
const output = 'artifacts/simulation-results.json';
const started = performance.now();
const errors: { seed: string; round?: number; issues: string[] }[] = [];
const maps = mapSeeds.map(seed => {
  const timer = performance.now();
  const state = createGame(seed);
  const repeat = createGame(seed);
  const issues = [...validateMap(state), ...checkInvariants(state), ...auditState(state)];
  if (JSON.stringify(state) !== JSON.stringify(repeat)) issues.push('same seed produces different initial state');
  if (issues.length) errors.push({ seed, issues });
  return { seed, valid: issues.length === 0, milliseconds: performance.now() - timer, starts: state.starts };
});

const matches: Record<string, unknown>[] = [];
for (const seed of matchSeeds) {
  let state: GameState = createGame(seed);
  const timer = performance.now();
  const combatNotifications = new Set<number>();
  let steps = 0;
  let longestBoundaryMs = 0;
  let longestAIRoundMs = 0;
  let aiRoundMs = 0;
  let restoreChecks = 0;
  const matchIssues: string[] = [];
  while (state.phase !== 'ended' && steps < 600) {
    const before = state;
    const boundaryTimer = performance.now();
    if (state.phase === 'player') {
      state = runAITurn(state, 0);
      if (state.phase === 'player') {
        const end = applyCommand(state, 0, { type: 'END_TURN' });
        if (!end.ok) throw new Error(`${seed}: human AI could not end turn: ${end.error.message}`);
        state = end.state;
      }
      aiRoundMs = 0;
    } else {
      state = advanceTurn(state);
      aiRoundMs += performance.now() - boundaryTimer;
      if (state.phase === 'player' || state.phase === 'ended') longestAIRoundMs = Math.max(longestAIRoundMs, aiRoundMs);
    }
    longestBoundaryMs = Math.max(longestBoundaryMs, performance.now() - boundaryTimer);
    steps += 1;
    state.notifications.filter(notification => notification.kind === 'combat').forEach(notification => combatNotifications.add(notification.id));
    const issues = [...checkInvariants(state), ...auditState(state), ...auditTransition(before, state)];
    if (state === before || JSON.stringify(state) === JSON.stringify(before)) issues.push('turn boundary made no progress');
    if (issues.length) { matchIssues.push(...issues); break; }
    // Resume through a JSON round-trip at every phase in the first complete round.
    // Both executions receive the same command/AI logic, including saved RNG state.
    if (state.round === 1 && state.phase !== 'player' && state.phase !== 'ended') {
      const restored = importSave(exportSave(state));
      if (JSON.stringify(advanceTurn(state)) !== JSON.stringify(advanceTurn(restored))) matchIssues.push('save/restore changed next phase');
      restoreChecks += 1;
    }
  }
  if (state.phase !== 'ended' || !state.result) matchIssues.push('match did not produce an end result within boundary budget');
  try { importSave(exportSave(state)); } catch (error) { matchIssues.push(`final save validation: ${error instanceof Error ? error.message : String(error)}`); }
  if (matchIssues.length) errors.push({ seed, round: state.round, issues: [...new Set(matchIssues)] });
  const entry = {
    seed, valid: matchIssues.length === 0, victory: state.result?.type ?? null, winner: state.result?.winner ?? null,
    round: state.round, totalCities: state.cities.length, founded: state.factions.reduce((sum, faction) => sum + faction.stats.founded, 0),
    technologies: state.factions.map(faction => ({ faction: faction.id, count: faction.researched.length })),
    attacks: state.factions.reduce((sum, faction) => sum + (faction.stats.combats ?? 0), 0),
    combatNotifications: combatNotifications.size, kills: state.factions.reduce((sum, faction) => sum + faction.stats.kills, 0),
    captures: state.factions.reduce((sum, faction) => sum + faction.stats.captures, 0),
    commands: state.commandSeq, settledRounds: state.lastSettledRound, boundarySteps: steps, restoreChecks,
    milliseconds: performance.now() - timer, longestBoundaryMs, longestAIRoundMs,
    scores: state.result?.scores ?? [], issues: [...new Set(matchIssues)],
  };
  matches.push(entry);
  process.stdout.write(`${seed}: ${entry.victory ?? 'FAILED'} round ${entry.round}, cities ${entry.totalCities}, ${entry.milliseconds.toFixed(0)} ms${matchIssues.length ? `; ${matchIssues.join('; ')}` : ''}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: { platform: platform(), release: release(), arch: arch(), node: process.version, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, memoryGiB: totalmem() / 1024 ** 3 },
  methodology: '50 fixed map seeds, 20 fixed AI matches; human faction uses identical observed-information AI; audit each faction/settlement boundary; first-round validated save restore at each AI phase, validated final save. attacks is the actual ATTACK command counter; combatNotifications also includes combat/capture reports.',
  elapsedMs: performance.now() - started, maps, matches, errors,
};
await mkdir('artifacts', { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
process.stdout.write(`Wrote ${output}; maps ${maps.filter(map => map.valid).length}/50; matches ${matches.filter(match => match.valid).length}/20; errors ${errors.length}\n`);
if (errors.length) process.exitCode = 1;
