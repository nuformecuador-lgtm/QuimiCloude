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

import {
  DuplicateOrderNumberError,
  InvalidTransitionError,
  NotCancellableError,
  NotDeletableError,
  NotFoundError,
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
  updateOrderAction,
  type CreateOrderFormState,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'

const {
  createOrderMock,
  getOrderMock,
  listOrdersMock,
  updateOrderMock,
  cancelOrderMock,
  deleteOrderMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  getOrderMock: vi.fn(),
  listOrdersMock: vi.fn(),
  updateOrderMock: vi.fn(),
  cancelOrderMock: vi.fn(),
  deleteOrderMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}))

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
  pedidos: {
    createOrder: createOrderMock,
    getOrder: getOrderMock,
    listOrders: listOrdersMock,
    updateOrder: updateOrderMock,
    cancelOrder: cancelOrderMock,
    deleteOrder: deleteOrderMock,
  },
}))

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID = '22222222-2222-4222-8222-222222222222'

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
 *  documenta por escrito lo que NO hace -«no repite `requireAdmin`», «sin `revalidatePath`»-,
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

    const ESPERADO = { id: 'user-admin-1', roleName: 'Administrador' }

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

    expect(getSessionUserMock).toHaveBeenCalledTimes(6)

    // Sin sesion, el actor que baja es `null` -no un objeto inventado, no un `throw` de la
    // action-: quien rechaza es el caso de uso (R3, falla cerrado).
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue(null)
    createOrderMock.mockRejectedValue(new UnauthorizedError())
    const sinSesion = await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))
    expect(createOrderMock.mock.calls[0]?.[1]).toBeNull()
    expect(sinSesion).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: expect.any(String),
    })

    // R5, segunda mitad: la action NO decide. No repite `requireAdmin`, no incrusta el rol, no
    // valida con los esquemas del dominio, no conoce los estados ni las transiciones, no mide
    // el motivo, no reimplementa la paginacion y no habla con el ORM.
    const source = readActionsSource()
    expect(source, 'repite la comprobacion de rol').not.toMatch(/requireAdmin/)
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

    // La edicion es REEMPLAZO COMPLETO y anade el estado; el `id` NO viaja en el `FormData`,
    // es argumento (R20).
    await updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS))
    expect(updateOrderMock.mock.calls[0]?.[0]).toBe(ORDER_ID)
    expect(updateOrderMock.mock.calls[0]?.[1]).toEqual({
      recipeId: RECIPE_ID,
      quantity: '12.5000',
      priority: 'ALTA',
      status: 'EN_CURSO',
    })
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
      { error: new NotFoundError(), code: 'not_found' },
      { error: new RecipeNotFoundError(), code: 'recipe_not_found' },
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

    // El `code` NO sale del texto ni del nombre de la clase: un mensaje distinto -otro idioma,
    // por ejemplo- no cambia el `code`. Esta es la asercion que separa «traduce por el code»
    // de «traduce por el mensaje».
    createOrderMock.mockRejectedValueOnce(new RecipeNotFoundError('Recipe is discontinued.'))
    expect(await createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))).toEqual({
      status: 'error',
      code: 'recipe_not_found',
      message: 'Recipe is discontinued.',
    })

    // Y el codigo fuente NO decide por el texto: ninguna comparacion contra un mensaje.
    const source = readActionsSource()
    expect(source, 'la traduccion mira el mensaje').not.toMatch(
      /error\.message\s*(===|==|\.includes|\.startsWith|\.match)/,
    )
    expect(source, 'la traduccion mira el nombre de la clase').not.toMatch(/error\.name/)
    expect(source, 'la traduccion deberia usar el code de la clase').toMatch(/code: error\.code/)
  })

  it('lo que no es un error de dominio se RELANZA, nunca se traga', async () => {
    // R56, segunda mitad: nada de `catch` vacios (`docs/conventions.md`). Un fallo de red o de
    // la base tiene que subir; convertirlo en `{ status: 'error' }` lo escondería detras de un
    // mensaje de formulario y nadie volveria a verlo.
    const ajeno = new Error('la conexion con la base se cayo')

    createOrderMock.mockRejectedValueOnce(ajeno)
    await expect(createOrderAction(CREATE_INITIAL, formDataOf(VALID_CREATE_FIELDS))).rejects.toBe(
      ajeno,
    )

    getOrderMock.mockRejectedValueOnce(ajeno)
    await expect(getOrderAction(ORDER_ID)).rejects.toBe(ajeno)

    listOrdersMock.mockRejectedValueOnce(ajeno)
    await expect(listOrdersAction({ page: 1 })).rejects.toBe(ajeno)

    updateOrderMock.mockRejectedValueOnce(ajeno)
    await expect(
      updateOrderAction(ORDER_ID, MUTATION_INITIAL, formDataOf(VALID_UPDATE_FIELDS)),
    ).rejects.toBe(ajeno)

    cancelOrderMock.mockRejectedValueOnce(ajeno)
    await expect(
      cancelOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID, reason: 'x' })),
    ).rejects.toBe(ajeno)

    deleteOrderMock.mockRejectedValueOnce(ajeno)
    await expect(deleteOrderAction(MUTATION_INITIAL, formDataOf({ id: ORDER_ID }))).rejects.toBe(
      ajeno,
    )

    // Y no hay ni un `catch` que se quede callado: los seis `catch` del archivo devuelven
    // `toErrorState`, que o traduce o relanza.
    const source = readActionsSource()
    const catches = source.match(/catch\s*\(/g) ?? []
    const traducciones = source.match(/return toErrorState\(error\)/g) ?? []
    expect(catches.length).toBeGreaterThan(0)
    // Uno por action, sin ninguno de mas y sin ninguno de menos.
    expect(traducciones.length).toBe(catches.length)
    expect(catches.length).toBe(6)
    expect(source, 'hay un catch vacio').not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/)
  })
})
