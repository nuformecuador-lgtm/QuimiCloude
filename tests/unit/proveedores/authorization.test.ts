// QC-74 T12 — Autorizacion POR PERMISO de los NUEVE casos de uso de `proveedores`
// (R12, R13, R14, R15, R16, R17, R18).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta
// como dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS no filtran
// NINGUNA consulta de esta app. La frontera real es el caso de uso. Un permiso que solo
// existiera como policy no estaria implementado, y una comprobacion que se saltara UNO de
// los nueve seria justo el agujero que este archivo existe para encontrar.
//
// Por eso los DOS puertos que quedan -repositorio de proveedores y repositorio del
// catalogo- y el log son dobles que FALLAN SI LOS LLAMAN: no basta con que la operacion
// lance; tiene que lanzar sin haber tocado nada (R12).
//
// QC-74 lo reescribe: donde antes se preguntaba «¿es Administrador?» ahora se pregunta por
// la PERTENENCIA EXACTA de un codigo al conjunto de permisos del actor. El `Actor` de este
// modulo ya no tiene nombre de rol (R18), y el codigo exigido por cada caso de uso es el de
// la tabla R16, ni uno mas.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { PERMISSIONS } from '@/lib/modules/identity'
import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line'
import { createCreateSupplier } from '@/lib/modules/proveedores/domain/create-supplier'
import { createDeleteCatalogLine } from '@/lib/modules/proveedores/domain/delete-catalog-line'
import { createDeleteSupplier } from '@/lib/modules/proveedores/domain/delete-supplier'
import { ProveedoresError, UnauthorizedError } from '@/lib/modules/proveedores/domain/errors'
import { createGetSupplier } from '@/lib/modules/proveedores/domain/get-supplier'
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines'
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers'
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line'
import { createUpdateSupplier } from '@/lib/modules/proveedores/domain/update-supplier'

import type { PermissionCode } from '@/lib/modules/identity'
import type { Actor } from '@/lib/modules/proveedores/domain/actor'
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository'
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository'
import type { UnitCatalog } from '@/lib/modules/unidades'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'proveedores',
)

/** Todos los `.ts` del modulo, recursivamente. */
function fuentesDelModulo(dir: string = moduloDir): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) return fuentesDelModulo(ruta)
    return entrada.isFile() && ruta.endsWith('.ts') ? [ruta] : []
  })
}

const CONSULTAR: PermissionCode = 'proveedores.consultar'
const MODIFICAR: PermissionCode = 'proveedores.modificar'

const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '33333333-3333-4333-8333-333333333333'
const ENTRADA_PROVEEDOR = { name: 'Insumos Andinos', phone: '+593 99 000 0000', email: null }
/** Campos de negocio VALIDOS de una linea: la edicion los reemplaza todos (R24 de QC-52). */
const CAMPOS_LINEA = {
  name: 'Acido citrico',
  presentationId: PRESENTATION_ID,
  unitId: null,
  imagePath: null,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
}
const ENTRADA_LINEA = { supplierId: SUPPLIER_ID, ...CAMPOS_LINEA }
/** Entrada que zod RECHAZA: sirve para demostrar que el permiso se mira ANTES (R12). */
const BASURA = { name: 42, cost: { no: 'es' }, page: 'primera' }

