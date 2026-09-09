/**
 * Tests de integracion de QC-38 (crud-de-unidades) contra una base Postgres REAL, ejercitando
 * los TRES CASOS DE USO de escritura (`createUnit`, `updateUnit`, `deleteUnit`) cableados con el
 * adaptador Prisma de verdad -no un doble-, tal como los consume la app: se importan desde
 * `@/lib/composition`, igual que hace `tests/integration/identity/identity-seed.int.test.ts` con
 * `identity`.
 *
 * POR QUE NO SE USA `prisma.$transaction` CON `ROLLBACK` -el patron de
 * `unidades-constraints.int.test.ts`- Los tres casos de uso, a traves del adaptador
 * `unit-write-prisma.ts`, llaman al cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no a un
 * `tx` inyectado: una llamada hecha "dentro" del callback de `prisma.$transaction(...)`
 * correria en OTRA conexion del pool y no veria las filas de la transaccion. Se usa entonces la
 * estrategia de `unit-repository.int.test.ts`: cada caso crea sus filas con `prisma` real y las
 * borra el mismo, por su `id` exacto, en un bloque `finally`, en el orden que respeta las FK
 * (lineas de receta -> recetas -> productos -> presentaciones -> unidades -> empresas).
 *
 * NINGUNA AFIRMACION GLOBAL -no se afirma "la tabla esta vacia" ni "hay N filas en total": la
 * base es compartida y otras sesiones corren contra ella. Cada caso localiza sus propias filas
 * por `id` exacto o por un marcador irrepetible (`token()`), y siembra SIMBOLOS Y NOMBRES
 * DERIVADOS DE ESE MARCADOR, nunca literales fijos como `'kg'` -el motivo esta escrito en
 * `unidades-constraints.int.test.ts`: el catalogo arrancador ya ocupa `kg`, `g`, `L` y `mL` como
 * unidades DE SISTEMA, y un literal fijo chocaria contra el o contra otro caso de este archivo.
 *
 * LOS CASOS DE USO SE LLAMAN TAL CUAL LOS LLAMARIA UNA SERVER ACTION -con un `Actor` construido
 * a mano (id, companyId, permissions)-, nunca con SQL crudo: lo que este archivo prueba es el
 * camino de datos REAL de la app (permiso -> zod -> equivalencia -> repositorio -> traduccion de
 * errores), no el esquema en si -eso ya lo prueba `unidades-constraints.int.test.ts`-.
 *
 * Requisitos cubiertos: R6, R7, R11, R12, R14, R16, R17, R19, R20, R23, R24.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { unidades } from '@/lib/composition'
import {
  DuplicateSymbolError,
  InvalidDerivationError,
  UnitDuplicateNameError,
  UnitInUseError,
} from '@/lib/modules/unidades'
import { prisma } from '@/lib/shared/db/prisma'

import type { Actor } from '@/lib/modules/unidades'

// ---------------------------------------------------------------------------
// Utilidades de aislamiento -sin transaccion, ver cabecera-
// ---------------------------------------------------------------------------

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Actor autorizado -con `unidades.modificar`-, de la empresa que se le indique. */
function actorFor(companyId: string): Actor {
  return { id: randomUUID(), companyId, permissions: ['unidades.modificar'] }
}

/** Empresa real: `units.company_id` referencia `companies(id)`. Se borra en el `finally`. */
async function createCompany(marker: string): Promise<string> {
  const company = await prisma.company.create({
    data: { name: `Empresa ${marker}`, nameNormalized: `empresa${marker}` },
    select: { id: true },
  })
  return company.id
}

/**
 * Unidad sembrada DIRECTO por Prisma -sin pasar por `createUnit`-, para construir el estado de
 * partida de un caso (una unidad de sistema, una de otra empresa, una ya en uso). El nombre y el
 * simbolo llevan SIEMPRE el marcador: los cuatro indices unicos son por AMBITO (QC-76) y una
 * unidad DE SISTEMA sembrada aqui comparte ambito con el catalogo arrancador.
 */
