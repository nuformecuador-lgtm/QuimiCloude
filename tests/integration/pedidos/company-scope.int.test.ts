/**
 * QC-60 T12 — restricciones, backfill y reversion de `20260915120000_orders_company_scope`.
 *
 * AISLAMIENTO. Cada caso corre en una transaccion interactiva que termina en ROLLBACK (molde:
 * `tests/integration/inventario/company-scope.int.test.ts`, QC-49). En Postgres el DDL es
 * transaccional, asi que el `down.sql` y el `migration.sql` se ejecutan ENTEROS dentro de esa
 * transaccion y el ROLLBACK los deshace: la base de la corrida vuelve al estado del UP al acabar
 * cada caso. Nada de esto toca la base de desarrollo: la integracion corre contra la base
 * efimera de la corrida (QC-77, `tests/integration/_setup.ts`).
 *
 * EJECUTAR UN ARCHIVO SQL. `$executeRawUnsafe` usa sentencias preparadas y no admite varias
 * sentencias de golpe, asi que el archivo se parte en sentencias con un lector que respeta
 * comentarios `--`, literales `'...'` (los `RAISE` llevan `--` y `''` dentro) y bloques `$$`.
 * Se ejecutan en orden sobre la MISMA transaccion; lo que se espera que aborte va dentro de un
 * SAVEPOINT, que es exactamente el comportamiento de la unica transaccion en la que Prisma
 * (UP) y `db:rollback` (DOWN) ejecutan cada archivo.
 *
 * ESTADO PREVIO. Los casos de migracion vacian `order_assignments` y `orders` DENTRO de la
 * transaccion: sin eso, cualquier fila que otro archivo dejara confirmada podria hacer saltar
 * una guardia por un motivo ajeno al caso. El ROLLBACK las devuelve.
 *
 * SECUENCIAS. `setval`/`nextval` NO son transaccionales. Por eso el caso de R7 usa anos cuya
 * secuencia `orders_sequence_<ano>` no existe al empezar (se comprueba) o que el propio caso crea
 * dentro de la transaccion: al deshacerse la creacion de la relacion, se va con ella su estado.
 *
 * QUE RESTRICCION SALTO. Por la via cruda Prisma entrega a veces el DETALLE de Postgres y no el
 * mensaje, asi que el nombre del indice no siempre viaja. Para los `23505` se afirma la lista de
 * columnas de la clave que cita el detalle y se comprueba en el catalogo que el UNICO indice unico
 * de `orders` sobre esas columnas es el esperado. Los mensajes de las guardias son de la
 * migracion y no se traducen.
 *
 * Requisitos cubiertos: R1, R2, R3, R5, R6, R7, R11, R13, R25, R26.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** No es un fallo: es como se fuerza el ROLLBACK de la transaccion del test. */
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
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'

type Rechazo = { readonly sqlState: string; readonly texto: string }

function rechazoDe(error: unknown): Rechazo {
  let sqlState = ''
  const partes: string[] = []
  if (error instanceof Error) partes.push(error.message)
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
      sqlState = (error as { code: string }).code
    }
    if ('meta' in error) {
      const meta: unknown = (error as { meta: unknown }).meta
      if (typeof meta === 'object' && meta !== null) {
        partes.push(JSON.stringify(meta))
        if ('code' in meta) {
          const code: unknown = (meta as { code: unknown }).code
          if (typeof code === 'string') sqlState = code
        }
      }
    }
  }
  if (partes.length === 0) partes.push(String(error))
  return { sqlState, texto: partes.join(' | ') }
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<Rechazo> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return rechazoDe(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

// ---------------------------------------------------------------------------
// Los dos archivos SQL, leidos del disco y partidos en sentencias
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsDir = join(repoRoot, 'db', 'migrations')
const scopeDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_orders_company_scope'),
)
expect(scopeDirs, 'debe existir exactamente una migracion *_orders_company_scope').toHaveLength(1)
const migrationDir = join(migrationsDir, scopeDirs[0] as string)

/**
 * Parte un archivo SQL en sentencias. Quita los comentarios `--` y `/* *\/` que estan FUERA de
 * literales y respeta `'...'` (con `''`), `"..."` y `$tag$...$tag$`. Solo corta por `;` en
 * el nivel superior.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i] as string
    const next = sql[i + 1]
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? n : end
      continue
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      current += ' '
      continue
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1
      for (;;) {
        if (j >= n) throw new Error('literal sin cerrar en el SQL')
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2
            continue
          }
          break
        }
        j += 1
      }
      current += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/u.exec(sql.slice(i))
      if (tag !== null) {
        const end = sql.indexOf(tag[0], i + tag[0].length)
        if (end === -1) throw new Error(`bloque ${tag[0]} sin cerrar en el SQL`)
        const stop = end + tag[0].length
        current += sql.slice(i, stop)
        i = stop
        continue
      }
    }
    if (ch === ';') {
      if (current.trim() !== '') statements.push(current.trim())
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }
  if (current.trim() !== '') statements.push(current.trim())
  return statements
}

const UP = splitSqlStatements(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN = splitSqlStatements(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

async function runScript(tx: Prisma.TransactionClient, statements: readonly string[]) {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

type Aborto = Rechazo & { readonly sentencia: string; readonly indice: number }

/**
 * Ejecuta el archivo dentro de un SAVEPOINT esperando que aborte. Devuelve el error y la
 * sentencia donde paro, y deja la transaccion como estaba antes del archivo.
 */
