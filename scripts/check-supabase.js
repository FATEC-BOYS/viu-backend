#!/usr/bin/env node
/**
 * Script de verificação do Supabase
 * Testa se a configuração está correta
 *
 * Usage: node scripts/check-supabase.js
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

console.log('🔍 Verificando configuração do Supabase...\n')

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

function success(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`)
}

function error(msg) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`)
}

function info(msg) {
  console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
}

function warning(msg) {
  console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`)
}

async function checkEnvVars() {
  console.log('📋 Verificando variáveis de ambiente...\n')

  const requiredVars = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
  ]

  let allPresent = true

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`${varName} configurado`)
    } else {
      error(`${varName} não encontrado no .env`)
      allPresent = false
    }
  }

  if (!allPresent) {
    console.log('\n')
    error('Algumas variáveis de ambiente estão faltando!')
    info('Copie .env.example para .env e preencha os valores')
    return false
  }

  // Verifica se não são valores de exemplo
  if (process.env.DATABASE_URL.includes('xxxxx')) {
    warning('DATABASE_URL ainda tem valores de exemplo')
    return false
  }

  if (process.env.SUPABASE_URL.includes('xxxxx')) {
    warning('SUPABASE_URL ainda tem valores de exemplo')
    return false
  }

  success('Todas as variáveis de ambiente configuradas!\n')
  return true
}

async function checkDatabaseConnection() {
  console.log('🗄️  Testando conexão com banco de dados...\n')

  try {
    await prisma.$connect()
    success('Conectado ao banco de dados!')

    // Testa query simples
    const result = await prisma.$queryRaw`SELECT current_database(), current_user`
    info(`Database: ${result[0].current_database}`)
    info(`User: ${result[0].current_user}`)

    return true
  } catch (err) {
    error(`Erro ao conectar: ${err.message}`)
    console.log('\n')
    info('Verifique se:')
    info('1. DATABASE_URL está correto')
    info('2. Projeto Supabase não está pausado')
    info('3. Senha está correta (sem colchetes!)')
    return false
  }
}

async function checkTables() {
  console.log('\n📊 Verificando tabelas...\n')

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
  ]

  let allTablesExist = true

  for (const table of tables) {
    try {
      const count = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) FROM ${table}`
      )
      success(`Tabela '${table}' existe (${count[0].count} registros)`)
    } catch (err) {
      error(`Tabela '${table}' não encontrada`)
      allTablesExist = false
    }
  }

  if (!allTablesExist) {
    console.log('\n')
    warning('Algumas tabelas estão faltando!')
    info('Execute o arquivo supabase-schema.sql no SQL Editor do Supabase')
    return false
  }

  success('\nTodas as tabelas existem!\n')
  return true
}

async function checkAdminUser() {
  console.log('👤 Verificando usuário admin...\n')

  try {
    const admin = await prisma.usuario.findUnique({
      where: { email: 'admin@viu.com' },
    })

    if (admin) {
      success(`Usuário admin existe: ${admin.nome}`)
      info(`ID: ${admin.id}`)
      info(`Tipo: ${admin.tipo}`)
      info(`Email: admin@viu.com`)
      info(`Senha padrão: Admin@123456`)
      warning('⚠️  Mude a senha do admin em produção!')
      return true
    } else {
      warning('Usuário admin não encontrado')
      info('Ele será criado automaticamente no primeiro uso')
      return true
    }
  } catch (err) {
    error(`Erro ao buscar admin: ${err.message}`)
    return false
  }
}

async function checkSupabaseAPI() {
  console.log('\n🔑 Testando Supabase API...\n')

  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_ANON_KEY

    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    })

    if (response.ok || response.status === 404) {
      success('Supabase API respondendo')
      info(`URL: ${url}`)
      return true
    } else {
      error(`Supabase API retornou erro: ${response.status}`)
      return false
    }
  } catch (err) {
    error(`Erro ao testar Supabase API: ${err.message}`)
    return false
  }
}

async function main() {
  console.log('================================================')
  console.log('🚀 VIU BACKEND - Verificação do Supabase')
  console.log('================================================\n')

  const checks = [
    checkEnvVars,
    checkDatabaseConnection,
    checkTables,
    checkAdminUser,
    checkSupabaseAPI,
  ]

  let allPassed = true

  for (const check of checks) {
    const passed = await check()
    if (!passed) {
      allPassed = false
    }
  }

  console.log('\n================================================')
  if (allPassed) {
    console.log(colors.green)
    console.log('✅ TUDO CERTO! Supabase configurado com sucesso!')
    console.log(colors.reset)
    console.log('\n🎉 Você pode iniciar o servidor com: npm run dev')
  } else {
    console.log(colors.red)
    console.log('❌ CONFIGURAÇÃO INCOMPLETA')
    console.log(colors.reset)
    console.log('\n📖 Consulte SUPABASE_SETUP.md para instruções')
  }
  console.log('================================================\n')

  await prisma.$disconnect()
  process.exit(allPassed ? 0 : 1)
}

main().catch(console.error)
