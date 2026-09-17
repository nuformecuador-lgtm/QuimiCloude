/**
 * QC-87 (T5) — Tests de integracion del ADAPTADOR Prisma de `OrderAssignmentRepository`
 * (`lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts`) contra
 * una base Postgres REAL con la migracion `20260911120000_order_assignments` aplicada.
 *
 * Lo que se demuestra aqui es lo que NINGUN doble de Prisma puede demostrar: que
 * `createMany({ skipDuplicates: true })` se traduce de verdad a `INSERT ... ON CONFLICT DO
 * NOTHING` contra `order_assignments_pkey`, y por tanto que **reaplicar el mismo lote no toca
 * ni una fila vieja** (R15, R22) y devuelve **0** (R16). El criterio de hecho de T5 es
 * literalmente el primer caso: correr `insertMissing` DOS VECES con el MISMO lote y que solo
 * la primera cree filas.
 *
 * AISLAMIENTO — `transaccion` (censado en `tests/integration/aislamiento.json`, QC-77 R18):
 * cada `it` corre dentro de una `prisma.$transaction` interactiva que termina lanzando
 * `RollbackSignal`, asi que Prisma emite `ROLLBACK` y ninguna fila sobrevive al caso. El
 * adaptador se CONSTRUYE SOBRE ESA `tx` -por eso es una fabrica y no un objeto atado al
 * cliente global (`createInitialAccessRepository`, QC-47, es el precedente)-: si hablara por
 * el cliente global correria en otra conexion del pool y no veria ni una fila del fixture, que
 * es el «aislamiento de mentira» que QC-77 describe. De paso, esto ejercita exactamente el
 * camino que R27 exige: el adaptador dentro de la transaccion que abre el caso de uso.
 *
 * FIXTURE PROPIO Y EFIMERO — dos empresas con nombre irrepetible (`randomUUID`), su rol, su
 * receta y sus pedidos nacen dentro de la transaccion. Nunca se usa la empresa de instalacion
 * que siembra QC-6: `companies_name_unique` es GLOBAL y el alta chocaria con ella. Mismo patron
 * que `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` (QC-86 T10).
 *
 * CADA ASERCION CAE AL MUTAR — quitar `skipDuplicates` del adaptador pone en rojo los casos 1 y
 * 2 (`23505` sin traducir); cambiarlo por el anti-patron «borrar y reinsertar» los pone rojos
 * igualmente, porque afirman sobre `created_at` y sobre el NOMBRE CONGELADO de la fila vieja.
 * Quitar `createdAt`/`updatedAt` explicitos rompe el caso del reloj unico. Quitar `companyId`
 * de los `where` rompe los tres casos de alcance de empresa, y cambiar el `orderBy` rompe el
 * del orden.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma'
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

import type { NewAssignment } from '@/lib/modules/asignaciones/ports/order-assignment-repository'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

interface Fixture {
  readonly tx: Prisma.TransactionClient
  /** Empresa propia del caso. */
  readonly companyA: string
  /** Empresa ajena: con ella se comprueba que `company_id` esta en el `where` (R7). */
  readonly companyB: string
  readonly roleId: string
  readonly recipeId: string
}

