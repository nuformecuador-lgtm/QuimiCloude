// T15 — Las Server Actions de `pedidos` (`design.md > 9`, `> 7.5`). Mockea `@/lib/composition`
// igual que `tests/unit/proveedores/supplier-actions.test.ts` y
// `tests/unit/inventario/product-actions.test.ts`: la action se prueba contra dobles, nunca
// contra el dominio real ni contra la sesion real.
//
// Cubre R5, R54 y R56 con los nombres EXACTOS que exige `tasks.md > Trazabilidad`.
//
// Los tres casos miden cosas distintas a proposito:
//  - R5  : de donde sale el actor, y que la action NO vuelve a decidir NADA (ni el rol, ni el
//          estado del pedido, ni la transicion, ni el tope del motivo, ni la paginacion).
//  - R54 : la FORMA de la entrada por operacion -las cuatro mutaciones con `FormData`, las dos
//          consultas con argumentos ya tipados-, que una entrada invalida NO llega al caso de
//          uso, y que no hay route handler ni `fetch` a ninguna ruta propia.
//  - R56 : que el error viaja por el `code` ESTABLE de la clase y jamas por el texto, y que lo
//          que no es error de dominio se RELANZA en vez de tragarse.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorMessage, UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores'
import {
  DuplicateOrderNumberError,
  InvalidTransitionError,
  NotCancellableError,
  NotDeletableError,
  OrderNotFoundError,
  PresentationNotFoundError,
  RecipeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/pedidos'
import {
  cancelOrderAction,
  createOrderAction,
  deleteOrderAction,
  getOrderAction,
  listOrdersAction,
  quoteOrderCostAction,
  updateOrderAction,
  type CreateOrderFormState,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'
import * as orderActions from '@/lib/modules/pedidos/adapters/driving/order-actions'
import { createCancelOrder } from '@/lib/modules/pedidos/domain/cancel-order'
import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createQuoteOrderCost } from '@/lib/modules/pedidos/domain/quote-order-cost'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const {
  createOrderMock,
  getOrderMock,
  listOrdersMock,
  updateOrderMock,
  cancelOrderMock,
  deleteOrderMock,
  quoteOrderCostMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  getOrderMock: vi.fn(),
  listOrdersMock: vi.fn(),
  updateOrderMock: vi.fn(),
  cancelOrderMock: vi.fn(),
  deleteOrderMock: vi.fn(),
  quoteOrderCostMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  // QC-60 (R17): la action pide las DOS caras de la sesion. Sin contexto no hay actor.
  getSessionContextMock: vi.fn(),
}))

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
})

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  pedidos: {
    createOrder: createOrderMock,
    getOrder: getOrderMock,
    listOrders: listOrdersMock,
    updateOrder: updateOrderMock,
    cancelOrder: cancelOrderMock,
    deleteOrder: deleteOrderMock,
    quoteOrderCost: quoteOrderCostMock,
  },
}))

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  // `roleName` se queda en la sesion: es DISPLAY, lo pinta `nav-user`. Lo que autoriza son los
  // permisos, y son lo unico que la action baja al caso de uso (QC-74 R18).
  roleName: 'Administrador',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}

/** QC-60: la empresa sale del CONTEXTO de sesion, nunca del formulario. */
const SESSION_CONTEXT = { companyId: '33333333-3333-4333-8333-333333333333' }

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

const CREATE_INITIAL: CreateOrderFormState = { status: 'idle' }
const MUTATION_INITIAL: OrderMutationFormState = { status: 'idle' }

const VALID_CREATE_FIELDS = {
  recipeId: RECIPE_ID,
  quantity: '12.5000',
  priority: 'ALTA',
  presentationId: PRESENTATION_ID,
}

const VALID_UPDATE_FIELDS = { ...VALID_CREATE_FIELDS, status: 'EN_CURSO' }

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ACTIONS_PATH = join(
  repoRoot,
  'lib',
  'modules',
  'pedidos',
  'adapters',
  'driving',
  'order-actions.ts',
)

/** Fuente SIN comentarios: se vigila el CODIGO, no la prosa que lo explica. Este archivo
 *  documenta por escrito lo que NO hace -«no repite `requirePermission`», «sin `revalidatePath`»-,
 *  y un barrido sobre el texto crudo leeria la advertencia como la infraccion. */
function readActionsSource(): string {
  return readFileSync(ACTIONS_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER)
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT)
})

