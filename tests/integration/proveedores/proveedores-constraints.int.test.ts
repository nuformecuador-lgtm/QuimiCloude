/**
 * Tests de integracion de QC-42 (modelo-proveedores) contra una base Postgres REAL, con la
 * migracion `20260903131417_suppliers_and_supplier_catalog_lines` aplicada.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila
 * escrita por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un
 * cliente `pg` aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app
 * (Prisma es el unico camino) y porque `$executeRaw` dentro de la misma transaccion
 * reutiliza la conexion, asi que el SQL crudo comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en
 * total»: cada test mira solo las filas que el mismo sembro, localizadas por su `id` o
 * por un marcador irrepetible.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — las referencias que cruzan de modulo
 * (`supplier_catalog_lines.presentation_id` -> `presentations`, `.unit_id` -> `units`, y
 * `created_by` / `updated_by` -> `users` en las dos tablas) son FK REALES aunque el esquema
 * Prisma las declare como escalares sin `@relation` (QC-52 R30). Por eso cada caso crea
 * dentro de su propia transaccion el tipo de documento, el rol, el usuario y la
 * presentacion que necesita: no se depende del seed ni del orden de los archivos.
 *
 * ACTUALIZADO POR QC-52 (`design.md > 2`). Lo que cambio en este archivo, y con que regla:
 *   - la linea ya no referencia ningun articulo del inventario (R9): donde habia
 *     `product_id` ahora hay `name` + `presentation_id`, que es su identidad nueva.
 *   - QC-42 R11 -unicidad por la pareja proveedor-articulo- la sustituye R15: la terna
 *     `(supplier_id, name_normalized, presentation_id)` sobre las lineas VIVAS.
 *   - QC-42 R28 -«quitar una linea del catalogo ELIMINA la fila, y la tabla no tiene
 *     `deleted_at`»- queda DEROGADA por la decision cerrada 5 y por R21: la baja es logica.
 *     El caso esta invertido, no borrado.
 *   - QC-42 R31 -el `RESTRICT` que impedia borrar un articulo con lineas- queda derogada
 *     por R19: esa FK se fue con la columna. El caso vive ahora en
 *     `catalog-line.int.test.ts`, escrito al reves.
 *   - el censo de FK de la tabla gana `presentation_id` y `unit_id` y pierde `product_id`.
 *
 * RLS — QC-52 R26 exige que siga HABILITADA y FORZADA en las dos tablas despues de la
 * migracion, y eso SI se puede comprobar leyendo `pg_class` (es una lectura de metadatos,
 * no un intento de saltarse la politica). Lo que sigue sin poder probarse con Prisma es que
 * las policies FILTREN: Prisma se conecta como dueno de las tablas.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * requisitos exigen comprobar el estado DESPUES del rechazo («no crear ninguna fila»).
 * Por eso toda operacion que se espera que falle se envuelve en un `SAVEPOINT` y se
 * deshace con `ROLLBACK TO SAVEPOINT`, que deja la transaccion viva y permite seguir
 * consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con
 * `$executeRaw`, por dos motivos: (1) omitir una columna obligatoria no se puede
 * expresar con la API tipada de Prisma (no compilaria), y (2) solo el raw propaga el
 * SQLSTATE de Postgres en `meta.code`. La API tipada lo traduce a su propio codigo
 * (`P2002`, `P2003`…) y el SQLSTATE se pierde. Se afirma sobre el SQLSTATE y NUNCA sobre
 * el texto: en esta maquina Postgres responde en espanol. Los caminos felices y las
 * lecturas si van con la API tipada, que es el camino real de la app.
 *
 * DECIMALES — `cost` y `minPurchase` se manejan siempre como `Prisma.Decimal` y se
 * comparan con `.toString()` / `.equals()`, o contra el texto de la propia base.
 * Convertirlos a `number` reintroduciria la coma flotante binaria que
 * `docs/architecture.md > Dominio` n.o 4 prohibe.
 *
 * NOMBRE NORMALIZADO — `name_normalized` se escribe LITERAL en cada caso, sin llamar a
 * `normalizeSupplierName`. Lo que aqui se prueba es el indice unico parcial de la base
 * (R7, R9); el algoritmo lo prueba `tests/unit/proveedores/domain/supplier-name.test.ts`.
 *
 * Requisitos de QC-52 cubiertos: R8, R10, R11, R15, R16, R17, R19, R20, R21, R22, R26,
 * R30. Los de QC-42 que este archivo ya cubria siguen cubiertos salvo los tres derogados
 * arriba.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Utilidades de aislamiento
// ---------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** Ejecuta el cuerpo del test en una transaccion que SIEMPRE termina en ROLLBACK. */
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

let savepointSeq = 0

/** SQLSTATE de Postgres relevantes aqui. Son estables y NO dependen del idioma. */
const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test
 * afirma sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el
 * efecto, y cada caso se construye para que solo una restriccion pueda dispararlo.
 */
