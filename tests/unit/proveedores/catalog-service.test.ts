// T10, T14, T15 (QC-52) — Los cuatro casos de uso del catalogo, con DOBLES del repositorio.
//
// Cubre R9, R13, R15, R18, R21, R22, R23, R24 y R32.
//
// Reemplaza al archivo de QC-43 T9. Lo que se cayo, y con que regla se caia:
//   - los tres casos que exigian `ProductNotFoundError` cuando el articulo del inventario no
//     existia o estaba dado de baja: QC-43 R26, derogada por la decision cerrada 3 y por R9.
//     La clase de error ya no existe (R32).
//   - el doble de `ProductCatalog` y todas las aserciones de «una sola llamada a findRefs»:
//     QC-43 R26 y R37, derogadas por R18. `proveedores` no consume `inventario`.
//   - el caso que fijaba el duplicado por la pareja proveedor-articulo: QC-43 R27, sustituida
//     por R15 (nombre normalizado + presentacion).
//   - el caso que fijaba el borrado FISICO de la linea y el metodo `deleteById` del puerto:
//     QC-43 R34, derogada por la decision cerrada 5 y por R21.
//   - el que fijaba la edicion como «solo condiciones comerciales»: QC-43 R33, derogada por
//     P6 y por R24.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line'
import { createDeleteCatalogLine } from '@/lib/modules/proveedores/domain/delete-catalog-line'
import {
  CatalogLineNotFoundError,
  DuplicateCatalogLineError,
  SupplierNotFoundError,
  ValidationError,
} from '@/lib/modules/proveedores/domain/errors'
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines'
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line'

import type { Actor } from '@/lib/modules/proveedores/domain/actor'
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view'
import type { ListQueryLog } from '@/lib/modules/proveedores/ports/list-query-log'
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository'
import type { UnitCatalog } from '@/lib/modules/unidades'

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'proveedores',
)
const read = (...partes: readonly string[]): string =>
  readFileSync(join(moduloDir, ...partes), 'utf8')

// QC-74 (R18): el actor no lleva nombre de rol, lleva su conjunto de permisos.
const ADMIN: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '99999999-9999-4999-8999-999999999999',
  permissions: ['proveedores.consultar', 'proveedores.modificar'],
}
const AHORA = new Date('2026-09-04T12:00:00.000Z')
const now = () => AHORA

/** Doble del catalogo de unidades: resuelve cualquier id pedido, para que los casos que
 *  traen unidad sigan aceptandola sin que este archivo tenga que probar `unidades`. */
const units: UnitCatalog = {
  findRefs: vi.fn(async (ids: readonly string[]) =>
    ids.map((id) => ({ id, name: 'kg', symbol: 'kg', baseUnitId: null, factor: null })),
  ),
}

const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTACION_A = '33333333-3333-4333-8333-333333333333'
const PRESENTACION_B = '44444444-4444-4444-8444-444444444444'
const UNIDAD = '55555555-5555-4555-8555-555555555555'

const CAMPOS_VALIDOS = {
  name: 'Acido citrico',
  presentationId: PRESENTACION_A,
  unitId: null,
  imagePath: null,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
}

const ALTA_VALIDA = { supplierId: SUPPLIER_ID, ...CAMPOS_VALIDOS }

/** Doble del repositorio del catalogo: espias con resultado exitoso por defecto. */
function makeCatalog(overrides: Partial<SupplierCatalogRepository> = {}): {
  readonly repo: SupplierCatalogRepository
  readonly spies: Record<keyof SupplierCatalogRepository, ReturnType<typeof vi.fn>>
} {
  const spies = {
    create: vi.fn(async () => ({ id: 'linea-1' })),
    replaceAlive: vi.fn(async () => 'ok'),
    softDeleteAlive: vi.fn(async () => true),
    listBySupplierAlive: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
  }
  // Los `overrides` REEMPLAZAN al espia por defecto, asi que `spies` tiene que ser el
  // objeto ya fusionado: si no, una asercion sobre un metodo sobrescrito miraria un espia
  // que nadie llamo y pasaria por vacio.
  const repo = { ...spies, ...overrides }
  return {
    repo: repo as unknown as SupplierCatalogRepository,
    spies: repo as unknown as Record<keyof SupplierCatalogRepository, ReturnType<typeof vi.fn>>,
  }
}

