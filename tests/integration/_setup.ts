/**
 * QC-77 — `setupFiles` del proyecto `integration`: **el guardian de R12**.
 *
 * Corre en cada worker, una vez por archivo de test, y **antes** de que el archivo se importe
 * —por tanto antes de que nadie importe `lib/shared/db/prisma`, que resuelve la conexion al
 * construirse (`design.md > 0`, ancla 9)—. Comprueba una sola cosa: que la conexion
 * configurada apunta a la base efimera que esta corrida creo.
 *
 * Por que existe. La URL viaja del proceso principal al worker por herencia de entorno
 * (`_global-setup.ts`). Eso esta medido hoy, sobre Vitest 4.1.10 con pool `forks`
 * (`progress/qc77-mediciones/T4.md`), pero es una propiedad del pool, no un contrato escrito:
 * un cambio de version o un `pool: 'threads'` puede romperla. Sin este archivo, esa rotura
 * significaria que los 41 archivos de integracion corren contra la base de desarrollo **en
 * silencio** y en verde — exactamente el estado del que viene esta ficha. Con el, significa un
 * rojo ruidoso antes del primer caso.
 *
 * Lanza al evaluarse, a proposito: `beforeAll` tambien abortaria el archivo, pero despues de
 * que el modulo bajo prueba ya se haya importado y haya podido abrir una conexion.
 *
 * El **juicio** vive en `tests/helpers/run-database-guard.ts` y no aqui: este archivo lanza al
 * importarse, asi que un test que lo importara para medirlo dispararia el aborto en vez de
 * comprobarlo. Alli es una funcion pura y `tests/unit/test-database/guardian-r12.test.ts`
 * cubre sus cinco desenlaces; aqui queda solo el `throw`.
 *
 * Este archivo no lleva `.test.` en el nombre, asi que el `include` del proyecto
 * (`tests/integration/**\/*.test.ts`) no lo recoge como suite.
 */
import { RUN_DATABASE_ENV, runDatabaseGuardFailure } from '../helpers/run-database-guard'

const failure = runDatabaseGuardFailure({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  QC77_RUN_DATABASE: process.env[RUN_DATABASE_ENV],
})

if (failure !== undefined) throw new Error(failure)