async function runScriptExpectingAbort(
  tx: Prisma.TransactionClient,
  statements: readonly string[],
  what: string,
): Promise<Aborto> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  for (const [indice, sentencia] of statements.entries()) {
    try {
      await tx.$executeRawUnsafe(sentencia)
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
      return { ...rechazoDe(error), sentencia, indice }
    }
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que el archivo abortara, pero termino entero: ${what}`)
}

// ---------------------------------------------------------------------------
// Foto del esquema: lo que el UP crea y lo que el DOWN restaura
// ---------------------------------------------------------------------------

interface Esquema {
  readonly columnaEmpresa: boolean
  readonly indiceGlobal: boolean
  readonly indicePorEmpresa: boolean
  readonly claveCandidata: boolean
  readonly fkEmpresa: boolean
  readonly fkAsignacionSimple: boolean
  readonly fkAsignacionCompuesta: boolean
  readonly funcionCorrelativo: boolean
  readonly rlsForzada: { orders: boolean; companies: boolean; order_assignments: boolean }
}

const ESQUEMA_UP: Omit<Esquema, 'rlsForzada'> = {
  columnaEmpresa: true,
  indiceGlobal: false,
  indicePorEmpresa: true,
  claveCandidata: true,
  fkEmpresa: true,
  fkAsignacionSimple: false,
  fkAsignacionCompuesta: true,
  funcionCorrelativo: false,
}

const ESQUEMA_PREVIO: Omit<Esquema, 'rlsForzada'> = {
  columnaEmpresa: false,
  indiceGlobal: true,
  indicePorEmpresa: false,
  claveCandidata: false,
  fkEmpresa: false,
  fkAsignacionSimple: true,
  fkAsignacionCompuesta: false,
  funcionCorrelativo: true,
}

const RLS_FORZADA = { orders: true, companies: true, order_assignments: true }

async function fotoDelEsquema(tx: Prisma.TransactionClient): Promise<Esquema> {
  const filas = await tx.$queryRaw<
    {
      columna: boolean
      indice_global: boolean
      indice_empresa: boolean
      clave: boolean
      fk_empresa: boolean
      fk_simple: boolean
      fk_compuesta: boolean
      funcion: boolean
    }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'company_id') AS columna,
      to_regclass('public.orders_order_year_order_sequence_key') IS NOT NULL AS indice_global,
      to_regclass('public.orders_company_year_sequence_key') IS NOT NULL AS indice_empresa,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_id_company_id_key') AS clave,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_company_id_fkey') AS fk_empresa,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_assignments_order_id_fkey') AS fk_simple,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_assignments_order_id_company_id_fkey') AS fk_compuesta,
      to_regprocedure('public.next_order_sequence(integer)') IS NOT NULL AS funcion`
  const fila = filas[0]
  if (fila === undefined) throw new Error('la foto del esquema no devolvio fila')
  const rls = await tx.$queryRaw<{ relname: string; forzada: boolean }[]>`
    SELECT relname, (relrowsecurity AND relforcerowsecurity) AS forzada
      FROM pg_class
     WHERE relnamespace = 'public'::regnamespace
       AND relname IN ('orders', 'companies', 'order_assignments')`
  const forzada = (tabla: string) => rls.find((r) => r.relname === tabla)?.forzada === true
  return {
    columnaEmpresa: fila.columna,
    indiceGlobal: fila.indice_global,
    indicePorEmpresa: fila.indice_empresa,
    claveCandidata: fila.clave,
    fkEmpresa: fila.fk_empresa,
    fkAsignacionSimple: fila.fk_simple,
    fkAsignacionCompuesta: fila.fk_compuesta,
    funcionCorrelativo: fila.funcion,
    rlsForzada: {
      orders: forzada('orders'),
      companies: forzada('companies'),
      order_assignments: forzada('order_assignments'),
    },
  }
}

