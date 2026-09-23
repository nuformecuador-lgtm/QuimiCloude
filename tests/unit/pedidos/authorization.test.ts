// QC-74 T13 — Autorizacion POR PERMISO de los SEIS casos de uso de `pedidos`
// (R12, R13, R14, R15, R16, R17, R18).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como
// dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS que QC-33 dejo
// activadas y FORZADAS en `orders` no filtran NINGUNA consulta de esta app. La frontera real
// es el caso de uso. Un permiso que solo existiera como policy no estaria implementado, y un
// `requirePermission` que se saltara UNO de los seis seria justo el agujero que este archivo
// existe para encontrar.
//
// POR QUE LOS DOBLES EXPLOTAN. Los DOS puertos -el repositorio de pedidos y el contrato
// `RecipeCatalog`- FALLAN SI LOS LLAMAN. No basta con que la operacion lance
// `UnauthorizedError`: tiene que lanzarlo SIN HABER TOCADO NADA (R12). Con dobles permisivos,
// un caso de uso que comprobara el permiso DESPUES de leer la fila pasaria verde, y quien no
// lo tiene habria leido igual.
//
// ERAN TRES PUERTOS hasta QC-35bis (2026-09-07): `UnitCatalog` se fue con la unidad del pedido.
//
// LO QUE ESTE ARCHIVO YA NO HACE. Hasta QC-74 su segunda mitad barria todos los fuentes de
// `lib/modules/pedidos/**` vigilando que no apareciera el literal del rol. Esa vigilancia se
// RETIRA de aqui: la sustituye una guardia GLOBAL a los cinco modulos,
// `tests/guards/guard-autorizacion-por-permiso.test.ts` (QC-74 R20, T16). Una copia por modulo
// de la misma regla es exactamente lo que la decision cerrada 7 del spec quiere evitar.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { createCancelOrder } from '@/lib/modules/pedidos/domain/cancel-order'
import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import { PedidosError, UnauthorizedError } from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'

const CONSULTAR = 'pedidos.consultar'
const MODIFICAR = 'pedidos.modificar'

const ENTRADA_ALTA = {
  recipeId: RECIPE_ID,
  quantity: '10.0000',
  presentationId: PRESENTATION_ID,
}
const ENTRADA_EDICION = { ...ENTRADA_ALTA, status: 'EN_CURSO' }

/** Entrada que zod RECHAZARIA. Sirve para R12: quien no tiene el permiso se va por
 *  `UnauthorizedError`, NO por `ValidationError` — la autorizacion va antes que la validacion. */
const ENTRADA_INVALIDA = { recipeId: 'no-es-un-uuid', quantity: '-1' }

