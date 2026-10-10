import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/storage/**'] },
  },
});
