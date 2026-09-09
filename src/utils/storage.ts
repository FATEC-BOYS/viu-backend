import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '../storage.js'

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await r2.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
  return key
}

export async function deleteFile(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
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
