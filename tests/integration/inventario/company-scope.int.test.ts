/**
 * T11 (QC-49, aislamiento-por-empresa-en-inventario) — Lo que la BASE garantiza sobre la
 * empresa del inventario, contra Postgres REAL con `<ts>_inventory_company_scope` aplicada.
 *
 * QUE SE PRUEBA AQUI Y POR QUE NO PUEDE PROBARSE EN OTRO SITIO. Este archivo NO prueba el
 * aislamiento -esa es la frontera del SERVICE, y la prueban `company-isolation-service.test.ts`
 * (T12) y `company-scope-queries.int.test.ts` (T13)-. Aqui se prueba la DEFENSA DE ABAJO: que
 * la fila de inventario sin empresa, o con una empresa que no existe, o con una empresa que no
 * cuadra con la de su producto, su presentacion o su unidad, NO SE PUEDE ESCRIBIR aunque nadie
 * valide antes. Un doble del puerto no puede decir nada de eso, y el test de texto del SQL
 * (T10) solo dice que la restriccion esta ESCRITA, no que muerda.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita por un test
 * sobrevive, y la base queda EXACTAMENTE como se encontro. Patron copiado literal de
 * `unidades-constraints.int.test.ts` (QC-32 T11) y `inventario-constraints.int.test.ts`.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «hay N productos» ni «la tabla esta vacia». Cada
 * caso siembra SU empresa, SU producto y SU presentacion, con marcadores irrepetibles, y mira
 * solo lo suyo. La base es compartida y otras sesiones corren a la vez.
 *
 * SQL CRUDO para todo lo que se espera que la base rechace, por dos motivos: (1) omitir una
 * columna obligatoria no se puede expresar con la API tipada -no compilaria, que es justamente
 * lo que R13 persigue-, y (2) solo el raw propaga el SQLSTATE de Postgres. Los caminos felices
 * van con la API tipada, que es el camino real de la app.
 *
 * SQLSTATE **Y ETIQUETA**, nunca el texto traducido. En esta maquina Postgres responde en
 * espanol, asi que no se afirma sobre la prosa del mensaje; pero los dos disparadores de QC-49
 * empiezan su `RAISE` con una ETIQUETA propia en ingles y estable
 * -`product_batches_company_differs_from_product`,
 * `product_batches_company_differs_from_presentation`, `presentations_unit_foreign_company`-,
 * y este archivo afirma CUAL salto. Un `23514` a secas dejaria pasar un disparador que rechaza
 * siempre por el motivo equivocado, que es el fallo que mas facil se cuela aqui.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase, porque
 * Prisma se conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y
 * autorizacion`). R5 lo cierran `tests/guards/guard-rls-force.test.ts` y el test de texto de
 * T10; escribirlo aqui seria un falso verde.
 *
 * Cubre R1, R2, R3, R7, R20, R21, R22 y R23.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

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
/** Violacion de CHECK. Es el que levantan los dos disparadores de QC-49, con
 *  `USING ERRCODE = '23514'` a proposito (`design.md > 2.4`). */
const CHECK_VIOLATION = '23514'

/** Lo que un rechazo de la base deja ver: el codigo estable y el texto, para la etiqueta. */
type Rechazo = { readonly sqlState: string; readonly texto: string }

/**
 * SQLSTATE + texto del error.
 *
 * El SQLSTATE se lee de `meta.code`, no del texto. El TEXTO se junta del mensaje del error y
 * de su `meta`, porque Prisma coloca el mensaje de Postgres en un sitio u otro segun la via
 * (`$executeRaw` frente a la API tipada) y lo unico que este archivo busca en el es la ETIQUETA
 * del disparador, que es un identificador ASCII estable y no una frase traducible.
 */
function rechazoDe(error: unknown): Rechazo {
  let sqlState = ''
  const partes: string[] = []
  if (error instanceof Error) partes.push(error.message)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    sqlState = error.code
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null) {
      partes.push(JSON.stringify(meta))
      if ('code' in meta) {
        const code: unknown = (meta as { code: unknown }).code
        if (typeof code === 'string') sqlState = code
      }
    }
  }
  return { sqlState, texto: partes.join(' | ') }
}