/** Nombres de los indices unicos de `orders` cuya clave es exactamente `columnas`, en orden. */
async function indicesUnicosDeOrdersSobre(
  tx: Prisma.TransactionClient,
  columnas: readonly string[],
): Promise<string[]> {
  const filas = await tx.$queryRaw<{ nombre: string }[]>`
    SELECT i.relname AS nombre
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'public.orders'::regclass
       AND x.indisunique
       AND ARRAY(
             SELECT a.attname::text
               FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, pos)
               JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
              ORDER BY k.pos
           ) = ${columnas}::text[]`
  return filas.map((f) => f.nombre)
}

async function contarFilas(tx: Prisma.TransactionClient) {
  const filas = await tx.$queryRaw<{ companies: bigint; orders: bigint; assignments: bigint }[]>`
    SELECT (SELECT count(*) FROM "companies")         AS companies,
           (SELECT count(*) FROM "orders")            AS orders,
           (SELECT count(*) FROM "order_assignments") AS assignments`
  const fila = filas[0]
  if (fila === undefined) throw new Error('el conteo no devolvio fila')
  return {
    companies: Number(fila.companies),
    orders: Number(fila.orders),
    assignments: Number(fila.assignments),
  }
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function currentUtcYear(): number {
  return new Date().getUTCFullYear()
}

/** Posiciones altas y aleatorias: no chocan por accidente con nada que ya haya en la base. */
function freshSequence(): number {
  return 700_000 + Math.floor(Math.random() * 200_000)
}

async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const name = `Empresa pedidos ${marcador}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function quimicloudId(tx: Prisma.TransactionClient): Promise<string> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS id FROM "companies" WHERE "name_normalized" = 'quimicloud'`
  expect(filas, 'la base de la corrida debe traer sembrada la empresa «QuimiCloud»').toHaveLength(1)
  return (filas[0] as { id: string }).id
}

async function crearUsuario(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  })
  return user.id
}

async function crearReceta(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  return recipe.id
}

