/**
 * 🗄️ Cliente Prisma - Configuração Otimizada
 * 
 * Cliente singleton com pool de conexões e logging
 */

import { PrismaClient } from '@prisma/client'

// Configuração do cliente Prisma
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  
  // Configurações de performance
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

// Singleton em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

export default prisma