/**
 * Corre `run` esperando que la base lo rechace. Devuelve el rechazo para que el caso afirme
 * sobre el tipo EXACTO de violacion y sobre la etiqueta del disparador, y deja la transaccion
 * utilizable: un error de restriccion aborta la transaccion entera de Postgres, y varios casos
 * necesitan seguir consultando DESPUES del rechazo para comprobar que no se escribio nada.
 */
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
// Datos de apoyo — cada caso siembra los suyos
// ---------------------------------------------------------------------------

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Empresa propia del caso. `companies` tiene borrado logico y su indice unico de nombre es
 *  parcial sobre las vivas, asi que el marcador evita cualquier choque. */
async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marcador}`, nameNormalized: `empresa${marcador}` },
    select: { id: true },
  })
  return company.id
}

/** Unidad DE SISTEMA (`company_id` nulo, QC-76 R11): vale para cualquier empresa. */
async function crearUnidadDeSistema(
  tx: Prisma.TransactionClient,
  marcador: string,
): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marcador}`,
      nameNormalized: `unidad${marcador}`,
      symbol: `u${marcador.slice(0, 8)}`,
      companyId: null,
    },
    select: { id: true },
  })
  return unit.id
}

/** Unidad DE UNA EMPRESA (QC-76 R9). Es la que `presentations_check_unit_scope` acota. */
async function crearUnidadDeEmpresa(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marcador}`,
      nameNormalized: `unidad${marcador}`,
      symbol: `u${marcador.slice(0, 8)}`,
      companyId,
    },
    select: { id: true },
  })
  return unit.id
}

/** Producto de una empresa. `products.name` NO es unico (QC-14 D14, QC-49 R21). */
async function crearProducto(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
  name = `Producto ${marcador}`,
): Promise<string> {
  const product = await tx.product.create({
    data: { name, nameNormalized: `producto${marcador}`, companyId },
    select: { id: true },
  })
  return product.id
}

/** Presentacion de una empresa, con su unidad. `nameNormalized` se escribe LITERAL, sin llamar
 *  a `normalizePresentationName`: lo que aqui se prueba es el INDICE, no el algoritmo -que
 *  prueba `tests/unit/inventario/presentation-name.test.ts`-. Si este archivo importara la
 *  funcion, un fallo del algoritmo podria dejarlo verde. */
async function crearPresentacion(
  tx: Prisma.TransactionClient,
  nameNormalized: string,
  companyId: string,
  unitId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name: `Presentacion ${nameNormalized}`, nameNormalized, companyId, unitId },
    select: { id: true },
  })
  return presentation.id
}

// ---------------------------------------------------------------------------
// El SQL de la migracion, leido del disco
// ---------------------------------------------------------------------------

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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
  name.endsWith('_inventory_company_scope'),
)
expect(scopeDirs, 'debe existir exactamente una migracion *_inventory_company_scope').toHaveLength(
  1,
)
const migrationDir = join(migrationsDir, scopeDirs[0] as string)

/**
 * El primer bloque `DO $$ ... $$` de un archivo .sql de la migracion.
 *
 * Se ejecuta EL MISMO TEXTO que aplico la migracion, leido del disco: reescribirlo aqui a mano
 * convertiria estos dos casos en un test de la copia y no del original, y el dia que el
 * original cambiara seguirian verdes. Es la unica via para ejercitar un backfill y una guardia
 * de reversion sin desaplicar la migracion en una base compartida.
 */
function bloqueDoDe(archivo: string): string {
  // LOS COMENTARIOS NO SE QUITAN, y esto costo un rojo: los dos `.sql` llevan `--` DENTRO de
  // los mensajes de sus `RAISE EXCEPTION` (`... la empresa inicial --`pnpm run db:seed`-- o
  // renombra ...`). Un barrido de `--.*$` los corta a mitad de literal y el bloque deja de ser
  // SQL valido. Los `--` que si son comentarios viven dentro del bloque y Postgres los ignora
  // solo, que es exactamente lo que hace al aplicar la migracion.
  const sql = readFileSync(join(migrationDir, archivo), 'utf8')
  const match = /DO\s+\$\$[\s\S]*?\$\$;/.exec(sql)
  if (match === null) throw new Error(`${archivo} no tiene ningun bloque DO $$`)
  return match[0]
}

