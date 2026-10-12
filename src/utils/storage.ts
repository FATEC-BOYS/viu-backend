import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '../storage.js'

/**
 * O arquivo não chegou ao armazenamento.
 *
 * Existe para separar esta falha das outras que podem acontecer ao criar uma
 * arte. Quem chamava colapsava tudo num 500 "Erro ao criar arte", e as saídas
 * de quem lê são opostas: armazenamento fora do ar se resolve tentando de novo
 * daqui a pouco, e nada foi criado no caminho; erro ao gravar a arte no banco,
 * não.
 *
 * Pelo `codigo` e não pelo texto — a frase que a pessoa lê é copy e vai mudar.
 */
export class ArmazenamentoIndisponivelError extends Error {
  readonly codigo = 'ARMAZENAMENTO_INDISPONIVEL'
  constructor(causa: unknown) {
    /*
     * `cause` do padrão, e não uma propriedade nossa.
     *
     * A primeira versão guardava o original em `this.causa`, e isso anulava o
     * motivo de existir deste embrulho: o serializador de erro do Pino trata
     * `cause` recursivamente, mas uma propriedade qualquer ele só espalha — e
     * `message` e `stack` de um Error não são enumeráveis, então a causa saía
     * no log como `{}`. Ficava o mesmo problema de antes, com uma classe a
     * mais: credencial errada e bucket fora do ar indistinguíveis para quem
     * abre o log às três da manhã.
     */
    super('O arquivo não chegou ao armazenamento.', { cause: causa })
    this.name = 'ArmazenamentoIndisponivelError'
  }
}

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  try {
    await r2.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
    )
  } catch (erro) {
    // A causa original vai junto: é ela que o log precisa para distinguir
    // credencial errada de bucket fora do ar.
    throw new ArmazenamentoIndisponivelError(erro)
  }
  return key
}

export async function deleteFile(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

/**
 * O conteúdo de um arquivo do bucket, pela chave.
 *
 * Existe porque dois caminhos do feedback precisavam LER de volta o que
 * subiram, e os dois faziam `fetch(feedback.arquivo)` — a coluna guarda a
 * chave do bucket, não uma URL, então o `fetch` nunca tinha endereço para
 * onde ir. Em `gerarAudioDoFeedback` isso significava que o cache de síntese
 * nunca acertava: cada clique em "ouvir" pagava uma síntese nova. Em
 * `getTranscricao`, que é o caminho de transcrever depois um áudio que entrou
 * sem texto, significava que esse caminho nunca funcionou.
 *
 * Devolve `null` quando o objeto não está lá, porque é isso que quem chama
 * precisa distinguir: "não tenho cópia guardada" se resolve gerando de novo;
 * uma exceção, não.
 */
export async function lerArquivo(key: string | null): Promise<Buffer | null> {
  if (!key) return null
  if (/^https?:\/\//i.test(key)) return null

  try {
    const saida = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    const corpo = saida.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!corpo?.transformToByteArray) return null
    return Buffer.from(await corpo.transformToByteArray())
  } catch {
    return null
  }
}

export async function signPath(
  path: string | null,
  expires = 3600,
): Promise<string | null> {
  if (!path) return null
  // Never pass through external URLs — only sign internal bucket keys
  if (/^https?:\/\//i.test(path)) return null

  try {
    return await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: path }),
      { expiresIn: expires },
    )
  } catch {
    return null
  }
}

/**
 * A foto de perfil para exibir, venha ela de onde vier.
 *
 * A coluna `avatar` guarda duas coisas diferentes: a chave do R2, quando a
 * pessoa subiu um arquivo, e uma URL absoluta, quando veio do seed. Chave
 * crua no `src` de um `<img>` não carrega nada, e `signPath` devolve `null`
 * para URL absoluta — de propósito, para não assinar link de terceiro. Sem
 * este intermediário, cada leitura teria que lembrar dos dois casos.
 */
export async function assinarAvatar(
  avatar: string | null | undefined,
  expires = 3600 * 24,
): Promise<string | null> {
  if (!avatar) return null
  if (/^https?:\/\//i.test(avatar)) return avatar
  return signPath(avatar, expires)
}

export async function signPaths(
  paths: (string | null)[],
  expires = 3600,
): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => signPath(p, expires)))
}
