/**
 * QC-32 T11 — el seed arrancador de unidades contra una base Postgres REAL, con la
 * migracion `20260903121404_units_catalog` aplicada. Cubre R25 y R26.
 *
 * AISLAMIENTO — mismo patron que `unidades-constraints.int.test.ts` y que
 * `tests/integration/identity/identity-seed.int.test.ts`: cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, lo que hace que
 * Prisma emita `ROLLBACK`. Ninguna fila escrita aqui sobrevive: la base local esta
 * COMPARTIDA con otras sesiones y el catalogo arrancador real ya esta sembrado en ella.
 *
 * QUE SE EJERCITA, Y POR QUE ASI — el caso de uso REAL del dominio
 * (`createSeedStarterUnits`, el mismo que `lib/composition` cablea y que `scripts/seed.ts`
 * invoca) contra el adaptador Prisma REAL DE PRODUCCION
 * (`createUnitSeedRepository`, `design.md > 5.4`), construido sobre el `tx` del test. Aqui
 * no se escribe ninguna copia del adaptador: una copia solo demostraria que la copia
 * funciona, y vaciar el adaptador de verdad dejaria este archivo verde. Por eso el
 * adaptador se exporta como fabrica, igual que `createInitialAccessRepository` en
 * `identity-seed.int.test.ts`.
 *
 * No se llama a `unidades.seedStarterUnits()` de `lib/composition` porque ese cableado ata
 * el adaptador al cliente COMPARTIDO: invocarlo desde dentro de un `prisma.$transaction`
 * escribiria por OTRA conexion, quedaria comiteado en la base de verdad y ni siquiera veria
 * las filas de la transaccion del test. Que el cableado exista se comprueba aparte —en el
 * ultimo caso de este archivo y, sobre el texto de los fuentes, en
 * `tests/unit/unidades/seed-wiring.test.ts`.
 *
 * NINGUNA AFIRMACION GLOBAL SOBRE LA TABLA — no se cuenta `units` entera ni se afirma que
 * este vacia: se mira SOLO las cinco claves arrancadoras. Otra sesion puede tener unidades
 * suyas a medias, y un conteo total volveria este archivo rojo por algo que no es suyo.
 *
 * EL CATALOGO ESPERADO SE ESCRIBE LITERAL — las cinco unidades no se leen de
 * `STARTER_UNITS`: si se leyeran, cambiar el conjunto arrancador no podria poner rojo a
 * este test, y es justo lo que tiene que vigilar. Sigue siendo la posicion por defecto de
 * `design.md > 6.1` (pregunta abierta 4 de `requirements.md`): si el humano la cambia, se
 * editan estos cinco literales.
 */
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { unidades } from '@/lib/composition'
import { createSeedStarterUnits } from '@/lib/modules/unidades'
import { createUnitSeedRepository } from '@/lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

/** Las cinco unidades arrancadoras, escritas literales (ver cabecera). */
const EXPECTED_STARTER_UNITS: readonly { name: string; nameNormalized: string; symbol: string | null }[] = [
  { name: 'gramo', nameNormalized: 'gramo', symbol: 'g' },
  { name: 'kilogramo', nameNormalized: 'kilogramo', symbol: 'kg' },
  { name: 'litro', nameNormalized: 'litro', symbol: 'L' },
  { name: 'mililitro', nameNormalized: 'mililitro', symbol: 'mL' },
  { name: 'unidad', nameNormalized: 'unidad', symbol: null },
]

const STARTER_KEYS = EXPECTED_STARTER_UNITS.map((unit) => unit.nameNormalized)

/** Las cinco filas arrancadoras que hay AHORA en la base, ordenadas por su clave. */
function readStarterUnits(tx: Prisma.TransactionClient) {
  return tx.unit.findMany({
    where: { nameNormalized: { in: [...STARTER_KEYS] } },
    orderBy: { nameNormalized: 'asc' },
  })
}

/**
 * Deja el catalogo SIN ninguna de las cinco unidades arrancadoras, DENTRO del `tx`. Hace
 * falta porque la base local ya trae el catalogo sembrado de una corrida real anterior: sin
 * este borrado, ningun caso podria observar «primera corrida sobre catalogo vacio». Como
 * toda la transaccion termina en ROLLBACK, esto nunca toca la base de verdad. El borrado es
 * FISICO porque `units` no tiene borrado logico a proposito (R8).
 */
