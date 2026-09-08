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

import {
  listUnits,
  listUnitsPage,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
import { MAX_UNITS } from '@/lib/modules/unidades'

import type { ListQuery } from '@/lib/modules/unidades/domain/list-query'
import type { UnitScope } from '@/lib/modules/unidades/domain/unit-scope'

/**
 * QC-57: `listUnits` recibe ahora, ademas de la cota, el CONTRATO GENERICO de consulta ya
 * saneado. Esta es la consulta VACIA -sin orden, sin filtro y sin busqueda-, o sea exactamente
 * el comportamiento que este archivo ya verificaba: catalogo entero ordenado por nombre. Se
 * adapta la LLAMADA; ningun aserto de comportamiento cambia (R26).
 */
const SIN_CONSULTA: ListQuery = { page: 1, sort: null, filters: {}, search: '' }

/**
 * QC-76 (R17, R18): las dos lecturas EXIGEN ahora el ambito de la empresa en cuyo nombre se
 * pregunta. Los dos casos de arriba —la cota y el orden— siembran unidades SIN empresa, o sea
 * DE SISTEMA (`company_id` nulo, R11), que son visibles desde cualquier ambito: se adapta la
 * LLAMADA y **ningun aserto de comportamiento cambia** (R21). El ambito de verdad —cada empresa
 * ve lo suyo mas lo de sistema y nada de la otra— se prueba en el bloque del final.
 */
const AMBITO: UnitScope = { companyId: '00000000-0000-4000-8000-0000000000aa' }
import { prisma } from '@/lib/shared/db/prisma'

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Siembra una unidad con nombre marcado. `nameNormalized` deriva del marcador porque su
 * indice unico es por AMBITO (QC-76 R14) y estas filas se siembran SIN empresa, o sea de
 * sistema: un nombre fijo chocaria con el catalogo arrancador o con otro caso.
 *
 * **El SIMBOLO tambien deriva del marcador, y desde QC-76 no es opcional que lo haga.** Antes
 * era el literal `'x'` para las tres filas de un mismo caso, y podia serlo porque `symbol` no
 * tenia ningun indice (QC-32 lo dejo a proposito sin el, su pregunta abierta 1). QC-76 la
 * cierra: el simbolo es UNICO dentro del ambito cuando existe (R15, decision cerrada 28), y
 * `units_system_symbol_unique` rechaza con 23505 la segunda fila de sistema que repita `'x'`.
 * El fallo NO seria del comportamiento que estos casos miden -la cota y el orden-, sino del
 * fixture, que es la peor forma de tener un test rojo.
 */
async function seedUnit(name: string, marker: string, suffix: string): Promise<string> {
  const unit = await prisma.unit.create({
    data: {
      name,
      nameNormalized: `${marker}${suffix}`,
      symbol: `x${marker.slice(0, 8)}${suffix}`,
    },
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

      const rows = await listUnits(limit, SIN_CONSULTA, AMBITO)

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
      const rows = await listUnits(total + 10, SIN_CONSULTA, AMBITO)

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
      // El simbolo esperado es el que sembro `seedUnit`, ahora derivado del marcador para no
      // chocar contra `units_system_symbol_unique` (QC-76 R15). Se sigue afirmando que la fila
      // TRAE su simbolo -que es lo que este caso mide-, no que valga un literal concreto.
      expect(first?.symbol).toBe(`x${marker.slice(0, 8)}01`)
    } finally {
      await deleteUnits(ids)
    }
  })
})

/**
 * QC-76 T9 — EL AMBITO POR EMPRESA CONTRA LA BASE REAL (R17, R18).
 *
 * POR QUE NO BASTA EL UNITARIO: `tests/unit/unidades/unit-prisma-where.test.ts` comprueba que el
 * `where` LLEVA el `OR` y que el `count` usa el mismo objeto que el `findMany`, pero lo hace
 * contra un doble de Prisma: no puede ver que Postgres DEVUELVA exactamente lo visible. Aqui se
 * siembran DOS empresas y unidades de sistema, y se afirma sobre las filas que vuelven, en los
 * DOS modos. **Si se borra el `OR` de `companyScopeWhere`, este bloque cae**: sin el, la empresa
 * A veria las unidades de la B (y el `total` de su pagina las contaria).
 *
 * AISLAMIENTO: el mismo del resto del archivo —filas reales, borradas por `id` exacto en el
 * `finally`—, mas las dos empresas, que se borran DESPUES de sus unidades. Ninguna afirmacion
 * global: todo se localiza por un marcador irrepetible en `name_normalized`, que ademas es lo
 * que permite acotar la consulta con la BUSQUEDA del propio contrato sin mirar el catalogo real.
 */
