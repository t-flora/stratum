import { defineConfig } from 'vitest/config';

// Pin test discovery so clones/worktrees under build/ or elsewhere aren't swept in.
export default defineConfig({
  // Some tests run the real build pipeline on a fixture (~2 s alone); under the full parallel suite that can pass
  // vitest's 5 s default, so give them room.
  test: { include: ['core/test/**/*.test.ts', 'cli/test/**/*.test.ts'], testTimeout: 20_000 },
});