describe('Server Actions de pedidos — actor, forma de entrada y errores', () => {
  it('la accion toma el actor de identity.getSessionUser y no vuelve a decidir nada', async () => {
    // R5, primera mitad: el actor sale de la sesion, UNA vez por invocacion, y llega al caso
    // de uso tal cual. Se comprueba en las SEIS actions, no en una de muestra: una sola que se
    // olvidara de pasarlo dejaria el caso de uso recibiendo `undefined`.
    createOrderMock.mockResolvedValue({
      id: ORDER_ID,
      number: { year: 2026, sequence: 1 },
      numberText: '2026-0000001',
    })
    updateOrderMock.mockResolvedValue(undefined)
    cancelOrderMock.mockResolvedValue(undefined)
    deleteOrderMock.mockResolvedValue(undefined)
    getOrderMock.mockResolvedValue({ id: ORDER_ID })
    listOrdersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 })

    const ESPERADO = {
      id: 'user-admin-1',
      companyId: SESSION_CONTEXT.companyId,
      permissions: ['pedidos.consultar', 'pedidos.modificar'],
    }

    await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
    expect(createOrderMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS))
    expect(updateOrderMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    await cancelOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID, reason: 'Sin stock' }))
    expect(cancelOrderMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    await deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID }))
    expect(deleteOrderMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await getOrderAction(ORDER_ID)
    expect(getOrderMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await listOrdersAction({ page: 1 })
    expect(listOrdersMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    quoteOrderCostMock.mockResolvedValue({ ingredientsCost: null })
    await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' })
    expect(quoteOrderCostMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    expect(getSessionUserMock).toHaveBeenCalledTimes(7)

    // Sin sesion, el actor que baja es `null` -no un objeto inventado, no un `throw` de la
    // action-: quien rechaza es el caso de uso (R3, falla cerrado).
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue(null)
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT)
    createOrderMock.mockRejectedValue(new UnauthorizedError())
    const sinSesion = await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
    expect(createOrderMock.mock.calls[0]?.[1]).toBeNull()
    expect(sinSesion).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: expect.any(String),
    })

    // R5, segunda mitad: la action NO decide. No repite `requirePermission`, no incrusta el rol,
    // valida con los esquemas del dominio, no conoce los estados ni las transiciones, no mide
    // el motivo, no reimplementa la paginacion y no habla con el ORM.
    const source = readActionsSource()
    expect(source, 'repite la comprobacion de permiso').not.toMatch(/requirePermission/)
    expect(source, 'incrusta el nombre del rol').not.toMatch(/Administrador/)
    expect(source, 'incrusta ROLE_ADMINISTRADOR').not.toMatch(/ROLE_ADMINISTRADOR/)
    expect(source, 'valida con el esquema del dominio').not.toMatch(/Schema\b/)
    expect(source, 'decide sobre el estado o la transicion').not.toMatch(
      /PENDIENTE|EN_CURSO|ENTREGADO|CANCELADO|assertTransition|isAllowedTransition/,
    )
    expect(source, 'mide el motivo de la cancelacion').not.toMatch(/\b500\b/)
    expect(source, 'reimplementa la paginacion').not.toMatch(
      /DEFAULT_PAGE_SIZE|MAX_PAGE_SIZE|Math\.(ceil|min)/,
    )
    expect(source, 'habla con el ORM').not.toMatch(/@prisma\/client|prisma\./)
    // Y no convierte los importes a numero: viajan como CADENA decimal hasta el driven.
    expect(source, 'convierte un importe a numero').not.toMatch(
      /Number\(|parseFloat\(|Number\.parseFloat\(/,
    )
    // Sin `revalidatePath`: no hay ninguna ruta que revalidar todavia (R57), y adivinar la de
    // QC-35 seria inventarla.
    expect(source, 'revalida una ruta que todavia no existe').not.toMatch(/revalidatePath/)
  })

  it('las mutaciones reciben FormData, las consultas argumentos tipados, y una entrada invalida no llega al caso de uso', async () => {
    // R54. Se mide en tres planos, porque un solo plano se puede falsear:
    //
    //  1. COMPORTAMIENTO: las cuatro mutaciones leen de verdad los campos del `FormData` -si
    //     la action ignorara el formulario, el candidato que llega al caso de uso no llevaria
    //     estos valores- y una mutacion SIN identificador se corta en el borde.
    //  2. FIRMA: las dos consultas NO admiten `FormData`; reciben argumentos ya tipados.
    //  3. ALCANCE: no existe ningun route handler de pedidos ni `fetch` a una ruta propia.
    createOrderMock.mockResolvedValue({
      id: ORDER_ID,
      number: { year: 2026, sequence: 1 },
      numberText: '2026-0000001',
    })
    updateOrderMock.mockResolvedValue(undefined)
    cancelOrderMock.mockResolvedValue(undefined)
    deleteOrderMock.mockResolvedValue(undefined)

    // 1. El alta traslada los TRES campos del formulario SIN tocarlos: la cantidad sigue siendo
    //    cadena y el recorte/los rangos son de `zod`, no del borde. (Eran cinco hasta el
    //    2026-09-07: la unidad y el precio unitario salieron del pedido.)
    await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
    expect(createOrderMock.mock.calls[0]?.[0]).toEqual({
      recipeId: RECIPE_ID,
      quantity: '12.5000',
      priority: 'ALTA',
      presentationId: PRESENTATION_ID,
    })
    // Y lo que el esquema no declara NO se envia: ni estado, ni motivo, ni correlativo, ni
    // autores (R6, R9). La action no puede colar por el formulario lo que el alta no acepta.
    for (const prohibido of [
      'status',
      'cancellationReason',
      'orderYear',
      'orderSequence',
      'createdAt',
      'createdBy',
      'updatedBy',
    ]) {
      expect(createOrderMock.mock.calls[0]?.[0]).not.toHaveProperty(prohibido)
    }

    // Una prioridad AUSENTE llega como ausencia -no como cadena vacia-, para que el defecto
    // `BAJA` del esquema pueda aplicarse (R9).
    await createOrderAction(
      CREATE_INITIAL,
      formDataOf({
        recipeId: RECIPE_ID,
        quantity: '12.5000',
      }),
    )
    expect(createOrderMock.mock.calls[1]?.[0]).toMatchObject({ priority: undefined })

    // La edicion es REEMPLAZO COMPLETO de los datos de negocio; el `id` NO viaja en el
    // `FormData`, es argumento. Un `status` que el formulario siga enviando (aqui,
    // `VALID_UPDATE_FIELDS`) NUNCA llega al caso de uso: la edicion ya no mueve el estado.
    await updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS))
    expect(updateOrderMock.mock.calls[0]?.[0]).toBe(ORDER_ID)
    expect(updateOrderMock.mock.calls[0]?.[1]).toEqual({
      recipeId: RECIPE_ID,
      quantity: '12.5000',
      priority: 'ALTA',
      presentationId: PRESENTATION_ID,
    })
    expect(updateOrderMock.mock.calls[0]?.[1]).not.toHaveProperty('status')
    // Y NUNCA lleva motivo: cancelar es `cancelOrder` y solo el (R24, R26).
    expect(updateOrderMock.mock.calls[0]?.[1]).not.toHaveProperty('reason')
    expect(updateOrderMock.mock.calls[0]?.[1]).not.toHaveProperty('cancellationReason')

    // La cancelacion lleva el id y el motivo en el formulario, y el motivo se entrega TAL
    // CUAL: el recorte y el tope son de `cancelOrderSchema` (R27).
    await cancelOrderAction(
      MUTATION_INITIAL,
      formDataOf({ id: ORDER_ID, reason: '  Cliente anulo el pedido  ' }),
    )
    expect(cancelOrderMock.mock.calls[0]?.[0]).toBe(ORDER_ID)
    expect(cancelOrderMock.mock.calls[0]?.[1]).toEqual({ reason: '  Cliente anulo el pedido  ' })

    // El borrado lleva el id en el formulario (campo oculto de un boton).
    await deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID }))
    expect(deleteOrderMock.mock.calls[0]?.[0]).toBe(ORDER_ID)

    // 1.b UNA ENTRADA INVALIDA NO LLEGA AL CASO DE USO. Los dobles se sustituyen por otros que
    //     FALLAN si alguien los llama: sin esto, el `toEqual` de abajo saldria verde tambien
    //     con una action que invocara el dominio y se limitara a traducir su error.
    cancelOrderMock.mockImplementation(() => {
      throw new Error('cancelOrder no debe invocarse sin identificador')
    })
    deleteOrderMock.mockImplementation(() => {
      throw new Error('deleteOrder no debe invocarse sin identificador')
    })

    const cancelSinId = await cancelOrderAction(MUTATION_INITIAL, formDataOf({ reason: 'Da igual' }))
    expect(cancelSinId).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    })
    const borradoSinId = await deleteOrderAction(MUTATION_INITIAL, formDataOf({}))
    expect(borradoSinId).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    })
    // Y no se llamo ni una vez mas: el contador sigue en la unica invocacion legitima de arriba.
    expect(cancelOrderMock).toHaveBeenCalledTimes(1)
    expect(deleteOrderMock).toHaveBeenCalledTimes(1)

    // 2. Firmas: las cuatro mutaciones terminan en `FormData`; las dos consultas ni lo
    //    mencionan.
    for (const action of [
      createOrderAction,
      updateOrderAction,
      cancelOrderAction,
      deleteOrderAction,
    ]) {
      expect(
        action.length,
        `${action.name} deberia recibir prevState y FormData`,
      ).toBeGreaterThanOrEqual(2)
    }

    const source = readActionsSource()
    for (const consulta of ['getOrderAction(id: string)', 'listOrdersAction(query: unknown)']) {
      expect(source, `${consulta} deberia recibir argumentos tipados`).toContain(consulta)
    }
    for (const consulta of ['getOrderAction', 'listOrdersAction']) {
      const firma = source.slice(source.indexOf(`export async function ${consulta}(`))
      expect(
        firma.slice(0, firma.indexOf('{')),
        `${consulta} no puede recibir FormData`,
      ).not.toMatch(/FormData/)
    }
    // Las cuatro mutaciones SI la declaran: sin esto, el bloque de arriba pasaria verde con
    // una firma que no menciona `FormData` en ningun sitio.
    for (const mutacion of [
      'createOrderAction',
      'updateOrderAction',
      'cancelOrderAction',
      'deleteOrderAction',
    ]) {
      const firma = source.slice(source.indexOf(`export async function ${mutacion}(`))
      expect(firma.slice(0, firma.indexOf('{')), `${mutacion} deberia recibir FormData`).toMatch(
        /formData: FormData/,
      )
    }

    // 3. Ningun route handler propio, y ningun `fetch` a una ruta interna (R54).
    for (const ruta of ['pedidos', 'orders']) {
      expect(existsSync(join(repoRoot, 'app', 'api', ruta)), `app/api/${ruta}`).toBe(false)
    }
    expect(source, 'una action llama por fetch a una ruta propia').not.toMatch(/fetch\(/)
    expect(source, 'una action declara un route handler').not.toMatch(
      /export async function (GET|POST|PUT|PATCH|DELETE)\b/,
    )
  })

  it('traduce cada error de dominio a status error con el code estable de la clase, nunca con el texto', async () => {
    // R56. Los `code` se afirman como LITERALES escritos aqui: si alguien renombra
    // `not_cancellable` a `no_cancelable`, este test cae aunque el codigo siga "funcionando"
    // -que es justo lo que R56 protege, porque QC-35 decide por el `code`-.
    const CASOS = [
      { error: new UnauthorizedError(), code: 'unauthorized' },
      { error: new OrderNotFoundError(), code: 'order_not_found' },
      { error: new RecipeNotFoundError(), code: 'recipe_not_found' },
      { error: new PresentationNotFoundError(), code: 'presentation_not_found' },
      { error: new InvalidTransitionError(), code: 'invalid_transition' },
      { error: new NotCancellableError(), code: 'not_cancellable' },
      { error: new NotDeletableError(), code: 'not_deletable' },
      { error: new DuplicateOrderNumberError(), code: 'duplicate_number' },
      { error: new ValidationError(), code: 'invalid_input' },
    ] as const

    for (const caso of CASOS) {
      createOrderMock.mockRejectedValueOnce(caso.error)
      const result = await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
      expect(result).toEqual({ status: 'error', code: caso.code, message: caso.error.message })
    }

    // Los tres `code` que QC-35 tiene que poder distinguir SIN leer el mensaje llegan tambien
    // por su propia action, no solo por la del alta.
    cancelOrderMock.mockRejectedValueOnce(new NotCancellableError())
    expect(
      await cancelOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID, reason: 'x' })),
    ).toMatchObject({ status: 'error', code: 'not_cancellable' })

    deleteOrderMock.mockRejectedValueOnce(new NotDeletableError())
    expect(await deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID }))).toMatchObject({
      status: 'error',
      code: 'not_deletable',
    })

    updateOrderMock.mockRejectedValueOnce(new InvalidTransitionError())
    expect(
      await updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS)),
    ).toMatchObject({ status: 'error', code: 'invalid_transition' })

    // El `code` NO sale del texto ni del nombre de la clase. Desde QC-70 el mensaje tampoco
    // se puede pasar al construir el error (R7): lo unico que admite el constructor es el
    // DIAGNOSTICO, que va al log y NUNCA al estado (R28, R29). Con un error construido con
    // diagnostico, el `code` y el `message` siguen siendo los del catalogo y el diagnostico
    // no aparece por ningun campo.
    createOrderMock.mockRejectedValueOnce(new RecipeNotFoundError('receta 42 dada de baja'))
    const conDiagnostico = await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
    expect(conDiagnostico).toEqual({
      status: 'error',
      code: 'recipe_not_found',
      message: errorMessage('recipe_not_found'),
    })
    expect(JSON.stringify(conDiagnostico)).not.toContain('receta 42 dada de baja')

    // Y el codigo fuente NO decide por el texto: ninguna comparacion contra un mensaje.
    const source = readActionsSource()
    expect(source, 'la traduccion mira el mensaje').not.toMatch(
      /error\.message\s*(===|==|\.includes|\.startsWith|\.match)/,
    )
    expect(source, 'la traduccion mira el nombre de la clase').not.toMatch(/error\.name/)
    // QC-70 (R10): la traduccion ya no se escribe aqui. Este archivo ATA el traductor unico a
    // la clase base del modulo y no vuelve a declarar el suyo, que es lo que R23 protege.
    // QC-71 (T7): el atado gana un segundo argumento —la LECTURA de la cabecera del
    // identificador, que solo el punto de composicion puede dar (R9)—. La asercion no se
    // afloja: pasa a exigir TAMBIEN ese argumento, porque sin el la action no sabria que
    // identificador devolver con el error inesperado (R13).
    expect(source, 'el adaptador deberia usar el traductor unico').toMatch(
      /const toErrorState = createErrorStateTranslator\(\s*PedidosError,\s*observabilidad\.readRequestIdHeader,?\s*\)/,
    )
    expect(source, 'el adaptador vuelve a declarar su propio traductor').not.toMatch(
      /function toErrorState\s*\(/,
    )
  })

  it('lo que no es un error de dominio se devuelve como unexpected, sin una brizna del detalle', async () => {
    // QC-70 (R12, R13). Hasta esta ficha estos seis casos fijaban `rejects.toBe(ajeno)`: el
    // error ajeno subia y reventaba la pantalla con la pagina de error del framework, a veces
    // con el mensaje de Prisma dentro. La decision cerrada del 2026-09-08 lo cambia: se
    // devuelve el codigo generico con mensaje neutro y el original va al log. Lo que NO se
    // relaja es lo que estos casos ya fijaban -que el error no se traga en silencio, que las
    // SEIS actions se comportan igual y que ningun `catch` queda vacio-, y se anade lo que la
    // ficha estrena: que el texto del error ajeno no cruza por NINGUN campo del estado.
    const DETALLE = 'la conexion con la base se cayo'
    const ajeno = new Error(DETALLE)
    const NEUTRO = {
      status: 'error',
      code: UNEXPECTED_ERROR_CODE,
      message: errorMessage(UNEXPECTED_ERROR_CODE),
      // QC-71 (R13): el estado inesperado vuelve ademas con el identificador de la peticion —el
      // mismo que se escribio en la linea del registro—, y su ausencia ya no compila (R16). Lo
      // que este caso fija sigue igual: del detalle interno no sale nada mas.
      reference: REQUEST_ID_DE_PRUEBA,
    }

    /** El detalle interno no puede aparecer en NINGUN campo, no solo en `message` (R13). */
    function sinDetalle(estado: unknown, nombre: string): void {
      expect(estado, nombre).toEqual(NEUTRO)
      expect(JSON.stringify(estado), `${nombre}: el estado filtra el detalle`).not.toContain(
        DETALLE,
      )
    }

    createOrderMock.mockRejectedValueOnce(ajeno)
    sinDetalle(
      await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS)),
      'createOrderAction',
    )

    getOrderMock.mockRejectedValueOnce(ajeno)
    sinDetalle(await getOrderAction(ORDER_ID), 'getOrderAction')

    listOrdersMock.mockRejectedValueOnce(ajeno)
    sinDetalle(await listOrdersAction({ page: 1 }), 'listOrdersAction')

    updateOrderMock.mockRejectedValueOnce(ajeno)
    sinDetalle(
      await updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS)),
      'updateOrderAction',
    )

    cancelOrderMock.mockRejectedValueOnce(ajeno)
    sinDetalle(
      await cancelOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID, reason: 'x' })),
      'cancelOrderAction',
    )

    deleteOrderMock.mockRejectedValueOnce(ajeno)
    sinDetalle(
      await deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID })),
      'deleteOrderAction',
    )

    quoteOrderCostMock.mockRejectedValueOnce(ajeno)
    sinDetalle(
      await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' }),
      'quoteOrderCostAction',
    )

    // Y no hay ni un `catch` que se quede callado: los siete `catch` del archivo devuelven
    // `toErrorState`, que o traduce el error de dominio o registra el ajeno y devuelve el
    // codigo generico. Ninguno se lo traga sin dejar rastro.
    const source = readActionsSource()
    const catches = source.match(/catch\s*\(/g) ?? []
    const traducciones = source.match(/return toErrorState\(error\)/g) ?? []
    expect(catches.length).toBeGreaterThan(0)
    // Uno por action, sin ninguno de mas y sin ninguno de menos.
    expect(traducciones.length).toBe(catches.length)
    expect(catches.length).toBe(7)
    expect(source, 'hay un catch vacio').not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/)
  })
})

