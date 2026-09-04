/**
 * Tests de integracion de QC-26 (pantalla-de-recetas) contra una base Postgres REAL,
 * ejercitando el adaptador `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts`
 * DIRECTAMENTE -no un doble-, importado por su ruta profunda igual que hace
 * `tests/integration/recetas/recipe-crud.int.test.ts` con `recipe-prisma`.
 *
 * POR QUE EXISTE ESTE ARCHIVO — cierra el MAYOR 3 de
 * `progress/review_QC-26-pantalla-de-recetas.md`: `listUnits` no tenia ni un solo test que
 * lo tocara. El reviewer borro a la vez `take: limit` y `orderBy: { name: 'asc' }` de
 * `unit-prisma.ts` y la suite completa siguio verde. Las dos mitades de R40 -la COTA y el
 * ORDEN ESTABLE- solo se pueden comprobar contra la base: son SQL, no logica de dominio
 * (esa ya la cubre `tests/unit/unidades/list-units.test.ts`, que solo ve un doble del
 * puerto y por tanto no puede ver ni el `take` ni el `ORDER BY`).
 *
 * AISLAMIENTO, Y POR QUE NO ES EL DE `unidades-constraints.int.test.ts` — aquel archivo
 * envuelve cada caso en `prisma.$transaction` con `ROLLBACK`. Aqui NO se puede: `listUnits`
 * llama al cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no a un `tx` inyectado, asi que
 * una llamada hecha "dentro" del callback de `prisma.$transaction(...)` correria en OTRA
 * conexion del pool y no veria las filas de la transaccion. Se usa entonces la estrategia 2
 * de `recipe-crud.int.test.ts`: cada caso crea sus filas con `prisma` real y las borra el
 * mismo, por su `id` exacto, en un bloque `finally`. La base queda como se encontro.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en total».
 * La base local ya trae el catalogo arrancador sembrado (QC-32) y otras sesiones corren
 * contra la MISMA base. Cada caso localiza sus filas por `id` exacto o por un marcador
 * irrepetible (`randomUUID`) y afirma solo sobre esa subsecuencia. El unico conteo global es
 * la PRECONDICION del caso de la cota, y no es una afirmacion sobre el contenido: es una
 * comprobacion de que el caso no sale verde por vacuidad (si hubiera menos filas que el
 * limite pedido, devolver «todas» y devolver «como mucho el limite» serian indistinguibles,
 * y el test tiene que fallar diciendolo en vez de mentir en verde).
 *
 * SUFIJOS ASCII EN EL CASO DEL ORDEN — los nombres se ordenan con digitos ASCII (`01`, `02`,
 * `03`) para que la intercalacion (`collation`) de Postgres y la comparacion de JavaScript no
 * puedan discrepar. Con acentos o mayusculas mezcladas, un test de orden es una loteria de
 * `LC_COLLATE`.
 *
 * Requisito cubierto: R40.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listUnits } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'

import type { ListQuery } from '@/lib/modules/unidades/domain/list-query'

/**
 * QC-57: `listUnits` recibe ahora, ademas de la cota, el CONTRATO GENERICO de consulta ya
 * saneado. Esta es la consulta VACIA -sin orden, sin filtro y sin busqueda-, o sea exactamente
 * el comportamiento que este archivo ya verificaba: catalogo entero ordenado por nombre. Se
 * adapta la LLAMADA; ningun aserto de comportamiento cambia (R26).
 */
const SIN_CONSULTA: ListQuery = { page: 1, sort: null, filters: {}, search: '' }
import { prisma } from '@/lib/shared/db/prisma'

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Siembra una unidad con nombre marcado. `nameNormalized` deriva del marcador porque su
 * indice unico es TOTAL: un nombre fijo chocaria con el catalogo arrancador o con otro caso.
 */
async function seedUnit(name: string, marker: string, suffix: string): Promise<string> {
  const unit = await prisma.unit.create({
    data: { name, nameNormalized: `${marker}${suffix}`, symbol: 'x' },
    select: { id: true },
  })
  return unit.id
}