function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code
      if (typeof code === 'string') return code
    }
    return error.code
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Corre `run` esperando que la base lo rechace. Devuelve el SQLSTATE para que el test
 * afirme sobre el tipo exacto de violacion, y deja la transaccion utilizable.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return sqlStateOf(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

// ---------------------------------------------------------------------------
// Datos de apoyo — las FK son reales, asi que cada caso siembra las suyas
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Crea un usuario completo con su tipo de documento y su rol propios. Los nombres y
 * codigos se aleatorizan porque `roles.name` es unico global y `users` tiene indices
 * unicos parciales sobre correo, nombre de usuario y documento (QC-4).
 */
async function createUser(tx: Prisma.TransactionClient): Promise<string> {
  const marker = token()
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  // Empresa efimera propia de este fixture: QC-47 R9 hizo `users.company_id` obligatoria, asi
  // que ningun usuario se puede crear ya sin una. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName` -la UNICA definicion de «mismo
  // nombre de empresa» (R3), importada del contrato publico de `identity`-, nunca de una copia
  // escrita a mano aqui.
  const companyName = `Empresa ${marker}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  })
  return user.id
}

/**
 * Presentacion propia. `presentations.name_normalized` es NOT NULL con INDICE UNICO
 * (QC-20), asi que se marca con `token()`: este helper se llama varias veces dentro de la
 * misma transaccion.
 *
 * Desde QC-52 es la FK que la linea necesita para existir (R10): `presentation_id` es
 * OBLIGATORIA porque forma parte de su identidad.
 */
/**
 * Empresa del ANDAMIAJE de inventario (QC-49 R1).
 *
 * `products.company_id` y `presentations.company_id` son NOT NULL desde
 * `<ts>_inventory_company_scope`, asi que sembrar cualquiera de las dos exige una empresa. Se
 * REUTILIZA una que ya existe en la base (`db:seed` deja la de instalacion) en vez de crear una
 * nueva: parte de lo que siembra este archivo se limpia a mano, y una empresa creada aqui
 * quedaria de residuo.
 *
 * Aqui la empresa es ANDAMIAJE y nada mas: este archivo no prueba el aislamiento por empresa
 * --eso es `tests/integration/inventario/company-scope.int.test.ts`-- y ningun aserto suyo
 * depende de cual sea. La unidad de estas presentaciones es DE SISTEMA, que vale para cualquier
 * empresa (QC-76 R11), asi que `presentations_check_unit_scope` la acepta (QC-49 R23).
 */
async function andamiajeCompanyId(tx: Prisma.TransactionClient): Promise<string> {
  const company = await tx.company.findFirstOrThrow({ select: { id: true } })
  return company.id
}

async function createPresentation(tx: Prisma.TransactionClient): Promise<string> {
  const marca = token()
  const presentation = await tx.presentation.create({
    data: {
      name: `Bidon 20 L ${marca}`,
      nameNormalized: `bidon20l${marca}`,
      unitId: await unidadDeSistema(tx),
      companyId: await andamiajeCompanyId(tx),
    },
    select: { id: true },
  })
  return presentation.id
}

/**
 * QC-80 (R1): `presentations.unit_id` es NOT NULL con FK a `units`, asi que toda
 * presentacion de apoyo necesita una unidad REAL. Se resuelve la unidad de sistema
 * `kilogramo` POR SU NOMBRE NORMALIZADO -nunca por un uuid escrito a mano: los
 * identificadores los genera `gen_random_uuid()` y son distintos en cada base-, que es
 * exactamente como la busca el relleno de la migracion. Ningun test de este archivo
 * afirma nada sobre la unidad de la presentacion: es solo lo que la columna exige.
 */
async function unidadDeSistema(db: Prisma.TransactionClient): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  })
  return unit.id
}

/** Unidad propia: `unit_id` es la otra FK que QC-52 anade a la linea (R30). */
async function createUnit(tx: Prisma.TransactionClient): Promise<string> {
  const marca = token()
  const unit = await tx.unit.create({
    // ACTUALIZADO EL 2026-09-08 POR QC-76 (R15, decision cerrada 28): el simbolo pasa a ser
    // UNICO dentro del ambito cuando existe. Esta unidad se siembra SIN empresa —o sea DE
    // SISTEMA—, asi que un `'ut'` fijo choca con `23505` en cuanto este helper se llama dos
    // veces. Se deriva del marcador irrepetible, que es lo que ya se hacia con el nombre.
    // Ningun aserto lee su valor.
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `ut${marca}` },
    select: { id: true },
  })
  return unit.id
}

// AUSENCIA DELIBERADA — este archivo ya no tiene ningun helper que cree un articulo del
// inventario, y esa ausencia ES el requisito (R9, R18, decision cerrada 3). La linea del
// catalogo no lo necesita para existir, asi que sembrarlo aqui seria arrastrar una
// dependencia que la ficha vino a cortar. Que dar de baja un articulo no altere ninguna
// linea, y que ninguna linea impida darlo de baja, se prueba en
// `tests/integration/proveedores/catalog-line.int.test.ts` (R19), que es donde el caso
// tiene sentido: alli se ejercita el adaptador real.

interface SupplierSeed {
  readonly name: string
  readonly nameNormalized: string
  readonly phone?: string | null
  readonly email?: string | null
  readonly createdBy?: string | null
  readonly updatedBy?: string | null
  /** Por defecto, la empresa de andamiaje comun del archivo. Un caso que compare DOS
   *  empresas -mismo nombre, empresas distintas- la pasa explicita. */
  readonly companyId?: string
}

/**
 * Crea un proveedor vivo. `nameNormalized` se pasa siempre a mano (ver cabecera): aqui
 * se prueba el indice de la base, no el algoritmo de normalizacion. Por defecto trae
 * telefono para satisfacer el CHECK de contacto sin que cada caso tenga que repetirlo.
 */
async function createSupplier(tx: Prisma.TransactionClient, seed: SupplierSeed): Promise<string> {
  const supplier = await tx.supplier.create({
    data: {
      name: seed.name,
      nameNormalized: seed.nameNormalized,
      phone: seed.phone === undefined ? '+57 300 555 0000' : seed.phone,
      email: seed.email ?? null,
      createdBy: seed.createdBy ?? null,
      updatedBy: seed.updatedBy ?? null,
      companyId: seed.companyId ?? (await andamiajeCompanyId(tx)),
    },
    select: { id: true },
  })
  return supplier.id
}

/**
 * Crea una linea de catalogo con la API tipada. Devuelve el id para poder releerla.
 *
 * `name` se marca con `token()` por defecto para que dos llamadas seguidas dentro de la
 * misma transaccion no choquen contra el indice unico parcial de R15; el caso que SI quiere
 * el choque pasa el nombre a mano. `nameNormalized` se escribe LITERAL a partir del nombre,
 * sin llamar a `normalizeSupplierName`: lo que aqui se prueba es el indice de la base, no
 * el algoritmo (ver la cabecera).
 */
async function createLine(
  tx: Prisma.TransactionClient,
  supplierId: string,
  presentationId: string,
  cost: string,
  extra: {
    minPurchase?: string
    deliveryTime?: number
    name?: string
    unitId?: string
    imagePath?: string
  } = {},
): Promise<string> {
  const name = extra.name ?? `Insumo ${token()}`
  const line = await tx.supplierCatalogLine.create({
    data: {
      supplierId,
      companyId: await andamiajeCompanyId(tx),
      name,
      nameNormalized: name.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      presentationId,
      unitId: extra.unitId ?? null,
      imagePath: extra.imagePath ?? null,
      cost: new Prisma.Decimal(cost),
      minPurchase: extra.minPurchase === undefined ? null : new Prisma.Decimal(extra.minPurchase),
      deliveryTime: extra.deliveryTime ?? null,
    },
    select: { id: true },
  })
  return line.id
}

/**
 * Las tres columnas que un `INSERT` crudo en `supplier_catalog_lines` NO puede omitir desde
 * QC-52: `name` y `name_normalized` son NOT NULL sin DEFAULT y `presentation_id` es NOT NULL
 * (R8, R10). Se agrupan aqui para que ningun caso las olvide y confunda un 23502 con el
 * rechazo que de verdad esta probando.
 */
function lineaMinima(
  presentationId: string,
  name = `Insumo ${token()}`,
): { name: Prisma.Sql; name_normalized: Prisma.Sql; presentation_id: Prisma.Sql } {
  return {
    name: Prisma.sql`${name}`,
    name_normalized: Prisma.sql`${name.toLowerCase().replace(/[^a-z0-9]/gu, '')}`,
    presentation_id: asUuid(presentationId),
  }
}

/** Columnas que un alta cruda puede escribir en una de las dos tablas de la feature. */
type WritableColumn =
  | 'name'
  | 'name_normalized'
  | 'phone'
  | 'email'
  | 'company_id'
  | 'created_by'
  | 'updated_by'
  | 'supplier_id'
  | 'presentation_id'
  | 'unit_id'
  | 'image_path'
  | 'deleted_at'
  | 'cost'
  | 'min_purchase'
  | 'delivery_time'

/**
 * `INSERT` crudo. `columns` decide que se escribe: omitir una entrada es exactamente el
 * caso «falta un dato obligatorio», que la API tipada de Prisma no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL sin DEFAULT (lo rellena el cliente
 * Prisma via `@updatedAt`, no la base).
 */
function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'suppliers' | 'supplier_catalog_lines',
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  // `company_id` es NOT NULL en las dos tablas de esta feature y ningun caso de este
  // archivo prueba SU ausencia -eso vive en `company-scope.int.test.ts`-, asi que se anade
  // aqui, no en cada llamada: lo contrario obligaria a los treinta casos existentes a
  // repetirlo.
  if (!('company_id' in columns)) {
    names.push(Prisma.raw('"company_id"'))
    values.push(asUuid(companyId))
  }

  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  const target = Prisma.raw(`"${table}"`)
  return tx.$executeRaw`INSERT INTO ${target} (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/** Valor SQL de un uuid: el parametro llega como texto y hay que castearlo. */
function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

interface ColumnInfo {
  readonly column_name: string
  readonly data_type: string
  readonly is_nullable: string
  readonly numeric_precision: number | bigint | null
  readonly numeric_scale: number | bigint | null
}

/** Forma REAL de unas columnas segun `information_schema`, no segun el esquema Prisma. */
function columnInfo(
  tx: Prisma.TransactionClient,
  table: string,
  columns: readonly string[],
): Promise<ColumnInfo[]> {
  return tx.$queryRaw<ColumnInfo[]>`
    SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name IN (${Prisma.join([...columns])})
    ORDER BY column_name`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

/** Empresa unica del archivo: `suppliers.company_id` y `supplier_catalog_lines.company_id`
 *  son NOT NULL desde esta ficha. Ningun caso de este archivo compara empresas entre si. */
let companyId: string

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('suppliers', 'supplier_catalog_lines')`
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-42 (suppliers y ' +
        'supplier_catalog_lines). Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }

  companyId = await andamiajeCompanyId(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('estructura del proveedor', () => {
  it('crea un proveedor con id, nombre, telefono y correo, y lo relee sin perdida (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const created = await tx.supplier.create({
        data: {
          name: `Quimicos del Pacifico ${marker}`,
          nameNormalized: `quimicosdelpacifico${marker}`,
          phone: '+57 300 111 2233',
          email: `contacto.${marker}@proveedor.test`,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      expect(created.id).toMatch(UUID_SHAPE)

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: created.id } })
      expect(supplier.name).toBe(`Quimicos del Pacifico ${marker}`)
      expect(supplier.nameNormalized).toBe(`quimicosdelpacifico${marker}`)
      expect(supplier.phone).toBe('+57 300 111 2233')
      expect(supplier.email).toBe(`contacto.${marker}@proveedor.test`)
      expect(supplier.deletedAt).toBeNull()
    })
  })

  it('rechaza un proveedor sin nombre con SQLSTATE 23502 (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name_normalized: Prisma.sql`${marker}`,
            phone: Prisma.sql`${'+57 300 000 0000'}`,
          }),
        'proveedor sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      const survivors = await tx.supplier.findMany({
        where: { nameNormalized: marker },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta proveedor solo con telefono y proveedor solo con correo (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const soloTelefono = await tx.supplier.create({
        data: {
          name: `Solo telefono ${marker}`,
          nameNormalized: `solotelefono${marker}`,
          phone: '+57 300 222 3344',
          email: null,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      const soloCorreo = await tx.supplier.create({
        data: {
          name: `Solo correo ${marker}`,
          nameNormalized: `solocorreo${marker}`,
          phone: null,
          email: `solo.${marker}@proveedor.test`,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })

      const first = await tx.supplier.findUniqueOrThrow({ where: { id: soloTelefono.id } })
      expect(first.phone).toBe('+57 300 222 3344')
      expect(first.email).toBeNull()

      const second = await tx.supplier.findUniqueOrThrow({ where: { id: soloCorreo.id } })
      expect(second.phone).toBeNull()
      expect(second.email).toBe(`solo.${marker}@proveedor.test`)
    })
  })

  it('la regla cruzada «al menos telefono o correo», los cinco casos de R4', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // (a) con telefono sin correo -> acepta
      const conTelefono = await tx.supplier.create({
        data: {
          name: `Con telefono ${marker}`,
          nameNormalized: `contelefono${marker}`,
          phone: '+57 300 333 4455',
          email: null,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      expect(conTelefono.id).toMatch(UUID_SHAPE)

      // (b) con correo sin telefono -> acepta
      const conCorreo = await tx.supplier.create({
        data: {
          name: `Con correo ${marker}`,
          nameNormalized: `concorreo${marker}`,
          phone: null,
          email: `con.${marker}@proveedor.test`,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      expect(conCorreo.id).toMatch(UUID_SHAPE)

      // (c) con los dos -> acepta
      const conLosDos = await tx.supplier.create({
        data: {
          name: `Con los dos ${marker}`,
          nameNormalized: `conlosdos${marker}`,
          phone: '+57 300 444 5566',
          email: `dos.${marker}@proveedor.test`,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      expect(conLosDos.id).toMatch(UUID_SHAPE)

      // (d) sin ninguno -> rechaza con 23514, en INSERT
      const insertSinNinguno = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Sin ninguno ${marker}`}`,
            name_normalized: Prisma.sql`${`sinninguno${marker}`}`,
          }),
        'proveedor sin telefono ni correo',
      )
      expect(insertSinNinguno).toBe(CHECK_VIOLATION)

      const survivors = await tx.supplier.findMany({
        where: { nameNormalized: `sinninguno${marker}` },
        select: { id: true },
      })
      expect(survivors).toEqual([])

      // (e) UPDATE que deja al proveedor sin ninguno de los dos -> rechaza con 23514
      const paraActualizar = await tx.supplier.create({
        data: {
          name: `Para actualizar ${marker}`,
          nameNormalized: `paraactualizar${marker}`,
          phone: '+57 300 555 6677',
          email: null,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      const updateSinNinguno = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "suppliers" SET "phone" = NULL WHERE "id" = ${asUuid(paraActualizar.id)}`,
        'update que deja al proveedor sin telefono ni correo',
      )
      expect(updateSinNinguno).toBe(CHECK_VIOLATION)

      // Y la fila conserva el telefono que tenia antes del intento fallido.
      const afterReject = await tx.supplier.findUniqueOrThrow({
        where: { id: paraActualizar.id },
        select: { phone: true },
      })
      expect(afterReject.phone).toBe('+57 300 555 6677')
    })
  })

  it('acepta un nombre de 500 caracteres y un correo de 500 caracteres (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      const emailLocalPart = 'b'.repeat(500 - '@proveedor.test'.length - marker.length)
      const email = `${marker}${emailLocalPart}@proveedor.test`
      expect(name).toHaveLength(500)
      expect(email).toHaveLength(500)

      const { id } = await tx.supplier.create({
        data: {
          name,
          nameNormalized: name,
          phone: '+57 300 666 7788',
          email,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id } })
      expect(supplier.name).toBe(name)
      expect(supplier.email).toBe(email)

      const columns = await columnInfo(tx, 'suppliers', ['name', 'email'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['email', 'text'],
        ['name', 'text'],
      ])
    })
  })

  it('dos proveedores vivos comparten el mismo telefono y correo, y un correo sin forma se acepta (R6)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const sharedPhone = '+57 300 777 8899'
      const sharedEmail = `compartido.${marker}@proveedor.test`

      const first = await tx.supplier.create({
        data: {
          name: `Primero ${marker}`,
          nameNormalized: `primero${marker}`,
          phone: sharedPhone,
          email: sharedEmail,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      const second = await tx.supplier.create({
        data: {
          name: `Segundo ${marker}`,
          nameNormalized: `segundo${marker}`,
          phone: sharedPhone,
          email: sharedEmail,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      expect(first.id).not.toBe(second.id)

      // No hay validacion de formato de correo en la base (decision 9).
      const conCorreoRaro = await tx.supplier.create({
        data: {
          name: `Correo raro ${marker}`,
          nameNormalized: `correoraro${marker}`,
          phone: null,
          email: `no-es-un-correo-${marker}`,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      const raro = await tx.supplier.findUniqueOrThrow({ where: { id: conCorreoRaro.id } })
      expect(raro.email).toBe(`no-es-un-correo-${marker}`)

      // Y no hay indice unico sobre telefono ni correo.
      const uniqueIndexes = await tx.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'suppliers'
          AND (indexdef LIKE '%phone%' OR indexdef LIKE '%email%')`
      expect(uniqueIndexes).toEqual([])
    })
  })
})

describe('unicidad del nombre del proveedor', () => {
  it('rechaza un segundo proveedor con el mismo nombre normalizado que otro proveedor VIVO (R7)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `quimicosunidos${marker}`

      const firstId = await createSupplier(tx, {
        name: `Quimicos Unidos ${marker}`,
        nameNormalized: normalized,
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`quimicos-unidos-${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            phone: Prisma.sql`${'+57 300 888 9900'}`,
          }),
        'segundo proveedor con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const rows = await tx.supplier.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      })
      expect(rows).toEqual([{ id: firstId }])
    })
  })

  it('tras dar de baja un proveedor, otro puede usar su mismo nombre normalizado (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `disolventesandinos${marker}`

      const firstId = await createSupplier(tx, {
        name: `Disolventes Andinos ${marker}`,
        nameNormalized: normalized,
      })
      await tx.supplier.update({ where: { id: firstId }, data: { deletedAt: new Date() } })

      const secondId = await createSupplier(tx, {
        name: `Disolventes Andinos ${marker}`,
        nameNormalized: normalized,
      })

      const rows = await tx.supplier.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, deletedAt: true },
      })
      expect(rows).toHaveLength(2)
      expect(rows.filter((row) => row.deletedAt === null).map((row) => row.id)).toEqual([secondId])
    })
  })
})

