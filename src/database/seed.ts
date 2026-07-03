// src/database/seed.ts
/**
 * 🌱 Seed Data – Popular Banco com Dados de Teste
 *
 * Este script cria dados realistas para facilitar o desenvolvimento e
 * testes da API. Ele remove quaisquer registros existentes para garantir
 * consistência e em seguida insere usuários, projetos, artes, feedbacks,
 * aprovações, tarefas, notificações e sessões de autenticação.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')
  // Limpar dados existentes na ordem reversa das dependências
  await prisma.notificacao.deleteMany()
  await prisma.sessao.deleteMany()
  await prisma.tarefa.deleteMany()
  await prisma.aprovacao.deleteMany()
  await prisma.feedback.deleteMany()
  await prisma.arte.deleteMany()
  await prisma.projeto.deleteMany()
  await prisma.usuario.deleteMany()

  // Hash da senha padrão
  const senhaHash = await bcrypt.hash('123456', 10)

  // Criar usuários
  const designer = await prisma.usuario.create({
    data: {
      email: 'designer@viu.com',
      senha: senhaHash,
      nome: 'Ana Silva',
      telefone: '11987654321',
      tipo: 'DESIGNER',
      avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150',
    },
  })
  const cliente1 = await prisma.usuario.create({
    data: {
      email: 'cliente1@empresa.com',
      senha: senhaHash,
      nome: 'João Santos',
      telefone: '11876543210',
      tipo: 'CLIENTE',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    },
  })
  const cliente2 = await prisma.usuario.create({
    data: {
      email: 'cliente2@startup.com',
      senha: senhaHash,
      nome: 'Maria Oliveira',
      telefone: '11765432109',
      tipo: 'CLIENTE',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    },
  })
  const admin = await prisma.usuario.create({
    data: {
      email: 'admin@viu.com',
      senha: senhaHash,
      nome: 'Carlos Admin',
      telefone: '11654321098',
      tipo: 'ADMIN',
    },
  })
  console.log('✅ Usuários criados:', { designer: designer.id, cliente1: cliente1.id, cliente2: cliente2.id, admin: admin.id })

  // Criar projetos
  const projeto1 = await prisma.projeto.create({
    data: {
      nome: 'Identidade Visual - TechStart',
      descricao: 'Criação de logo, cartão de visita e papelaria para startup de tecnologia',
      status: 'EM_ANDAMENTO',
      orcamento: 350000,
      prazo: new Date('2025-09-15'),
      designerId: designer.id,
      clienteId: cliente1.id,
    },
  })
  const projeto2 = await prisma.projeto.create({
    data: {
      nome: 'Site Institucional - EcoLife',
      descricao: 'Design de site responsivo para empresa de sustentabilidade',
      status: 'EM_ANDAMENTO',
      orcamento: 800000,
      prazo: new Date('2025-10-01'),
      designerId: designer.id,
      clienteId: cliente2.id,
    },
  })
  const projeto3 = await prisma.projeto.create({
    data: {
      nome: 'App Mobile - FitTracker',
      descricao: 'Interface UI/UX para aplicativo de fitness',
      status: 'CONCLUIDO',
      orcamento: 1200000,
      designerId: designer.id,
      clienteId: cliente1.id,
    },
  })
  console.log('✅ Projetos criados:', { projeto1: projeto1.id, projeto2: projeto2.id, projeto3: projeto3.id })

  // Criar artes
  const arte1 = await prisma.arte.create({
    data: {
      nome: 'Logo TechStart - Versão 1',
      descricao: 'Primeira proposta de logo com conceito minimalista',
      arquivo: 'uploads/logos/techstart-v1.png',
      tipo: 'IMAGEM',
      tamanho: BigInt(245760),
      versao: 1,
      status: 'EM_ANALISE',
      projetoId: projeto1.id,
      autorId: designer.id,
    },
  })
  const arte2 = await prisma.arte.create({
    data: {
      nome: 'Cartão de Visita TechStart',
      descricao: 'Layout do cartão de visita frente e verso',
      arquivo: 'uploads/cartoes/techstart-cartao.pdf',
      tipo: 'DOCUMENTO',
      tamanho: BigInt(1048576),
      versao: 1,
      status: 'APROVADO',
      projetoId: projeto1.id,
      autorId: designer.id,
    },
  })
  const arte3 = await prisma.arte.create({
    data: {
      nome: 'Homepage EcoLife',
      descricao: 'Design da página inicial do site',
      arquivo: 'uploads/sites/ecolife-home.jpg',
      tipo: 'IMAGEM',
      tamanho: BigInt(512000),
      versao: 2,
      status: 'REVISAO',
      projetoId: projeto2.id,
      autorId: designer.id,
    },
  })
  console.log('✅ Artes criadas:', { arte1: arte1.id, arte2: arte2.id, arte3: arte3.id })

  // Criar feedbacks
  await prisma.feedback.create({
    data: {
      conteudo: 'Gostei muito do conceito! Poderia testar uma versão com a cor azul mais escura?',
      tipo: 'TEXTO',
      arteId: arte1.id,
      autorId: cliente1.id,
    },
  })
  await prisma.feedback.create({
    data: {
      conteudo: 'A fonte está perfeita, mas o ícone poderia ser um pouco maior.',
      tipo: 'POSICIONAL',
      posicaoX: 150.5,
      posicaoY: 75.2,
      arteId: arte1.id,
      autorId: cliente1.id,
    },
  })
  await prisma.feedback.create({
    data: {
      conteudo: 'Layout muito clean! Aprovado para produção.',
      tipo: 'TEXTO',
      arteId: arte2.id,
      autorId: cliente1.id,
    },
  })

  // Criar aprovações
  await prisma.aprovacao.create({
    data: {
      status: 'APROVADO',
      comentario: 'Perfeito! Pode seguir para produção.',
      arteId: arte2.id,
      aprovadorId: cliente1.id,
    },
  })
  await prisma.aprovacao.create({
    data: {
      status: 'PENDENTE',
      arteId: arte1.id,
      aprovadorId: cliente1.id,
    },
  })

  // Criar tarefas
  await prisma.tarefa.create({
    data: {
      titulo: 'Ajustar cor do logo',
      descricao: 'Aplicar feedback do cliente sobre a cor azul',
      status: 'EM_ANDAMENTO',
      prioridade: 'ALTA',
      prazo: new Date('2025-08-20'),
      projetoId: projeto1.id,
      responsavelId: designer.id,
    },
  })
  await prisma.tarefa.create({
    data: {
      titulo: 'Criar versão mobile do site',
      descricao: 'Adaptar layout para dispositivos móveis',
      status: 'PENDENTE',
      prioridade: 'MEDIA',
      prazo: new Date('2025-09-01'),
      projetoId: projeto2.id,
      responsavelId: designer.id,
    },
  })

  // Criar notificações
  await prisma.notificacao.create({
    data: {
      titulo: 'Novo feedback recebido',
      conteudo: 'João Santos comentou no logo TechStart',
      tipo: 'NOVO_FEEDBACK',
      canal: 'SISTEMA',
      usuarioId: designer.id,
    },
  })
  await prisma.notificacao.create({
    data: {
      titulo: 'Arte aprovada!',
      conteudo: 'Seu cartão de visita foi aprovado pelo cliente',
      tipo: 'APROVACAO',
      canal: 'SISTEMA',
      lida: false,
      usuarioId: designer.id,
    },
  })

  // Criar sessões de autenticação (tokens de exemplo)
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24 horas
  await prisma.sessao.create({
    data: {
      token: `session_token_${designer.id}`,
      expiresAt: expires,
      ativo: true,
      usuarioId: designer.id,
    },
  })
  await prisma.sessao.create({
    data: {
      token: `session_token_${cliente1.id}`,
      expiresAt: expires,
      ativo: true,
      usuarioId: cliente1.id,
    },
  })
  await prisma.sessao.create({
    data: {
      token: `session_token_${admin.id}`,
      expiresAt: expires,
      ativo: true,
      usuarioId: admin.id,
    },
  })

  console.log('✅ Seed concluído com sucesso!')
  console.log(`
🎉 Dados criados:
👤 Usuários: 4 (1 designer, 2 clientes, 1 admin)
📁 Projetos: 3 (2 em andamento, 1 concluído)
🎨 Artes: 3
💬 Feedbacks: 3
✅ Aprovações: 2
📋 Tarefas: 2
🔔 Notificações: 2
🔐 Sessões: 3

🔐 Logins de teste:
Email: designer@viu.com | Senha: 123456 | Token: session_token_${designer.id}
Email: cliente1@empresa.com | Senha: 123456 | Token: session_token_${cliente1.id}
Email: admin@viu.com | Senha: 123456 | Token: session_token_${admin.id}
  `)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })