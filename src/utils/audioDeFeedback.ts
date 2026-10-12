import { signPath } from './storage.js'

/**
 * O feedback com o endereço tocável do áudio, quando há áudio.
 *
 * Um feedback tem áudio quando tem ARQUIVO — e não quando o rótulo `tipo` diz
 * `AUDIO`. A diferença não é teórica: `createFeedbackComAudio` gravava
 * `tipo: 'POSICIONAL'` sempre que a gravação vinha com um pino, então a
 * condição `fb.tipo === 'AUDIO' && fb.arquivo` respondia "não é áudio"
 * justamente para o comentário em áudio mais específico que o produto sabe
 * fazer. Medido no link público: o áudio com pino saía com
 * `arquivo_url: null`, a tela não desenhava player nenhum, e a gravação
 * existia no bucket sem nenhum caminho até ela.
 *
 * Como a condição errada estava COPIADA em quatro leituras
 * (`listFeedbacks`, `getFeedbackById`, `GET /artes/:id` e o preview do link
 * público), consertar uma delas deixaria as outras três mentindo. Aqui a
 * regra existe uma vez.
 *
 * A formulação certa já estava escrita do outro lado, no painel de feedbacks
 * do frontend: "um feedback é de áudio quando tem áudio, e não quando o
 * rótulo diz AUDIO". Isto é o mesmo raciocínio no lado que gera o endereço.
 *
 * Mora em módulo próprio, e não junto do `signPath`, para que os testes que
 * mockam o armazenamento continuem valendo sem reimplementar esta regra: eles
 * trocam só a assinatura de URL, e a decisão de QUANDO assinar roda de
 * verdade.
 */
export async function assinarAudioDeFeedback<T extends { arquivo?: string | null }>(
  fb: T,
  expires = 3600,
): Promise<T & { arquivo_url: string | null }> {
  return { ...fb, arquivo_url: await signPath(fb.arquivo ?? null, expires) }
}