async function inRolledBackTransaction(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const companyA = await createCompany(tx, 'qc87-a')
        const companyB = await createCompany(tx, 'qc87-b')
        const roleId = await createRole(tx)
        const recipeId = await createRecipe(tx, companyA)
        await body({ tx, companyA, companyB, roleId, recipeId })
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

async function createCompany(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const name = `${prefix}-${randomUUID()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function createRole(tx: Prisma.TransactionClient): Promise<string> {
  const role = await tx.role.create({
    data: { name: `rol-qc87-${randomUUID()}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  return role.id
}

/** Receta efimera SIN lineas: es solo el otro lado de `orders_recipe_id_fkey`. Es de la misma
 *  empresa que el pedido que la usa (`companyA`): QC-50 hizo `recipes.company_id` obligatoria. */
async function createRecipe(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = randomUUID().replaceAll('-', '')
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  return recipe.id
}

async function createUser(fixture: Fixture, companyId: string): Promise<string> {
  const tag = randomUUID()
  const user = await fixture.tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${tag}@example.com`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 15),
      username: tag,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: fixture.roleId,
      companyId,
    },
    select: { id: true },
  })
  return user.id
}

async function createWorkGroup(
  tx: Prisma.TransactionClient,
  companyId: string,
  name = `Turno noche ${randomUUID()}`,
): Promise<{ id: string; name: string }> {
  return tx.workGroup.create({
    data: { name, nameNormalized: normalizeWorkGroupName(name), companyId },
    select: { id: true, name: true },
  })
}

/**
 * Posicion del correlativo de los pedidos de este archivo. Arranca alto y aleatorio para no
 * chocar con `orders_order_year_order_sequence_key` ni con otro archivo que corra a la vez. El
 * ano NO se escribe a mano: el CHECK `orders_order_year_matches_created_at` (QC-33 R41) lo ata
 * a `created_at`.
 */
let nextSequence = 810_000 + Math.floor(Math.random() * 90_000)

async function createOrder(fixture: Fixture): Promise<string> {
  nextSequence += 1
  const order = await fixture.tx.order.create({
    data: {
      // QC-60: `orders.company_id` es NOT NULL y la FK de la asignacion ya es compuesta, asi que
      // el pedido nace en la MISMA empresa que sus asignaciones.
      companyId: fixture.companyA,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  })
  return order.id
}

/** Todas las filas de ese pedido, con las marcas de tiempo, leidas al margen del adaptador. */
async function readRows(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<
  ReadonlyArray<{
    userId: string
    companyId: string
    workGroupId: string | null
    workGroupName: string | null
    createdAt: Date
    updatedAt: Date
  }>
> {
  return tx.orderAssignment.findMany({
    where: { orderId },
    select: {
      userId: true,
      companyId: true,
      workGroupId: true,
      workGroupName: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { userId: 'asc' },
  })
}

const T1 = new Date('2026-03-01T10:00:00.000Z')
const T2 = new Date('2026-03-02T18:30:00.000Z')

describe('order-assignment-prisma (integracion)', () => {
  // -------------------------------------------------------------------------
  // insertMissing: el criterio de hecho de T5
  // -------------------------------------------------------------------------

  it('insertMissing con el MISMO lote dos veces crea filas SOLO la primera vez', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA)
      const suelta = await createUser(fixture, fixture.companyA)
      const delGrupo = await createUser(fixture, fixture.companyA)

      const lote: readonly NewAssignment[] = [
        {
          orderId,
          userId: suelta,
          companyId: fixture.companyA,
          workGroupId: null,
          workGroupName: null,
        },
        {
          orderId,
          userId: delGrupo,
          companyId: fixture.companyA,
          workGroupId: grupo.id,
          workGroupName: grupo.name,
        },
      ]

      // Primera pasada: entran las dos (R16).
      expect(await repo.insertMissing(lote, T1)).toBe(2)
      const antes = await readRows(fixture.tx, orderId)
      expect(antes).toHaveLength(2)

      // Segunda pasada, lote IDENTICO y reloj DISTINTO: ni una fila nueva...
      expect(await repo.insertMissing(lote, T2)).toBe(0)

      // ...y ni una fila TOCADA: mismas marcas de tiempo, mismo origen, mismo nombre
      // congelado. Esto es lo que cae si alguien quita `skipDuplicates` (la sentencia
      // reventaria con `23505`) o lo cambia por «borrar y reinsertar» (las marcas pasarian a
      // ser las de T2).
      expect(await readRows(fixture.tx, orderId)).toEqual(antes)
      for (const fila of antes) {
        expect(fila.createdAt).toEqual(T1)
        expect(fila.updatedAt).toEqual(T1)
      }
    })
  })

  it('reaplicar el grupo RENOMBRADO no reescribe el nombre congelado y solo mete al que falta', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno A ${randomUUID()}`)
      const veterano = await createUser(fixture, fixture.companyA)
      const recienLlegado = await createUser(fixture, fixture.companyA)

      const fila = (userId: string, workGroupName: string): NewAssignment => ({
        orderId,
        userId,
        companyId: fixture.companyA,
        workGroupId: grupo.id,
        workGroupName,
      })

      expect(await repo.insertMissing([fila(veterano, grupo.name)], T1)).toBe(1)

      // El grupo se renombra DESPUES y se reaplica con los dos miembros: el nombre nuevo solo
      // se congela en la fila NUEVA (QC-86 dec. 2, R22, R28).
      const nombreNuevo = `Turno B ${randomUUID()}`
      const creadas = await repo.insertMissing(
        [fila(veterano, nombreNuevo), fila(recienLlegado, nombreNuevo)],
        T2,
      )
      expect(creadas).toBe(1)

      const rows = await readRows(fixture.tx, orderId)
      const delVeterano = rows.find((row) => row.userId === veterano)
      const delRecien = rows.find((row) => row.userId === recienLlegado)
      expect(delVeterano?.workGroupName).toBe(grupo.name)
      expect(delVeterano?.createdAt).toEqual(T1)
      expect(delRecien?.workGroupName).toBe(nombreNuevo)
      expect(delRecien?.createdAt).toEqual(T2)
    })
  })

  it('insertMissing escribe created_at y updated_at con el `now` recibido, no con el de la base', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const userId = await createUser(fixture, fixture.companyA)

      expect(
        await repo.insertMissing(
          [{ orderId, userId, companyId: fixture.companyA, workGroupId: null, workGroupName: null }],
          T1,
        ),
      ).toBe(1)

      const [fila] = await readRows(fixture.tx, orderId)
      expect(fila?.createdAt).toEqual(T1)
      expect(fila?.updatedAt).toEqual(T1)
    })
  })

  it('insertMissing con un lote vacio no escribe nada y devuelve 0', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)

      expect(await repo.insertMissing([], T1)).toBe(0)
      expect(await readRows(fixture.tx, orderId)).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // listByOrderInCompany
  // -------------------------------------------------------------------------

  it('listByOrderInCompany devuelve el origen de cada fila, ordenado por user_id', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA)
      const ids = [
        await createUser(fixture, fixture.companyA),
        await createUser(fixture, fixture.companyA),
        await createUser(fixture, fixture.companyA),
      ]

      await repo.insertMissing(
        ids.map((userId, i) => ({
          orderId,
          userId,
          companyId: fixture.companyA,
          workGroupId: i === 0 ? null : grupo.id,
          workGroupName: i === 0 ? null : grupo.name,
        })),
        T1,
      )

      const filas = await repo.listByOrderInCompany(fixture.companyA, orderId)
      expect(filas.map((fila) => fila.userId)).toEqual([...ids].sort())
      const suelta = filas.find((fila) => fila.userId === ids[0])
      expect(suelta).toEqual({ userId: ids[0], workGroupId: null, workGroupName: null })
      const deGrupo = filas.find((fila) => fila.userId === ids[1])
      expect(deGrupo?.workGroupId).toBe(grupo.id)
      expect(deGrupo?.workGroupName).toBe(grupo.name)
    })
  })

  it('listByOrderInCompany no devuelve nada si se pregunta con OTRA empresa (R7)', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const userId = await createUser(fixture, fixture.companyA)
      await repo.insertMissing(
        [{ orderId, userId, companyId: fixture.companyA, workGroupId: null, workGroupName: null }],
        T1,
      )

      expect(await repo.listByOrderInCompany(fixture.companyB, orderId)).toEqual([])
      expect(await repo.listByOrderInCompany(fixture.companyA, orderId)).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // deleteOne y deleteByWorkGroup: borrado FISICO (QC-86 R15)
  // -------------------------------------------------------------------------

  it('deleteOne borra FISICAMENTE una fila y devuelve not_found cuando no habia ninguna', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const userId = await createUser(fixture, fixture.companyA)
      const ajeno = await createUser(fixture, fixture.companyA)
      await repo.insertMissing(
        [{ orderId, userId, companyId: fixture.companyA, workGroupId: null, workGroupName: null }],
        T1,
      )

      // Esa persona no es responsable -> R30, y sin lanzar ninguna excepcion.
      expect(await repo.deleteOne(fixture.companyA, orderId, ajeno)).toBe('not_found')
      // La empresa esta en el `where`: preguntar desde la otra no borra (R7).
      expect(await repo.deleteOne(fixture.companyB, orderId, userId)).toBe('not_found')
      expect(await readRows(fixture.tx, orderId)).toHaveLength(1)

      expect(await repo.deleteOne(fixture.companyA, orderId, userId)).toBe('ok')
      // FISICO: la fila no queda marcada, desaparece.
      expect(await readRows(fixture.tx, orderId)).toEqual([])
      expect(await repo.deleteOne(fixture.companyA, orderId, userId)).toBe('not_found')
    })
  })

  it('deleteByWorkGroup borra solo las filas de ESE grupo y devuelve cuantas (R32, R34)', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx)
      const orderId = await createOrder(fixture)
      const otroPedido = await createOrder(fixture)
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA)
      const otroGrupo = await createWorkGroup(fixture.tx, fixture.companyA)
      const delGrupo1 = await createUser(fixture, fixture.companyA)
      const delGrupo2 = await createUser(fixture, fixture.companyA)
      const delOtroGrupo = await createUser(fixture, fixture.companyA)
      const suelta = await createUser(fixture, fixture.companyA)

      await repo.insertMissing(
        [
          {
            orderId,
            userId: delGrupo1,
            companyId: fixture.companyA,
            workGroupId: grupo.id,
            workGroupName: grupo.name,
          },
          {
            orderId,
            userId: delGrupo2,
            companyId: fixture.companyA,
            workGroupId: grupo.id,
            workGroupName: grupo.name,
          },
          {
            orderId,
            userId: delOtroGrupo,
            companyId: fixture.companyA,
            workGroupId: otroGrupo.id,
            workGroupName: otroGrupo.name,
          },
          {
            orderId,
            userId: suelta,
            companyId: fixture.companyA,
            workGroupId: null,
            workGroupName: null,
          },
          // Mismo grupo, OTRO pedido: no lo toca, porque el `where` lleva `order_id`.
          {
            orderId: otroPedido,
            userId: delGrupo1,
            companyId: fixture.companyA,
            workGroupId: grupo.id,
            workGroupName: grupo.name,
          },
        ],
        T1,
      )

      expect(await repo.deleteByWorkGroup(fixture.companyB, orderId, grupo.id)).toBe(0)
      expect(await repo.deleteByWorkGroup(fixture.companyA, orderId, grupo.id)).toBe(2)

      const quedan = await readRows(fixture.tx, orderId)
      expect(quedan.map((fila) => fila.userId).sort()).toEqual([delOtroGrupo, suelta].sort())
      expect(await readRows(fixture.tx, otroPedido)).toHaveLength(1)

      // Idempotente: volver a quitar el mismo grupo no borra nada y no lanza.
      expect(await repo.deleteByWorkGroup(fixture.companyA, orderId, grupo.id)).toBe(0)
    })
  })
})
