import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./src/Tests/**/*.{test,spec}.{js,ts}'],
    environment: 'node'
  }
});