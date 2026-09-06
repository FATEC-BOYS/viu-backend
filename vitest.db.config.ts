import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Config separada para os testes que precisam de Postgres de verdade.
 *
 * Fora do `include` do vitest.config.ts de propósito: quem não tem banco
 * levantado roda `npm test` normalmente e não vê falha. Estes só rodam por
 * `npm run test:db`, que cuida de subir o cluster.
 */
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/concorrencia/**/*.test.ts'],
    setupFiles: ['tests/setup-db.ts'],
    testTimeout: 30000,
    // Transações concorrentes contra o mesmo banco: rodar arquivos em paralelo
    // faria um teste ver as linhas do outro.
    fileParallelism: false,
  },
})