describe('QC-151 — quoteOrderCostAction', () => {
  it('exito devuelve { status: success, data: { ingredientsCost } }', async () => {
    quoteOrderCostMock.mockResolvedValue({ ingredientsCost: '40.0000' })
    const result = await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' })
    expect(result).toEqual({ status: 'success', data: { ingredientsCost: '40.0000' } })
  })

  it('sin sesion, el actor null baja al caso de uso y el rechazo vuelve como unauthorized (R3)', async () => {
    getSessionUserMock.mockResolvedValue(null)
    quoteOrderCostMock.mockRejectedValueOnce(new UnauthorizedError())
    const result = await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' })
    expect(quoteOrderCostMock.mock.calls[0]?.[1]).toBeNull()
    expect(result).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) })
  })

  it('entrada invalida rechaza con invalid_input (R5)', async () => {
    quoteOrderCostMock.mockRejectedValueOnce(new ValidationError())
    const result = await quoteOrderCostAction({ recipeId: 'no-es-uuid', quantity: '-1' })
    expect(result).toEqual({ status: 'error', code: 'invalid_input', message: expect.any(String) })
  })

  it('un error ajeno se devuelve como unexpected, sin detalle', async () => {
    quoteOrderCostMock.mockRejectedValueOnce(new Error('boom'))
    const result = await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' })
    expect(result).toMatchObject({ status: 'error', code: UNEXPECTED_ERROR_CODE })
  })

  it('la empresa del actor sale de getSessionContext aunque la entrada traiga otra (R7)', async () => {
    quoteOrderCostMock.mockResolvedValue({ ingredientsCost: null })
    const OTRA = '44444444-4444-4444-8444-444444444444'
    await quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000', companyId: OTRA })
    expect(quoteOrderCostMock.mock.calls[0]?.[1]).toEqual({
      id: ADMIN_SESSION_USER.id,
      companyId: SESSION_CONTEXT.companyId,
      permissions: ADMIN_SESSION_USER.permissions,
    })
  })
})

