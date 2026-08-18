import { vi } from 'vitest'

/**
 * Mock do Prisma que cobre qualquer model e método.
 *
 * Antes cada teste listava à mão os models e métodos que achava que o serviço
 * usava. Bastava o serviço passar a chamar mais uma coisa — sessao.updateMany,
 * por exemplo — para o teste quebrar com "is not a function", sem que houvesse
 * bug nenhum no código testado.
 *
 * Aqui um Proxy cria o model na primeira vez que é acessado, já com todos os
 * métodos como vi.fn(). O mesmo model devolve sempre as mesmas funções, então
 * vi.mocked(prisma.x.findUnique) continua funcionando normalmente.
 */
const METODOS = [
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
] as const

export function criarPrismaMock(): any {
  const models: Record<string, any> = {}

  const base: Record<string, any> = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    // Transação: repassa o próprio mock para o callback, ou resolve o array
    $transaction: vi.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(proxy) : Promise.all(arg),
    ),
  }

  const proxy: any = new Proxy(base, {
    get(alvo, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop in alvo) return alvo[prop]
      // evita que await/thenable trate o proxy como promise
      if (prop === 'then' || prop.startsWith('$')) return undefined
      if (!models[prop]) {
        // Métodos do Prisma devolvem Promise. Um vi.fn() cru devolve undefined,
        // e código fire-and-forget como .create(...).catch() estoura com
        // "Cannot read properties of undefined". O teste sobrescreve quando
        // precisa de um valor específico.
        models[prop] = Object.fromEntries(
          METODOS.map((m) => [m, vi.fn(async () => undefined)]),
        )
      }
      return models[prop]
    },
  })

  return proxy
}
