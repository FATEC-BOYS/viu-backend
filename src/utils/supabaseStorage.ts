// src/utils/supabaseStorage.ts
/**
 * Utilitários para Supabase Storage
 *
 * Funções auxiliares para trabalhar com arquivos no Supabase Storage,
 * incluindo geração de URLs assinadas.
 */

import { supa } from '../supabaseAdmin.js'

/**
 * Gera URL assinada do Supabase Storage
 * @param path - Caminho no formato "bucket/chave" ou URL completa
 * @param expires - Tempo de expiração em segundos (padrão: 1 hora)
 * @returns URL assinada ou a URL original se já for uma URL completa
 */
export async function signPath(
  path: string | null,
  expires = 3600
): Promise<string | null> {
  if (!path) {
    return null
  }

  // Se já é uma URL completa (http:// ou https://), retorna como está
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  // Extrai bucket e chave do path
  const [bucket, ...rest] = path.split('/')
  const key = rest.join('/')

  if (!bucket || !key) {
    return null
  }

  try {
    const { data, error } = await supa.storage
      .from(bucket)
      .createSignedUrl(key, expires)

    if (error || !data) {
      console.error('Erro ao assinar URL:', error)
      return null
    }

    return data.signedUrl
  } catch (error) {
    console.error('Erro ao assinar URL:', error)
    return null
  }
}

/**
 * Assina múltiplos paths de uma vez
 * @param paths - Array de paths para assinar
 * @param expires - Tempo de expiração em segundos (padrão: 1 hora)
 * @returns Array de URLs assinadas (ou null para paths inválidos)
 */
export async function signPaths(
  paths: (string | null)[],
  expires = 3600
): Promise<(string | null)[]> {
  return Promise.all(paths.map((path) => signPath(path, expires)))
}
