// T8 (QC-43) — Los cinco casos de uso del proveedor, con DOBLES del puerto.
//
// Cubre R7, R8, R13, R14, R15, R16, R22, R24 y R35 (`tasks.md > Grupo B`). Aqui no hay
// base de datos: lo que se demuestra es que el caso de uso pide al puerto EXACTAMENTE lo
// que R8 y R16 exigen, y que traduce cada resultado discriminado al error de dominio que
// le toca. Lo que solo Postgres puede demostrar -que el indice unico rechaza de verdad,
// que `created_by` no se toca al editar- es T17.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { createCreateSupplier } from '@/lib/modules/proveedores/domain/create-supplier'
import { createDeleteSupplier } from '@/lib/modules/proveedores/domain/delete-supplier'
import {
  SupplierDuplicateNameError,
  SupplierNotFoundError,
} from '@/lib/modules/proveedores/domain/errors'
import { createGetSupplier } from '@/lib/modules/proveedores/domain/get-supplier'
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers'
import { createUpdateSupplier } from '@/lib/modules/proveedores/domain/update-supplier'

import type { Actor } from '@/lib/modules/proveedores/domain/actor'
import type { SupplierView } from '@/lib/modules/proveedores/domain/supplier-view'
import type { ListQueryLog } from '@/lib/modules/proveedores/ports/list-query-log'
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const moduloDir = join(repoRoot, 'lib', 'modules', 'proveedores')

const read = (...partes: readonly string[]): string =>
  readFileSync(join(moduloDir, ...partes), 'utf8')

/**
 * Quita comentarios de bloque y de linea antes de afirmar sobre el TEXTO del fuente: si no,
 * un comentario que explica «aqui no se restaura nada» disparia la misma expresion que la
 * linea de codigo que se busca prohibir. Mismo criterio que el bloque 14 de
 * `guard-arquitectura-modulos` («no se ciega por comentarios»).
 */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')

/** Nombres de metodo declarados por la interfaz del puerto, leidos de su fuente. */
function metodosDelPuerto(archivo: string): readonly string[] {
  const fuente = read('ports', archivo)
  return [...fuente.matchAll(/^ {2}(\w+)\(/gm)].map((m) => m[1] as string).sort()
}

/** Nombres de las dependencias declaradas en el `type ...Deps` de un caso de uso. */
function clavesDelTipoDeps(fuente: string): readonly string[] {
  const bloque = /export type \w+Deps = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? ''
  return [...bloque.matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1] as string).sort()
}

// QC-74 (R18): el actor no lleva nombre de rol, lleva su conjunto de permisos.
const ADMIN: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '99999999-9999-4999-8999-999999999999',
  permissions: ['proveedores.consultar', 'proveedores.modificar'],
}
const AHORA = new Date('2026-09-03T12:00:00.000Z')
const now = () => AHORA

/** Doble del puerto: cada metodo es un espia con un resultado exitoso por defecto. */
function makeSuppliers(overrides: Partial<SupplierRepository> = {}): {
  readonly repo: SupplierRepository
  readonly spies: Record<keyof SupplierRepository, ReturnType<typeof vi.fn>>
} {
  const spies = {
    create: vi.fn(async () => ({ id: 'nuevo-id' })),
    findAliveById: vi.fn(async () => null),
    updateAlive: vi.fn(async () => 'ok'),
    softDeleteAlive: vi.fn(async () => true),
    listAlive: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 })),
  }
  // Los `overrides` REEMPLAZAN al espia por defecto, asi que `spies` tiene que ser el
  // objeto ya fusionado: si no, una asercion sobre un metodo sobrescrito miraria un espia
  // que nadie llamo y pasaria por vacio.
  const repo = { ...spies, ...overrides }
  return {
    repo: repo as unknown as SupplierRepository,
    spies: repo as unknown as Record<keyof SupplierRepository, ReturnType<typeof vi.fn>>,
  }
}

