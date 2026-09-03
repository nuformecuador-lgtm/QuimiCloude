/**
 * db:seed — deja la base utilizable desde cero: siembra el catalogo de roles y, si hace
 * falta, el usuario inicial con rol Administrador (`design.md > 5`, T13), y el catalogo
 * arrancador de unidades de medida (QC-32 `design.md > 6`, T5).
 *
 * Cascara fina: TODA la logica vive en `lib/modules/identity/domain/seed-initial-access.ts`
 * y en `lib/modules/unidades/domain/seed-units.ts`.
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
    const { identity, unidades } = await import('../lib/composition')
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

    // QC-32: catalogo arrancador de unidades. Idempotente por lectura previa, no por
    // `upsert`: una segunda corrida no crea nada y no pisa ninguna unidad existente (R26).
    const units = await unidades.seedStarterUnits()
    console.log(
      units.createdUnits.length > 0
        ? `db:seed: unidades creadas: ${units.createdUnits.length} (${units.createdUnits.join(', ')})`
        : 'db:seed: unidades creadas: 0',
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`db:seed: fallo — ${detail}`)
  process.exit(1)
})