describe('auditoria, baja y marcas de tiempo del proveedor', () => {
  it('la baja conserva la fila completa y marca deleted_at (R26)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)

      const { id } = await tx.supplier.create({
        data: {
          name: `Proveedor a dar de baja ${marker}`,
          nameNormalized: marker,
          phone: '+57 300 999 0011',
          email: `baja.${marker}@proveedor.test`,
          createdBy: autor,
          updatedBy: autor,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })

      const antes = new Date()
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } })

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id } })
      expect(supplier.deletedAt).toBeInstanceOf(Date)
      expect(supplier.deletedAt?.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000)
      expect(supplier.name).toBe(`Proveedor a dar de baja ${marker}`)
      expect(supplier.phone).toBe('+57 300 999 0011')
      expect(supplier.email).toBe(`baja.${marker}@proveedor.test`)
      expect(supplier.createdBy).toBe(autor)
      expect(supplier.updatedBy).toBe(autor)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas (R27)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)
      const lineId = await createLine(tx, supplierId, presentationId, '10.0000')

      const supplierAntes = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineAntes = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })
      expect(supplierAntes.createdAt).toBeInstanceOf(Date)
      expect(lineAntes.createdAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.supplier.update({ where: { id: supplierId }, data: { phone: '+57 300 111 2200' } })
      await tx.supplierCatalogLine.update({
        where: { id: lineId },
        data: { cost: new Prisma.Decimal('11.0000') },
      })

      const supplierDespues = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineDespues = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })

      expect(supplierDespues.createdAt.getTime()).toBe(supplierAntes.createdAt.getTime())
      expect(supplierDespues.updatedAt.getTime()).toBeGreaterThan(supplierAntes.updatedAt.getTime())
      expect(lineDespues.createdAt.getTime()).toBe(lineAntes.createdAt.getTime())
      expect(lineDespues.updatedAt.getTime()).toBeGreaterThan(lineAntes.updatedAt.getTime())
    })
  })

  it('registra autor y editor, acepta un proveedor sin autor, y rechaza un autor inexistente con 23503 (R24)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)
      const editor = await createUser(tx)

      const { id } = await tx.supplier.create({
        data: {
          name: `Con autoria ${marker}`,
          nameNormalized: `conautoria${marker}`,
          phone: '+57 300 222 3300',
          createdBy: autor,
          updatedBy: autor,
          companyId: await andamiajeCompanyId(tx),
        },
        select: { id: true },
      })
      await tx.supplier.update({ where: { id }, data: { updatedBy: editor } })

      const supplier = await tx.supplier.findUniqueOrThrow({
        where: { id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(supplier.createdBy).toBe(autor)
      expect(supplier.updatedBy).toBe(editor)

      // Proveedor sin autor (createdBy/updatedBy NULL).
      const sinAutor = await createSupplier(tx, {
        name: `Sin autor ${marker}`,
        nameNormalized: `sinautor${marker}`,
      })
      const sinAutorRow = await tx.supplier.findUniqueOrThrow({
        where: { id: sinAutor },
        select: { createdBy: true, updatedBy: true },
      })
      expect(sinAutorRow.createdBy).toBeNull()
      expect(sinAutorRow.updatedBy).toBeNull()

      // Autor inexistente -> 23503.
      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Con autor fantasma ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasma${marker}`}`,
            phone: Prisma.sql`${'+57 300 333 4400'}`,
            created_by: asUuid(randomUUID()),
          }),
        'alta de proveedor con autor inexistente',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('estructura de la linea de catalogo', () => {
  it('la linea tiene EXACTAMENTE las columnas de R8, y no tiene existencia, alerta ni referencia a un articulo', async () => {
    // QC-52 R8, sobre `information_schema`: es el censo de la tabla DESPUES de la
    // migracion, y por eso se lee de la base y no del esquema Prisma -que es lo que la
    // migracion podria haber dejado desincronizado-.
    //
    // La mitad NEGATIVA es la que vale: `stock` y `qty_alert` NO estan -cuanto tienes es
    // tuyo, no del proveedor (decision cerrada 2)- y `product_id` tampoco (R9). Un
    // `toEqual` completo, no tres `not.toContain`: asi tampoco puede entrar una columna que
    // nadie ha decidido.
    await inRolledBackTransaction(async (tx) => {
      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supplier_catalog_lines'
        ORDER BY column_name`
      expect(columnas.map((c) => c.column_name)).toEqual([
        'cost',
        'created_at',
        'created_by',
        'deleted_at',
        'delivery_time',
        'id',
        'image_path',
        'min_purchase',
        'name',
        'name_normalized',
        'presentation_id',
        'supplier_id',
        'unit_id',
        'updated_at',
        'updated_by',
      ])
    })
  })

  it('crea una linea con nombre, presentacion, unidad, imagen, costo, minimo y plazo, y la relee (R8, R10)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)
      const unitId = await createUnit(tx)

      const lineId = await createLine(tx, supplierId, presentationId, '125.5000', {
        name: 'Acido citrico',
        unitId,
        imagePath: 'catalogo/acido.png',
        minPurchase: '10.0000',
        deliveryTime: 5,
      })

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.id).toMatch(UUID_SHAPE)
      expect(line.supplierId).toBe(supplierId)
      expect(line.name).toBe('Acido citrico')
      expect(line.nameNormalized).toBe('acidocitrico')
      expect(line.presentationId).toBe(presentationId)
      expect(line.unitId).toBe(unitId)
      expect(line.imagePath).toBe('catalogo/acido.png')
      expect(line.cost.equals(new Prisma.Decimal('125.5'))).toBe(true)
      expect(line.minPurchase?.equals(new Prisma.Decimal('10'))).toBe(true)
      expect(line.deliveryTime).toBe(5)
      expect(line.createdAt).toBeInstanceOf(Date)
      expect(line.updatedAt).toBeInstanceOf(Date)
      // R21: nace VIVA. La marca de baja existe como columna y empieza en nulo.
      expect(line.deletedAt).toBeNull()
    })
  })

  it('rechaza con 23502 la linea sin nombre, sin nombre normalizado o sin presentacion (R8, R10)', async () => {
    // Las tres columnas son NOT NULL SIN DEFAULT, y eso es deliberado: un `DEFAULT ''`
    // convertiria «esta linea no tiene nombre» en un valor valido. Omitir una columna
    // obligatoria no se puede expresar con la API tipada, asi que va con SQL crudo.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)
      const completa = lineaMinima(presentationId)

      for (const omitida of ['name', 'name_normalized', 'presentation_id'] as const) {
        const columnas = { ...completa }
        delete columnas[omitida]
        const sqlState = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsert(tx, 'supplier_catalog_lines', {
              supplier_id: asUuid(supplierId),
              ...columnas,
              cost: Prisma.sql`10.0000`,
            }),
          `linea sin ${omitida}`,
        )
        expect(sqlState, `la linea sin ${omitida} deberia caer`).toBe(NOT_NULL_VIOLATION)
      }

      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(0)
    })
  })

  it('rechaza con 23505 la segunda linea VIVA con el mismo nombre normalizado y presentacion (QC-52 R15)', async () => {
    // SUSTITUYE a QC-42 R11, que fijaba la unicidad por la pareja proveedor-articulo. Esa
    // pareja desaparecio con la columna (R9) y la identidad de la linea pasa a ser la terna
    // `(supplier_id, name_normalized, presentation_id)` sobre las lineas VIVAS.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const firstLine = await createLine(tx, supplierId, presentationId, '50.0000', {
        name: 'Acido citrico',
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            // Nombre distinto, forma normalizada IDENTICA: es lo que hace util persistir la
            // columna normalizada en vez de comparar el nombre tal cual.
            ...lineaMinima(presentationId, 'ACIDO CITRICO'),
            name_normalized: Prisma.sql`${'acidocitrico'}`,
            cost: Prisma.sql`60.0000`,
          }),
        'segunda linea viva con el mismo nombre normalizado y presentacion',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const lines = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { id: true },
      })
      expect(lines).toEqual([{ id: firstLine }])
    })
  })

  it('una linea dada de baja libera su combinacion, porque el indice es PARCIAL (QC-52 R17)', async () => {
    // El indice de QC-43 era TOTAL. Este es `WHERE deleted_at IS NULL`, y esa diferencia ES
    // el requisito: sin ella, una linea dada de baja ocuparia su nombre para siempre y no
    // habria forma de volver a darla de alta.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const vieja = await createLine(tx, supplierId, presentationId, '50.0000', {
        name: 'Acido citrico',
      })
      await tx.supplierCatalogLine.update({
        where: { id: vieja },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      })

      // Ahora la misma combinacion vuelve a estar libre...
      const nueva = await createLine(tx, supplierId, presentationId, '77.0000', {
        name: 'Acido citrico',
      })

      // ...y la fila vieja SIGUE AHI (R21): nada se borro.
      const filas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { id: true, deletedAt: true },
        orderBy: { cost: 'asc' },
      })
      expect(filas.map((f) => f.id).sort()).toEqual([vieja, nueva].sort())
      expect(filas.filter((f) => f.deletedAt === null)).toHaveLength(1)

      // Y la garantia sigue viva para las VIVAS: una tercera choca.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Acido citrico'),
            cost: Prisma.sql`88.0000`,
          }),
        'tercera linea viva con la combinacion ya ocupada',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)
    })
  })

  it('acepta muchas lineas por proveedor, el mismo nombre en dos presentaciones y la misma linea en dos proveedores (QC-52 R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierA = await createSupplier(tx, { name: `Proveedor A ${marker}`, nameNormalized: `a${marker}` })
      const supplierB = await createSupplier(tx, { name: `Proveedor B ${marker}`, nameNormalized: `b${marker}` })

      const bidon = await createPresentation(tx)
      const tambor = await createPresentation(tx)

      // Un mismo proveedor con el MISMO nombre en dos presentaciones distintas y con
      // precios distintos: es el ejemplo literal de la decision cerrada 4.
      await createLine(tx, supplierA, bidon, '10.0000', { name: 'Hidroxido de sodio' })
      await createLine(tx, supplierA, tambor, '85.0000', { name: 'Hidroxido de sodio' })
      await createLine(tx, supplierA, bidon, '5.0000', { name: 'Colorante azul' })
      const lineB = await createLine(tx, supplierB, bidon, '15.0000', { name: 'Hidroxido de sodio' })

      const linesOfA = await tx.supplierCatalogLine.findMany({
        where: { supplierId: supplierA },
        select: { nameNormalized: true, presentationId: true, cost: true },
        orderBy: { cost: 'asc' },
      })
      expect(linesOfA).toHaveLength(3)
      expect(
        linesOfA
          .filter((line) => line.nameNormalized === 'hidroxidodesodio')
          .map((line) => line.cost.toString()),
      ).toEqual(['10', '85'])

      const lineBRow = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineB } })
      expect(lineBRow.cost.toString()).toBe('15')

      // Y DOS proveedores distintos con la misma linea -mismo nombre, misma presentacion-:
      // la otra mitad de R16, que sale de tener `supplier_id` en la clave del indice.
      const mismaLinea = await tx.supplierCatalogLine.findMany({
        where: { nameNormalized: 'hidroxidodesodio', presentationId: bidon },
        select: { supplierId: true },
      })
      expect(mismaLinea.map((line) => line.supplierId).sort()).toEqual([supplierA, supplierB].sort())
    })
  })

  it('una linea sin minimo y sin plazo queda con NULL, no con cero (R13)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const lineId = await createLine(tx, supplierId, presentationId, '30.0000')

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.minPurchase).toBeNull()
      expect(line.deliveryTime).toBeNull()
      // QC-52 R10: la unidad y la imagen tambien son opcionales y quedan en NULL, no en
      // cadena vacia. Y la marca de baja nace nula (R21).
      expect(line.unitId).toBeNull()
      expect(line.imagePath).toBeNull()
      expect(line.deletedAt).toBeNull()

      const shape = await tx.$queryRaw<{ sin_min: boolean; sin_plazo: boolean }[]>`
        SELECT ("min_purchase" IS NULL) AS sin_min, ("delivery_time" IS NULL) AS sin_plazo
        FROM "supplier_catalog_lines" WHERE "id" = ${asUuid(lineId)}`
      expect(shape).toEqual([{ sin_min: true, sin_plazo: true }])
    })
  })

  it('el costo y el minimo conservan cuatro decimales exactos, columna numeric(14,4) (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const grande = await createLine(tx, supplierId, presentationId, '1234567890.1234', {
        name: 'Linea grande',
        minPurchase: '1234567890.1234',
      })
      const minimo = await createLine(tx, supplierId, presentationId, '0.0001', {
        name: 'Linea minima',
        minPurchase: '0.0001',
      })

      const lines = await tx.supplierCatalogLine.findMany({
        where: { id: { in: [grande, minimo] } },
        select: { id: true, cost: true, minPurchase: true },
      })
      const byId = new Map(lines.map((line) => [line.id, line]))
      expect(byId.get(grande)?.cost.toString()).toBe('1234567890.1234')
      expect(byId.get(grande)?.minPurchase?.toString()).toBe('1234567890.1234')
      expect(byId.get(minimo)?.cost.toString()).toBe('0.0001')
      expect(byId.get(minimo)?.minPurchase?.toString()).toBe('0.0001')

      const asText = await tx.$queryRaw<{ id: string; costo: string }[]>`
        SELECT "id"::text AS id, "cost"::text AS costo
        FROM "supplier_catalog_lines" WHERE "id" IN (${asUuid(grande)}, ${asUuid(minimo)})
        ORDER BY "cost" DESC`
      expect(asText.map((row) => row.costo)).toEqual(['1234567890.1234', '0.0001'])

      const columns = await columnInfo(tx, 'supplier_catalog_lines', ['cost', 'min_purchase'])
      expect(columns).toHaveLength(2)
      for (const column of columns) {
        expect(column.data_type).toBe('numeric')
        expect(Number(column.numeric_precision)).toBe(14)
        expect(Number(column.numeric_scale)).toBe(4)
      }
    })
  })

  it('acepta un minimo de compra de 2,5 y lo devuelve sin redondear (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const lineId = await createLine(tx, supplierId, presentationId, '40.0000', {
        minPurchase: '2.5000',
      })

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.minPurchase?.toString()).toBe('2.5')
    })
  })

  it('rechaza un plazo con parte fraccionaria y acepta uno entero (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      // El plazo entero se acepta sin problema.
      const lineId = await createLine(tx, supplierId, presentationId, '10.0000', {
        name: 'Plazo entero',
        deliveryTime: 7,
      })
      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.deliveryTime).toBe(7)

      // Este expect NO prueba que la columna sea INTEGER: prueba que un parametro de
      // tipo texto no se liga (bind) contra NINGUNA columna de la familia numerica, sea
      // entera o decimal (una columna NUMERIC(14,4) daria el mismo 42804 ante el mismo
      // insert). Que `delivery_time` sea especificamente INTEGER lo verifica, aparte, el
      // test de mas abajo que lee `information_schema.columns`. Se documenta el SQLSTATE
      // exacto porque no es el generico de CHECK (23514).
      // Tiene que ir como PARAMETRO de texto (no como literal numerico sin comillas): un
      // literal `3.5` sin comillas es una constante NUMERIC y Postgres la redondearia via
      // el cast de asignacion numeric->integer en vez de rechazarla. Ligado como parametro
      // de tipo desconocido contra una columna de familia numerica, Postgres responde
      // `42804` (datatype_mismatch: «la columna es de tipo integer [o numeric] pero la
      // expresion es de tipo text»), no `22P02` (que seria el error si el propio texto no
      // fuera numerico, p. ej. 'abc').
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Plazo fraccionario'),
            cost: Prisma.sql`10.0000`,
            delivery_time: Prisma.sql`${'3.5'}`,
          }),
        'linea con plazo fraccionario',
      )
      expect(sqlState).toBe('42804')

      const survivors = await tx.supplierCatalogLine.findMany({
        where: { supplierId, nameNormalized: 'plazofraccionario' },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('el plazo de entrega es una columna integer de verdad, no numeric (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const columns = await columnInfo(tx, 'supplier_catalog_lines', ['delivery_time'])
      expect(columns).toHaveLength(1)
      expect(columns[0]?.data_type).toBe('integer')
    })
  })

  it('rechaza costo, minimo y plazo negativos por separado con SQLSTATE 23514, y acepta el cero (R17)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const costoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Costo negativo'),
            cost: Prisma.sql`-1.0000`,
          }),
        'linea con costo negativo',
      )
      expect(costoNegativo).toBe(CHECK_VIOLATION)

      const minimoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Minimo negativo'),
            cost: Prisma.sql`10.0000`,
            min_purchase: Prisma.sql`-5.0000`,
          }),
        'linea con minimo negativo',
      )
      expect(minimoNegativo).toBe(CHECK_VIOLATION)

      const plazoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Plazo negativo'),
            cost: Prisma.sql`10.0000`,
            delivery_time: Prisma.sql`-2`,
          }),
        'linea con plazo negativo',
      )
      expect(plazoNegativo).toBe(CHECK_VIOLATION)

      // Cero sigue siendo valido en el MINIMO y en el PLAZO -\u00absin minimo pactado\u00bb y
      // \u00abmismo dia\u00bb son datos legitimos-, pero YA NO en el costo: QC-43 (decision cerrada 4,
      // su R29) cambio ese CHECK a `cost > 0` porque un cero casi siempre es un dato a medio
      // escribir. Este caso se actualiza aqui, y no en el archivo de QC-43, porque es el
      // censo de esta tabla el que dejaria de ser cierto.
      const costoCero = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Costo cero'),
            cost: Prisma.sql`0.0000`,
          }),
        'linea con costo cero (QC-43 R29)',
      )
      expect(costoCero).toBe(CHECK_VIOLATION)

      // QC-52 R10, y la razon de que este caso siga aqui palabra por palabra: los TRES
      // CHECK de QC-42/QC-43 -`cost_positive`, `min_purchase_non_negative`,
      // `delivery_time_non_negative`- tienen que SEGUIR existiendo despues de la migracion.
      // Prisma no los modela, asi que si el SQL generado se los hubiera llevado, ni el
      // esquema ni el cliente se habrian quejado y solo caeria este test.
      const checks = await tx.$queryRaw<{ conname: string }[]>`
        SELECT c.conname FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.contype = 'c' AND t.relname = 'supplier_catalog_lines'
        ORDER BY c.conname`
      expect(checks.map((c) => c.conname)).toEqual([
        'supplier_catalog_lines_cost_positive',
        'supplier_catalog_lines_delivery_time_non_negative',
        'supplier_catalog_lines_min_purchase_non_negative',
      ])

      const cero = await createLine(tx, supplierId, presentationId, '0.0001', {
        name: 'Linea en cero',
        minPurchase: '0.0000',
        deliveryTime: 0,
      })
      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: cero } })
      expect(line.cost.toString()).toBe('0.0001')
      expect(line.minPurchase?.toString()).toBe('0')
      expect(line.deliveryTime).toBe(0)
    })
  })
})

describe('frontera con otros modulos: FK reales sin relacion de Prisma (QC-52 R30)', () => {
  it('rechaza con 23503 la presentacion, la unidad y el autor inexistentes, aunque Prisma no declare la relacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      // R30. Las dos FK nuevas de QC-52 existen EN LA BASE aunque los campos sean escalares
      // sin `@relation` en el esquema. Es la mitad del requisito que el test de esquema no
      // puede demostrar: alli solo se ve que NO hay `@relation`, y un escalar sin FK dejaria
      // lineas apuntando al vacio.
      const presentacionFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(randomUUID(), 'Presentacion fantasma'),
            presentation_id: asUuid(randomUUID()),
            cost: Prisma.sql`10.0000`,
          }),
        'linea con presentation_id inventado',
      )
      expect(presentacionFantasma).toBe(FOREIGN_KEY_VIOLATION)

      const unidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            ...lineaMinima(presentationId, 'Unidad fantasma'),
            unit_id: asUuid(randomUUID()),
            cost: Prisma.sql`10.0000`,
          }),
        'linea con unit_id inventado',
      )
      expect(unidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Con autor fantasma linea ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasmalinea${marker}`}`,
            phone: Prisma.sql`${'+57 300 444 5500'}`,
            created_by: asUuid(randomUUID()),
          }),
        'proveedor con created_by inventado',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // El censo COMPLETO de FK de las dos tablas. Es exhaustivo a proposito: es lo que
      // hace que una FK no pueda entrar ni salir sin que nadie se entere, y esta migracion
      // es exactamente la que podia llevarselas por delante -el generador propuso borrar
      // quince FK escritas a mano (R29)-.
      //
      // QC-52 cambia dos filas: entran `presentation_id` -> `presentations` y `unit_id` ->
      // `units`, y sale `product_id` -> `products`, que se fue con la columna (R9).
      //
      // Las FK existen en la base aunque el esquema Prisma declare `unit_id`, `created_by` y
      // `updated_by` como escalares sin `@relation`.
      //
      // El JOIN con `pg_namespace` acota la consulta al esquema `public` y NO es adorno:
      // `pg_constraint` es global a la BASE, no al esquema. La base de pruebas llego a ser
      // compartida y a tener un esquema espejo (`public_shadow_qc52`) con las mismas tablas;
      // sin este filtro cada FK aparecia DOS veces. No sirve confiar en el `search_path` ni
      // en `::regclass`, que solo cualifica cuando la tabla NO esta en el path: por eso el
      // sintoma era tan confuso.
      const foreignKeys = await tx.$queryRaw<{ conname: string; referencia: string; regla: string }[]>`
        SELECT c.conname, ft.relname AS referencia, c.confdeltype AS regla
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND t.relname IN ('suppliers', 'supplier_catalog_lines')
        ORDER BY c.conname`
      expect(foreignKeys).toEqual([
        { conname: 'supplier_catalog_lines_created_by_fkey', referencia: 'users', regla: 'r' },
        // `r` = RESTRICT. `presentations` no tiene borrado logico -se borra de verdad
        // (QC-20 D6)-, asi que el RESTRICT es justo lo que impide que borrar una
        // presentacion deje lineas apuntando al vacio.
        { conname: 'supplier_catalog_lines_presentation_id_fkey', referencia: 'presentations', regla: 'r' },
        // `c` = CASCADE, y se CONSERVA tal cual (`design.md > 6.4`): es la red de un
        // borrado FISICO -una purga, el `down.sql`- y no se dispara nunca en operacion
        // normal, porque ninguna FK reacciona a un UPDATE. La decision cerrada 5 lo
        // sustituye como POLITICA DE NEGOCIO, no como restriccion de base.
        { conname: 'supplier_catalog_lines_supplier_id_fkey', referencia: 'suppliers', regla: 'c' },
        { conname: 'supplier_catalog_lines_unit_id_fkey', referencia: 'units', regla: 'r' },
        { conname: 'supplier_catalog_lines_updated_by_fkey', referencia: 'users', regla: 'r' },
        { conname: 'suppliers_created_by_fkey', referencia: 'users', regla: 'r' },
        { conname: 'suppliers_updated_by_fkey', referencia: 'users', regla: 'r' },
      ])
      expect(
        foreignKeys.some((fk) => fk.referencia === 'products'),
        'la linea volvio a referenciar la tabla de articulos del inventario (R9)',
      ).toBe(false)

      // Y cada FK nueva tiene indice en su lado hijo (R30, ultima frase): Postgres no lo
      // crea solo, y por ahi pasa la verificacion del RESTRICT.
      const indices = await tx.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'supplier_catalog_lines'
        ORDER BY indexname`
      const nombres = indices.map((i) => i.indexname)
      expect(nombres).toContain('supplier_catalog_lines_presentation_id_idx')
      expect(nombres).toContain('supplier_catalog_lines_unit_id_idx')
      expect(nombres).toContain('supplier_catalog_lines_name_presentation_unique')
      expect(nombres).not.toContain('supplier_catalog_lines_product_id_idx')
      expect(nombres).not.toContain('supplier_catalog_lines_supplier_id_product_id_key')
    })
  })

  it('el indice de la identidad de la linea es UNICO y PARCIAL sobre las vivas (QC-52 R15, R17)', async () => {
    // Se lee la DEFINICION que Postgres guarda, no el texto del `migration.sql`: el archivo
    // dice lo que se pidio y esto dice lo que quedo. Que sea PARCIAL es lo que hace posible
    // R17, y es lo unico que distingue este indice del TOTAL que tenia QC-43.
    await inRolledBackTransaction(async (tx) => {
      const [indice] = await tx.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'supplier_catalog_lines_name_presentation_unique'`
      expect(indice?.indexdef).toBeDefined()
      expect(indice?.indexdef).toMatch(/CREATE UNIQUE INDEX/i)
      expect(indice?.indexdef).toMatch(/\(supplier_id, name_normalized, presentation_id\)/i)
      expect(indice?.indexdef).toMatch(/WHERE \(deleted_at IS NULL\)/i)
    })
  })

  it('RLS sigue HABILITADA y FORZADA en las dos tablas despues de la migracion (QC-52 R26)', async () => {
    // R26. Leer `pg_class` es una lectura de METADATOS, no un intento de saltarse una
    // policy: eso ultimo no se puede probar con Prisma, que se conecta como dueno de las
    // tablas (`docs/architecture.md > Acceso a datos y autorizacion`), y por eso la
    // autorizacion de verdad se valida en el service y tiene su propio test.
    //
    // Lo que SI se puede probar, y es lo que R26 pide, es que la migracion no aflojo la
    // defensa en profundidad. `relforcerowsecurity` es la mitad que se olvida: sin ella
    // Postgres NO aplica RLS al dueno de la tabla, que es justo con quien se conecta Prisma.
    await inRolledBackTransaction(async (tx) => {
      const rls = await tx.$queryRaw<
        { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN ('suppliers', 'supplier_catalog_lines')
        ORDER BY relname`
      expect(rls).toEqual([
        { relname: 'supplier_catalog_lines', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'suppliers', relrowsecurity: true, relforcerowsecurity: true },
      ])
    })
  })
})

describe('baja logica de la linea y CASCADE (QC-52 R20, R21, R22)', () => {
  it('dar de baja una linea CONSERVA su fila y marca deleted_at (R21)', async () => {
    // INVERTIDO respecto a QC-42 R28, que decia que quitar una linea del catalogo ELIMINABA
    // la fila y afirmaba que la tabla NO tenia `deleted_at`. La decision cerrada 5 de QC-52
    // lo deroga: nada se borra fisicamente, el historico queda.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)
      const baja = new Date('2026-02-02T00:00:00Z')

      const lineaQueSale = await createLine(tx, supplierId, presentationId, '5.0000', {
        name: 'Linea que sale',
      })
      const lineaQueQueda = await createLine(tx, supplierId, presentationId, '6.0000', {
        name: 'Linea que queda',
      })

      await tx.supplierCatalogLine.update({
        where: { id: lineaQueSale },
        data: { deletedAt: baja, updatedAt: baja },
      })

      // La fila SIGUE EXISTIENDO, entera.
      const fila = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineaQueSale } })
      expect(fila.name).toBe('Linea que sale')
      expect(fila.cost.toString()).toBe('5')
      expect(fila.deletedAt?.toISOString()).toBe(baja.toISOString())

      // Y la otra sigue viva.
      const vivas = await tx.supplierCatalogLine.findMany({
        where: { supplierId, deletedAt: null },
        select: { id: true },
      })
      expect(vivas).toEqual([{ id: lineaQueQueda }])

      // La columna de baja logica EXISTE: es lo que QC-42 afirmaba que no existia.
      const softDeleteColumns = await tx.$queryRaw<{ column_name: string; is_nullable: string }[]>`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supplier_catalog_lines'
          AND column_name = 'deleted_at'`
      expect(softDeleteColumns).toEqual([{ column_name: 'deleted_at', is_nullable: 'YES' }])

      expect(await tx.supplier.findUnique({ where: { id: supplierId } })).not.toBeNull()
    })
  })

  it('borrar fisicamente un proveedor se lleva sus lineas por CASCADE y no deja huerfanas (R29 de QC-42)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)

      const line1 = await createLine(tx, supplierId, presentationId, '10.0000', { name: 'Insumo 1' })
      const line2 = await createLine(tx, supplierId, presentationId, '20.0000', { name: 'Insumo 2' })

      // Borrado FISICO (una purga, un script, el `down.sql`): aqui si se dispara el
      // CASCADE. QC-52 lo CONSERVA a proposito (`design.md > 6.4`): en operacion normal el
      // borrado es logico y ninguna FK reacciona a un UPDATE, asi que esta red no se
      // dispara nunca. La decision cerrada 5 sustituye al CASCADE como politica de negocio,
      // no como restriccion de base.
      await tx.supplier.delete({ where: { id: supplierId } })

      const survivors = await tx.supplierCatalogLine.findMany({
        where: { id: { in: [line1, line2] } },
        select: { id: true },
      })
      expect(survivors).toEqual([])
      expect(await tx.supplier.findUnique({ where: { id: supplierId } })).toBeNull()
    })
  })

  it('la baja LOGICA de un proveedor puede arrastrar sus lineas con la misma marca, y ninguna fila se pierde (R20)', async () => {
    // INVERTIDO respecto a QC-42 R30, que afirmaba que la baja logica del proveedor dejaba
    // sus lineas INTACTAS. La decision cerrada 5 de QC-52 lo deroga: las lineas se van con
    // el, en logico y en la MISMA operacion atomica.
    //
    // Aqui se comprueba la parte que es de la BASE -que las dos columnas admiten la misma
    // marca y que ninguna fila desaparece al hacerlo-. Que el ADAPTADOR lo haga en una sola
    // transaccion y con un solo `now` se prueba en `catalog-line.int.test.ts`, que es donde
    // se ejercita el codigo real.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const presentationId = await createPresentation(tx)
      const baja = new Date('2026-02-02T10:11:12.000Z')

      const line1 = await createLine(tx, supplierId, presentationId, '10.5000', { name: 'Insumo 1' })
      const line2 = await createLine(tx, supplierId, presentationId, '0.2500', { name: 'Insumo 2' })

      await tx.supplier.update({ where: { id: supplierId }, data: { deletedAt: baja } })
      await tx.supplierCatalogLine.updateMany({
        where: { supplierId, deletedAt: null },
        data: { deletedAt: baja, updatedAt: baja },
      })

      const proveedor = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { deletedAt: true },
      })
      const despues = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        orderBy: { cost: 'asc' },
      })

      // Las tres filas siguen existiendo...
      expect(despues.map((line) => line.id).sort()).toEqual([line1, line2].sort())
      // ...y las tres llevan LA MISMA marca.
      expect([
        proveedor.deletedAt?.toISOString(),
        ...despues.map((line) => line.deletedAt?.toISOString()),
      ]).toEqual([baja.toISOString(), baja.toISOString(), baja.toISOString()])

      // R22: ninguna consulta del catalogo las devuelve, porque el filtro es por
      // `deleted_at IS NULL`.
      expect(await tx.supplierCatalogLine.count({ where: { supplierId, deletedAt: null } })).toBe(0)
    })
  })
})