/**
 * Los dos puertos y el log. Cada metodo explota si alguien lo llama: si un caso de uso
 * comprobara el permiso DESPUES de tocar el puerto, el test caeria por la excepcion del
 * doble aunque el `toBeInstanceOf(UnauthorizedError)` pudiera enganarse.
 */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`)
    })

  const suppliers = {
    create: explota('suppliers.create'),
    findAliveById: explota('suppliers.findAliveById'),
    updateAlive: explota('suppliers.updateAlive'),
    softDeleteAlive: explota('suppliers.softDeleteAlive'),
    listAlive: explota('suppliers.listAlive'),
  }
  const catalog = {
    create: explota('catalog.create'),
    replaceAlive: explota('catalog.replaceAlive'),
    softDeleteAlive: explota('catalog.softDeleteAlive'),
    listBySupplierAlive: explota('catalog.listBySupplierAlive'),
  }

  // QC-57 (R34): el log del campo omitido tampoco puede sonar sin autorizacion.
  // `requirePermission` es la PRIMERA linea de los dos listados, antes de zod y antes de
  // sanear, asi que un actor rechazado no llega ni a saber que su consulta traia campos raros.
  const log = { ignoredFields: explota('log.ignoredFields') }

  // `units` tampoco puede sonar sin autorizacion: `createCatalogLine`/`updateCatalogLine`
  // exigen el permiso antes de preguntarle nada al catalogo de unidades.
  const units = { findRefs: explota('units.findRefs') }

  return {
    suppliers: suppliers as unknown as SupplierRepository,
    catalog: catalog as unknown as SupplierCatalogRepository,
    log,
    units: units as unknown as UnitCatalog,
    espias: [
      ...Object.values(suppliers),
      ...Object.values(catalog),
      ...Object.values(log),
      ...Object.values(units),
    ],
  }
}

type Deps = ReturnType<typeof dobles>

type Caso = {
  readonly nombre: string
  readonly archivo: string
  /** El codigo EXACTO de la tabla R16. */
  readonly permiso: PermissionCode
  /** Invocacion con entrada VALIDA: lo unico que puede fallar es la autorizacion. */
  readonly ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>
  /** Invocacion con entrada que zod rechaza; solo la tienen los que validan con zod. */
  readonly ejecutarConBasura?: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>
}

/**
 * Los NUEVE casos de uso con el permiso que exige cada uno (R16). Con entrada VALIDA: si la
 * entrada fuera basura, un `ValidationError` podria estar tapando la falta de la
 * comprobacion. Todo lo que falla en los casos de rechazo falla por autorizacion y por nada
 * mas.
 */
const CASOS_DE_USO: readonly Caso[] = [
  {
    nombre: 'createSupplier',
    archivo: 'create-supplier.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createCreateSupplier({ suppliers: d.suppliers })(ENTRADA_PROVEEDOR, actor),
    ejecutarConBasura: (d, actor) => createCreateSupplier({ suppliers: d.suppliers })(BASURA, actor),
  },
  {
    nombre: 'updateSupplier',
    archivo: 'update-supplier.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createUpdateSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, ENTRADA_PROVEEDOR, actor),
    ejecutarConBasura: (d, actor) =>
      createUpdateSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, BASURA, actor),
  },
  {
    nombre: 'deleteSupplier',
    archivo: 'delete-supplier.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createDeleteSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, actor),
  },
  {
    nombre: 'getSupplier',
    archivo: 'get-supplier.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) => createGetSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, actor),
  },
  {
    nombre: 'listSuppliers',
    archivo: 'list-suppliers.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) =>
      createListSuppliers({ suppliers: d.suppliers, log: d.log })({ page: 1 }, actor),
    ejecutarConBasura: (d, actor) =>
      createListSuppliers({ suppliers: d.suppliers, log: d.log })(BASURA, actor),
  },
  {
    nombre: 'createCatalogLine',
    archivo: 'create-catalog-line.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createCreateCatalogLine({ catalog: d.catalog, units: d.units })(ENTRADA_LINEA, actor),
    ejecutarConBasura: (d, actor) =>
      createCreateCatalogLine({ catalog: d.catalog, units: d.units })(BASURA, actor),
  },
  {
    nombre: 'updateCatalogLine',
    archivo: 'update-catalog-line.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createUpdateCatalogLine({ catalog: d.catalog, units: d.units })('linea-1', CAMPOS_LINEA, actor),
    ejecutarConBasura: (d, actor) =>
      createUpdateCatalogLine({ catalog: d.catalog, units: d.units })('linea-1', BASURA, actor),
  },
  {
    nombre: 'deleteCatalogLine',
    archivo: 'delete-catalog-line.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createDeleteCatalogLine({ catalog: d.catalog })('linea-1', actor),
  },
  {
    nombre: 'listCatalogLines',
    archivo: 'list-catalog-lines.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) =>
      createListCatalogLines({ catalog: d.catalog, log: d.log })(SUPPLIER_ID, { page: 1 }, actor),
    ejecutarConBasura: (d, actor) =>
      createListCatalogLines({ catalog: d.catalog, log: d.log })(SUPPLIER_ID, BASURA, actor),
  },
]

/** Actor con exactamente los permisos que se le den; sin nombre de rol (R18). */
function actorCon(...permissions: readonly string[]): Actor {
  return { id: 'u-1', companyId: COMPANY_ID, permissions }
}

/** Todos los codigos del catalogo REAL menos uno: el conjunto que NO debe abrir el caso. */
function todosMenos(permiso: PermissionCode): readonly string[] {
  return PERMISSIONS.map((p) => p.code).filter((code) => code !== permiso)
}

/** Ejecuta un caso de uso con un actor no autorizado y exige rechazo SIN tocar ningun puerto. */
async function esperarRechazoSinTocarNada(
  caso: Caso,
  actor: Actor | null | undefined,
  etiqueta: string,
  ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown> = caso.ejecutar,
): Promise<void> {
  const d = dobles()
  const fallo = await ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  )

  // R15: el error es el `UnauthorizedError` DEL MODULO y es un `ProveedoresError`, que es lo
  // que hace que los adaptadores driving lo sigan serializando con su `instanceof` de siempre
  // y con el mismo `code` estable. Si algun dia `requirePermission` lanzara el error de otro
  // modulo, esta asercion caeria y con ella caeria el 403 de las nueve actions.
  expect(fallo, `${caso.nombre} con ${etiqueta} no rechazo`).toBeInstanceOf(UnauthorizedError)
  expect(fallo, `${caso.nombre} con ${etiqueta} no lanzo un error del modulo`).toBeInstanceOf(
    ProveedoresError,
  )
  expect((fallo as UnauthorizedError).code).toBe('unauthorized')

  // R12, R14: sin efectos. Se afirma CONTANDO invocaciones de los dobles, no solo mirando que
  // lanza.
  for (const espia of d.espias) {
    expect(espia, `${caso.nombre} con ${etiqueta} toco un puerto`).not.toHaveBeenCalled()
  }
}

/**
 * Ejecuta un caso de uso con un actor AUTORIZADO y exige que AVANCE hasta el puerto: se ve
 * porque el doble explota con SU mensaje, no con `unauthorized`. Esto es lo que impide que la
 * concesion pase por un `throw new UnauthorizedError()` incondicional o por un caso de uso que
 * no llame a nadie.
 */
async function esperarQueLlegueAlPuerto(caso: Caso, actor: Actor): Promise<void> {
  const d = dobles()
  const resultado = await caso.ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  )

  expect(resultado, `${caso.nombre} no llego al puerto con ${caso.permiso}`).not.toBeNull()
  expect(resultado, `${caso.nombre} rechazo teniendo ${caso.permiso}`).not.toBeInstanceOf(
    UnauthorizedError,
  )
  expect((resultado as Error).message).toMatch(/no debe llamarse sin autorizacion/)
}

describe('autorizacion por permiso de los nueve casos de uso de proveedores (QC-74 T12)', () => {
  it('los nueve casos de uso estan cubiertos por esta tabla', () => {
    // Guardia de la propia guardia: si alguien anade un decimo caso de uso al dominio y no
    // lo mete en `CASOS_DE_USO`, este test cae. Sin esto, la cobertura «de los nueve» seria
    // una promesa del comentario de cabecera y no una afirmacion ejecutable.
    //
    // QC-57 anadio `domain/list-query.ts`, que empieza por `list-` y NO es un caso de uso: es
    // el contrato de consulta de lista -tipos, esquema zod y una funcion pura `sanitize`-, sin
    // actor y sin ningun puerto que tocar, asi que no tiene autorizacion que validar. Se
    // excluye por nombre, y no relajando el patron, para que la guardia siga cayendo con un
    // caso de uso nuevo de verdad. Si algun dia deja de ser una excepcion, el aserto de
    // `toHaveLength(9)` lo dira.
    const NO_SON_CASOS_DE_USO: readonly string[] = ['list-query.ts']

    const factoriasEnElDominio = readdirSync(join(moduloDir, 'domain'))
      .filter(
        (archivo) =>
          /^(create|update|delete|get|list)-/.test(archivo) &&
          !NO_SON_CASOS_DE_USO.includes(archivo),
      )
      .sort()
    expect(factoriasEnElDominio).toEqual([...CASOS_DE_USO].map((c) => c.archivo).sort())
    expect(CASOS_DE_USO).toHaveLength(9)

    // Y la tabla R16 esta completa por los dos lados: tres lecturas y seis escrituras, y los
    // dos codigos existen en el catalogo REAL de `identity`, no en una copia escrita a mano.
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual(['getSupplier', 'listCatalogLines', 'listSuppliers'])
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual([
      'createCatalogLine',
      'createSupplier',
      'deleteCatalogLine',
      'deleteSupplier',
      'updateCatalogLine',
      'updateSupplier',
    ])
    const codigos: readonly string[] = PERMISSIONS.map((p) => p.code)
    expect(codigos).toContain(CONSULTAR)
    expect(codigos).toContain(MODIFICAR)
  })

  it('R16, R17 — cada caso de uso avanza con EXACTAMENTE el permiso de su fila y con nada mas', async () => {
    for (const caso of CASOS_DE_USO) {
      // Concesion: el actor tiene SOLO el codigo exigido. No hace falta ningun rol: R17 dice
      // que la concesion depende del conjunto de permisos, «sea cual sea el nombre de su rol»,
      // y aqui el `Actor` ni siquiera tiene donde guardarlo (R18).
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso))

      // «Y NO DEBE exigir ningun otro»: con los otros NUEVE codigos del catalogo real y sin el
      // suyo, el caso de uso rechaza. Es la mitad que impide que alguien exija un codigo de
      // otro modulo -o dos a la vez- y el test siga verde.
      await esperarRechazoSinTocarNada(
        caso,
        actorCon(...todosMenos(caso.permiso)),
        `todo el catalogo menos ${caso.permiso}`,
      )
    }
  })

  it('R13 — solo `proveedores.consultar` no abre ninguna de las seis escrituras', async () => {
    // Pertenencia EXACTA, sin implicacion entre permisos: consultar no concede modificar.
    for (const caso of CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR)) {
      await esperarRechazoSinTocarNada(caso, actorCon(CONSULTAR), 'solo proveedores.consultar')
    }
  })

  it('R13 — solo `proveedores.modificar` no abre ninguna de las tres lecturas', async () => {
    // Y el sentido inverso, que es el que la intuicion se salta: modificar NO concede consultar.
    for (const caso of CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR)) {
      await esperarRechazoSinTocarNada(caso, actorCon(MODIFICAR), 'solo proveedores.modificar')
    }
  })

  it('R13 — ni el prefijo, ni otra caja, ni un codigo parecido conceden nada', async () => {
    // Sin normalizacion y sin coincidencia parcial: los conjuntos de abajo CONTIENEN algo que
    // se parece al codigo exigido y ninguno lo es.
    const PARECIDOS: readonly {
      readonly etiqueta: string
      readonly permisos: readonly string[]
    }[] = [
      { etiqueta: 'solo el prefijo del modulo', permisos: ['proveedores'] },
      { etiqueta: 'el prefijo con el punto', permisos: ['proveedores.'] },
      {
        etiqueta: 'los dos codigos en otra caja',
        permisos: [CONSULTAR.toUpperCase(), MODIFICAR.toUpperCase()],
      },
      { etiqueta: 'los dos codigos con espacios', permisos: [` ${CONSULTAR} `, ` ${MODIFICAR} `] },
      { etiqueta: 'un codigo mas largo', permisos: [`${MODIFICAR}.todo`, `${CONSULTAR}.todo`] },
    ]

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, permisos } of PARECIDOS) {
        await esperarRechazoSinTocarNada(caso, actorCon(...permisos), etiqueta)
      }
    }
  })

  it('R14 — falla cerrado: actor ausente, sin conjunto de permisos, vacio o de otro modulo', async () => {
    const NO_AUTORIZADOS: readonly {
      readonly etiqueta: string
      readonly actor: Actor | null | undefined
    }[] = [
      { etiqueta: 'actor ausente (null)', actor: null },
      { etiqueta: 'actor ausente (undefined)', actor: undefined },
      { etiqueta: 'conjunto de permisos vacio', actor: actorCon() },
      // El Operador que siembra el seed: su UNICO permiso es `inventario.consultar` (R9), que
      // no abre nada de este modulo. Es el caso que de verdad puede ocurrir hoy.
      { etiqueta: 'el Operador sembrado', actor: actorCon('inventario.consultar') },
      {
        // Lo que llegaria de un adaptador que se olvidara del campo: falla cerrado igual, no
        // revienta con un `TypeError` ni concede por descuido.
        etiqueta: 'sin conjunto de permisos',
        actor: { id: 'u-1' } as unknown as Actor,
      },
      {
        etiqueta: 'conjunto que no es un array',
        actor: { id: 'u-1', permissions: 'proveedores.modificar' } as unknown as Actor,
      },
    ]

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, actor } of NO_AUTORIZADOS) {
        await esperarRechazoSinTocarNada(caso, actor, etiqueta)
      }
    }
  })

  it('R12 — el permiso se comprueba ANTES de zod: con entrada invalida el rechazo sigue siendo por permiso', async () => {
    // Si validara primero, un actor no autorizado con una consulta rota recibiria
    // `ValidationError` y sabria algo del sistema sin tener permiso para preguntarlo. Aqui la
    // entrada es basura Y el actor no tiene permiso: lo que sale es `unauthorized`, y ningun
    // puerto se toca. Mutacion que lo pone rojo: mover `requirePermission` debajo del
    // `safeParse` en cualquiera de los seis casos que validan.
    const conZod = CASOS_DE_USO.filter((c) => c.ejecutarConBasura !== undefined)
    expect(conZod).toHaveLength(6)

    for (const caso of conZod) {
      await esperarRechazoSinTocarNada(
        caso,
        actorCon('inventario.consultar'),
        'entrada invalida y sin permiso',
        caso.ejecutarConBasura,
      )
    }
  })

  it('R12 — cada caso de uso recibe el actor por parametro y no lee ninguna sesion', async () => {
    // Dos mitades:
    //
    // 1. TEXTO: ningun archivo del dominio nombra cookie, cabecera, sesion ni el lector de
    //    sesion de `identity`. Quien resuelve el actor es el adaptador driving con
    //    `identity.getSessionUser()` via `@/lib/composition`, y esa es la unica puerta.
    //    Mutacion que lo pone rojo: importar `cookies` de `next/headers` en cualquier caso
    //    de uso -tambien caeria la guardia de pureza del dominio, que es el cinturon-.
    for (const archivo of fuentesDelModulo(join(moduloDir, 'domain'))) {
      const fuente = readFileSync(archivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
      expect(fuente, `${archivo} lee la sesion`).not.toMatch(
        /getSessionUser|next\/headers|\bcookies?\b|\bheaders\(\)|@\/lib\/composition/i,
      )
    }

    // 2. COMPORTAMIENTO: el actor es un ARGUMENTO, asi que el mismo caso de uso con el mismo
    //    entorno acepta o rechaza segun lo que se le pase, sin nada ambiental.
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinTocarNada(caso, actorCon('inventario.consultar'), 'otro modulo')
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso))
    }
  })

  it('R18 — el Actor del modulo no tiene nombre de rol y ningun archivo lo lee', () => {
    // El tipo, primero: `Actor` es `{ id, permissions }` y nada mas. Mutacion que lo pone
    // rojo: devolver `roleName` en `actor.ts` «por si acaso».
    const actorTs = readFileSync(join(moduloDir, 'domain', 'actor.ts'), 'utf8')
    expect(actorTs).toMatch(
      /export type Actor = \{\s*readonly id: string;\s*readonly companyId: string;\s*readonly permissions: readonly string\[\];\s*\}/,
    )

    // Y el modulo entero: ni `roleName`, ni el literal de un rol, ni la comprobacion vieja. Es
    // el centinela local de la guardia global de T15; que exista aqui hace que el rojo apunte
    // al modulo que lo rompio.
    const archivos = fuentesDelModulo()
    expect(archivos.length).toBeGreaterThan(0)
    for (const archivo of archivos) {
      const fuente = readFileSync(archivo, 'utf8')
      expect(fuente, `${archivo} lee el nombre del rol`).not.toMatch(/roleName/)
      expect(fuente, `${archivo} incrusta el literal del rol`).not.toMatch(/['"`]Administrador/)
      expect(fuente, `${archivo} conserva la autorizacion por rol`).not.toMatch(
        /requireAdmin|assertAdminRole|ROLE_ADMINISTRADOR|ROLE_OPERADOR/,
      )
    }

    // La regla sale del BARREL de `identity`, no por ruta profunda ni de otro modulo de
    // negocio: `assertPermission` es la UNICA implementacion del repo y el catalogo de codigos
    // tiene un solo dueno.
    expect(actorTs).toMatch(
      /import \{ assertPermission, type PermissionCode \} from '@\/lib\/modules\/identity'/,
    )
    expect(actorTs).not.toMatch(/@\/lib\/modules\/identity\//)
    expect(actorTs).not.toMatch(/@\/lib\/modules\/(inventario|recetas|unidades|pedidos)/)
  })
})
