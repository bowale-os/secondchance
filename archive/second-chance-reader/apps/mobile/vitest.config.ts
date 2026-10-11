import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Screens and native modules run in the app; tests cover the logic underneath them.
    include: ['src/**/*.test.ts'],
  },
});
