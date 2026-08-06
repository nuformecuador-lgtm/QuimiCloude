import { PrismaClient } from '@prisma/client'

/**
 * Cliente Prisma del proyecto. **Es la unica instancia**: ningun otro archivo
 * instancia `PrismaClient` ni lo importa (`design.md > 7`). Los repositorios de las
 * features siguientes importan `prisma` de aqui.
 *
 * El cache en `globalThis` existe por el hot-reload de `next dev`: cada recarga
 * reevalua los modulos y, sin cache, dejaria una conexion nueva por recarga hasta
 * agotar el pool. En produccion el modulo se evalua una sola vez.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
