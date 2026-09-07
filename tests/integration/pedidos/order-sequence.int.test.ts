/**
 * T17 (QC-34) — la SECUENCIA POR ANO del correlativo (`next_order_sequence`, `design.md > 4`)
 * contra una base Postgres REAL con la migracion `20260904135210_order_cancellation` aplicada.
 *
 * Requisitos cubiertos: R11, R12, R13.
 *
 * Cierra la pregunta abierta 2 de QC-33: quien entrega el numero y que pasa con dos altas
 * simultaneas. Nada de esto se puede demostrar con un doble —lo que se prueba es el
 * comportamiento de Postgres: que `nextval` no espera, que `CREATE SEQUENCE` es transaccional,
 * que un `pg_advisory_xact_lock` bloquea a la segunda sesion y que un numero consumido por una
 * transaccion abortada no vuelve—.
 *
 * AISLAMIENTO — los cinco casos, salvo el de concurrencia, corren dentro de
 * `prisma.$transaction` interactiva que SIEMPRE termina en `ROLLBACK`. En Postgres el
 * `CREATE SEQUENCE` es transaccional, asi que la secuencia que crea el caso desaparece con el
 * rollback igual que sus filas. Los tests de `tests/integration/` corren EN SERIE contra UNA
 * base compartida (`vitest.config.mts`, `fileParallelism: false`) y algun archivo afirma sobre
 * el estado global de una tabla: aqui no se puede dejar ni una fila ni una secuencia.
 *
 * EL CASO CONCURRENTE ES LA EXCEPCION, Y ES INEVITABLE (`design.md > 12`, segundo aviso): hacen
 * falta DOS CONEXIONES DE VERDAD, porque con dos `await` sobre la misma no hay concurrencia y el
 * caso pasaria por casualidad. Y para que la segunda sesion encuentre la secuencia por el
 * `IF NOT EXISTS`, la primera tiene que CONFIRMAR: la secuencia sobrevive al caso a proposito.
 * Por eso ese caso trabaja SOLO sobre la funcion —ni una fila de `orders`— y `afterAll` borra
 * todas las secuencias `orders_sequence_%` de los anos de prueba. Insertar pedidos ahi obligaria
 * a confirmar tambien la receta, la unidad y el usuario de sus FK (una transaccion no ve lo que
 * otra no ha confirmado), y eso si contaminaria la base compartida.
 *
 * ANOS DE PRUEBA MUY LEJANOS (28xx) — el CHECK `orders_order_year_matches_created_at` (QC-33
 * R41) ata `order_year` al ano UTC de `created_at`, asi que cada alta de estos casos fija su
 * `created_at`. Se usan anos que ninguna otra prueba ni la aplicacion pueden tocar, para que
 * `orders_sequence_<ano>` no exista nunca antes del caso y su limpieza no pueda llevarse por
 * delante la secuencia de un ano real.
 *
 * SE AFIRMA SOBRE EL SQLSTATE, NUNCA SOBRE EL TEXTO del mensaje: en esta maquina Postgres
 * responde en espanol (`design.md > 12`, primer aviso).
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Anos de prueba y limpieza
// ---------------------------------------------------------------------------

/** Un ano por caso: asi ningun caso hereda la secuencia de otro ni depende del orden. */
const YEAR_PRIMERA_ALTA = 2871
const YEAR_DOS_ALTAS = 2872
const YEAR_HUECO = 2873
const YEAR_ANTERIOR = 2874
const YEAR_SIGUIENTE = 2875
const YEAR_CONCURRENCIA = 2876

const TEST_YEARS = [
  YEAR_PRIMERA_ALTA,
  YEAR_DOS_ALTAS,
  YEAR_HUECO,
  YEAR_ANTERIOR,
  YEAR_SIGUIENTE,
  YEAR_CONCURRENCIA,
] as const

/** Borra las secuencias de los anos de prueba. Se llama ANTES y DESPUES: antes, porque un caso
 *  de una corrida anterior interrumpida no puede decidir el resultado de esta; despues, porque
 *  la secuencia del caso concurrente queda confirmada y contaminaria la corrida siguiente. */