const BACKFILL = bloqueDoDe('migration.sql')
const GUARDIA_DEL_DOWN = bloqueDoDe('down.sql')

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('R1 — la empresa es obligatoria y tiene que existir, en las tres tablas', () => {
  it('rechaza con 23502 un producto, una presentacion y un lote SIN empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, companyId, unitId)

      // SQL CRUDO: omitir una columna obligatoria no se puede expresar con la API tipada -no
      // compilaria, que es exactamente lo que R13 busca-, asi que el INSERT literal es la
      // unica forma de intentarlo. En cada uno la UNICA columna obligatoria que falta es
      // `company_id`, asi que el 23502 solo puede venir de ella.
      const producto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "products" ("name", "name_normalized", "updated_at")
          VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, CURRENT_TIMESTAMP)`,
        'producto sin empresa',
      )
      expect(producto.sqlState).toBe(NOT_NULL_VIOLATION)

      const presentacion = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "updated_at")
          VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, CAST(${unitId} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion sin empresa',
      )
      expect(presentacion.sqlState).toBe(NOT_NULL_VIOLATION)

      // R2 — EL LOTE TIENE COLUMNA PROPIA Y NO LA DEDUCE DE SU PRODUCTO. Este INSERT apunta a
      // un producto que SI declara empresa, y aun asi se rechaza: si la columna del lote se
      // hubiera modelado como derivacion por `join` -decision cerrada 2, que la descarta-,
      // este caso seria verde y QC-81 no tendria donde colgar la unicidad `(empresa, lote)`.
      const lote = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CURRENT_TIMESTAMP)`,
        'lote sin empresa, con un producto que si la declara',
      )
      expect(lote.sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ni modificar ninguna fila»: ninguno de los tres intentos escribio.
      expect(
        await tx.product.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0)
      expect(
        await tx.presentation.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0)
      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('rechaza con 23503 una empresa que no corresponde a ninguna existente, en las tres', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, companyId, unitId)
      // Sintacticamente valido y sin fila detras: el unico que puede rechazarlo es la FK.
      const inventada = randomUUID()

      // CRUDO tambien aqui, aunque la API tipada SI podria expresarlo: solo el raw propaga el
      // SQLSTATE de Postgres. Por la API tipada esto llega como `P2003`, el codigo PROPIO de
      // Prisma, y afirmar sobre el probaria que Prisma sabe traducir, no que la base rechaza.
      const producto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "products" ("name", "name_normalized", "company_id", "updated_at")
          VALUES (${`Empresa inventada ${marcador}`}, ${`inventada${marcador}`}, CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'producto con una empresa inexistente',
      )
      expect(producto.sqlState).toBe(FOREIGN_KEY_VIOLATION)

      const presentacion = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`Empresa inventada ${marcador}`}, ${`inventadapres${marcador}`}, CAST(${unitId} AS uuid), CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion con una empresa inexistente',
      )
      expect(presentacion.sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // El lote apunta a un producto y una presentacion REALES, de una empresa REAL, y declara
      // una empresa inventada. Aqui hay DOS guardianes y el disparador `BEFORE` habla ANTES que
      // la FK, asi que se acepta cualquiera de los dos codigos: lo que R1 exige es que la fila
      // NO se escriba, no cual de las dos defensas la para.
      const lote = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'lote con una empresa inexistente',
      )
      expect([FOREIGN_KEY_VIOLATION, CHECK_VIOLATION]).toContain(lote.sqlState)

      expect(await tx.product.count({ where: { companyId: inventada } })).toBe(0)
      expect(await tx.presentation.count({ where: { companyId: inventada } })).toBe(0)
      expect(await tx.productBatch.count({ where: { companyId: inventada } })).toBe(0)
    })
  })
})