const ENTRADA_VALIDA = {
  name: 'Quimicos del Pacifico S.A.',
  phone: '+593 99 000 0000',
  email: null,
}

const VISTA: SupplierView = {
  id: 'sup-1',
  name: 'Quimicos del Pacifico S.A.',
  nameNormalized: 'quimicosdelpacificosa',
  phone: '+593 99 000 0000',
  email: null,
  createdAt: AHORA,
  updatedAt: AHORA,
  createdBy: ADMIN.id,
  updatedBy: ADMIN.id,
}

describe('el ambito de empresa de los cinco casos de uso del proveedor (QC-59 T34)', () => {
  it('R21, R30 — cada uno pasa `{ companyId: actor.companyId }` como ULTIMO argumento del puerto', async () => {
    // El ambito sale del ACTOR, no de la entrada, y viaja al final de la firma en los cinco
    // metodos. Aqui se mide lo que RECIBE el puerto; que el `where` filtre de verdad es de la
    // integracion, y que ninguna implementacion se olvide de declararlo es de
    // `tests/guards/guard-ambito-empresa-proveedores.test.ts`.
    const { repo, spies } = makeSuppliers({ findAliveById: vi.fn(async () => VISTA) })
    const log = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() }

    await createCreateSupplier({ suppliers: repo, now })(ENTRADA_VALIDA, ADMIN)
    await createUpdateSupplier({ suppliers: repo, now })('sup-1', ENTRADA_VALIDA, ADMIN)
    await createDeleteSupplier({ suppliers: repo, now })('sup-1', ADMIN)
    await createGetSupplier({ suppliers: repo })('sup-1', ADMIN)
    await createListSuppliers({ suppliers: repo, log })({ page: 1 }, ADMIN)

    const AMBITO = { companyId: ADMIN.companyId }
    for (const [metodo, espia] of Object.entries(spies)) {
      expect(espia, `${metodo} no se ejercito`).toHaveBeenCalledTimes(1)
      const args = espia.mock.calls[0] as unknown as readonly unknown[]
      expect(args[args.length - 1], `${metodo}: el ambito no es el del actor`).toStrictEqual(AMBITO)
    }
  })

  it('R30 — una empresa en la ENTRADA del alta o de la edicion se descarta, y no llega al puerto', async () => {
    // El esquema del proveedor es un `object` de zod: lo que no declara se elimina. Asi que la
    // empresa de la entrada no se escribe y tampoco viaja dentro de los datos.
    const AJENA = '12121212-1212-4121-8121-121212121212'
    const { repo, spies } = makeSuppliers()

    await createCreateSupplier({ suppliers: repo, now })(
      { ...ENTRADA_VALIDA, companyId: AJENA, company_id: AJENA },
      ADMIN,
    )
    await createUpdateSupplier({ suppliers: repo, now })(
      'sup-1',
      { ...ENTRADA_VALIDA, companyId: AJENA },
      ADMIN,
    )

    for (const espia of [spies.create, spies.updateAlive]) {
      const args = espia.mock.calls[0] as unknown as readonly unknown[]
      expect(JSON.stringify(args)).not.toContain(AJENA)
    }
    const datosDelAlta = spies.create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(datosDelAlta).sort()).toEqual(['email', 'name', 'nameNormalized', 'phone'])
  })

  it('R38 — las firmas publicas de los cinco casos de uso no cambiaron: el ambito NO es un parametro suyo', async () => {
    // Quien llama sigue pasando (entrada, actor) o (id, entrada, actor). Si el ambito hubiera
    // entrado como parametro del caso de uso, cada pantalla podria ELEGIR empresa, que es
    // justo lo que se evita metiendolo en el actor.
    const { repo } = makeSuppliers({ findAliveById: vi.fn(async () => VISTA) })
    expect(createCreateSupplier({ suppliers: repo, now }).length).toBe(2)
    expect(createUpdateSupplier({ suppliers: repo, now }).length).toBe(3)
    expect(createDeleteSupplier({ suppliers: repo, now }).length).toBe(2)
    expect(createGetSupplier({ suppliers: repo }).length).toBe(2)
    expect(createListSuppliers({
      suppliers: repo,
      log: { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() },
    }).length).toBe(2)
  })
})