/** Alta de pedido en el esquema del UP (con empresa). */
async function insertarPedido(
  tx: Prisma.TransactionClient,
  seed: {
    companyId: string
    recipeId: string
    year: number
    sequence: number
    createdAt?: string
  },
): Promise<string> {
  const id = randomUUID()
  await tx.$executeRawUnsafe(
    `INSERT INTO "orders" ("id","company_id","order_year","order_sequence","recipe_id","quantity","created_at","updated_at")
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 10, COALESCE($6::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
    id,
    seed.companyId,
    seed.year,
    seed.sequence,
    seed.recipeId,
    seed.createdAt ?? null,
  )
  return id
}

/** Pedido en el esquema PREVIO al UP: no hay columna de empresa que escribir. */
async function insertarPedidoPrevio(
  tx: Prisma.TransactionClient,
  seed: {
    recipeId: string
    sequence: number
    status?: 'PENDIENTE' | 'CANCELADO'
    deleted?: boolean
  },
): Promise<string> {
  const id = randomUUID()
  const cancelado = seed.status === 'CANCELADO'
  await tx.$executeRawUnsafe(
    `INSERT INTO "orders" ("id","order_year","order_sequence","recipe_id","quantity","status","cancellation_reason","created_at","deleted_at","updated_at")
     VALUES ($1::uuid, 2026, $2, $3::uuid, 10,
             ${cancelado ? `'CANCELADO'` : `'PENDIENTE'`},
             ${cancelado ? `'Cancelado antes de migrar'` : 'NULL'},
             TIMESTAMPTZ '2026-05-10T12:00:00Z',
             ${seed.deleted === true ? 'CURRENT_TIMESTAMP' : 'NULL'},
             CURRENT_TIMESTAMP)`,
    id,
    seed.sequence,
    seed.recipeId,
  )
  return id
}

async function insertarAsignacion(
  tx: Prisma.TransactionClient,
  seed: { orderId: string; userId: string; companyId: string },
): Promise<number> {
  return tx.$executeRawUnsafe(
    `INSERT INTO "order_assignments" ("order_id","user_id","company_id","work_group_id","work_group_name","updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, NULL, CURRENT_TIMESTAMP)`,
    seed.orderId,
    seed.userId,
    seed.companyId,
  )
}

/** Deja `orders` y `order_assignments` vacias SOLO dentro de la transaccion del caso. */
async function vaciarPedidos(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe('DELETE FROM "order_assignments"')
  await tx.$executeRawUnsafe('DELETE FROM "orders"')
}

// ---------------------------------------------------------------------------
// FK posteriores que cuelgan de `orders_id_company_id_key`
// ---------------------------------------------------------------------------

/**
 * El DOWN de esta migracion suelta `orders_id_company_id_key` (paso 3), pero dos migraciones
 * posteriores (`20260923150100_reservations_and_decimal_stock`) le anadieron FK compuestas que
 * la referencian: `reservation_movements_order_id_fkey` e `inventory_movements_order_id_fkey`.
 * Sobre la base YA migrada a HEAD (con la que corre esta suite) esas FK existen, y Postgres
 * rechaza el `DROP CONSTRAINT` de la clave mientras algo la referencie. Se retiran antes de
 * correr el DOWN y se restauran despues de un UP posterior, todo dentro de la transaccion del
 * caso -que termina en ROLLBACK-; no es una migracion nueva ni un cambio de las existentes.
 *
 * 2026-10-06 (QC-82): `20261006180000_order_execution_entries` anadio una tercera,
 * `order_execution_entries_order_id_company_id_fkey`, con la misma forma; se retira y restaura
 * igual que las otras dos.
 *
 * 2026-10-08 (QC-218): `20261008150000_order_conditioning_team` anadio una cuarta,
 * `order_conditioning_team_members_order_id_company_id_fkey`, con la misma forma.
 *
 * QC-223 2026-10-08: `20261008150100_order_deliveries` anadio una quinta,
 * `order_deliveries_order_id_fkey`, con la misma forma; se retira y restaura igual.
 */
const RESERVATION_ORDER_FK =
  'ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_order_id_fkey" ' +
  'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ' +
  'ON DELETE RESTRICT ON UPDATE CASCADE'
const INVENTORY_ORDER_FK =
  'ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" ' +
  'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ' +
  'ON DELETE RESTRICT ON UPDATE CASCADE'
const EXECUTION_ENTRY_ORDER_FK =
  'ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_order_id_company_id_fkey" ' +
  'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ' +
  'ON DELETE RESTRICT ON UPDATE CASCADE'
const CONDITIONING_TEAM_ORDER_FK =
  'ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_order_id_company_id_fkey" ' +
  'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ' +
  'ON DELETE RESTRICT ON UPDATE CASCADE'
const DELIVERY_ORDER_FK =
  'ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_fkey" ' +
  'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ' +
  'ON DELETE RESTRICT ON UPDATE CASCADE'

async function dropForeignKeysDependingOnOrdersCompanyKey(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(
    'ALTER TABLE "reservation_movements" DROP CONSTRAINT "reservation_movements_order_id_fkey"',
  )
  await tx.$executeRawUnsafe(
    'ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_fkey"',
  )
  await tx.$executeRawUnsafe(
    'ALTER TABLE "order_execution_entries" DROP CONSTRAINT "order_execution_entries_order_id_company_id_fkey"',
  )
  await tx.$executeRawUnsafe(
    'ALTER TABLE "order_conditioning_team_members" DROP CONSTRAINT "order_conditioning_team_members_order_id_company_id_fkey"',
  )
  await tx.$executeRawUnsafe('ALTER TABLE "order_deliveries" DROP CONSTRAINT "order_deliveries_order_id_fkey"')
}

async function restoreForeignKeysDependingOnOrdersCompanyKey(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(RESERVATION_ORDER_FK)
  await tx.$executeRawUnsafe(INVENTORY_ORDER_FK)
  await tx.$executeRawUnsafe(EXECUTION_ENTRY_ORDER_FK)
  await tx.$executeRawUnsafe(CONDITIONING_TEAM_ORDER_FK)
  await tx.$executeRawUnsafe(DELIVERY_ORDER_FK)
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// R1 — la empresa es obligatoria y tiene que existir
// ---------------------------------------------------------------------------

describe('R1 — todo pedido lleva una empresa que existe', () => {
  it('rechaza con 23502 un pedido SIN empresa y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      const recipeId = await crearReceta(tx, quimicloud)
      const sequence = freshSequence()
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(
          `INSERT INTO "orders" ("order_year","order_sequence","recipe_id","quantity","updated_at")
           VALUES ($1, $2, $3::uuid, 10, CURRENT_TIMESTAMP)`,
          currentUtcYear(),
          sequence,
          recipeId,
        ),
        'pedido sin empresa',
      )
      expect(rechazo.sqlState).toBe(NOT_NULL_VIOLATION)
      // En el INSERT solo falta `company_id`: el resto de NOT NULL van con valor o tienen DEFAULT.
      expect(await tx.order.count({ where: { recipeId } })).toBe(0)
    })
  })

  it('rechaza con 23503 un pedido con una empresa INEXISTENTE y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      const recipeId = await crearReceta(tx, quimicloud)
      const inventada = randomUUID()
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarPedido(tx, {
          companyId: inventada,
          recipeId,
          year: currentUtcYear(),
          sequence: freshSequence(),
        }),
        'pedido con empresa inexistente',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.texto).toContain('orders_company_id_fkey')
      expect(await tx.order.count({ where: { companyId: inventada } })).toBe(0)
      expect(await tx.order.count({ where: { recipeId } })).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// R11 — el correlativo es unico DENTRO de la empresa
// ---------------------------------------------------------------------------

