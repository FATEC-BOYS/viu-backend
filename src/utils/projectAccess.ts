import prisma from '../database/client.js'

/**
 * Isolamento por projeto — ponto único de verdade.
 *
 * Antes esta regra estava copiada em cinco controllers (`artes`, `tarefas`,
 * `aprovacoes`, `feedbacks`, `busca`) e mais uma vez dentro de
 * `aceiteController`. Seis cópias da mesma cláusula `OR` é uma cópia a mais
 * para esquecer no dia em que a regra mudar, e o teste de uma delas não diz
 * nada sobre as outras.
 *
 * Fase A: acesso a um projeto é `designerId` OU `clienteId`. Pertencer à
 * equipe dona do projeto NÃO dá acesso — equipe é agrupamento visual.
 * TODO(fase-b): quando agência com múltiplos designers virar demanda real,
 * é aqui que o `OR` cresce, e só aqui.
 */

/** Colunas mínimas para decidir acesso — evita puxar o projeto inteiro. */
export const PROJETO_ACCESS_SELECT = { designerId: true, clienteId: true } as const

export interface ProjetoAcesso {
  designerId: string
  clienteId: string
}

/** Cláusula `where` reutilizável: projetos que este usuário alcança. */
export function projetoDoUsuarioWhere(usuarioId: string) {
  return { OR: [{ designerId: usuarioId }, { clienteId: usuarioId }] }
}

export function participaDoProjeto(
  projeto: ProjetoAcesso | null | undefined,
  usuarioId: string,
): boolean {
  return !!projeto && (projeto.designerId === usuarioId || projeto.clienteId === usuarioId)
}

/**
 * IDs dos projetos que o usuário alcança.
 *
 * Devolve `null` para ADMIN — ausência de escopo, que é diferente de escopo
 * vazio. Quem consome precisa tratar os dois: `[]` significa "nenhum projeto,
 * não devolva nada"; `null` significa "não filtre".
 */
export async function getAccessibleProjectIds(
  usuarioId: string,
  isAdmin = false,
): Promise<string[] | null> {
  if (isAdmin) return null

  const projetos = await prisma.projeto.findMany({
    where: projetoDoUsuarioWhere(usuarioId),
    select: { id: true },
  })
  return projetos.map((p: { id: string }) => p.id)
}

export type ResultadoAcesso = 'ok' | 'nao-encontrado' | 'negado'

/**
 * Consulta o projeto e decide. Devolve em vez de lançar porque os middlewares
 * precisam distinguir 404 de 403 na resposta.
 */
export async function checkProjectAccess(
  projetoId: string,
  usuarioId: string,
  isAdmin = false,
): Promise<ResultadoAcesso> {
  if (isAdmin) return 'ok'

  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: PROJETO_ACCESS_SELECT,
  })
  if (!projeto) return 'nao-encontrado'
  return participaDoProjeto(projeto, usuarioId) ? 'ok' : 'negado'
}

/**
 * Autoridade final dentro dos services, sobre um projeto já carregado.
 *
 * Recebe o projeto em vez do id de propósito: o service acabou de buscar o
 * recurso com o projeto junto, e uma segunda query só para reconfirmar o que
 * já está em mãos é desperdício. Passar `null` aqui é negação, nunca "deixa
 * passar" — recurso sem projeto associado não é acessível por ninguém que não
 * seja ADMIN.
 */
export function assertAcessoAoProjeto(
  projeto: ProjetoAcesso | null | undefined,
  usuarioId: string,
  isAdmin = false,
): void {
  if (isAdmin) return
  if (!participaDoProjeto(projeto, usuarioId)) {
    throw new Error('Acesso negado: você não tem acesso a este projeto')
  }
}

/** Versão que busca pelo id — para quando o service ainda não tem o projeto. */
export async function assertProjectAccessById(
  projetoId: string,
  usuarioId: string,
  isAdmin = false,
): Promise<void> {
  const resultado = await checkProjectAccess(projetoId, usuarioId, isAdmin)
  if (resultado === 'nao-encontrado') throw new Error('Projeto não encontrado')
  if (resultado === 'negado') throw new Error('Acesso negado: você não tem acesso a este projeto')
}
