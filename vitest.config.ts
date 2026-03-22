import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__mocks__/figma.ts'],
    include: ['src/__tests__/**/*.test.ts'],
  },
});