/**
 * QC-57: el listado del catalogo recibe ademas el puerto del log de campos omitidos (R6). Es
 * un espia mudo: lo que ese puerto registra se prueba en `tests/unit/proveedores/list-*`, aqui
 * solo hace falta para poder construir el caso de uso.
 */
function logMudo(): ListQueryLog {
  return { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() }
}

/** Fila del catalogo tal como la devuelve el puerto. */
function linea(id: string, name: string, presentationId: string): CatalogLineView {
  return {
    id,
    supplierId: SUPPLIER_ID,
    name,
    presentationId,
    unitId: null,
    imagePath: null,
    cost: '12.5000',
    minPurchase: null,
    deliveryTime: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ADMIN.id,
    updatedBy: ADMIN.id,
  }
}

describe('el ambito de empresa de los cuatro casos de uso del catalogo (QC-59 T34)', () => {
  it('R21, R30 — cada uno pasa `{ companyId: actor.companyId }` como ULTIMO argumento del puerto', async () => {
    const { repo, spies } = makeCatalog()

    await createCreateCatalogLine({ catalog: repo, units, now })(ALTA_VALIDA, ADMIN)
    await createUpdateCatalogLine({ catalog: repo, units, now })('linea-1', CAMPOS_VALIDOS, ADMIN)
    await createDeleteCatalogLine({ catalog: repo, now })('linea-1', ADMIN)
    await createListCatalogLines({ catalog: repo, log: logMudo() })(SUPPLIER_ID, { page: 1 }, ADMIN)

    const AMBITO = { companyId: ADMIN.companyId }
    for (const [metodo, espia] of Object.entries(spies)) {
      expect(espia, `${metodo} no se ejercito`).toHaveBeenCalledTimes(1)
      const args = espia.mock.calls[0] as unknown as readonly unknown[]
      expect(args[args.length - 1], `${metodo}: el ambito no es el del actor`).toStrictEqual(AMBITO)
    }
  })

  it('R18 — la unidad se resuelve contra `unidades` con la empresa DEL ACTOR, y solo si la entrada la trae', async () => {
    // La semantica «de sistema o de la empresa» no se reescribe aqui: la pone `unidades`. Lo
    // que este modulo tiene que hacer bien es pasar la empresa en cuyo nombre pregunta.
    const { repo } = makeCatalog()
    const findRefs = vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => ({ id, name: 'kg', symbol: 'kg', baseUnitId: null, factor: null })),
    )
    const conUnidad: UnitCatalog = { findRefs }

    await createCreateCatalogLine({ catalog: repo, units: conUnidad, now })(
      { ...ALTA_VALIDA, unitId: UNIDAD },
      ADMIN,
    )
    expect(findRefs.mock.calls[0]).toEqual([[UNIDAD], ADMIN.companyId])

    await createUpdateCatalogLine({ catalog: repo, units: conUnidad, now })(
      'linea-1',
      { ...CAMPOS_VALIDOS, unitId: UNIDAD },
      ADMIN,
    )
    expect(findRefs.mock.calls[1]).toEqual([[UNIDAD], ADMIN.companyId])

    // Sin unidad no se le pregunta nada: la ausencia sigue siendo un valor valido de la linea.
    findRefs.mockClear()
    await createCreateCatalogLine({ catalog: repo, units: conUnidad, now })(
      { ...ALTA_VALIDA, unitId: null },
      ADMIN,
    )
    expect(findRefs).not.toHaveBeenCalled()
  })

  it('R18 — una unidad que `unidades` no resuelve para esa empresa es entrada invalida, y no se escribe nada', async () => {
    // El doble devuelve vacio, que es como `unidades` reporta «no existe o es de otra
    // empresa»: los dos casos son el mismo desenlace y ninguno llega al repositorio.
    const { repo, spies } = makeCatalog()
    const ajena: UnitCatalog = { findRefs: vi.fn(async () => []) }

    await expect(
      createCreateCatalogLine({ catalog: repo, units: ajena, now })(
        { ...ALTA_VALIDA, unitId: UNIDAD },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      createUpdateCatalogLine({ catalog: repo, units: ajena, now })(
        'linea-1',
        { ...CAMPOS_VALIDOS, unitId: UNIDAD },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ValidationError)

    expect(spies.create).not.toHaveBeenCalled()
    expect(spies.replaceAlive).not.toHaveBeenCalled()
  })
})