async function dropTestSequences(): Promise<void> {
  for (const year of TEST_YEARS) {
    await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "orders_sequence_${String(year)}"`)
  }
}

/** ¿Existe la secuencia de ese ano? Se pregunta al catalogo, no se deduce de un error. */
async function sequenceExists(
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  year: number,
): Promise<boolean> {
  const filas = await client.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c
    WHERE c.relkind = 'S' AND c.relname = ${`orders_sequence_${String(year)}`}`
  return filas.length === 1
}

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (copia literal de `pedidos-constraints.int.test.ts`)
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

let savepointSeq = 0

/** `check_violation`. Estable y ajeno al idioma del servidor. */
const CHECK_VIOLATION = '23514'

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
// Datos de apoyo — las cuatro FK del pedido son reales
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

interface Fixtures {
  readonly unitId: string
  readonly recipeId: string
  readonly userId: string
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token()
  const unit = await tx.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: 'kg' },
    select: { id: true },
  })
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}` },
    select: { id: true },
  })
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  // Empresa efimera propia de este fixture: QC-47 R9 hizo `users.company_id` obligatoria, asi
  // que ningun usuario se puede crear ya sin una. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName` -la UNICA definicion de «mismo
  // nombre de empresa» (R3), importada del contrato publico de `identity`-, nunca de una copia
  // escrita a mano aqui.
  const companyName = `Empresa ${marca}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
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
      companyId: company.id,
    },
    select: { id: true },
  })
  return { unitId: unit.id, recipeId: recipe.id, userId: user.id }
}

/** Un instante dentro del ano pedido, para que el CHECK que ata `order_year` a `created_at`
 *  (QC-33 R41) se satisfaga sin que el ano se escriba dos veces con dos cuentas distintas. */
function instantIn(year: number): string {
  return `${String(year)}-06-15T12:00:00Z`
}

interface AltaHecha {
  readonly id: string
  readonly sequence: number
}

/**
 * Da de alta un pedido con LA MISMA sentencia que
 * `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts > createOrder`: el numero se
 * pide a `next_order_sequence` DENTRO del `INSERT`, que es el punto de `design.md > 4.2`. No se
 * llama a la funcion del adaptador porque esa habla con el cliente Prisma GLOBAL y haria COMMIT
 * fuera de la transaccion del caso.
 *
 * `quantity` es un parametro porque el caso del hueco necesita un alta que consuma su numero y
 * DESPUES sea rechazada: con `0` salta `orders_quantity_positive` (QC-33 R7), que es la unica
 * restriccion que ese alta puede violar.
 */
async function altaConSecuencia(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  year: number,
  quantity = '10',
): Promise<AltaHecha> {
  const filas = await tx.$queryRaw<{ id: string; order_sequence: number }[]>`
    INSERT INTO "orders" (
      "order_year", "order_sequence", "recipe_id", "quantity", "unit_id", "unit_price",
      "priority", "status", "created_by", "updated_by", "created_at", "updated_at"
    ) VALUES (
      ${year}::integer,
      next_order_sequence(${year}::integer),
      ${f.recipeId}::uuid,
      ${quantity}::numeric,
      ${f.unitId}::uuid,
      ${'25'}::numeric,
      ${'BAJA'}::"OrderPriority",
      ${'PENDIENTE'}::"OrderStatus",
      ${f.userId}::uuid,
      ${f.userId}::uuid,
      ${instantIn(year)}::timestamptz,
      ${instantIn(year)}::timestamptz
    )
    RETURNING "id", "order_sequence"
  `
  const fila = filas[0]
  if (fila === undefined) throw new Error('el INSERT del alta no devolvio ninguna fila')
  return { id: fila.id, sequence: Number(fila.order_sequence) }
}

/** La siguiente posicion del ano, pedida directamente a la funcion. */
async function nextSequence(tx: Prisma.TransactionClient, year: number): Promise<number> {
  const filas = await tx.$queryRaw<{ n: number }[]>`
    SELECT next_order_sequence(${year}::integer) AS n`
  const fila = filas[0]
  if (fila === undefined) throw new Error('next_order_sequence no devolvio ninguna fila')
  return Number(fila.n)
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  // `design.md > 12`, quinto aviso: si falta la migracion de esta ficha hay que decirlo AQUI,
  // con un mensaje accionable, y no reventar a mitad del primer caso.
  const funciones = await prisma.$queryRaw<{ proname: string }[]>`
    SELECT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'next_order_sequence'`
  if (funciones.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene la funcion `next_order_sequence`: falta la migracion ' +
        '`20260904135210_order_cancellation` de QC-34. Corre `pnpm run db:migrate`.',
    )
  }

  const valores = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'CANCELADO'`
  if (valores.length !== 1) {
    throw new Error(
      'el tipo `OrderStatus` de la base de pruebas no tiene el valor `CANCELADO`: falta la ' +
        'migracion `20260904135210_order_cancellation` de QC-34. Corre `pnpm run db:migrate`.',
    )
  }

  await dropTestSequences()
})