async function seedUnit(
  marker: string,
  extra: {
    readonly companyId?: string | null
    readonly symbol?: string | null
    readonly baseUnitId?: string | null
    readonly factor?: string | null
  } = {},
): Promise<string> {
  const unit = await prisma.unit.create({
    data: {
      name: `Unidad ${marker}`,
      nameNormalized: `unidad${marker}`,
      symbol: extra.symbol ?? null,
      companyId: extra.companyId ?? null,
      baseUnitId: extra.baseUnitId ?? null,
      factor: extra.factor === undefined || extra.factor === null ? null : new Prisma.Decimal(extra.factor),
    },
    select: { id: true },
  })
  return unit.id
}

/** Presentacion + producto, con o sin unidad. `presentations.name_normalized` es UNICO: lleva
 *  el marcador. */
async function createProduct(
  marker: string,
  unitId: string | null,
): Promise<{ readonly productId: string; readonly presentationId: string }> {
  const presentation = await prisma.presentation.create({
    data: { name: `Bidon 20 L ${marker}`, nameNormalized: `bidon20l${marker}` },
    select: { id: true },
  })
  const product = await prisma.product.create({
    data: {
      name: `Producto ${marker}`,
      nameNormalized: `producto${marker}`,
      presentationId: presentation.id,
      unitId,
    },
    select: { id: true },
  })
  return { productId: product.id, presentationId: presentation.id }
}