/** Los dos dobles y el log. Cada metodo explota si alguien lo llama. */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`)
    })

  const orders = {
    findAliveById: explota('orders.findAliveById'),
    listAlive: explota('orders.listAlive'),
  } as unknown as OrderRepository

  // La unidad de trabajo TAMBIEN explota si se abre sin autorizacion: R41 exige el permiso
  // ANTES de abrir la transaccion compartida con `inventario`, y `run` es justo el punto por
  // el que se abre.
  const unitOfWork = { run: explota('unitOfWork.run') } as unknown as OrderUnitOfWork

  const recipes = {
    findRefsIncludingDeleted: explota('recipes.findRefsIncludingDeleted'),
    findExecutionContentById: explota('recipes.findExecutionContentById'),
  } as unknown as RecipeCatalog

  // El calculo del importe (R23) es otro puerto que no puede tocarse sin autorizacion: si
  // alguno de los dos se llamara sin permiso, la operacion explota igual que con `orders` o
  // `recipes`.
  const products = {
    findRefs: explota('products.findRefs'),
    findCostingBatches: explota('products.findCostingBatches'),
  } as unknown as ProductCatalog

  const units = {
    findRefs: explota('units.findRefs'),
    findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
  } as unknown as UnitCatalog

  // R12: el catalogo de presentaciones tampoco puede tocarse sin autorizacion.
  const presentations = {
    findRefs: explota('presentations.findRefs'),
  } as unknown as PresentationCatalog

  // QC-57 (R34): el log del campo omitido tampoco puede sonar sin autorizacion.
  // `requirePermission` va antes de zod y antes de sanear, asi que un actor rechazado no llega
  // ni a saber que su consulta traia campos no declarados.
  const log = { ignoredFields: explota('log.ignoredFields') }

  const llamadas = () =>
    [
      ...Object.values(orders as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(recipes as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(products as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(units as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(presentations as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(log as unknown as Record<string, ReturnType<typeof vi.fn>>),
      unitOfWork.run as unknown as ReturnType<typeof vi.fn>,
    ] as readonly ReturnType<typeof vi.fn>[]

  return { orders, recipes, products, units, presentations, log, unitOfWork, llamadas }
}

/** Los dobles de la invocacion en curso. Se renuevan en CADA caso para que el contador de uno
 *  no arrastre el del anterior. */
let enCurso = dobles()

function depsDeTurno() {
  return {
    orders: enCurso.orders,
    recipes: enCurso.recipes,
    products: enCurso.products,
    units: enCurso.units,
    presentations: enCurso.presentations,
    log: enCurso.log,
    unitOfWork: enCurso.unitOfWork,
  }
}

type Invocacion = (actor: Actor | null | undefined, entrada?: unknown) => Promise<unknown>

/** Los seis casos de uso con el codigo que EXIGE cada uno (R16). Esta tabla es el dato del que
 *  cuelga todo lo demas del archivo: concesion, rechazo y cruzado se derivan de ella. */
const SEIS: readonly (readonly [string, string, Invocacion])[] = [
  [
    'createOrder',
    MODIFICAR,
    (actor, entrada = ENTRADA_ALTA) => createCreateOrder(depsDeTurno())(entrada, actor),
  ],
  ['getOrder', CONSULTAR, (actor) => createGetOrder(depsDeTurno())(ORDER_ID, actor)],
  [
    'listOrders',
    CONSULTAR,
    (actor, entrada = { page: 1 }) => createListOrders(depsDeTurno())(entrada, actor),
  ],
  [
    'updateOrder',
    MODIFICAR,
    (actor, entrada = ENTRADA_EDICION) =>
      createUpdateOrder(depsDeTurno())(ORDER_ID, entrada, actor),
  ],
  [
    'cancelOrder',
    MODIFICAR,
    (actor, entrada = { reason: 'sin stock' }) =>
      createCancelOrder({ orders: depsDeTurno().orders, unitOfWork: depsDeTurno().unitOfWork })(
        ORDER_ID,
        entrada,
        actor,
      ),
  ],
  [
    'deleteOrder',
    MODIFICAR,
    (actor) =>
      createDeleteOrder({ orders: depsDeTurno().orders, unitOfWork: depsDeTurno().unitOfWork })(
        ORDER_ID,
        actor,
      ),
  ],
]

/** Ejecuta un caso de uso con dobles NUEVOS y devuelve el error (o `null`) y los espias. */
async function ejecutar(
  invocacion: Invocacion,
  actor: Actor | null | undefined,
  entrada?: unknown,
) {
  enCurso = dobles()
  const llamadas = enCurso.llamadas
  const error = await invocacion(actor, entrada).then(
    () => null,
    (e: unknown) => e,
  )
  return { error, llamadas }
}

// QC-60 (R16): el `Actor` de `pedidos` lleva la EMPRESA desde esta ficha.
function actorCon(...permissions: readonly string[]): Actor {
  return { id: 'u-1', companyId: '33333333-3333-4333-8333-333333333333', permissions }
}

/** Afirma el rechazo COMPLETO: error del modulo, `code` estable y CERO puertos tocados. */
function esperaRechazo(
  error: unknown,
  llamadas: () => readonly ReturnType<typeof vi.fn>[],
  nombre: string,
) {
  // R15: es el `UnauthorizedError` DE ESTE modulo y ademas `instanceof PedidosError`, que es la
  // comprobacion exacta con la que el adaptador driving lo serializa a un 403.
  expect(error, nombre).toBeInstanceOf(UnauthorizedError)
  expect(error, `${nombre}: el driving traduce con instanceof PedidosError`).toBeInstanceOf(
    PedidosError,
  )
  // Se afirma sobre el CODE de la clase, nunca sobre el texto del mensaje.
  expect((error as UnauthorizedError).code, nombre).toBe('unauthorized')
  for (const doble of llamadas()) {
    expect(doble, `${nombre}: ningun puerto se toca sin autorizacion`).not.toHaveBeenCalled()
  }
}

describe('QC-74 — cada caso de uso de pedidos exige su permiso exacto (R16, R17)', () => {
  it('la tabla cubre los seis nombres con su codigo: no se queda corta por un renombrado', () => {
    // Sin esto, borrar una fila dejaria todos los bucles verdes con cinco.
    expect(SEIS.map(([nombre, codigo]) => `${nombre}:${codigo}`)).toEqual([
      'createOrder:pedidos.modificar',
      'getOrder:pedidos.consultar',
      'listOrders:pedidos.consultar',
      'updateOrder:pedidos.modificar',
      'cancelOrder:pedidos.modificar',
      'deleteOrder:pedidos.modificar',
    ])
  })

  for (const [nombre, codigo, invocacion] of SEIS) {
    it(`${nombre}: CONCEDE con ${codigo} y llega hasta el puerto`, async () => {
      // R17: con el codigo exigido la operacion NO se detiene en la autorizacion. Los dobles
      // siguen explotando, asi que el error que sale ya no es de permiso: eso demuestra que la
      // barrera se cruzo. Se afirma por NEGACION del `UnauthorizedError`, que es lo unico que
      // decide este archivo; el resultado de negocio lo prueban los tests de cada caso de uso.
      const { error } = await ejecutar(invocacion, actorCon(codigo))
      expect(error, nombre).not.toBeInstanceOf(UnauthorizedError)
    })

    it(`${nombre}: RECHAZA sin ${codigo}, con el UnauthorizedError del modulo y sin tocar ningun puerto`, async () => {
      const { error, llamadas } = await ejecutar(invocacion, actorCon('otro.permiso'))
      esperaRechazo(error, llamadas, nombre)
    })
  }
})

describe('QC-74 — pertenencia exacta, sin implicacion entre permisos (R13)', () => {
  const ESCRITURAS = SEIS.filter(([, codigo]) => codigo === MODIFICAR)
  const LECTURAS = SEIS.filter(([, codigo]) => codigo === CONSULTAR)

  it('hay cuatro escrituras y dos lecturas: el cruzado no corre sobre una lista vacia', () => {
    expect(ESCRITURAS.map(([nombre]) => nombre)).toEqual([
      'createOrder',
      'updateOrder',
      'cancelOrder',
      'deleteOrder',
    ])
    expect(LECTURAS.map(([nombre]) => nombre)).toEqual(['getOrder', 'listOrders'])
  })

  for (const [nombre, , invocacion] of ESCRITURAS) {
    it(`${nombre}: tener solo ${CONSULTAR} NO abre la escritura`, async () => {
      const { error, llamadas } = await ejecutar(invocacion, actorCon(CONSULTAR))
      esperaRechazo(error, llamadas, nombre)
    })
  }

  for (const [nombre, , invocacion] of LECTURAS) {
    it(`${nombre}: tener solo ${MODIFICAR} NO abre la lectura`, async () => {
      const { error, llamadas } = await ejecutar(invocacion, actorCon(MODIFICAR))
      esperaRechazo(error, llamadas, nombre)
    })
  }

  for (const [nombre, codigo, invocacion] of SEIS) {
    it(`${nombre}: ni prefijo, ni sufijo, ni mayusculas, ni otro modulo se cuelan por ${codigo}`, async () => {
      // Sin normalizacion y sin coincidencia parcial: el modulo a secas, el codigo con algo
      // pegado detras, el mismo codigo en mayusculas y el codigo homonimo de otro modulo son
      // todos «no».
      const casi = [
        'pedidos',
        `${codigo}.extra`,
        codigo.toUpperCase(),
        codigo.replace('pedidos.', 'inventario.'),
      ]
      const { error, llamadas } = await ejecutar(invocacion, actorCon(...casi))
      esperaRechazo(error, llamadas, nombre)
    })
  }
})

describe('QC-74 — falla cerrado (R14)', () => {
  const AUSENTES: readonly (readonly [string, Actor | null | undefined])[] = [
    ['sin actor (null)', null],
    ['sin actor (undefined)', undefined],
    ['conjunto de permisos vacio', { id: 'u-vacio', companyId: '33333333-3333-4333-8333-333333333333', permissions: [] }],
  ]

  for (const [quien, actor] of AUSENTES) {
    for (const [nombre, , invocacion] of SEIS) {
      it(`${nombre}: ${quien} rechaza y NO toca ningun puerto`, async () => {
        const { error, llamadas } = await ejecutar(invocacion, actor)
        esperaRechazo(error, llamadas, nombre)
      })
    }
  }

  it('un actor sin la propiedad de permisos rechaza igual, no revienta con TypeError', async () => {
    // La forma llega en tiempo de ejecucion desde el adaptador driving; el tipo no la garantiza
    // si el dato viniera mal. Falla cerrado igual.
    const roto = { id: 'u-roto' } as unknown as Actor
    for (const [nombre, , invocacion] of SEIS) {
      const { error, llamadas } = await ejecutar(invocacion, roto)
      esperaRechazo(error, llamadas, nombre)
    }
  })
})

describe('R12: alta y edicion rechazan sin pedidos.modificar antes del catalogo de presentaciones', () => {
  const CON_PRESENTACION = SEIS.filter(([nombre]) => ['createOrder', 'updateOrder'].includes(nombre))

  for (const [nombre, , invocacion] of CON_PRESENTACION) {
    it(`R12: ${nombre} sin pedidos.modificar rechaza con unauthorized y no llama a presentations.findRefs`, async () => {
      const { error, llamadas } = await ejecutar(invocacion, actorCon('otro.permiso'))
      esperaRechazo(error, llamadas, nombre)
      expect(enCurso.presentations.findRefs).not.toHaveBeenCalled()
    })
  }
})

describe('QC-74 — la autorizacion va ANTES de la validacion (R12)', () => {
  // Las operaciones que validan entrada con zod. Con entrada invalida Y sin permiso, el error
  // tiene que ser el de PERMISO: si saliera `ValidationError`, zod habria corrido antes.
  const CON_ENTRADA = SEIS.filter(([nombre]) =>
    ['createOrder', 'listOrders', 'updateOrder', 'cancelOrder'].includes(nombre),
  )

  it('las cuatro operaciones con entrada estan en la lista', () => {
    expect(CON_ENTRADA.map(([nombre]) => nombre)).toEqual([
      'createOrder',
      'listOrders',
      'updateOrder',
      'cancelOrder',
    ])
  })

  for (const [nombre, , invocacion] of CON_ENTRADA) {
    it(`${nombre}: con entrada invalida y sin permiso, rechaza por PERMISO y no valida`, async () => {
      const { error, llamadas } = await ejecutar(
        invocacion,
        actorCon('otro.permiso'),
        ENTRADA_INVALIDA,
      )
      esperaRechazo(error, llamadas, nombre)
    })
  }
})

// ---------------------------------------------------------------------------------------
// La comprobacion ESTRUCTURAL: `requirePermission` es la PRIMERA linea, antes de `zod` y antes
// de tocar ningun puerto. Los dobles que explotan ya lo demuestran en ejecucion; esto lo fija
// tambien en la forma del archivo, para que un refactor que mueva la llamada tres lineas mas
// abajo se vea aqui aunque los dobles siguieran sin llamarse por casualidad.
// ---------------------------------------------------------------------------------------

const domainDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'pedidos',
  'domain',
)

const SEIS_ARCHIVOS = [
  ['create-order.ts', MODIFICAR],
  ['get-order.ts', CONSULTAR],
  ['list-orders.ts', CONSULTAR],
  ['update-order.ts', MODIFICAR],
  ['cancel-order.ts', MODIFICAR],
  ['delete-order.ts', MODIFICAR],
] as const

/** Fuente sin comentarios: lo que se vigila es el CODIGO, no la prosa. */
function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** El cuerpo de la funcion DEVUELTA por la factory: lo de arriba corre al cablear, no al
 *  ejecutar la operacion, y por eso no cuenta como «antes de `requirePermission`». */
function cuerpoDelCasoDeUso(fuente: string): string {
  const inicio = soloCodigo(fuente).indexOf('return async function')
  expect(inicio).toBeGreaterThan(-1)
  return soloCodigo(fuente).slice(inicio)
}

describe('QC-74 — requirePermission es la primera linea de los seis, con su codigo (R12, R16)', () => {
  for (const [archivo, codigo] of SEIS_ARCHIVOS) {
    it(`${archivo}: requirePermission(actor, '${codigo}') va antes de zod y de cualquier puerto`, () => {
      const cuerpo = cuerpoDelCasoDeUso(readFileSync(join(domainDir, archivo), 'utf8'))

      const autorizacion = cuerpo.indexOf(`requirePermission(actor, '${codigo}')`)
      expect(autorizacion, `requirePermission(actor, '${codigo}') tiene que estar`).toBeGreaterThan(
        -1,
      )

      const validacion = cuerpo.indexOf('safeParse')
      if (validacion > -1) expect(autorizacion).toBeLessThan(validacion)

      const primerPuerto = cuerpo.search(/\bdeps\s*\.\s*(orders|recipes)\b/)
      expect(primerPuerto, 'algun puerto tiene que usarse').toBeGreaterThan(-1)
      expect(autorizacion).toBeLessThan(primerPuerto)
    })
  }
})

describe('QC-74 — el Actor de pedidos no lleva nombre de rol (R18)', () => {
  it('domain/actor.ts declara id y permissions, y ningun campo de rol', () => {
    const fuente = soloCodigo(readFileSync(join(domainDir, 'actor.ts'), 'utf8'))
    expect(fuente).toMatch(/readonly permissions: readonly string\[\]/)
    // El barrido GLOBAL contra el nombre de rol en los cinco modulos vive en
    // `tests/guards/guard-autorizacion-por-permiso.test.ts` (R20, T16). Aqui solo se ancla el
    // tipo de ESTE modulo, que es lo que R18 pide nombre por nombre.
    expect(fuente).not.toMatch(/roleName/)
  })
})

// ---------------------------------------------------------------------------------------
// QC-60 (R28, T16). El ambito por empresa NO cambia la autorizacion: siguen siendo los dos
// permisos de siempre, se exigen en el service y se exigen ANTES de validar la entrada y de
// tocar ningun puerto. Lo que esta ficha anade es que el actor ya lleva EMPRESA, y eso abre dos
// tentaciones que este bloque cierra: crear un permiso «por empresa», y dejar que un actor
// rechazado se distinga segun de que empresa venga.
// ---------------------------------------------------------------------------------------

describe('QC-60 R28 — ningun permiso nuevo: siguen siendo pedidos.consultar y pedidos.modificar', () => {
  const moduloDir = join(domainDir, '..')

  /** Todos los `.ts` de `lib/modules/pedidos/**`, leidos del disco. */
  function fuentesDelModulo(dir: string): readonly string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name)
      if (entrada.isDirectory()) return fuentesDelModulo(ruta)
      return entrada.name.endsWith('.ts') ? [ruta] : []
    })
  }

  it('los seis casos de uso exigen exactamente esos dos codigos, y ningun otro', () => {
    const exigidos = new Set<string>()
    for (const [archivo] of SEIS_ARCHIVOS) {
      const codigo = soloCodigo(readFileSync(join(domainDir, archivo), 'utf8'))
      for (const match of codigo.matchAll(/requirePermission\(\s*actor\s*,\s*'([^']+)'\s*\)/g)) {
        exigidos.add(match[1] ?? '')
      }
    }
    expect([...exigidos].sort()).toEqual([CONSULTAR, MODIFICAR])
  })

  it('ningun archivo del modulo escribe un codigo de permiso de pedidos distinto de esos dos', () => {
    const fuentes = fuentesDelModulo(moduloDir)
    // Anti-placebo: el barrido LEE el modulo (dominio, puertos y adaptadores).
    expect(fuentes.length).toBeGreaterThan(10)

    const codigos = new Set<string>()
    for (const ruta of fuentes) {
      const codigo = soloCodigo(readFileSync(ruta, 'utf8'))
      for (const match of codigo.matchAll(/['"`](pedidos\.[a-zA-Z_.-]+)['"`]/g)) {
        codigos.add(match[1] ?? '')
      }
    }
    expect(codigos.size, 'el barrido no encontro ni los dos codigos existentes').toBeGreaterThan(0)
    for (const codigo of codigos) {
      expect([CONSULTAR, MODIFICAR], `permiso nuevo en pedidos: ${codigo}`).toContain(codigo)
    }
  })
})