// ---------------------------------------------------------------------------------------
// QC-60 (R17, R34, T16). La empresa sale del CONTEXTO de sesion del servidor. Sin ese contexto
// -o sin el usuario- no hay actor, y sin actor no hay consulta.
//
// Lo que se afirma, y con que precision. La action NO repite `requirePermission` (R5, primer caso
// de este archivo): con la sesion incompleta baja `null` al caso de uso, y es el caso de uso quien
// rechaza en su primera linea, antes de tocar ningun puerto. Por eso aqui se prueban DOS cosas:
//   1. que las seis actions bajan `null` -nunca un actor a medias, con `companyId: undefined` o
//      con una empresa inventada- cuando falta CUALQUIERA de las dos caras;
//   2. la CADENA REAL: action -> caso de uso de verdad -> puertos que EXPLOTAN. Sin contexto, el
//      estado es `unauthorized` y ningun puerto se toco. Eso es R17 entero -«rechazar la operacion
//      sin consultar el repositorio»- y no depende de que el doble del caso de uso se porte bien.
// ---------------------------------------------------------------------------------------

describe('QC-60 R17 — sin las dos caras de la sesion no hay actor ni consulta', () => {
  /** Las seis actions con la posicion del argumento `actor` en la llamada al caso de uso. */
  const SEIS = [
    [
      'createOrderAction',
      createOrderMock,
      1,
      () => createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS)),
    ],
    [
      'updateOrderAction',
      updateOrderMock,
      2,
      () => updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS)),
    ],
    [
      'cancelOrderAction',
      cancelOrderMock,
      2,
      () => cancelOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID, reason: 'Sin stock' })),
    ],
    [
      'deleteOrderAction',
      deleteOrderMock,
      1,
      () => deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID })),
    ],
    ['getOrderAction', getOrderMock, 1, () => getOrderAction(ORDER_ID)],
    ['listOrdersAction', listOrdersMock, 1, () => listOrdersAction({ page: 1 })],
    [
      'quoteOrderCostAction',
      quoteOrderCostMock,
      1,
      () => quoteOrderCostAction({ recipeId: RECIPE_ID, quantity: '12.5000' }),
    ],
  ] as const

  const SESIONES_INCOMPLETAS = [
    ['sin contexto de sesion', ADMIN_SESSION_USER, null],
    ['sin usuario de sesion', null, SESSION_CONTEXT],
    ['sin ninguna de las dos', null, null],
  ] as const

  for (const [sesion, usuario, contexto] of SESIONES_INCOMPLETAS) {
    it(`${sesion}: las seis actions bajan actor null, nunca uno a medias`, async () => {
      getSessionUserMock.mockResolvedValue(usuario)
      getSessionContextMock.mockResolvedValue(contexto)

      for (const [nombre, mock, posicion, invocar] of SEIS) {
        mock.mockRejectedValueOnce(new UnauthorizedError())
        const estado = await invocar()
        expect(mock.mock.calls.at(-1)?.[posicion], `${nombre}: el actor tiene que ser null`).toBeNull()
        expect(estado, nombre).toMatchObject({ status: 'error', code: 'unauthorized' })
      }
      // Las dos caras se pidieron en CADA invocacion: una action que solo mirara el usuario
      // habria construido un actor sin empresa.
      expect(getSessionContextMock).toHaveBeenCalledTimes(SEIS.length)
      expect(getSessionUserMock).toHaveBeenCalledTimes(SEIS.length)
    })
  }

  it('con la sesion completa, la empresa del actor es la del CONTEXTO y no la del formulario', async () => {
    createOrderMock.mockResolvedValue({
      id: ORDER_ID,
      number: { year: 2026, sequence: 1 },
      numberText: '2026-0000001',
    })
    const OTRA = '44444444-4444-4444-8444-444444444444'
    await createOrderAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_CREATE_FIELDS, companyId: OTRA, company_id: OTRA }),
    )
    expect(createOrderMock.mock.calls[0]?.[1]).toEqual({
      id: ADMIN_SESSION_USER.id,
      companyId: SESSION_CONTEXT.companyId,
      permissions: ADMIN_SESSION_USER.permissions,
    })
    // Y el candidato que baja al caso de uso ni siquiera la trae.
    expect(JSON.stringify(createOrderMock.mock.calls[0]?.[0])).not.toContain(OTRA)
  })

  it('CADENA REAL sin contexto de sesion: las seis devuelven unauthorized y NINGUN puerto se toca', async () => {
    const explota = (nombre: string) =>
      vi.fn(() => {
        throw new Error(`el puerto ${nombre} no debe llamarse sin contexto de sesion`)
      })
    const orders = {
      create: explota('create'),
      findAliveById: explota('findAliveById'),
      listAlive: explota('listAlive'),
      updateAlive: explota('updateAlive'),
      cancelAlive: explota('cancelAlive'),
      softDeleteAlive: explota('softDeleteAlive'),
    }
    const recipes = {
      findRefsIncludingDeleted: explota('findRefsIncludingDeleted'),
      findExecutionContentById: explota('findExecutionContentById'),
    }
    const products = {
      findRefs: explota('products.findRefs'),
      findCostingBatches: explota('products.findCostingBatches'),
    }
    const units = {
      findRefs: explota('units.findRefs'),
      findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
    }
    const presentations = { findRefs: explota('presentations.findRefs') }
    const log = { ignoredFields: explota('ignoredFields') }
    const deps = {
      orders: orders as unknown as OrderRepository,
      recipes: recipes as unknown as RecipeCatalog,
      products: products as unknown as ProductCatalog,
      units: units as unknown as UnitCatalog,
      presentations: presentations as unknown as PresentationCatalog,
      log,
    }

    // Los casos de uso DE VERDAD detras de la composicion simulada.
    createOrderMock.mockImplementation(createCreateOrder(deps))
    getOrderMock.mockImplementation(createGetOrder(deps))
    listOrdersMock.mockImplementation(createListOrders(deps))
    updateOrderMock.mockImplementation(createUpdateOrder(deps))
    cancelOrderMock.mockImplementation(createCancelOrder(deps))
    deleteOrderMock.mockImplementation(createDeleteOrder(deps))
    quoteOrderCostMock.mockImplementation(createQuoteOrderCost(deps))

    getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER)
    getSessionContextMock.mockResolvedValue(null)

    for (const [nombre, , , invocar] of SEIS) {
      expect(await invocar(), nombre).toEqual({
        status: 'error',
        code: 'unauthorized',
        message: errorMessage('unauthorized'),
      })
    }
    for (const espia of [...Object.values(orders), ...Object.values(recipes), log.ignoredFields]) {
      expect(espia).not.toHaveBeenCalled()
    }

    // CONTROL POSITIVO de la misma cadena: con el contexto presente la barrera se cruza y el
    // primer puerto SI se alcanza (y explota). Sin esto, unos casos de uso que rechazaran todo
    // pondrian verde el bucle de arriba.
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT)
    const conContexto = await getOrderAction(ORDER_ID)
    expect(conContexto).toMatchObject({ status: 'error', code: UNEXPECTED_ERROR_CODE })
    expect(orders.findAliveById).toHaveBeenCalledWith(ORDER_ID, {
      companyId: SESSION_CONTEXT.companyId,
    })

    // Los `mockImplementation` no los limpia `clearAllMocks` del `beforeEach`: se retiran aqui
    // para no arrastrar los casos de uso reales a otro test.
    for (const mock of [
      createOrderMock,
      getOrderMock,
      listOrdersMock,
      updateOrderMock,
      cancelOrderMock,
      deleteOrderMock,
      quoteOrderCostMock,
    ]) {
      mock.mockReset()
    }
  })
})

