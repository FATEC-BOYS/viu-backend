// src/index.ts
/**
 * Ponto de entrada da aplicação Fastify
 *
 * Este arquivo instância o servidor Fastify, registra as rotas de projetos
 * e inicia a escuta em uma porta configurada. Manter a criação do servidor
 * separada permite maior flexibilidade para testes automatizados.
 */

import fastify from 'fastify'
import { projetosRoutes } from './routes/projetos.js'
import { usuariosRoutes } from './routes/usuarios.js'
import { artesRoutes } from './routes/artes.js'
import { feedbacksRoutes } from './routes/feedbacks.js'
import { aprovacoesRoutes } from './routes/aprovacoes.js'
import { tarefasRoutes } from './routes/tarefas.js'
import { notificacoesRoutes } from './routes/notificacoes.js'
import { sessoesRoutes } from './routes/sessoes.js'

export async function buildServer() {
  const app = fastify({ logger: true })
  // Registrar rotas de projetos
  await app.register(projetosRoutes)
  // Registrar rotas de usuários
  await app.register(usuariosRoutes)
  // Registrar rotas de artes
  await app.register(artesRoutes)
  // Registrar rotas de feedbacks
  await app.register(feedbacksRoutes)
  // Registrar rotas de aprovações
  await app.register(aprovacoesRoutes)
  // Registrar rotas de tarefas
  await app.register(tarefasRoutes)
  // Registrar rotas de notificações
  await app.register(notificacoesRoutes)
  // Registrar rotas de sessões
  await app.register(sessoesRoutes)
  return app
}

// Apenas inicia o servidor se este módulo for executado diretamente
if (require.main === module) {
  buildServer()
    .then((app) => {
      const port = process.env.PORT ? Number(process.env.PORT) : 3000
      app.listen({ port }, (err, address) => {
        if (err) {
          app.log.error(err)
          process.exit(1)
        }
        app.log.info(`Servidor iniciado em ${address}`)
      })
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err)
    })
}