/**
 * db:seed — deja la base utilizable desde cero: siembra el catalogo de roles y, si hace
 * falta, el usuario inicial con rol Administrador (`design.md > 5`, T13).
 *
 * Cascara fina: TODA la logica vive en `lib/modules/identity/domain/seed-initial-access.ts`.
 * Este script solo carga el entorno, invoca la composicion, resume el resultado por
 * consola sin secretos, y traduce exito/fallo a codigo de salida.
 *
 * Import RELATIVO a la composicion (`../lib/composition`), no `@/lib/composition`:
 * `tsx` no resuelve los alias de `tsconfig` de forma verificada en este repo
 * (`design.md > 5`).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { prisma } from '../lib/shared/db/prisma'

/** `tsx` no carga `.env` por su cuenta (mismo patron que `scripts/db-rollback.ts`). */
function loadDotEnv(): void {
  if (!existsSync(join(process.cwd(), '.env'))) return
  process.loadEnvFile()
}

async function main(): Promise<void> {
  loadDotEnv()

  const { identity } = await import('../lib/composition')
  const outcome = await identity.seedInitialAccess()

  if (outcome.createdRoles.length > 0 || outcome.createdAdmin) {
    const roles =
      outcome.createdRoles.length > 0
        ? `roles creados: ${outcome.createdRoles.length} (${outcome.createdRoles.join(', ')})`
        : 'roles creados: 0'
    const admin = outcome.createdAdmin ? 'usuario inicial: creado' : 'usuario inicial: ya existia'
    console.log(`db:seed: ${roles} - ${admin}`)
  } else {
    console.log('db:seed: nada que crear')
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`db:seed: fallo — ${detail}`)
    await prisma.$disconnect()
    process.exit(1)
  })