describe('R22 — la empresa del lote tiene que ser la de su producto Y la de su presentacion', () => {
  it('rechaza el lote cuya empresa NO es la de su producto, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      // El producto es de A; la presentacion, de B. El lote se declara de B: cuadra con su
      // presentacion y NO con su producto, asi que solo puede saltar el primer caso del
      // disparador. Montarlo asi -y no con las dos discrepancias a la vez- es lo que permite
      // afirmar CUAL de los dos mensajes salio.
      const productId = await crearProducto(tx, `a${marcador}`, empresaA)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaB, unitId)

      // CRUDO: solo el raw propaga el SQLSTATE **y el texto** del `RAISE` del disparador, que
      // es donde viaja la etiqueta que este caso afirma. Por la API tipada el error llega como
      // `PrismaClientUnknownRequestError`, sin codigo y sin mensaje util.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${empresaB} AS uuid), CURRENT_TIMESTAMP)`,
        'lote de la empresa B colgado de un producto de la empresa A',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_product')
      // Y NO el otro caso del mismo disparador: si los dos mensajes fueran iguales, este
      // `not.toContain` no podria escribirse y el caso no probaria cual salto.
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from_presentation')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('rechaza el lote cuya empresa NO es la de su presentacion, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      // Ahora al reves: producto y lote de A, presentacion de B. Cuadra con el producto y no
      // con la presentacion, asi que tiene que saltar el SEGUNDO caso.
      const productId = await crearProducto(tx, `a${marcador}`, empresaA)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaB, unitId)

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'lote de la empresa A con una presentacion de la empresa B',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_presentation')
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from_product:')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('acepta el lote cuando las tres empresas coinciden, y tambien rechaza el UPDATE que las separa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const productId = await crearProducto(tx, `a${marcador}`, empresaA)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaA, unitId)

      // La otra mitad, sin la cual el caso pasaria igual con un disparador que rechaza SIEMPRE.
      const batch = await tx.productBatch.create({
        data: {
          productId,
          presentationId,
          stock: 1,
          unitCost: new Prisma.Decimal('1.0000'),
          companyId: empresaA,
        },
        select: { id: true },
      })
      expect(batch.id).toMatch(/^[0-9a-f-]{36}$/u)

      // El disparador es `BEFORE INSERT OR UPDATE`, no solo INSERT: mover el lote a otra
      // empresa dejandolo colgado del mismo producto tambien se rechaza. Sin el `OR UPDATE`,
      // esta seria la puerta de atras por la que un lote acaba en la empresa equivocada.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          UPDATE "product_batches" SET "company_id" = CAST(${empresaB} AS uuid)
           WHERE "id" = CAST(${batch.id} AS uuid)`,
        'mover un lote a otra empresa dejando su producto donde estaba',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_product')

      const releido = await tx.productBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { companyId: true },
      })
      expect(releido.companyId).toBe(empresaA)
    })
  })
})

describe('R23 — la unidad de una presentacion es de su empresa o de sistema', () => {
  it('rechaza la presentacion cuya unidad pertenece a OTRA empresa, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unidadDeB = await crearUnidadDeEmpresa(tx, `b${marcador}`, empresaB)

      // La FK `presentations_unit_id_fkey` NO mira de quien es la unidad -esa es la razon de
      // ser del disparador-: la unidad existe, asi que el 23503 no puede saltar y lo unico que
      // puede rechazar esto es `presentations_check_unit_scope`.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`Ajena ${marcador}`}, ${`ajena${marcador}`}, CAST(${unidadDeB} AS uuid), CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion de la empresa A con una unidad de la empresa B',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('presentations_unit_foreign_company')
      // Y no es el disparador del lote el que hablo: los tres mensajes son distinguibles.
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from')

      expect(await tx.presentation.count({ where: { nameNormalized: `ajena${marcador}` } })).toBe(0)
    })
  })

  it('acepta la unidad de SU empresa y la unidad DE SISTEMA', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const unidadDeA = await crearUnidadDeEmpresa(tx, `propia${marcador}`, empresaA)
      const unidadDeSistema = await crearUnidadDeSistema(tx, `sistema${marcador}`)

      // Sin estas dos mitades, el caso de arriba pasaria igual con un disparador que rechaza
      // toda presentacion. La de SISTEMA es ademas la excepcion que QC-76 (R11) dejo abierta a
      // proposito: `units.company_id IS NULL` significa «de todas», y el disparador lo
      // comprueba explicitamente en vez de confiar en que `<>` con un nulo no sea cierto.
      const propia = await crearPresentacion(tx, `propia${marcador}`, empresaA, unidadDeA)
      const sistema = await crearPresentacion(tx, `sistema${marcador}`, empresaA, unidadDeSistema)

      const filas = await tx.presentation.findMany({
        where: { id: { in: [propia, sistema] } },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.every((fila) => fila.companyId === empresaA)).toBe(true)
    })
  })
})

describe('R20 — el nombre de presentacion es unico POR EMPRESA, no en todo el catalogo', () => {
  it('ACEPTA el mismo nombre normalizado en dos empresas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      // Es la mitad de R20 que el indice GLOBAL de QC-20 hacia IMPOSIBLE, y la razon de que la
      // migracion lo cambie en vez de anadir uno al lado: cada empresa tiene su «Garrafa 20 L».
      const compartido = `garrafa20l${marcador}`
      const deA = await crearPresentacion(tx, compartido, empresaA, unitId)
      const deB = await crearPresentacion(tx, compartido, empresaB, unitId)

      const filas = await tx.presentation.findMany({
        where: { nameNormalized: compartido },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]))
      expect(new Set([deA, deB]).size).toBe(2)
    })
  })

  it('RECHAZA con 23505 el mismo nombre normalizado dentro de la MISMA empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const compartido = `garrafa20l${marcador}`
      const primera = await crearPresentacion(tx, compartido, empresaA, unitId)

      // Nombre ORIGINAL distinto y misma clave normalizada: lo que choca es la clave, contra el
      // INDICE UNICO `presentations_company_name_unique` y no contra ninguna comprobacion
      // previa al vuelo, que es lo que R20 exige literalmente.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`GARRAFA-20L ${marcador}`}, ${compartido}, CAST(${unitId} AS uuid), CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda presentacion con el mismo nombre normalizado en la misma empresa',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)

      // «No crear ni modificar ninguna fila»: solo sobrevive la primera.
      const filas = await tx.presentation.findMany({
        where: { nameNormalized: compartido },
        select: { id: true },
      })
      expect(filas).toEqual([{ id: primera }])
    })
  })
})

describe('R21 — el nombre de producto no gana ninguna unicidad', () => {
  it('acepta dos productos con el mismo nombre DENTRO de la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const nombre = `Sosa caustica ${marcador}`

      // Que dos productos puedan llamarse igual es decision cerrada de QC-20 (D14) y esta ficha
      // NO la reabre: si alguien anadiera `UNIQUE (company_id, name_normalized)` sobre
      // `products` «por simetria» con `presentations`, este caso lo caza con un 23505 en vez de
      // descubrirse en produccion.
      const primero = await crearProducto(tx, marcador, empresaA, nombre)
      const segundo = await tx.product.create({
        data: { name: nombre, nameNormalized: `producto${marcador}`, companyId: empresaA },
        select: { id: true },
      })

      expect(new Set([primero, segundo.id]).size).toBe(2)
      const filas = await tx.product.findMany({
        where: { id: { in: [primero, segundo.id] } },
        select: { id: true, name: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.every((fila) => fila.name === nombre && fila.companyId === empresaA)).toBe(true)
    })
  })
})

describe('R3 — el backfill asigna TODAS las filas que ya existian a «QuimiCloud»', () => {
  it('rellena productos vivos, productos borrados, presentaciones y lotes, y no pierde ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()

      // Se reconstruye el estado ANTERIOR a la migracion dentro de la transaccion: las tres
      // columnas vuelven a ser anulables y se siembran filas SIN empresa. Es la unica forma de
      // ejercitar el backfill de verdad sin desaplicar la migracion en una base compartida, y
      // el `ROLLBACK` deshace tanto el DDL como los datos -en Postgres el DDL es
      // transaccional-.
      for (const tabla of ['products', 'presentations', 'product_batches']) {
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${tabla}" ALTER COLUMN "company_id" DROP NOT NULL`,
        )
      }

      const unitId = await crearUnidadDeSistema(tx, marcador)
      const vivo = randomUUID()
      const borrado = randomUUID()
      const presentacion = randomUUID()
      const lote = randomUUID()

      // Productos: uno VIVO y uno con BORRADO LOGICO. El borrado esta aqui a proposito: la
      // columna va a ser NOT NULL y un borrado logico sigue siendo una fila, asi que el
      // backfill que lo saltara dejaria la migracion sin poder apretar el `SET NOT NULL`.
      await tx.$executeRawUnsafe(
        `INSERT INTO "products" ("id","name","name_normalized","updated_at")
         VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP)`,
        vivo,
        `Vivo ${marcador}`,
        `vivo${marcador}`,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "products" ("id","name","name_normalized","deleted_at","updated_at")
         VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        borrado,
        `Borrado ${marcador}`,
        `borrado${marcador}`,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "presentations" ("id","name","name_normalized","unit_id","updated_at")
         VALUES ($1::uuid, $2, $3, $4::uuid, CURRENT_TIMESTAMP)`,
        presentacion,
        `Presentacion ${marcador}`,
        `presentacion${marcador}`,
        unitId,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "product_batches" ("id","product_id","presentation_id","stock","unit_cost","updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 1.0000, CURRENT_TIMESTAMP)`,
        lote,
        vivo,
        presentacion,
      )

      const antes = {
        productos: await tx.product.count(),
        presentaciones: await tx.presentation.count(),
        lotes: await tx.productBatch.count(),
        empresas: await tx.company.count(),
      }

      // EL MISMO TEXTO que aplico la migracion, leido del disco (ver `bloqueDoDe`).
      await tx.$executeRawUnsafe(BACKFILL)

      const quimicloud = await tx.company.findFirstOrThrow({
        where: { nameNormalized: 'quimicloud' },
        select: { id: true },
      })

      // Las CUATRO filas sembradas quedan asignadas, incluida la del borrado logico.
      const productos = await tx.product.findMany({
        where: { id: { in: [vivo, borrado] } },
        select: { id: true, companyId: true, deletedAt: true },
      })
      expect(productos).toHaveLength(2)
      expect(productos.every((fila) => fila.companyId === quimicloud.id)).toBe(true)
      expect(productos.filter((fila) => fila.deletedAt !== null)).toHaveLength(1)

      const filaPresentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentacion },
        select: { companyId: true },
      })
      expect(filaPresentacion.companyId).toBe(quimicloud.id)

      const filaLote = await tx.productBatch.findUniqueOrThrow({
        where: { id: lote },
        select: { companyId: true },
      })
      expect(filaLote.companyId).toBe(quimicloud.id)

      // R4, la mitad que se puede medir contra la base: el backfill ESCRIBE, no borra ni
      // inserta. El numero de filas de las cuatro tablas es exactamente el de antes.
      expect({
        productos: await tx.product.count(),
        presentaciones: await tx.presentation.count(),
        lotes: await tx.productBatch.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes)

      // Y NO queda ningun nulo: es la condicion que el `SET NOT NULL` del bloque 3 necesita.
      const nulos = await tx.$queryRaw<{ pendientes: bigint }[]>`
        SELECT (SELECT count(*) FROM "products"        WHERE "company_id" IS NULL)
             + (SELECT count(*) FROM "presentations"   WHERE "company_id" IS NULL)
             + (SELECT count(*) FROM "product_batches" WHERE "company_id" IS NULL) AS "pendientes"`
      expect(Number(nulos[0]?.pendientes ?? -1)).toBe(0)
    })
  })
})