async function emptyStarterCatalog(tx: Prisma.TransactionClient): Promise<void> {
  await tx.unit.deleteMany({ where: { nameNormalized: { in: [...STARTER_KEYS] } } })
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'units'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-32 (tabla `units`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('el seed arrancador de unidades contra base real', () => {
  it('db:seed deja las cinco unidades en la base', async () => {
    await inRolledBackTransaction(async (tx) => {
      await emptyStarterCatalog(tx)
      expect(await readStarterUnits(tx)).toEqual([])

      const seedStarterUnits = createSeedStarterUnits({
        repository: createUnitSeedRepository(tx),
      })
      const outcome = await seedStarterUnits()

      // R25: las cinco, con su nombre y su simbolo, y NINGUNA otra.
      expect(outcome.createdUnits.slice().sort()).toEqual(
        ['gramo', 'kilogramo', 'litro', 'mililitro', 'unidad'].sort(),
      )

      const units = await readStarterUnits(tx)
      expect(
        units.map((unit) => ({
          name: unit.name,
          nameNormalized: unit.nameNormalized,
          symbol: unit.symbol,
        })),
      ).toEqual(EXPECTED_STARTER_UNITS)

      // «unidad» es el caso que estrena el simbolo opcional (R3): ausencia, no cadena
      // vacia, tambien cuando quien escribe es el seed.
      const unidad = units.find((unit) => unit.nameNormalized === 'unidad')
      expect(unidad?.symbol).toBeNull()
      expect(unidad?.symbol).not.toBe('')

      // Y cada fila nace con su identificador propio y sus marcas de tiempo puestas (R1, R9).
      for (const unit of units) {
        expect(unit.id).toMatch(/^[0-9a-f-]{36}$/u)
        expect(unit.createdAt).toBeInstanceOf(Date)
        expect(unit.updatedAt).toBeInstanceOf(Date)
      }
    })
  })

  it('una segunda corrida no crea nada y no pisa una unidad renombrada a mano', async () => {
    await inRolledBackTransaction(async (tx) => {
      await emptyStarterCatalog(tx)
      const seedStarterUnits = createSeedStarterUnits({
        repository: createUnitSeedRepository(tx),
      })

      const first = await seedStarterUnits()
      expect(first.createdUnits).toHaveLength(5)

      // Alguien renombra «litro» a mano y le cambia el simbolo. La clave normalizada NO
      // cambia (`litro` sigue normalizando a `litro`), que es el caso que R26 describe.
      const litro = await tx.unit.findUniqueOrThrow({ where: { nameNormalized: 'litro' } })
      await tx.unit.update({
        where: { id: litro.id },
        data: { name: 'Litro', symbol: 'l' },
      })
      const litroEditado = await tx.unit.findUniqueOrThrow({ where: { id: litro.id } })
      expect(litroEditado.name).toBe('Litro')
      expect(litroEditado.symbol).toBe('l')

      const unitsAntes = await readStarterUnits(tx)

      const second = await seedStarterUnits()

      // R26, primera mitad: la segunda corrida no crea NADA, ni siquiera un duplicado de
      // la unidad renombrada.
      expect(second.createdUnits).toEqual([])
      const conClaveLitro = await tx.unit.findMany({ where: { nameNormalized: 'litro' } })
      expect(conClaveLitro).toHaveLength(1)

      // R26, segunda mitad: la fila editada a mano no se toco. Comparacion campo a campo
      // de la fila entera releida —nombre, simbolo, `created_at` y `updated_at`
      // incluidos—: si el seed hubiera hecho un `upsert`, `L` habria vuelto y `updated_at`
      // se habria movido.
      const litroDespues = await tx.unit.findUniqueOrThrow({ where: { id: litro.id } })
      expect(litroDespues).toEqual(litroEditado)
      expect(litroDespues.name).toBe('Litro')
      expect(litroDespues.symbol).toBe('l')
      expect(litroDespues.updatedAt.getTime()).toBe(litroEditado.updatedAt.getTime())

      // Y el resto del catalogo tampoco se movio: las cinco filas siguen siendo las
      // mismas, con el mismo id y las mismas marcas de tiempo.
      expect(await readStarterUnits(tx)).toEqual(unitsAntes)
    })
  })

  it('el catalogo arrancador esta cableado en lib/composition, que es lo que invoca scripts/seed.ts', async () => {
    // Los dos casos de arriba ejercitan el caso de uso del dominio con el adaptador de
    // produccion atado al `tx` (ver cabecera). Lo unico que ese montaje NO puede demostrar
    // es que el cableado exista: sin esta comprobacion, `lib/composition` podria quedarse
    // sin `unidades` y los dos casos seguirian verdes mientras `pnpm run db:seed` no siembra
    // nada. No se invoca: hacerlo escribiria en la base compartida fuera de transaccion.
    // Esto ya no es lo UNICO que vigila el cableado: `tests/unit/unidades/seed-wiring.test.ts`
    // comprueba sobre el texto de los fuentes que `lib/composition` ata el puerto al
    // adaptador driven real y que `scripts/seed.ts` invoca el seed de unidades.
    expect(typeof unidades.seedStarterUnits).toBe('function')
  })
})
