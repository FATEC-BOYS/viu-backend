import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/database/client.ts',
        'src/database/seed.ts',
      ],
    },
  },
})
