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
    // tests/concorrencia precisa de Postgres de verdade e roda por
    // `npm run test:db`, com config própria. Sem esta exclusão, `npm test`
    // falharia para quem não tem banco levantado.
    exclude: ['node_modules/**', 'tests/concorrencia/**'],
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
