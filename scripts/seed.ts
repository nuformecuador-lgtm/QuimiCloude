/**
 * db:seed — deja la base utilizable desde cero: siembra el catalogo de roles y, si hace
 * falta, el usuario inicial con rol Administrador (`design.md > 5`, T13).
 *
 * El catalogo de unidades de medida NO se siembra aqui: lo insertan cuatro filas de la
 * migracion de QC-32 (`db/migrations/20260903121404_units_catalog/migration.sql`).
 *
 * Cascara fina: TODA la logica vive en `lib/modules/identity/domain/seed-initial-access.ts`.
 * Este script solo carga el entorno, invoca la composicion, resume el resultado por
 * consola sin secretos, y traduce exito/fallo a codigo de salida.
 *
 * Import RELATIVO a la composicion (`../lib/composition`), no `@/lib/composition`:
 * `tsx` no resuelve los alias de `tsconfig` de forma verificada en este repo
 * (`design.md > 5`).
 *
 * `prisma` se carga con `import()` dinamico DENTRO de `main()`, DESPUES de
 * `loadDotEnv()`, igual que `../lib/composition`: un import estatico se evalua antes de
 * que `.env` este cargado, y aunque Prisma resuelve la url de conexion de forma
 * perezosa (asi que hoy no falla), el orden es fragil y contradice a proposito a
 * `scripts/db-rollback.ts`, que carga el entorno primero.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** `tsx` no carga `.env` por su cuenta (mismo patron que `scripts/db-rollback.ts`). */
function loadDotEnv(): void {
  if (!existsSync(join(process.cwd(), '.env'))) return
  process.loadEnvFile()
}

async function main(): Promise<void> {
  loadDotEnv()

  const { prisma } = await import('../lib/shared/db/prisma')
  try {
    const { identity } = await import('../lib/composition')
    const outcome = await identity.seedInitialAccess()

    if (outcome.createdRoles.length > 0 || outcome.createdAdmin || outcome.createdCompany !== null) {
      const roles =
        outcome.createdRoles.length > 0
          ? `roles creados: ${outcome.createdRoles.length} (${outcome.createdRoles.join(', ')})`
          : 'roles creados: 0'
      // QC-47: la empresa inicial. El nombre no es un secreto (sale de una constante del
      // dominio, `design.md > 6.1`), asi que puede ir en la linea de resumen.
      const empresa =
        outcome.createdCompany !== null
          ? `empresa inicial: creada (${outcome.createdCompany})`
          : 'empresa inicial: ya existia'
      const admin = outcome.createdAdmin ? 'usuario inicial: creado' : 'usuario inicial: ya existia'
      console.log(`db:seed: ${roles} - ${empresa} - ${admin}`)
    } else {
      console.log('db:seed: nada que crear')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`db:seed: fallo — ${detail}`)
  process.exit(1)
})