describe('R11 — (ano, secuencia) es unico por empresa, no global', () => {
  it('ACEPTA la misma pareja (ano, secuencia) en dos empresas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marca = token()
      const empresaA = await crearEmpresa(tx, `a${marca}`)
      const empresaB = await crearEmpresa(tx, `b${marca}`)
      const recipeId = await crearReceta(tx, empresaA)
      const year = currentUtcYear()
      const sequence = freshSequence()

      const deA = await insertarPedido(tx, { companyId: empresaA, recipeId, year, sequence })
      const deB = await insertarPedido(tx, { companyId: empresaB, recipeId, year, sequence })

      const filas = await tx.order.findMany({
        where: { id: { in: [deA, deB] } },
        select: { companyId: true, orderYear: true, orderSequence: true },
      })
      expect(filas).toHaveLength(2)
      expect(new Set(filas.map((f) => f.companyId))).toEqual(new Set([empresaA, empresaB]))
      expect(filas.every((f) => f.orderYear === year && f.orderSequence === sequence)).toBe(true)
    })
  })

  it('RECHAZA con 23505 la misma pareja dentro de la MISMA empresa, contra orders_company_year_sequence_key', async () => {
    await inRolledBackTransaction(async (tx) => {
      const empresa = await crearEmpresa(tx, token())
      const recipeId = await crearReceta(tx, empresa)
      const year = currentUtcYear()
      const sequence = freshSequence()
      const primero = await insertarPedido(tx, { companyId: empresa, recipeId, year, sequence })

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarPedido(tx, { companyId: empresa, recipeId, year, sequence }),
        'segundo pedido con la misma pareja en la misma empresa',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rechazo.texto).toContain('(company_id, order_year, order_sequence)')
      expect(
        await indicesUnicosDeOrdersSobre(tx, ['company_id', 'order_year', 'order_sequence']),
      ).toEqual(['orders_company_year_sequence_key'])

      const filas = await tx.order.findMany({
        where: { companyId: empresa },
        select: { id: true },
      })
      expect(filas).toEqual([{ id: primero }])
    })
  })
})

// ---------------------------------------------------------------------------
// R25, R26 — el enlace de la asignacion es compuesto, y la suelta sigue valiendo
// ---------------------------------------------------------------------------

describe('R25 — una asignacion no puede apuntar a un pedido de otra empresa', () => {
  it('rechaza con 23503 la asignacion cuya empresa no es la del pedido', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marca = token()
      const empresaA = await crearEmpresa(tx, `a${marca}`)
      const empresaB = await crearEmpresa(tx, `b${marca}`)
      const recipeId = await crearReceta(tx, empresaA)
      const pedidoDeA = await insertarPedido(tx, {
        companyId: empresaA,
        recipeId,
        year: currentUtcYear(),
        sequence: freshSequence(),
      })
      // La persona es de B y la fila declara B: la FK de la persona se cumple, asi que el unico
      // rechazo posible es el del enlace compuesto hacia el pedido.
      const personaDeB = await crearUsuario(tx, empresaB)

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarAsignacion(tx, { orderId: pedidoDeA, userId: personaDeB, companyId: empresaB }),
        'asignacion de la empresa B a un pedido de la empresa A',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.texto).toContain('order_assignments_order_id_company_id_fkey')
      expect(await tx.orderAssignment.count({ where: { orderId: pedidoDeA } })).toBe(0)
    })
  })
})