describe('QC-60 R34 — las firmas publicas de las Server Actions no cambian', () => {
  it('el modulo exporta exactamente las siete actions, con su aridad de siempre', () => {
    const exportadas = Object.entries(orderActions)
      .filter(([, valor]) => typeof valor === 'function')
      .map(([nombre, valor]) => [nombre, (valor as (...args: never[]) => unknown).length] as const)
      .sort(([a], [b]) => a.localeCompare(b))

    expect(exportadas).toEqual([
      ['cancelOrderAction', 2],
      ['createOrderAction', 2],
      ['deleteOrderAction', 2],
      ['getOrderAction', 1],
      ['listOrdersAction', 1],
      ['quoteOrderCostAction', 1],
      ['updateOrderAction', 3],
    ])
  })

  it('ninguna firma recibe la empresa, ni el actor, ni la sesion', () => {
    const source = readActionsSource()
    const FIRMAS = {
      createOrderAction: 'prevState: CreateOrderFormState, formData: FormData',
      updateOrderAction: 'id: string, prevState: OrderMutationFormState, formData: FormData',
      cancelOrderAction: 'prevState: OrderMutationFormState, formData: FormData',
      deleteOrderAction: 'prevState: OrderMutationFormState, formData: FormData',
      getOrderAction: 'id: string',
      listOrdersAction: 'query: unknown',
      quoteOrderCostAction: 'input: unknown',
    }
    for (const [nombre, parametros] of Object.entries(FIRMAS)) {
      const desde = source.indexOf(`export async function ${nombre}(`)
      expect(desde, `falta ${nombre}`).toBeGreaterThan(-1)
      const abre = source.indexOf('(', desde)
      const firma = source
        .slice(abre + 1, source.indexOf(')', abre))
        .replace(/\s+/g, ' ')
        .replace(/,\s*$/, '')
        .trim()
      expect(firma, nombre).toBe(parametros)
      expect(firma, `${nombre} recibe la empresa`).not.toMatch(/company|actor|session/i)
    }
  })
})