describe('casos de uso del catalogo del proveedor (QC-52 T10, T14, T15)', () => {
  it('ninguno de los cuatro casos de uso depende del modulo inventario', () => {
    // R18, y es el corazon de la ficha. Se mide sobre el TIPO `*Deps` de cada caso de uso,
    // que es la unica puerta por la que una dependencia podria entrar al dominio: si
    // alguien vuelve a atar `proveedores` a `inventario`, tiene que declararlo aqui.
    //
    // Mutacion que lo pone rojo: devolver `readonly products: ProductCatalog` a cualquiera
    // de los dos casos de uso que lo tenian.
    // `create`/`update` ganan `units` (R18, decision cerrada): es la unica costura nueva y es
    // hacia `unidades`, no hacia `inventario`.
    expect(clavesDelTipoDeps(read('domain', 'create-catalog-line.ts'))).toEqual([
      'catalog',
      'now',
      'units',
    ])
    expect(clavesDelTipoDeps(read('domain', 'update-catalog-line.ts'))).toEqual([
      'catalog',
      'now',
      'units',
    ])
    expect(clavesDelTipoDeps(read('domain', 'delete-catalog-line.ts'))).toEqual(['catalog', 'now'])
    // QC-57 (R6) le anade el puerto del LOG de campos omitidos, y nada mas: sigue sin
    // conocer `inventario`, que es lo que este caso vigila.
    expect(clavesDelTipoDeps(read('domain', 'list-catalog-lines.ts'))).toEqual([
      'catalog',
      'log',
    ])

    // Y el puerto expone EXACTAMENTE estos cuatro metodos. `deleteById` ya no esta -la baja
    // es logica (R21)- y `updateTerms` tampoco -la edicion es reemplazo completo (R24)-. No
    // hay ningun metodo de busqueda por nombre, y esa ausencia es deliberada (R15,
    // `design.md > 10.4`): sin el, el `SELECT` previo al `INSERT` no es expresable.
    expect(metodosDelPuerto()).toEqual([
      'create',
      'listBySupplierAlive',
      'replaceAlive',
      'softDeleteAlive',
    ])
  })

  it('el alta manda los siete campos de negocio al puerto, con el actor y el instante inyectados', async () => {
    // R13. El puerto recibe el `actorId` y el instante inyectado. Que al crear se escriban
    // las DOS columnas de autor y al editar solo `updated_by` es del adaptador y se prueba
    // contra Postgres en integracion; lo que se cierra aqui es que el dominio entrega los
    // siete campos, el proveedor y nada mas.
    const { repo, spies } = makeCatalog()

    const creada = await createCreateCatalogLine({ catalog: repo, units, now })(
      { ...ALTA_VALIDA, unitId: UNIDAD, imagePath: 'catalogo/x.png', minPurchase: '2.5' },
      ADMIN,
    )
    expect(creada).toEqual({ id: 'linea-1' })
    expect(spies.create).toHaveBeenCalledWith(expect.anything(), ADMIN.id, AHORA, expect.anything())
    expect(spies.create.mock.calls[0]?.[0]).toEqual({
      supplierId: SUPPLIER_ID,
      name: 'Acido citrico',
      presentationId: PRESENTACION_A,
      unitId: UNIDAD,
      imagePath: 'catalogo/x.png',
      cost: '12.5000',
      minPurchase: '2.5',
      deliveryTime: null,
    })

    // R10: lo que no se indica llega como AUSENCIA explicita, nunca como `undefined`.
    await createCreateCatalogLine({ catalog: repo, units, now })(
      { supplierId: SUPPLIER_ID, name: 'Sosa', presentationId: PRESENTACION_A, cost: '1.0000' },
      ADMIN,
    )
    expect(spies.create.mock.calls[1]?.[0]).toEqual({
      supplierId: SUPPLIER_ID,
      name: 'Sosa',
      presentationId: PRESENTACION_A,
      unitId: null,
      imagePath: null,
      cost: '1.0000',
      minPurchase: null,
      deliveryTime: null,
    })
  })

  it('rechaza el alta con un identificador de articulo del inventario sin tocar el repositorio', async () => {
    // R9. La entrada de mas se RECHAZA como entrada invalida, no se ignora, y el repositorio
    // no se llama. Mutacion que lo pone rojo: pasar `createCatalogLineSchema` de
    // `strictObject` a `object`.
    const { repo, spies } = makeCatalog()

    const fallo = await createCreateCatalogLine({ catalog: repo, units, now })(
      { ...ALTA_VALIDA, productId: '66666666-6666-4666-8666-666666666666' },
      ADMIN,
    ).catch((error: unknown) => error)

    expect(fallo).toBeInstanceOf(ValidationError)
    expect((fallo as ValidationError).code).toBe('invalid_input')
    expect(spies.create).not.toHaveBeenCalled()
  })

  it('traduce el duplicado del puerto a error de linea repetida, en el alta y en el renombrado', async () => {
    // R15, R24, R32. El 23505 del indice unico parcial llega ya traducido a un resultado
    // discriminado; el dominio lo convierte en su error con `code` ESTABLE -el mismo que
    // usaba QC-43, porque el caso sigue existiendo y solo cambia la clave que lo dispara- y
    // no intenta ninguna segunda escritura.
    const alta = makeCatalog({ create: vi.fn(async () => 'duplicate' as const) })

    const fallo = await createCreateCatalogLine({ catalog: alta.repo, units, now })(
      ALTA_VALIDA,
      ADMIN,
    ).catch((error: unknown) => error)

    expect(fallo).toBeInstanceOf(DuplicateCatalogLineError)
    expect((fallo as DuplicateCatalogLineError).code).toBe('duplicate_catalog_line')
    expect(alta.spies.replaceAlive).not.toHaveBeenCalled()

    // El renombrado que choca contra otra linea VIVA del mismo proveedor da el MISMO error y
    // el mismo `code` (R24 remite a R15): no se introduce un codigo nuevo para un caso que
    // ya tiene uno (R32).
    const edicion = makeCatalog({ replaceAlive: vi.fn(async () => 'duplicate' as const) })
    const falloEdicion = await createUpdateCatalogLine({ catalog: edicion.repo, units, now })(
      'linea-1',
      CAMPOS_VALIDOS,
      ADMIN,
    ).catch((error: unknown) => error)
    expect(falloEdicion).toBeInstanceOf(DuplicateCatalogLineError)
    expect((falloEdicion as DuplicateCatalogLineError).code).toBe('duplicate_catalog_line')

    // Y el proveedor inexistente o dado de baja es «no encontrado», no un duplicado (R23).
    const sinProveedor = makeCatalog({ create: vi.fn(async () => 'supplier_not_found' as const) })
    await expect(
      createCreateCatalogLine({ catalog: sinProveedor.repo, units, now })(ALTA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(SupplierNotFoundError)
  })

  it('la edicion reemplaza los siete campos y no puede cambiar el proveedor', async () => {
    // R24 (P6). El dato que llega al puerto tiene EXACTAMENTE los siete campos de negocio:
    // ni `supplierId` ni ninguna referencia a un articulo del inventario. Mutacion que lo
    // pone rojo: pasarle `parsed.data` con un `supplierId` colado, o cambiar el esquema de
    // edicion para que lo admita.
    const { repo, spies } = makeCatalog()

    await createUpdateCatalogLine({ catalog: repo, units, now })(
      'linea-1',
      {
        name: '  Sosa caustica  ',
        presentationId: PRESENTACION_B,
        unitId: UNIDAD,
        imagePath: 'catalogo/sosa.png',
        cost: '9.0000',
        minPurchase: '25.0000',
        deliveryTime: 3,
      },
      ADMIN,
    )
    expect(spies.replaceAlive).toHaveBeenCalledWith(
      'linea-1',
      expect.anything(),
      ADMIN.id,
      AHORA,
      expect.anything(),
    )
    expect(spies.replaceAlive.mock.calls[0]?.[1]).toEqual({
      // El nombre llega ya RECORTADO: lo hizo el esquema, antes de salir del borde (R14).
      name: 'Sosa caustica',
      presentationId: PRESENTACION_B,
      unitId: UNIDAD,
      imagePath: 'catalogo/sosa.png',
      cost: '9.0000',
      minPurchase: '25.0000',
      deliveryTime: 3,
    })

    // R10: lo que no se indica llega como AUSENCIA explicita, nunca como `undefined`.
    await createUpdateCatalogLine({ catalog: repo, units, now })(
      'linea-1',
      { name: 'Sosa', presentationId: PRESENTACION_A, cost: '9.0000' },
      ADMIN,
    )
    expect(spies.replaceAlive.mock.calls[1]?.[1]).toEqual({
      name: 'Sosa',
      presentationId: PRESENTACION_A,
      unitId: null,
      imagePath: null,
      cost: '9.0000',
      minPurchase: null,
      deliveryTime: null,
    })

    // Intentar cambiar de proveedor es entrada INVALIDA, no un campo ignorado, y no llega
    // ninguna escritura al puerto.
    const conProveedor = makeCatalog()
    const fallo = await createUpdateCatalogLine({ catalog: conProveedor.repo, units, now })(
      'linea-1',
      { ...CAMPOS_VALIDOS, supplierId: '77777777-7777-4777-8777-777777777777' },
      ADMIN,
    ).catch((error: unknown) => error)
    expect(fallo).toBeInstanceOf(ValidationError)
    expect((fallo as ValidationError).code).toBe('invalid_input')
    expect(conProveedor.spies.replaceAlive).not.toHaveBeenCalled()

    // Y una linea inexistente, ya dada de baja o de un proveedor dado de baja es «no
    // encontrado»: los tres son el mismo caso para el dominio (R23).
    const vacio = makeCatalog({ replaceAlive: vi.fn(async () => 'not_found' as const) })
    await expect(
      createUpdateCatalogLine({ catalog: vacio.repo, units, now })('linea-x', CAMPOS_VALIDOS, ADMIN),
    ).rejects.toBeInstanceOf(CatalogLineNotFoundError)
  })

  it('la baja de la linea es logica, sella al actor y al instante, y no encuentra la de un proveedor dado de baja', async () => {
    // R13, R21, R23. El caso de uso llama a `softDeleteAlive` -no hay ningun `deleteById`
    // que llamar: QC-43 R34 queda derogada (decision cerrada 5)- y le pasa el actor y el
    // instante inyectado, porque una baja logica SI tiene `deleted_at` y `updated_at` que
    // sellar.
    const { repo, spies } = makeCatalog()
    await createDeleteCatalogLine({ catalog: repo, now })('linea-1', ADMIN)
    expect(spies.softDeleteAlive).toHaveBeenCalledWith(
      'linea-1',
      ADMIN.id,
      AHORA,
      expect.anything(),
    )

    // QC-43 R48 DEROGADA ENTERA (P5): la baja de una linea inexistente, de una ya dada de
    // baja o de una cuyo PROVEEDOR esta dado de baja responde «no encontrado», igual que las
    // otras tres operaciones. Quien decide los tres casos es el puerto, con un solo `false`.
    const vacio = makeCatalog({ softDeleteAlive: vi.fn(async () => false) })
    await expect(
      createDeleteCatalogLine({ catalog: vacio.repo, now })('linea-x', ADMIN),
    ).rejects.toBeInstanceOf(CatalogLineNotFoundError)
  })

  it('el catalogo se consulta con su propio listado paginado, sin resolver nada de otro modulo', async () => {
    // R18, R22. La pagina se devuelve TAL CUAL la da el puerto: ni un `map`, ni una segunda
    // consulta, ni ningun nombre pegado desde fuera. `presentationId` y `unitId` salen en
    // crudo, y eso es la consecuencia aceptada de `design.md > 6.2`.
    const { repo, spies } = makeCatalog({
      listBySupplierAlive: vi.fn(async () => ({
        items: [
          linea('l-1', 'Acido citrico', PRESENTACION_A),
          linea('l-2', 'Acido citrico', PRESENTACION_B),
        ],
        total: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      })),
    })

    const pagina = await createListCatalogLines({ catalog: repo, log: logMudo() })(
      SUPPLIER_ID,
      { page: 1 },
      ADMIN,
    )

    // QC-57 (R13): al puerto llega el CONTRATO GENERICO ya saneado, no `{ page }` a secas. Sin
    // orden, sin filtros y sin busqueda es exactamente la lista de siempre (R11), asi que este
    // caso sigue midiendo lo mismo y no se relaja ningun aserto.
    expect(spies.listBySupplierAlive).toHaveBeenCalledWith(
      SUPPLIER_ID,
      { page: 1, sort: null, filters: {}, search: '' },
      expect.anything(),
    )
    expect(spies.listBySupplierAlive).toHaveBeenCalledTimes(1)
    expect(pagina.total).toBe(2)
    // R16 visto desde el dominio: dos lineas del MISMO nombre en presentaciones distintas
    // conviven y llegan las dos.
    expect(pagina.items.map((item) => item.id)).toEqual(['l-1', 'l-2'])
    expect(pagina.items.map((item) => item.presentationId)).toEqual([
      PRESENTACION_A,
      PRESENTACION_B,
    ])
    // Y ninguna linea trae ningun campo derivado de otro modulo.
    for (const item of pagina.items) {
      expect(Object.keys(item).some((clave) => /product/i.test(clave))).toBe(false)
    }
  })

  it('el listado no devuelve nada de un proveedor dado de baja', async () => {
    // R22, R23. El filtro de proveedor vivo -y el de linea viva- son del PUERTO
    // (`listBySupplierAlive`), no de un `if` del dominio; cuando el puerto dice que no hay
    // proveedor, el caso de uso lanza «no encontrado».
    const { repo } = makeCatalog({
      listBySupplierAlive: vi.fn(async () => 'supplier_not_found' as const),
    })

    await expect(
      createListCatalogLines({ catalog: repo, log: logMudo() })(SUPPLIER_ID, { page: 1 }, ADMIN),
    ).rejects.toBeInstanceOf(SupplierNotFoundError)

    // Y una consulta de pagina invalida es entrada invalida, no una pagina vacia.
    const otro = makeCatalog()
    await expect(
      createListCatalogLines({ catalog: otro.repo, log: logMudo() })(
        SUPPLIER_ID,
        { page: 0 },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(otro.spies.listBySupplierAlive).not.toHaveBeenCalled()
  })
})

/** Nombres de metodo declarados por la interfaz del puerto del catalogo. */
function metodosDelPuerto(): readonly string[] {
  return [...read('ports', 'supplier-catalog-repository.ts').matchAll(/^ {2}(\w+)\(/gm)]
    .map((m) => m[1] as string)
    .sort()
}

/** Nombres de las dependencias declaradas en el `type ...Deps` de un caso de uso. */
function clavesDelTipoDeps(fuente: string): readonly string[] {
  const bloque = /export type \w+Deps = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? ''
  return [...bloque.matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1] as string).sort()
}