/** Receta viva, vacia. */
async function createRecipe(marker: string): Promise<string> {
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}` },
    select: { id: true },
  })
  return recipe.id
}

/** Linea de receta, referenciando el producto y la unidad que se le pasen. */
async function createLine(
  recipeId: string,
  productId: string,
  unitId: string,
  quantity = '1.0000',
): Promise<string> {
  const line = await prisma.recipeLine.create({
    data: { recipeId, productId, unitId, quantity: new Prisma.Decimal(quantity) },
    select: { id: true },
  })
  return line.id
}

/** IDs sembrados por un caso, listos para borrarse en el orden que respeta las FK. */
interface Seeded {
  recipeLines?: readonly string[]
  recipes?: readonly string[]
  products?: readonly string[]
  presentations?: readonly string[]
  units?: readonly string[]
  companies?: readonly string[]
}

/** Borra por `id` EXACTO, nunca por marcador ni por rango, en el orden que exigen las FK:
 *  lineas -> recetas -> productos -> presentaciones -> unidades -> empresas. Un `DELETE`
 *  por tabla en un solo `deleteMany`: Postgres comprueba las FK al final del enunciado, asi que
 *  una unidad base y su derivada que se borran en el MISMO `deleteMany` no chocan entre si. */
async function cleanup(seeded: Seeded): Promise<void> {
  if (seeded.recipeLines && seeded.recipeLines.length > 0) {
    await prisma.recipeLine.deleteMany({ where: { id: { in: [...seeded.recipeLines] } } })
  }
  if (seeded.recipes && seeded.recipes.length > 0) {
    await prisma.recipe.deleteMany({ where: { id: { in: [...seeded.recipes] } } })
  }
  if (seeded.products && seeded.products.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: [...seeded.products] } } })
  }
  if (seeded.presentations && seeded.presentations.length > 0) {
    await prisma.presentation.deleteMany({ where: { id: { in: [...seeded.presentations] } } })
  }
  if (seeded.units && seeded.units.length > 0) {
    await prisma.unit.deleteMany({ where: { id: { in: [...seeded.units] } } })
  }
  if (seeded.companies && seeded.companies.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: [...seeded.companies] } } })
  }
}

/** Factor exacto tal como lo guardo la base -DECIMAL(14,4)-, sin pasar por el `toString()`
 *  recortado de `Prisma.Decimal`, que quitaria los ceros de cola que R14 exige comprobar. */
async function rawFactor(id: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ factor: string | null }[]>`
    SELECT "factor"::text AS factor FROM "units" WHERE "id" = ${id}::uuid`
  return rows[0]?.factor ?? null
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

describe('createUnit — R6, R7: alta con y sin simbolo, con y sin derivacion', () => {
  it('crea una fila con la empresa del actor, con simbolo y con derivacion', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      // Unidad DE SISTEMA, sembrada a mano: la app nunca puede crear una (R7), pero puede
      // DERIVAR de una (R16).
      const sistema = await seedUnit(`sistema${marker}`)
      seeded.units = [...(seeded.units ?? []), sistema]

      const { id } = await unidades.createUnit(
        {
          name: `Kilogramo ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: sistema,
          factor: '1000.0000',
        },
        actor,
      )
      seeded.units = [...(seeded.units ?? []), id]

      // R6: una fila, con su identificador.
      expect(id).toMatch(/^[0-9a-f-]{36}$/u)

      // R7: la fila creada lleva SIEMPRE la empresa del actor, nunca una de la entrada -que ni
      // siquiera tiene ese campo-.
      const row = await prisma.unit.findUniqueOrThrow({
        where: { id },
        select: { companyId: true, symbol: true, baseUnitId: true, factor: true },
      })
      expect(row.companyId).toBe(companyId)
      expect(row.symbol).toBe(`u${marker.slice(0, 8)}`)
      expect(row.baseUnitId).toBe(sistema)
      expect(row.factor?.toString()).toBe('1000')
    } finally {
      await cleanup(seeded)
    }
  })

  it('crea una fila con la empresa del actor, sin simbolo y sin derivacion (unidad base)', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id } = await unidades.createUnit({ name: `Mililitro ${marker}` }, actor)
      seeded.units = [id]

      const row = await prisma.unit.findUniqueOrThrow({
        where: { id },
        select: { companyId: true, symbol: true, baseUnitId: true, factor: true },
      })
      // R7: empresa del actor, aunque no se haya declarado simbolo ni derivacion.
      expect(row.companyId).toBe(companyId)
      // R10: la ausencia de simbolo es ausencia, no cadena vacia.
      expect(row.symbol).toBeNull()
      // Unidad BASE: ninguno de los dos campos de equivalencia.
      expect(row.baseUnitId).toBeNull()
      expect(row.factor).toBeNull()
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('createUnit — R11: unicidad del nombre normalizado, por empresa', () => {
  it('rechaza el mismo nombre normalizado en la MISMA empresa con UnitDuplicateNameError', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id: primera } = await unidades.createUnit({ name: `Kilo-Gramo ${marker}` }, actor)
      seeded.units = [primera]

      // Nombre distinto en superficie -mayusculas y guion-, mismo normalizado.
      await expect(
        unidades.createUnit({ name: `KILOGRAMO ${marker}` }, actor),
      ).rejects.toBeInstanceOf(UnitDuplicateNameError)

      // No se escribio ninguna fila nueva: solo sobrevive la primera.
      const rows = await prisma.unit.findMany({
        where: { companyId, nameNormalized: `kilogramo${marker}` },
        select: { id: true },
      })
      expect(rows).toEqual([{ id: primera }])
    } finally {
      await cleanup(seeded)
    }
  })

  it('acepta el mismo nombre normalizado en OTRA empresa y frente a una unidad DE SISTEMA', async () => {
    const marker = token()
    const companyA = await createCompany(`a${marker}`)
    const companyB = await createCompany(`b${marker}`)
    const seeded: Seeded = { companies: [companyA, companyB], units: [] }

    try {
      // Ya existe una unidad DE SISTEMA con ese normalizado, sembrada a mano.
      const sistema = await seedUnit(`sistema${marker}`)
      seeded.units = [...(seeded.units ?? []), sistema]
      // Ojo: el nombre de sistema y el de las empresas comparten el MISMO normalizado a
      // proposito -son ambitos distintos-, asi que aqui se usa el mismo `nameNormalized` que
      // producira `KILOGRAMO ${marker}`.

      const enA = await unidades.createUnit({ name: `KILOGRAMO ${marker}` }, actorFor(companyA))
      const enB = await unidades.createUnit({ name: `KILOGRAMO ${marker}` }, actorFor(companyB))
      seeded.units = [...(seeded.units ?? []), enA.id, enB.id]

      expect(enA.id).not.toBe(enB.id)
      const rows = await prisma.unit.findMany({
        where: { nameNormalized: `kilogramo${marker}` },
        select: { id: true, companyId: true },
      })
      expect(rows.map((row) => row.companyId).sort()).toEqual([companyA, companyB].sort())
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('createUnit — R12: unicidad del simbolo, por empresa; el simbolo sigue siendo opcional', () => {
  it('rechaza el mismo simbolo en la MISMA empresa con DuplicateSymbolError', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const symbol = `u${marker.slice(0, 8)}`
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id: primera } = await unidades.createUnit(
        { name: `Primera ${marker}`, symbol },
        actor,
      )
      seeded.units = [primera]

      await expect(
        unidades.createUnit({ name: `Segunda ${marker}`, symbol }, actor),
      ).rejects.toBeInstanceOf(DuplicateSymbolError)

      const rows = await prisma.unit.findMany({
        where: { companyId, symbol },
        select: { id: true },
      })
      expect(rows).toEqual([{ id: primera }])
    } finally {
      await cleanup(seeded)
    }
  })

  it('acepta DOS unidades sin simbolo en la MISMA empresa: el indice es parcial', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const primera = await unidades.createUnit({ name: `Primera ${marker}` }, actor)
      const segunda = await unidades.createUnit({ name: `Segunda ${marker}` }, actor)
      seeded.units = [primera.id, segunda.id]

      const rows = await prisma.unit.findMany({
        where: { id: { in: [primera.id, segunda.id] } },
        select: { symbol: true },
      })
      expect(rows).toEqual([{ symbol: null }, { symbol: null }])
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('createUnit — R14: el factor como DECIMAL(14,4), sin coma flotante', () => {
  it("guarda '0.5' y lo relee como 0.5000, con factor menor que 1", async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const garrafa = await seedUnit(`garrafa${marker}`, { companyId })
      seeded.units = [garrafa]

      const { id } = await unidades.createUnit(
        {
          name: `Media garrafa ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: garrafa,
          factor: '0.5',
        },
        actor,
      )
      seeded.units = [...(seeded.units ?? []), id]

      // R14: se acepta un factor menor que 1, SIN normalizarlo -no se le da la vuelta-.
      const exacto = await rawFactor(id)
      expect(exacto).toBe('0.5000')
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('createUnit — R16: la derivacion, un solo nivel y por ambito', () => {
  it('acepta derivar de la propia empresa y de una unidad DE SISTEMA', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const propia = await seedUnit(`propia${marker}`, { companyId })
      const sistema = await seedUnit(`sistema${marker}`)
      seeded.units = [propia, sistema]

      const deLaPropia = await unidades.createUnit(
        {
          name: `Derivada de la propia ${marker}`,
          symbol: `p${marker.slice(0, 6)}`,
          baseUnitId: propia,
          factor: '10.0000',
        },
        actor,
      )
      const deSistema = await unidades.createUnit(
        {
          name: `Derivada de sistema ${marker}`,
          symbol: `s${marker.slice(0, 6)}`,
          baseUnitId: sistema,
          factor: '100.0000',
        },
        actor,
      )
      seeded.units = [...(seeded.units ?? []), deLaPropia.id, deSistema.id]

      const rows = await prisma.unit.findMany({
        where: { id: { in: [deLaPropia.id, deSistema.id] } },
        select: { id: true, baseUnitId: true },
      })
      expect(rows.find((row) => row.id === deLaPropia.id)?.baseUnitId).toBe(propia)
      expect(rows.find((row) => row.id === deSistema.id)?.baseUnitId).toBe(sistema)
    } finally {
      await cleanup(seeded)
    }
  })

  it('rechaza derivar de una unidad de OTRA empresa y de una unidad INEXISTENTE', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const otraEmpresa = await createCompany(`otra${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId, otraEmpresa], units: [] }

    try {
      const deOtraEmpresa = await seedUnit(`otra${marker}`, { companyId: otraEmpresa })
      seeded.units = [deOtraEmpresa]

      await expect(
        unidades.createUnit(
          { name: `Invalida A ${marker}`, baseUnitId: deOtraEmpresa, factor: '1.0000' },
          actor,
        ),
      ).rejects.toBeInstanceOf(InvalidDerivationError)

      await expect(
        unidades.createUnit(
          { name: `Invalida B ${marker}`, baseUnitId: randomUUID(), factor: '1.0000' },
          actor,
        ),
      ).rejects.toBeInstanceOf(InvalidDerivationError)

      // Ninguna de las dos escribio fila.
      const rows = await prisma.unit.findMany({
        where: {
          nameNormalized: { in: [`invalidaa${marker}`, `invalidab${marker}`] },
        },
        select: { id: true },
      })
      expect(rows).toEqual([])
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('updateUnit — R17: reemplazo completo, borra simbolo y borra la derivacion', () => {
  it('una edicion que borra el simbolo y la derivacion deja la unidad BASE', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const base = await seedUnit(`base${marker}`, { companyId })
      const { id } = await unidades.createUnit(
        {
          name: `Derivada ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: base,
          factor: '10.0000',
        },
        actor,
      )
      seeded.units = [base, id]

      await unidades.updateUnit(id, { name: `Derivada editada ${marker}` }, actor)

      const row = await prisma.unit.findUniqueOrThrow({
        where: { id },
        select: { symbol: true, baseUnitId: true, factor: true },
      })
      expect(row.symbol).toBeNull()
      expect(row.baseUnitId).toBeNull()
      expect(row.factor).toBeNull()
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('updateUnit — R19: la edicion NO cambia la empresa', () => {
  it('la fila conserva su company_id despues de editar', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id } = await unidades.createUnit({ name: `Original ${marker}` }, actor)
      seeded.units = [id]

      await unidades.updateUnit(
        id,
        { name: `Renombrada ${marker}`, symbol: `u${marker.slice(0, 8)}` },
        actor,
      )

      const row = await prisma.unit.findUniqueOrThrow({ where: { id }, select: { companyId: true } })
      expect(row.companyId).toBe(companyId)
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('updateUnit — R20: cambiar base y factor de una unidad ya en uso no toca lo guardado', () => {
  it('un producto y una linea de receta siguen intactos tras cambiar la base y el factor', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [], products: [], presentations: [], recipes: [], recipeLines: [] }

    try {
      const baseVieja = await seedUnit(`vieja${marker}`, { companyId })
      const baseNueva = await seedUnit(`nueva${marker}`, { companyId })
      seeded.units = [baseVieja, baseNueva]

      const { id: unitId } = await unidades.createUnit(
        {
          name: `En uso ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: baseVieja,
          factor: '1000.0000',
        },
        actor,
      )
      seeded.units = [...(seeded.units ?? []), unitId]

      const { productId, presentationId } = await createProduct(`prod${marker}`, unitId)
      seeded.products = [productId]
      seeded.presentations = [presentationId]

      const recipeId = await createRecipe(`rec${marker}`)
      seeded.recipes = [recipeId]
      const { productId: productoDeLaLinea, presentationId: presentacionDeLaLinea } =
        await createProduct(`linea${marker}`, null)
      seeded.products = [...(seeded.products ?? []), productoDeLaLinea]
      seeded.presentations = [...(seeded.presentations ?? []), presentacionDeLaLinea]
      const lineId = await createLine(recipeId, productoDeLaLinea, unitId, '3.5000')
      seeded.recipeLines = [lineId]

      // El cambio: nueva base, nuevo factor.
      await unidades.updateUnit(
        unitId,
        {
          name: `En uso editada ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: baseNueva,
          factor: '2000.0000',
        },
        actor,
      )

      const unit = await prisma.unit.findUniqueOrThrow({
        where: { id: unitId },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(baseNueva)
      expect(unit.factor?.toString()).toBe('2000')

      // El producto y la linea SIGUEN apuntando a la misma unidad, con sus cantidades intactas.
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(product.unitId).toBe(unitId)

      const line = await prisma.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      expect(line.unitId).toBe(unitId)
      expect(line.quantity.toString()).toBe('3.5')
    } finally {
      await cleanup(seeded)
    }
  })
})

describe('deleteUnit — R23: borrado FISICO, cero filas', () => {
  it('tras borrar, la unidad ya no existe', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id } = await unidades.createUnit({ name: `Para borrar ${marker}` }, actor)

      await unidades.deleteUnit(id, actor)

      const row = await prisma.unit.findUnique({ where: { id } })
      expect(row).toBeNull()
    } finally {
      // La unidad ya no existe: no hace falta -ni se puede- incluirla en `seeded.units`.
      await cleanup(seeded)
    }
  })
})

describe('deleteUnit — R24: bloqueado por uso, con UnitInUseError y las filas intactas', () => {
  it('rechaza borrar una unidad usada por un PRODUCTO, y la deja intacta', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [], products: [], presentations: [] }

    try {
      const { id: unitId } = await unidades.createUnit({ name: `Usada por producto ${marker}` }, actor)
      seeded.units = [unitId]

      const { productId, presentationId } = await createProduct(`prod${marker}`, unitId)
      seeded.products = [productId]
      seeded.presentations = [presentationId]

      await expect(unidades.deleteUnit(unitId, actor)).rejects.toBeInstanceOf(UnitInUseError)

      // Intactas: la unidad sigue ahi, y el producto sigue apuntandola.
      expect(await prisma.unit.findUnique({ where: { id: unitId } })).not.toBeNull()
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(product.unitId).toBe(unitId)
    } finally {
      await cleanup(seeded)
    }
  })

  it('rechaza borrar una unidad usada por una LINEA DE RECETA, y la deja intacta', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = {
      companies: [companyId],
      units: [],
      products: [],
      presentations: [],
      recipes: [],
      recipeLines: [],
    }

    try {
      const { id: unitId } = await unidades.createUnit({ name: `Usada por linea ${marker}` }, actor)
      seeded.units = [unitId]

      const { productId, presentationId } = await createProduct(`prod${marker}`, null)
      seeded.products = [productId]
      seeded.presentations = [presentationId]
      const recipeId = await createRecipe(`rec${marker}`)
      seeded.recipes = [recipeId]
      const lineId = await createLine(recipeId, productId, unitId)
      seeded.recipeLines = [lineId]

      await expect(unidades.deleteUnit(unitId, actor)).rejects.toBeInstanceOf(UnitInUseError)

      expect(await prisma.unit.findUnique({ where: { id: unitId } })).not.toBeNull()
      const line = await prisma.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true },
      })
      expect(line.unitId).toBe(unitId)
    } finally {
      await cleanup(seeded)
    }
  })

  it('rechaza borrar una unidad que es BASE de otra, y las deja intactas a las dos', async () => {
    const marker = token()
    const companyId = await createCompany(`comp${marker}`)
    const actor = actorFor(companyId)
    const seeded: Seeded = { companies: [companyId], units: [] }

    try {
      const { id: baseId } = await unidades.createUnit({ name: `Base con hija ${marker}` }, actor)
      seeded.units = [baseId]

      const { id: derivadaId } = await unidades.createUnit(
        {
          name: `Hija ${marker}`,
          symbol: `u${marker.slice(0, 8)}`,
          baseUnitId: baseId,
          factor: '10.0000',
        },
        actor,
      )
      seeded.units = [...(seeded.units ?? []), derivadaId]

      await expect(unidades.deleteUnit(baseId, actor)).rejects.toBeInstanceOf(UnitInUseError)

      expect(await prisma.unit.findUnique({ where: { id: baseId } })).not.toBeNull()
      const derivada = await prisma.unit.findUniqueOrThrow({
        where: { id: derivadaId },
        select: { baseUnitId: true },
      })
      expect(derivada.baseUnitId).toBe(baseId)
    } finally {
      await cleanup(seeded)
    }
  })
})