describe('el listado acota por empresa — QC-76 R17, R18', () => {
  /** Crea una empresa real: `units.company_id` referencia `companies(id)` (R13). */
  async function seedCompany(marker: string, suffix: string): Promise<string> {
    const company = await prisma.company.create({
      data: { name: `Empresa ${marker} ${suffix}`, nameNormalized: `${marker}${suffix}` },
      select: { id: true },
    })
    return company.id
  }

  /** Unidad con empresa (`companyId`) o DE SISTEMA (`companyId: null`, R11). */
  async function seedScopedUnit(
    name: string,
    nameNormalized: string,
    companyId: string | null,
  ): Promise<string> {
    const unit = await prisma.unit.create({
      data: { name, nameNormalized, symbol: null, companyId },
      select: { id: true },
    })
    return unit.id
  }

  it('cada empresa ve las suyas MAS las de sistema y ninguna de la otra, en los dos modos', async () => {
    const marker = token()
    const consulta: ListQuery = { ...SIN_CONSULTA, search: marker }
    const unitIds: string[] = []
    const companyIds: string[] = []

    try {
      const empresaA = await seedCompany(marker, 'a')
      const empresaB = await seedCompany(marker, 'b')
      companyIds.push(empresaA, empresaB)

      const deA = await seedScopedUnit(`Unidad ${marker} A`, `${marker}a`, empresaA)
      const deB = await seedScopedUnit(`Unidad ${marker} B`, `${marker}b`, empresaB)
      const deSistema = await seedScopedUnit(`Unidad ${marker} S`, `${marker}s`, null)
      unitIds.push(deA, deB, deSistema)

      // --- modo CATALOGO -------------------------------------------------------------
      const catalogoA = await listUnits(MAX_UNITS, consulta, { companyId: empresaA })
      const idsCatalogoA = catalogoA.map((row) => row.id)
      expect(idsCatalogoA).toContain(deA)
      expect(idsCatalogoA).toContain(deSistema)
      expect(idsCatalogoA, 'la empresa A ve una unidad de la empresa B').not.toContain(deB)
      // La igualdad de conjunto, no solo la pertenencia: acotado por el marcador, lo visible
      // para A es EXACTAMENTE su unidad y la de sistema.
      expect([...idsCatalogoA].sort()).toEqual([deA, deSistema].sort())

      const catalogoB = await listUnits(MAX_UNITS, consulta, { companyId: empresaB })
      expect([...catalogoB.map((row) => row.id)].sort()).toEqual([deB, deSistema].sort())

      // --- modo PAGINA ---------------------------------------------------------------
      const paginaA = await listUnitsPage({ ...consulta, pageSize: 25 }, { companyId: empresaA })
      expect([...paginaA.items.map((row) => row.id)].sort()).toEqual([deA, deSistema].sort())
      // R17: el recuento cuenta SOLO lo visible. Con las tres filas sembradas y el mismo
      // marcador, un `total` de 3 seria justo el defecto que este caso persigue.
      expect(paginaA.total).toBe(2)
      expect(paginaA.totalPages).toBe(1)

      const paginaB = await listUnitsPage({ ...consulta, pageSize: 25 }, { companyId: empresaB })
      expect([...paginaB.items.map((row) => row.id)].sort()).toEqual([deB, deSistema].sort())
      expect(paginaB.total).toBe(2)
    } finally {
      await deleteUnits(unitIds)
      if (companyIds.length > 0) {
        await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
      }
    }
  })

  it('una empresa sin unidades propias ve las de sistema, y solo esas', async () => {
    // El otro lado del `OR`: quitarlo entero no solo ensena de mas, tambien esconderia las de
    // sistema a quien no tiene ninguna suya. Con `company_id = :empresa` a secas, este caso
    // devolveria vacio.
    const marker = token()
    const consulta: ListQuery = { ...SIN_CONSULTA, search: marker }
    const unitIds: string[] = []
    const companyIds: string[] = []

    try {
      const empresaA = await seedCompany(marker, 'a')
      const empresaVacia = await seedCompany(marker, 'v')
      companyIds.push(empresaA, empresaVacia)

      const deA = await seedScopedUnit(`Unidad ${marker} A`, `${marker}a`, empresaA)
      const deSistema = await seedScopedUnit(`Unidad ${marker} S`, `${marker}s`, null)
      unitIds.push(deA, deSistema)

      const catalogo = await listUnits(MAX_UNITS, consulta, { companyId: empresaVacia })
      expect(catalogo.map((row) => row.id)).toEqual([deSistema])

      const pagina = await listUnitsPage({ ...consulta, pageSize: 25 }, { companyId: empresaVacia })
      expect(pagina.items.map((row) => row.id)).toEqual([deSistema])
      expect(pagina.total).toBe(1)
    } finally {
      await deleteUnits(unitIds)
      if (companyIds.length > 0) {
        await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
      }
    }
  })

  it('la busqueda no amplia lo visible: el termino se combina con el ambito, no lo sustituye', async () => {
    // El `AND` de `buildUnitWhere`. Si el ambito y la busqueda quedaran al mismo nivel, buscar
    // el nombre exacto de una unidad ajena la sacaria a la luz.
    const marker = token()
    const unitIds: string[] = []
    const companyIds: string[] = []

    try {
      const empresaA = await seedCompany(marker, 'a')
      const empresaB = await seedCompany(marker, 'b')
      companyIds.push(empresaA, empresaB)

      const deB = await seedScopedUnit(`Unidad ${marker} B`, `${marker}b`, empresaB)
      unitIds.push(deB)

      const catalogo = await listUnits(
        MAX_UNITS,
        { ...SIN_CONSULTA, search: `${marker}b` },
        { companyId: empresaA },
      )
      expect(catalogo.map((row) => row.id)).toEqual([])

      const pagina = await listUnitsPage(
        { ...SIN_CONSULTA, search: `${marker}b`, pageSize: 25 },
        { companyId: empresaA },
      )
      expect(pagina.items).toEqual([])
      expect(pagina.total).toBe(0)
    } finally {
      await deleteUnits(unitIds)
      if (companyIds.length > 0) {
        await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
      }
    }
  })
})