afterAll(async () => {
  // Higiene: la secuencia del caso concurrente queda CONFIRMADA, y sin este borrado la corrida
  // siguiente arrancaria ese ano en 3 y el caso se volveria verde por herencia.
  await dropTestSequences()
  // Defensivo: ningun caso confirma pedidos de estos anos, pero si una corrida se interrumpe a
  // medias, la fila no puede quedarse en una base que otros archivos comparten.
  await prisma.order.deleteMany({ where: { orderYear: { in: [...TEST_YEARS] } } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('la secuencia por ano (R11, R12, R13)', () => {
  it('la primera alta de un ano sin secuencia la crea, arranca en 1 y no falla', async () => {
    // R12. El caso que la decision 10 dejo abierto: las secuencias son infinitas en el tiempo y
    // ninguna migracion puede precrearlas todas, asi que la del ano nace al vuelo la primera vez
    // que alguien pide un numero. Si esto fallara, el 1 de enero no se podria dar de alta nada.
    await inRolledBackTransaction(async (tx) => {
      expect(await sequenceExists(tx, YEAR_PRIMERA_ALTA)).toBe(false)

      const f = await seedFixtures(tx)
      const alta = await altaConSecuencia(tx, f, YEAR_PRIMERA_ALTA)

      expect(alta.sequence).toBe(1)
      expect(await sequenceExists(tx, YEAR_PRIMERA_ALTA)).toBe(true)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id: alta.id },
        select: { orderYear: true, orderSequence: true },
      })
      expect(stored).toEqual({ orderYear: YEAR_PRIMERA_ALTA, orderSequence: 1 })
    })
  })

  it('dos altas del mismo ano obtienen posiciones distintas y consecutivas', async () => {
    // R11. Ninguna de las dos lee el maximo de la tabla ni reintenta: el numero lo entrega la
    // base, que es lo que hace imposible la carrera que QC-33 dejo anotada.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const primera = await altaConSecuencia(tx, f, YEAR_DOS_ALTAS)
      const segunda = await altaConSecuencia(tx, f, YEAR_DOS_ALTAS)

      expect(primera.sequence).toBe(1)
      expect(segunda.sequence).toBe(2)
      expect(segunda.sequence).not.toBe(primera.sequence)

      const filas = await tx.order.findMany({
        where: { id: { in: [primera.id, segunda.id] } },
        select: { orderYear: true, orderSequence: true },
        orderBy: { orderSequence: 'asc' },
      })
      expect(filas).toEqual([
        { orderYear: YEAR_DOS_ALTAS, orderSequence: 1 },
        { orderYear: YEAR_DOS_ALTAS, orderSequence: 2 },
      ])
    })
  })

  it('un alta abortada deja un hueco y la siguiente no lo rellena', async () => {
    // R13 (y QC-33 R42). Los huecos estan ACEPTADOS a conciencia: el numero de un alta que se cae
    // se pierde y nadie lo reutiliza. Una AUSENCIA de restriccion solo se demuestra ejerciendola,
    // asi que si alguien anadiera manana un contador «para que el correlativo no salte», este
    // caso se pondria rojo — que es justo lo que se quiere.
    //
    // La secuencia se crea con la PRIMERA alta, fuera del `SAVEPOINT`: si naciera dentro, el
    // `ROLLBACK TO SAVEPOINT` se la llevaria (en Postgres el `CREATE SEQUENCE` es transaccional)
    // y la tercera alta volveria a empezar en 1 sin que nadie lo notara.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const primera = await altaConSecuencia(tx, f, YEAR_HUECO)
      expect(primera.sequence).toBe(1)

      // El alta que se cae DESPUES de consumir su numero: `quantity = 0` viola
      // `orders_quantity_positive`, y `nextval` ya se evaluo al construir la fila.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => altaConSecuencia(tx, f, YEAR_HUECO, '0'),
        'alta con cantidad cero',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const tercera = await altaConSecuencia(tx, f, YEAR_HUECO)
      expect(tercera.sequence).toBe(3)

      const filas = await tx.order.findMany({
        where: { orderYear: YEAR_HUECO },
        select: { orderSequence: true },
        orderBy: { orderSequence: 'asc' },
      })
      expect(filas).toEqual([{ orderSequence: 1 }, { orderSequence: 3 }])

      // Y el hueco sigue libre: nadie lo relleno por su cuenta.
      const enElHueco = await tx.order.count({
        where: { orderYear: YEAR_HUECO, orderSequence: 2 },
      })
      expect(enElHueco).toBe(0)
    })
  })

  it('un ano nuevo vuelve a arrancar en 1', async () => {
    // R12. La numeracion se reinicia cada ano porque la secuencia es POR ANO, no una global: la
    // del ano siguiente no sabe nada de la del anterior. Es lo que hace que (2874, 1) y
    // (2875, 1) puedan convivir bajo el indice unico de QC-33 R21.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      expect((await altaConSecuencia(tx, f, YEAR_ANTERIOR)).sequence).toBe(1)
      expect((await altaConSecuencia(tx, f, YEAR_ANTERIOR)).sequence).toBe(2)

      const delAnoNuevo = await altaConSecuencia(tx, f, YEAR_SIGUIENTE)
      expect(delAnoNuevo.sequence).toBe(1)

      // La del ano anterior sigue donde estaba: el reinicio no la toco.
      expect(await nextSequence(tx, YEAR_ANTERIOR)).toBe(3)
    })
  })
})

