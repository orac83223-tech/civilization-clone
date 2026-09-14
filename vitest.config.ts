import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'], maxWorkers: 1, testTimeout: 30000, coverage: { provider: 'v8', include: ['src/game/**/*.ts', 'src/storage/**/*.ts'], exclude: ['src/game/core/types.ts', 'src/game/index.ts', 'src/game/data/**'], reporter: ['text', 'json-summary', 'html'] } } });