describe('R7 — revertir con inventario de otra empresa aborta la reversion entera', () => {
  it('la guardia del down.sql lanza si hay una sola fila de una empresa que no es la del UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const ajena = await crearEmpresa(tx, `ajena${marcador}`)
      await crearProducto(tx, marcador, ajena)

      // EL MISMO TEXTO del `down.sql`, leido del disco. Se ejecuta SOLO su guardia -el primer
      // bloque `DO $$`- y no el archivo entero a proposito: los `DROP` posteriores tomarian
      // ACCESS EXCLUSIVE sobre las tres tablas y bloquearian a cualquier otra sesion de la base
      // compartida mientras dura la transaccion del test. Lo que R7 exige se decide EN LA
      // GUARDIA, que es lo primero del archivo y lo unico que puede impedir la perdida.
      // Va dentro de un SAVEPOINT: el `RAISE` aborta la transaccion de Postgres entera, y este
      // caso necesita seguir consultando DESPUES para comprobar que la fila ajena sigue viva.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_DEL_DOWN),
        'reversion con inventario de otra empresa',
      )
      expect(rechazo.texto).toContain('QC-49 down')

      // «No descartar ese dato en silencio»: la fila ajena sigue entera y con SU empresa.
      const fila = await tx.product.findFirstOrThrow({
        where: { companyId: ajena },
        select: { companyId: true },
      })
      expect(fila.companyId).toBe(ajena)
    })
  })

  it('sin la comprobacion de filas ajenas, la guardia deja pasar: el test no es un placebo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const ajena = await crearEmpresa(tx, `ajena${marcador}`)
      await crearProducto(tx, marcador, ajena)

      // MUTACION EN MEMORIA del mismo texto -el archivo del disco NO se toca-: se anula la
      // comprobacion de inventario ajeno y se deja el resto de la guardia igual. Si con la
      // mutacion tambien abortara, el caso de arriba estaria abortando por otra cosa
      // -resolucion de la empresa, nombres repetidos- y no probaria R7.
      const mutada = GUARDIA_DEL_DOWN.replace(
        /SELECT \(SELECT count\(\*\) FROM "products"[\s\S]*?INTO filas_ajenas;/,
        'filas_ajenas := 0;',
      )
      expect(mutada, 'la mutacion no cambio la guardia').not.toBe(GUARDIA_DEL_DOWN)

      await expect(tx.$executeRawUnsafe(mutada)).resolves.not.toThrow()
    })
  })
})