describe('casos de uso del proveedor (QC-43 T8)', () => {
  it('persiste el nombre normalizado junto al nombre en el alta y en la edicion', async () => {
    // R16 (y R7: el alta devuelve el identificador que dio el puerto). El emparejamiento
    // nombre/normalizado lo hace el CASO DE USO, no el adaptador, y por eso es observable
    // aqui. Mutacion que lo pone rojo: quitar `nameNormalized` del objeto que se pasa al
    // puerto en `create-supplier.ts` o en `update-supplier.ts`.
    const { repo, spies } = makeSuppliers()

    const creado = await createCreateSupplier({ suppliers: repo, now })(
      { ...ENTRADA_VALIDA, name: '  Quimicos del Pacifico S.A.  ' },
      ADMIN,
    )
    expect(creado).toEqual({ id: 'nuevo-id' })
    expect(spies.create.mock.calls[0]?.[0]).toMatchObject({
      name: 'Quimicos del Pacifico S.A.',
      nameNormalized: 'quimicosdelpacificosa',
    })

    await createUpdateSupplier({ suppliers: repo, now })(
      'sup-1',
      { ...ENTRADA_VALIDA, name: 'Quimicos  del  Pacifico, S.A.' },
      ADMIN,
    )
    expect(spies.updateAlive.mock.calls[0]?.[1]).toMatchObject({
      name: 'Quimicos  del  Pacifico, S.A.',
      nameNormalized: 'quimicosdelpacificosa',
    })
  })

  it('guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al dar de baja', async () => {
    // R8. El puerto recibe UN `actorId` y el instante inyectado; escribirlo en las dos
    // columnas al crear y solo en `updated_by` al editar es del adaptador (T11) y se
    // prueba contra Postgres en T17. Lo que SI se cierra aqui es la otra mitad: el dato
    // que el caso de uso manda al editar y al dar de baja NO contiene ningun campo de
    // autoria de creacion, asi que el adaptador no tiene con que pisarlo.
    const { repo, spies } = makeSuppliers()

    await createCreateSupplier({ suppliers: repo, now })(ENTRADA_VALIDA, ADMIN)
    expect(spies.create).toHaveBeenCalledWith(expect.anything(), ADMIN.id, AHORA, expect.anything())

    await createUpdateSupplier({ suppliers: repo, now })('sup-1', ENTRADA_VALIDA, ADMIN)
    expect(spies.updateAlive).toHaveBeenCalledWith(
      'sup-1',
      expect.anything(),
      ADMIN.id,
      AHORA,
      expect.anything(),
    )
    expect(Object.keys(spies.updateAlive.mock.calls[0]?.[1] as object).sort()).toEqual([
      'email',
      'name',
      'nameNormalized',
      'phone',
    ])

    await createDeleteSupplier({ suppliers: repo, now })('sup-1', ADMIN)
    expect(spies.softDeleteAlive).toHaveBeenCalledWith('sup-1', ADMIN.id, AHORA, expect.anything())
  })

  it('la edicion reemplaza nombre, telefono y correo y no expone ninguna operacion por campo suelto', async () => {
    // R14 y R13. El dato que llega al puerto lleva SIEMPRE los tres campos de negocio -no
    // un parche-, y el telefono en blanco llega como AUSENCIA, no como cadena vacia.
    const { repo, spies } = makeSuppliers()

    await createUpdateSupplier({ suppliers: repo, now })(
      'sup-1',
      { name: 'Insumos Andinos', phone: '   ', email: '  ventas@andinos.test  ' },
      ADMIN,
    )
    expect(spies.updateAlive.mock.calls[0]?.[1]).toEqual({
      name: 'Insumos Andinos',
      nameNormalized: 'insumosandinos',
      phone: null,
      email: 'ventas@andinos.test',
    })

    // Y no hay ninguna operacion por campo suelto: el puerto tiene EXACTAMENTE seis
    // metodos. Mutacion que lo pone rojo: anadir `renameAlive` o `updatePhone` al puerto.
    expect(metodosDelPuerto('supplier-repository.ts')).toEqual([
      'create',
      'findAliveById',
      'listAlive',
      'listShowcaseAlive',
      'softDeleteAlive',
      'updateAlive',
    ])
  })

  it('traduce el duplicado del puerto a error de nombre repetido sin crear ni modificar nada', async () => {
    // R15. El adaptador tradujo el 23505 del indice unico parcial a un resultado
    // discriminado; el dominio lo convierte en `SupplierDuplicateNameError` y no intenta
    // ninguna segunda escritura.
    const alta = makeSuppliers({ create: vi.fn(async () => 'duplicate' as const) })
    await expect(
      createCreateSupplier({ suppliers: alta.repo, now })(ENTRADA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(SupplierDuplicateNameError)
    expect(alta.spies.updateAlive).not.toHaveBeenCalled()
    expect(alta.spies.softDeleteAlive).not.toHaveBeenCalled()

    const edicion = makeSuppliers({ updateAlive: vi.fn(async () => 'duplicate' as const) })
    const fallo = await createUpdateSupplier({ suppliers: edicion.repo, now })(
      'sup-1',
      ENTRADA_VALIDA,
      ADMIN,
    ).catch((error: unknown) => error)
    expect(fallo).toBeInstanceOf(SupplierDuplicateNameError)
    expect((fallo as SupplierDuplicateNameError).code).toBe('supplier_duplicate_name')
    expect(edicion.spies.create).not.toHaveBeenCalled()
  })

  it('devuelve no encontrado al consultar, editar o dar de baja un proveedor inexistente o ya dado de baja', async () => {
    // R24. Los tres caminos, con el resultado que el puerto da cuando la fila no existe o
    // ya esta dada de baja -para el dominio es el MISMO caso-.
    const consulta = makeSuppliers({ findAliveById: vi.fn(async () => null) })
    await expect(
      createGetSupplier({ suppliers: consulta.repo })('sup-x', ADMIN),
    ).rejects.toBeInstanceOf(SupplierNotFoundError)

    const edicion = makeSuppliers({ updateAlive: vi.fn(async () => 'not_found' as const) })
    await expect(
      createUpdateSupplier({ suppliers: edicion.repo, now })('sup-x', ENTRADA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(SupplierNotFoundError)

    const baja = makeSuppliers({ softDeleteAlive: vi.fn(async () => false) })
    const fallo = await createDeleteSupplier({ suppliers: baja.repo, now })('sup-x', ADMIN).catch(
      (error: unknown) => error,
    )
    expect(fallo).toBeInstanceOf(SupplierNotFoundError)
    expect((fallo as SupplierNotFoundError).code).toBe('supplier_not_found')
    expect(baja.spies.create).not.toHaveBeenCalled()
    expect(baja.spies.updateAlive).not.toHaveBeenCalled()
  })

  it('no existe ninguna operacion de restaurar ni de listar dados de baja', async () => {
    // R22 (decision cerrada 6). Dos mitades:
    //
    // 1. El puerto no puede EXPRESAR ninguna de las dos: sus seis metodos son los del
    //    caso de arriba y ninguno admite un `includeDeleted`. Mutacion: anadir
    //    `restore(id)` o `listDeleted(query)` al puerto -la lista exacta de metodos cae-.
    // 2. Ni el dominio ni el puerto nombran la idea en ninguna forma.
    const puerto = sinComentarios(read('ports', 'supplier-repository.ts'))
    expect(puerto).not.toMatch(/includeDeleted|onlyDeleted|withDeleted/i)
    expect(metodosDelPuerto('supplier-repository.ts')).toEqual([
      'create',
      'findAliveById',
      'listAlive',
      'listShowcaseAlive',
      'softDeleteAlive',
      'updateAlive',
    ])
    for (const archivo of [
      'create-supplier.ts',
      'update-supplier.ts',
      'delete-supplier.ts',
      'get-supplier.ts',
      'list-suppliers.ts',
    ]) {
      expect(
        sinComentarios(read('domain', archivo)),
        `${archivo} nombra una restauracion`,
      ).not.toMatch(
        /restore|restaurar|reactivar|undelete/i,
      )
    }

    // Y la baja es LOGICA: el caso de uso llama a `softDeleteAlive`, jamas a un borrado
    // fisico (R23).
    const { repo, spies } = makeSuppliers()
    await createDeleteSupplier({ suppliers: repo, now })('sup-1', ADMIN)
    expect(spies.softDeleteAlive).toHaveBeenCalledTimes(1)
  })

  it('ni la ficha ni el listado de proveedores traen las lineas del catalogo', async () => {
    // R35 (decision cerrada 5). La ficha devuelve lo que el puerto de PROVEEDORES da, y
    // ese puerto no sabe nada de lineas: no hay forma de que salgan. Por partida doble:
    //
    // 1. Los dos casos de uso de consulta dependen SOLO del repositorio de proveedores.
    //    Mutacion que lo pone rojo: anadir `readonly catalog: SupplierCatalogRepository`
    //    a `GetSupplierDeps` o a `ListSuppliersDeps`.
    // QC-57 (R6) anade al LISTADO -y solo a el- el puerto del log de campos omitidos: sigue
    // sin conocer el catalogo, que es lo que este caso vigila. `getSupplier` no lista, asi que
    // no lo recibe. Cada archivo declara aqui sus dependencias EXACTAS, ni una mas.
    const DEPS_ESPERADAS: Readonly<Record<string, readonly string[]>> = {
      'get-supplier.ts': ['suppliers'],
      'list-suppliers.ts': ['log', 'suppliers'],
    }
    for (const [archivo, esperadas] of Object.entries(DEPS_ESPERADAS)) {
      const fuente = read('domain', archivo)
      expect(clavesDelTipoDeps(fuente), `${archivo}`).toEqual(esperadas)
      expect(sinComentarios(fuente), `${archivo} conoce el catalogo`).not.toMatch(/catalog/i)
    }

    // 2. Y `SupplierView`, que es lo que las dos devuelven, no tiene ningun campo de
    //    lineas: su censo de campos es exacto y la ficha devuelta no trae ni uno mas.
    const vista = read('domain', 'supplier-view.ts')
    const camposDeLaVista = [...vista.matchAll(/^ {2}readonly (\w+):/gm)]
      .map((m) => m[1] as string)
      .filter((campo, indice, todos) => todos.indexOf(campo) === indice)
    expect(camposDeLaVista).toContain('nameNormalized')
    expect(camposDeLaVista).not.toContain('lines')
    expect(camposDeLaVista).not.toContain('catalogLines')

    const { repo, spies } = makeSuppliers({ findAliveById: vi.fn(async () => VISTA) })
    const ficha = await createGetSupplier({ suppliers: repo })('sup-1', ADMIN)
    expect(Object.keys(ficha).sort()).toEqual([...new Set(camposDeLaVista)].sort())

    const listado = await createListSuppliers({
      suppliers: repo,
      // QC-57 (R6): espia mudo del log de campos omitidos; lo que registra se prueba en
      // `tests/unit/proveedores/list-use-cases.test.ts`.
      log: { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() },
    })({ page: 1 }, ADMIN)
    expect(Object.keys(listado).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'total',
      'totalPages',
    ])
    expect(spies.listAlive).toHaveBeenCalledTimes(1)
  })
})