describe('QC-60 R28 — rechazo POR IGUAL de las cuatro formas de no estar autorizado, antes de la entrada y de los puertos', () => {
  const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'

  /** Las cuatro formas que enumera R28, todas con una empresa distinta de la del pedido: la
   *  empresa no puede cambiar ni el error ni el momento del rechazo. */
  const NO_AUTORIZADOS: readonly (readonly [string, Actor | null | undefined])[] = [
    ['actor ausente (null)', null],
    ['actor ausente (undefined)', undefined],
    [
      'actor sin conjunto de permisos',
      { id: 'u-sin', companyId: OTRA_EMPRESA } as unknown as Actor,
    ],
    ['actor con el conjunto vacio', { id: 'u-vacio', companyId: OTRA_EMPRESA, permissions: [] }],
    [
      'actor sin el codigo exacto',
      {
        id: 'u-casi',
        companyId: OTRA_EMPRESA,
        permissions: ['pedidos', 'pedidos.consultar.extra', 'PEDIDOS.MODIFICAR', 'inventario.modificar'],
      },
    ],
  ]

  for (const [nombre, , invocacion] of SEIS) {
    it(`${nombre}: las cuatro formas dan el MISMO error, con entrada invalida y sin tocar ningun puerto`, async () => {
      const firmas: string[] = []
      for (const [quien, actor] of NO_AUTORIZADOS) {
        // Entrada INVALIDA en las que la tienen: si zod corriera antes, saldria `invalid_input`.
        const { error, llamadas } = await ejecutar(invocacion, actor, ENTRADA_INVALIDA)
        esperaRechazo(error, llamadas, `${nombre} / ${quien}`)
        const e = error as UnauthorizedError
        firmas.push(`${e.constructor.name}|${e.code}|${e.message}`)
      }
      // Indistinguibles entre si: ni la forma del actor ni su empresa se filtran por el error.
      expect(new Set(firmas).size, `${nombre}: el rechazo varia segun el actor`).toBe(1)
    })
  }
})
