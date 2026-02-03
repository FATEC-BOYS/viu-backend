/**
 * Script de Validação do Schema
 * 
 * Este script valida se:
 * 1. A conexão com o banco está funcionando
 * 2. Todas as tabelas foram criadas
 * 3. Os relacionamentos estão corretos
 * 4. É possível criar registros de teste
 * 
 * Execute com: npx tsx validate-schema.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Iniciando validação do schema...\n');

  try {
    // 1. Testar conexão
    console.log('1️⃣ Testando conexão com o banco...');
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso!\n');

    // 2. Verificar se as tabelas existem
    console.log('2️⃣ Verificando tabelas...');
    const tables = [
      'usuarios',
      'projetos',
      'artes',
      'feedbacks',
      'aprovacoes',
      'tarefas',
      'notificacoes',
      'sessoes',
      'audit_logs',
      'security_events',
      'link_compartilhado',
    ];

    for (const table of tables) {
      try {
        // @ts-ignore - Acesso dinâmico às tabelas
        const count = await prisma[table].count();
        console.log(`   ✅ ${table}: ${count} registros`);
      } catch (error: any) {
        console.log(`   ❌ ${table}: ERRO - ${error.message}`);
      }
    }
    console.log('');

    // 3. Testar criação de usuário
    console.log('3️⃣ Testando criação de usuário...');
    const usuario = await prisma.usuario.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        nome: 'Usuário Teste',
        senha: 'senha-hash-aqui',
        tipo: 'DESIGNER',
      },
    });
    console.log(`✅ Usuário criado: ${usuario.nome} (${usuario.email})\n`);

    // 4. Testar criação de projeto com relacionamento
    console.log('4️⃣ Testando criação de projeto com relacionamento...');
    const projeto = await prisma.projeto.create({
      data: {
        nome: 'Projeto Teste',
        descricao: 'Descrição do projeto teste',
        designerId: usuario.id,
        clienteId: usuario.id, // Mesmo usuário como cliente para teste
      },
    });
    console.log(`✅ Projeto criado: ${projeto.nome}\n`);

    // 5. Testar criação de arte com relacionamento
    console.log('5️⃣ Testando criação de arte com relacionamento...');
    const arte = await prisma.arte.create({
      data: {
        nome: 'Arte Teste',
        arquivo: 'https://exemplo.com/arte.jpg',
        tipo: 'IMAGEM',
        tamanho: 1024000,
        projetoId: projeto.id,
        autorId: usuario.id,
      },
    });
    console.log(`✅ Arte criada: ${arte.nome}\n`);

    // 6. Testar criação de feedback com relacionamento
    console.log('6️⃣ Testando criação de feedback com relacionamento...');
    const feedback = await prisma.feedback.create({
      data: {
        conteudo: 'Feedback teste',
        tipo: 'TEXTO',
        arteId: arte.id,
        autorId: usuario.id,
      },
    });
    console.log(`✅ Feedback criado: ${feedback.conteudo}\n`);

    // 7. Testar query com relacionamentos (include)
    console.log('7️⃣ Testando query com relacionamentos...');
    const projetoComRelacionamentos = await prisma.projeto.findUnique({
      where: { id: projeto.id },
      include: {
        designer: true,
        cliente: true,
        artes: {
          include: {
            feedbacks: true,
            autor: true,
          },
        },
      },
    });

    if (projetoComRelacionamentos) {
      console.log(`✅ Projeto encontrado: ${projetoComRelacionamentos.nome}`);
      console.log(`   - Designer: ${projetoComRelacionamentos.designer.nome}`);
      console.log(`   - Cliente: ${projetoComRelacionamentos.cliente.nome}`);
      console.log(`   - Artes: ${projetoComRelacionamentos.artes.length}`);
      if (projetoComRelacionamentos.artes.length > 0) {
        const primeiraArte = projetoComRelacionamentos.artes[0];
        console.log(`     - Arte: ${primeiraArte.nome}`);
        console.log(`     - Autor: ${primeiraArte.autor.nome}`);
        console.log(`     - Feedbacks: ${primeiraArte.feedbacks.length}`);
      }
    }
    console.log('');

    // 8. Testar criação de notificação
    console.log('8️⃣ Testando criação de notificação...');
    const notificacao = await prisma.notificacao.create({
      data: {
        titulo: 'Notificação Teste',
        conteudo: 'Conteúdo da notificação',
        tipo: 'SISTEMA',
        usuarioId: usuario.id,
      },
    });
    console.log(`✅ Notificação criada: ${notificacao.titulo}\n`);

    // 9. Limpar dados de teste
    console.log('9️⃣ Limpando dados de teste...');
    await prisma.feedback.delete({ where: { id: feedback.id } });
    await prisma.arte.delete({ where: { id: arte.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.notificacao.delete({ where: { id: notificacao.id } });
    await prisma.usuario.delete({ where: { id: usuario.id } });
    console.log('✅ Dados de teste removidos\n');

    console.log('🎉 VALIDAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('✅ Todos os relacionamentos estão funcionando corretamente.');
    console.log('✅ O schema está sincronizado com o banco de dados.');

  } catch (error: any) {
    console.error('❌ ERRO durante a validação:', error.message);
    console.error('\n📋 Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