describe('dos altas concurrentes que son las dos la primera del ano (R12)', () => {
  it('las dos acaban bien, con posiciones distintas, en dos conexiones de verdad', async () => {
    // R12, la mitad cara de la decision 10. HACEN FALTA DOS CONEXIONES REALES (`design.md > 12`,
    // segundo aviso): con dos `await` sobre la misma conexion no hay concurrencia y el caso
    // pasaria por casualidad. Se usa `pg` —ya es dependencia del repo, la usa
    // `scripts/db-rollback.ts`— porque una transaccion interactiva de Prisma no permite dejar dos
    // sesiones abiertas a la vez y observar como una espera a la otra.
    //
    // Lo que se demuestra es el `pg_advisory_xact_lock` de la rama de creacion: la sesion B entra
    // al lock cuando A ya confirmo, encuentra la secuencia por el `IF NOT EXISTS` y sigue. Sin el
    // lock, las dos intentarian crear la misma secuencia y una se llevaria un 42P07/23505 de
    // `pg_class` — o, peor, las dos se llevarian el numero 1.
    //
    // Aqui NO se insertan pedidos: ver la cabecera. La secuencia que queda la borra `afterAll`.
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
    if (connectionString === undefined || connectionString.trim() === '') {
      throw new Error(
        'falta DATABASE_URL (o DIRECT_URL) en el entorno. Vitest NO carga `.env`: corre estos ' +
          'tests con las variables cargadas (`set -a && . ./.env && set +a && pnpm test`).',
      )
    }

    const sesionA = new Client({ connectionString })
    const sesionB = new Client({ connectionString })
    await sesionA.connect()
    await sesionB.connect()

    try {
      expect(await sequenceExists(prisma, YEAR_CONCURRENCIA)).toBe(false)

      const pidB = (await sesionB.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]
      if (pidB === undefined) throw new Error('no se pudo leer el pid de la sesion B')

      // A abre transaccion y pide el numero: crea la secuencia y se queda con el lock de aviso
      // hasta que confirme.
      await sesionA.query('BEGIN')
      const filaA = (
        await sesionA.query<{ n: number }>('SELECT next_order_sequence($1) AS n', [
          YEAR_CONCURRENCIA,
        ])
      ).rows[0]
      if (filaA === undefined) throw new Error('la sesion A no obtuvo ninguna posicion')

      // B pide el numero SIN esperar: su promesa queda pendiente contra el lock de A.
      await sesionB.query('BEGIN')
      let terminoB = false
      const promesaB = sesionB
        .query<{ n: number }>('SELECT next_order_sequence($1) AS n', [YEAR_CONCURRENCIA])
        .then((resultado) => {
          terminoB = true
          return resultado
        })

      // Se espera a VER el bloqueo en el catalogo, no a que pase un tiempo: preguntar por
      // `pg_locks` es determinista, un `setTimeout` a ojo seria una carrera disfrazada de test.
      let bloqueada = false
      for (let intento = 0; intento < 50 && !bloqueada; intento += 1) {
        const esperando = await sesionA.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_locks
           WHERE locktype = 'advisory' AND NOT granted AND pid = $1`,
          [pidB.pid],
        )
        bloqueada = (esperando.rows[0]?.n ?? 0) > 0
        if (!bloqueada) await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(bloqueada).toBe(true)
      // Y no ha terminado: esta esperando de verdad, no adelantandose con otro numero.
      expect(terminoB).toBe(false)

      await sesionA.query('COMMIT')

      const filaB = (await promesaB).rows[0]
      if (filaB === undefined) throw new Error('la sesion B no obtuvo ninguna posicion')
      await sesionB.query('ROLLBACK')

      // LAS DOS ACABAN BIEN, y con posiciones DISTINTAS: ninguna fue rechazada y ninguna repitio.
      expect(filaA.n).toBe(1)
      expect(filaB.n).toBe(2)
      expect(filaB.n).not.toBe(filaA.n)
    } finally {
      await sesionA.end()
      await sesionB.end()
      await dropTestSequences()
    }
  })
})