describe('R26 — la asignacion suelta (sin grupo) sigue aceptandose', () => {
  it('acepta work_group_id NULL con pedido y persona de la misma empresa, y ninguna FK es MATCH FULL', async () => {
    await inRolledBackTransaction(async (tx) => {
      const empresa = await crearEmpresa(tx, token())
      const recipeId = await crearReceta(tx, empresa)
      const pedido = await insertarPedido(tx, {
        companyId: empresa,
        recipeId,
        year: currentUtcYear(),
        sequence: freshSequence(),
      })
      const persona = await crearUsuario(tx, empresa)

      await expect(
        insertarAsignacion(tx, { orderId: pedido, userId: persona, companyId: empresa }),
      ).resolves.toBe(1)
      const fila = await tx.orderAssignment.findUniqueOrThrow({
        where: { orderId_userId: { orderId: pedido, userId: persona } },
        select: { companyId: true, workGroupId: true, workGroupName: true },
      })
      expect(fila).toEqual({ companyId: empresa, workGroupId: null, workGroupName: null })

      const matches = await tx.$queryRaw<{ conname: string; confmatchtype: string }[]>`
        SELECT conname, confmatchtype::text AS confmatchtype
          FROM pg_constraint
         WHERE conrelid = 'public.order_assignments'::regclass AND contype = 'f'
         ORDER BY conname`
      expect(matches.map((m) => m.conname)).toEqual([
        'order_assignments_order_id_company_id_fkey',
        'order_assignments_user_id_fkey',
        'order_assignments_work_group_id_fkey',
      ])
      expect(matches.every((m) => m.confmatchtype === 's')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// R2, R3, R13 — el backfill del UP
// ---------------------------------------------------------------------------

describe('R2, R3, R13 — el UP asigna todos los pedidos a «QuimiCloud» sin renumerar ni perder filas', () => {
  it('backfill: canceladas y borradas incluidas, conservan 37, 44 y 77, y los conteos no cambian', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)

      // Estado previo a la migracion, dentro de la transaccion.
      await dropForeignKeysDependingOnOrdersCompanyKey(tx)
      await runScript(tx, DOWN)
      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_PREVIO, rlsForzada: RLS_FORZADA })

      const recipeId = await crearReceta(tx, quimicloud)
      const p37 = await insertarPedidoPrevio(tx, { recipeId, sequence: 37 })
      const p44 = await insertarPedidoPrevio(tx, { recipeId, sequence: 44, status: 'CANCELADO' })
      const p77 = await insertarPedidoPrevio(tx, { recipeId, sequence: 77, deleted: true })
      // Una asignacion previa (FK simple): el UP tiene que validar la compuesta sobre ella.
      const persona = await crearUsuario(tx, quimicloud)
      await insertarAsignacion(tx, { orderId: p37, userId: persona, companyId: quimicloud })

      const antes = await contarFilas(tx)
      expect(antes.orders).toBe(3)
      expect(antes.assignments).toBe(1)

      await runScript(tx, UP)
      await restoreForeignKeysDependingOnOrdersCompanyKey(tx)

      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_UP, rlsForzada: RLS_FORZADA })
      expect(await contarFilas(tx)).toEqual(antes)

      const filas = await tx.order.findMany({
        where: { id: { in: [p37, p44, p77] } },
        select: {
          id: true,
          companyId: true,
          orderYear: true,
          orderSequence: true,
          status: true,
          deletedAt: true,
        },
        orderBy: { orderSequence: 'asc' },
      })
      expect(filas.map((f) => [f.id, f.orderYear, f.orderSequence])).toEqual([
        [p37, 2026, 37],
        [p44, 2026, 44],
        [p77, 2026, 77],
      ])
      expect(filas.every((f) => f.companyId === quimicloud)).toBe(true)
      expect(filas[1]?.status).toBe('CANCELADO')
      expect(filas[2]?.deletedAt).not.toBeNull()
    })
  })

  it('si la empresa no se puede resolver de forma univoca, el UP aborta ENTERO y el esquema queda como antes', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)
      await dropForeignKeysDependingOnOrdersCompanyKey(tx)
      await runScript(tx, DOWN)

      const recipeId = await crearReceta(tx, quimicloud)
      const p37 = await insertarPedidoPrevio(tx, { recipeId, sequence: 37 })

      // Sin ninguna empresa llamada «quimicloud» y con al menos dos en la tabla: no hay candidata.
      const marca = token()
      await tx.$executeRawUnsafe(
        `UPDATE "companies" SET "name" = $1, "name_normalized" = $2 WHERE "id" = $3::uuid`,
        `Renombrada ${marca}`,
        `renombrada${marca}`,
        quimicloud,
      )
      await crearEmpresa(tx, marca)
      const antes = await contarFilas(tx)
      expect(antes.companies).toBeGreaterThanOrEqual(2)

      const aborto = await runScriptExpectingAbort(tx, UP, 'UP sin empresa resoluble')
      expect(aborto.texto).toContain('QC-60: no se pudo identificar la empresa')
      // Paro en el backfill, no en un DDL posterior.
      expect(aborto.sentencia).toMatch(/^DO\s+\$\$/u)
      expect(aborto.sentencia).toContain('UPDATE "orders" SET "company_id"')

      // Nada a medias: ni columna, ni indice, ni restriccion, y la funcion sigue viva.
      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_PREVIO, rlsForzada: RLS_FORZADA })
      expect(await contarFilas(tx)).toEqual(antes)
      const sigue = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "orders"
         WHERE "id" = CAST(${p37} AS uuid) AND "order_year" = 2026 AND "order_sequence" = 37`
      expect(Number(sigue[0]?.n ?? 0)).toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// R6 — la reversion aborta entera ante dato que no puede tirar
// ---------------------------------------------------------------------------

describe('R6 — el DOWN aborta entero si hay pedidos de otra empresa', () => {
  it('con dos empresas compartiendo (ano, secuencia) aborta en la guardia 1 y el esquema sigue en el UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)
      const ajena = await crearEmpresa(tx, token())
      const recipeId = await crearReceta(tx, quimicloud)
      const year = currentUtcYear()
      const propio = await insertarPedido(tx, { companyId: quimicloud, recipeId, year, sequence: 5 })
      const deOtra = await insertarPedido(tx, { companyId: ajena, recipeId, year, sequence: 5 })
      const antes = await contarFilas(tx)

      const aborto = await runScriptExpectingAbort(tx, DOWN, 'DOWN con correlativo compartido')
      expect(aborto.texto).toContain('QC-60 down: hay 1 pareja(s) (ano, secuencia) compartida(s)')
      expect(aborto.sentencia).toMatch(/^DO\s+\$\$/u)

      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_UP, rlsForzada: RLS_FORZADA })
      expect(await contarFilas(tx)).toEqual(antes)
      const filas = await tx.order.findMany({
        where: { id: { in: [propio, deOtra] } },
        select: { companyId: true },
      })
      expect(new Set(filas.map((f) => f.companyId))).toEqual(new Set([quimicloud, ajena]))
    })
  })

  it('con una sola fila de otra empresa (sin correlativo compartido) aborta en la guardia 2', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)
      const ajena = await crearEmpresa(tx, token())
      const recipeId = await crearReceta(tx, quimicloud)
      const year = currentUtcYear()
      await insertarPedido(tx, { companyId: quimicloud, recipeId, year, sequence: 5 })
      const deOtra = await insertarPedido(tx, { companyId: ajena, recipeId, year, sequence: 6 })
      const antes = await contarFilas(tx)

      const aborto = await runScriptExpectingAbort(tx, DOWN, 'DOWN con un pedido ajeno')
      expect(aborto.texto).toContain(
        'QC-60 down: hay 1 pedido(s) que pertenecen a una empresa distinta',
      )
      expect(aborto.texto).not.toContain('compartida(s)')

      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_UP, rlsForzada: RLS_FORZADA })
      expect(await contarFilas(tx)).toEqual(antes)
      const fila = await tx.order.findUniqueOrThrow({
        where: { id: deOtra },
        select: { companyId: true },
      })
      expect(fila.companyId).toBe(ajena)
    })
  })

  it('con una asignacion cuya empresa no es la de su pedido aborta en la guardia 3', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)
      const ajena = await crearEmpresa(tx, token())
      const recipeId = await crearReceta(tx, quimicloud)
      const year = currentUtcYear()
      // Todos los pedidos son de la empresa del UP y sin parejas repetidas: las guardias 1 y 2
      // no tienen nada que ver, asi que si el DOWN aborta solo puede hacerlo la 3.
      const pedido = await insertarPedido(tx, { companyId: quimicloud, recipeId, year, sequence: 5 })
      await insertarPedido(tx, { companyId: quimicloud, recipeId, year, sequence: 6 })
      const personaAjena = await crearUsuario(tx, ajena)

      // La FK compuesta impide fabricar el dato cruzado; se suelta solo dentro de esta
      // transaccion, que termina en ROLLBACK.
      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_UP, rlsForzada: RLS_FORZADA })
      await tx.$executeRawUnsafe(
        'ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_company_id_fkey"',
      )
      await insertarAsignacion(tx, { orderId: pedido, userId: personaAjena, companyId: ajena })

      const cruzadas = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n
          FROM "order_assignments" a JOIN "orders" o ON o."id" = a."order_id"
         WHERE a."company_id" <> o."company_id"`
      expect(Number(cruzadas[0]?.n)).toBe(1)
      const ajenos = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "orders" WHERE "company_id" <> CAST(${quimicloud} AS uuid)`
      expect(Number(ajenos[0]?.n)).toBe(0)

      const esquemaAntes = await fotoDelEsquema(tx)
      expect(esquemaAntes).toEqual({
        ...ESQUEMA_UP,
        fkAsignacionCompuesta: false,
        rlsForzada: RLS_FORZADA,
      })
      const antes = await contarFilas(tx)
      const asignacionAntes = await tx.$queryRaw<{ company_id: string }[]>`
        SELECT "company_id"::text AS company_id FROM "order_assignments"
         WHERE "order_id" = CAST(${pedido} AS uuid) AND "user_id" = CAST(${personaAjena} AS uuid)`

      const aborto = await runScriptExpectingAbort(tx, DOWN, 'DOWN con una asignacion cruzada')
      // Excepcion levantada por un `RAISE` (P0001) en el bloque de las guardias, que es el primer
      // `DO` del archivo: ningun DDL posterior llego a ejecutarse.
      expect(aborto.sqlState).toBe('P0001')
      expect(aborto.sentencia).toMatch(/^DO\s+\$\$/u)
      expect(aborto.indice).toBe(DOWN.findIndex((s) => /^DO\s+\$\$/u.test(s)))
      expect(aborto.texto).toContain('QC-60 down: hay 1 asignacion(es)')
      expect(aborto.texto).not.toContain('compartida(s)')
      expect(aborto.texto).not.toContain('pedido(s) que pertenecen')

      expect(await fotoDelEsquema(tx)).toEqual(esquemaAntes)
      expect(await contarFilas(tx)).toEqual(antes)
      const asignacionDespues = await tx.$queryRaw<{ company_id: string }[]>`
        SELECT "company_id"::text AS company_id FROM "order_assignments"
         WHERE "order_id" = CAST(${pedido} AS uuid) AND "user_id" = CAST(${personaAjena} AS uuid)`
      expect(asignacionDespues).toEqual(asignacionAntes)
      expect(asignacionDespues).toEqual([{ company_id: ajena }])
    })
  })
})

// ---------------------------------------------------------------------------
// R5, R7 — la reversion limpia
// ---------------------------------------------------------------------------

describe('R5, R7 — el DOWN limpio restaura el esquema global y deja el contador en el maximo', () => {
  it('restaura unico global, FK simple y funcion; orders_sequence_<ano> apunta al maximo; no pierde filas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const quimicloud = await quimicloudId(tx)
      await vaciarPedidos(tx)

      // `setval` no es transaccional: solo se trabaja con secuencias que nacen en esta transaccion.
      const previas = await tx.$queryRaw<{ a: boolean; b: boolean }[]>`
        SELECT to_regclass('public.orders_sequence_2961') IS NULL AS a,
               to_regclass('public.orders_sequence_2962') IS NULL AS b`
      expect(previas[0], 'las secuencias de 2961/2962 no deben existir al empezar').toEqual({
        a: true,
        b: true,
      })
      // 2962: la secuencia ya existe y va retrasada (en 1). 2961: no existe todavia.
      await tx.$executeRawUnsafe(
        'CREATE SEQUENCE "orders_sequence_2962" AS integer MINVALUE 1 START WITH 1',
      )
      const retrasada = await tx.$queryRaw<{ v: bigint }[]>`SELECT nextval('orders_sequence_2962') AS v`
      expect(Number(retrasada[0]?.v)).toBe(1)

      const recipeId = await crearReceta(tx, quimicloud)
      const ids = [
        await insertarPedido(tx, { companyId: quimicloud, recipeId, year: 2961, sequence: 5, createdAt: '2961-03-01T12:00:00Z' }),
        await insertarPedido(tx, { companyId: quimicloud, recipeId, year: 2961, sequence: 12, createdAt: '2961-03-02T12:00:00Z' }),
        await insertarPedido(tx, { companyId: quimicloud, recipeId, year: 2962, sequence: 3, createdAt: '2962-03-01T12:00:00Z' }),
      ]
      const persona = await crearUsuario(tx, quimicloud)
      await insertarAsignacion(tx, { orderId: ids[0] as string, userId: persona, companyId: quimicloud })
      const antes = await contarFilas(tx)

      await dropForeignKeysDependingOnOrdersCompanyKey(tx)
      await runScript(tx, DOWN)

      expect(await fotoDelEsquema(tx)).toEqual({ ...ESQUEMA_PREVIO, rlsForzada: RLS_FORZADA })
      expect(await contarFilas(tx)).toEqual(antes)
      const vivos = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "orders" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})`
      expect(Number(vivos[0]?.n)).toBe(3)

      // El primer numero tras revertir es max + 1, en los dos casos.
      const siguientes = await tx.$queryRaw<{ a: number; b: number }[]>`
        SELECT next_order_sequence(2961) AS a, next_order_sequence(2962) AS b`
      expect(siguientes[0]).toEqual({ a: 13, b: 4 })

      // Y ese numero cabe bajo el unico global recien restaurado, mientras que uno ya usado no.
      await expect(
        tx.$executeRawUnsafe(
          `INSERT INTO "orders" ("order_year","order_sequence","recipe_id","quantity","created_at","updated_at")
           VALUES (2961, 13, $1::uuid, 10, TIMESTAMPTZ '2961-04-01T12:00:00Z', CURRENT_TIMESTAMP)`,
          recipeId,
        ),
      ).resolves.toBe(1)
      const repetido = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(
          `INSERT INTO "orders" ("order_year","order_sequence","recipe_id","quantity","created_at","updated_at")
           VALUES (2961, 12, $1::uuid, 10, TIMESTAMPTZ '2961-04-01T12:00:00Z', CURRENT_TIMESTAMP)`,
          recipeId,
        ),
        'pareja ya escrita tras revertir',
      )
      expect(repetido.sqlState).toBe(UNIQUE_VIOLATION)
      expect(repetido.texto).toContain('(order_year, order_sequence)')
      expect(await indicesUnicosDeOrdersSobre(tx, ['order_year', 'order_sequence'])).toEqual([
        'orders_order_year_order_sequence_key',
      ])
    })
  })
})