/** Borra por `id` EXACTO las filas sembradas. Nunca por marcador ni por rango. */
async function deleteUnits(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.unit.deleteMany({ where: { id: { in: [...ids] } } })
}

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

describe('listUnits — R40: la cota', () => {
  it('devuelve exactamente el limite pedido cuando la tabla tiene mas filas que el limite', async () => {
    const marker = token()
    const limit = 2
    const ids: string[] = []

    try {
      for (const suffix of ['01', '02', '03']) {
        ids.push(await seedUnit(`Unidad cota ${marker} ${suffix}`, marker, suffix))
      }

      // PRECONDICION, no asercion de contenido: si la tabla no tuviera MAS filas que el
      // limite, «devolver todas» y «devolver como mucho el limite» darian el mismo
      // resultado y el caso seria verde por vacuidad. Se falla diciendolo.
      const total = await prisma.unit.count()
      expect(
        total,
        `precondicion no cumplida: la tabla units tiene ${String(total)} filas y el caso ` +
          `pide ${String(limit)}; sin mas filas que el limite el caso seria verde por vacuidad`,
      ).toBeGreaterThan(limit)

      const rows = await listUnits(limit, SIN_CONSULTA)

      // La cota se respeta...
      expect(rows.length).toBeLessThanOrEqual(limit)
      // ...y ademas se AGOTA: con mas filas disponibles que el limite, devolver menos seria
      // otro defecto. Es esta igualdad la que muere si `take: limit` desaparece del adaptador.
      expect(rows).toHaveLength(limit)
    } finally {
      await deleteUnits(ids)
    }
  })
})

describe('listUnits — R40: el orden', () => {
  it('devuelve las filas ordenadas de forma ascendente por nombre, no en orden de insercion', async () => {
    const marker = token()
    const ids: string[] = []

    try {
      // Se siembran 8 filas (suffix de dos digitos '01'..'08' para conservar el orden
      // ASCII) en el orden EXACTAMENTE INVERSO al alfabetico esperado ('08'..'01'). Con
      // solo 3 filas, Postgres puede devolver por azar el orden correcto sin `ORDER BY`
      // -reutilizacion de tuplas muertas en el heap-, como se probo empiricamente (6
      // corridas: 1 falso verde, 5 rojas). Sembrando 8 filas en orden estrictamente
      // inverso al de insercion, el orden de heap sin `ORDER BY` coincidiria con el
      // inverso exacto del esperado, lo que hace que la comparacion de abajo falle de
      // forma consistente si el adaptador pierde su `orderBy`.
      const prefix = `Unidad orden ${marker} `
      for (const suffix of ['08', '07', '06', '05', '04', '03', '02', '01']) {
        ids.push(await seedUnit(`${prefix}${suffix}`, marker, suffix))
      }

      // Limite mayor que el total de filas: este caso mira el ORDEN, no la cota, asi que
      // las ocho filas sembradas tienen que caber enteras en la pagina.
      const total = await prisma.unit.count()
      const rows = await listUnits(total + 10, SIN_CONSULTA)

      // Solo las filas de este caso, localizadas por el marcador irrepetible.
      const own = rows.filter((row) => row.name.startsWith(prefix))
      expect(own).toHaveLength(8)
      expect(own.map((row) => row.name)).toEqual([
        `${prefix}01`,
        `${prefix}02`,
        `${prefix}03`,
        `${prefix}04`,
        `${prefix}05`,
        `${prefix}06`,
        `${prefix}07`,
        `${prefix}08`,
      ])

      // La subsecuencia viene ascendente, dicho ademas sin depender del orden esperado
      // concreto: cada nombre es estrictamente menor que el siguiente.
      const names = own.map((row) => row.name)
      const ascending = [...names].sort()
      expect(names).toEqual(ascending)

      // Y cada fila trae los tres campos que R40 pide, no un id suelto.
      const first = own[0]
      expect(first?.id).toMatch(/^[0-9a-f-]{36}$/u)
      expect(first?.symbol).toBe('x')
    } finally {
      await deleteUnits(ids)
    }
  })
})
