import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.js'],
    server: {
      deps: {
        external: ['better-sqlite3'],
      },
    },
  },
});
