import { randomBytes } from 'crypto'

/**
 * Um id no mesmo formato que o banco gera sozinho.
 *
 * O schema usa `@default(dbgenerated("('c' || encode(gen_random_bytes(12), 'hex'))"))`
 * — 'c' seguido de 24 caracteres hexadecimais. Quase todo id do sistema nasce
 * assim, e o validador de parâmetro de rota (`validateCuidParam`) exige esse
 * formato.
 *
 * Existe porque há um caso em que o id precisa ser conhecido *antes* do
 * `create`: a chave do bucket é montada com ele. Quem gerava esse id com
 * `randomUUID()` produzia uma arte que subia normalmente e que depois nenhuma
 * rota `/:id` aceitava — 400 em abrir, editar, excluir e listar versões.
 */
export function novoId(): string {
  return 'c' + randomBytes(12).toString('hex')
}
