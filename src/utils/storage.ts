import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
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

export async function signPath(
  path: string | null,
  expires = 3600,
): Promise<string | null> {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

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

export async function signPaths(
  paths: (string | null)[],
  expires = 3600,
): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => signPath(p, expires)))
}
