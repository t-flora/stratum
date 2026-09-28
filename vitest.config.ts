import { defineConfig } from 'vitest/config';

// Pin test discovery so clones/worktrees under build/ or elsewhere aren't swept in.
export default defineConfig({
  test: { include: ['core/test/**/*.test.ts', 'cli/test/**/*.test.ts'] },
});
