// T6 — Los tipos de salida y el puerto de `pedidos` (QC-34 R24, R26, R40, R46, R47).
//
// Esto es un TEST DE TIPOS: lo que se afirma no lo comprueba `expect`, lo comprueba el
// compilador. Cada `@ts-expect-error` es una asercion en positivo -si la linea de debajo
// dejara de ser un error, el `typecheck` FALLA por el `@ts-expect-error` no utilizado-, que es
// lo que convierte «no se puede escribir CANCELADO desde la edicion» en algo verificable y no
// en una promesa del comentario.
//
// Es la PRIMERA de las cuatro capas de `design.md > 8`. Las otras tres -`zod`, la tabla de
// transiciones y el `CHECK` de la base- tienen sus propios tests.

import { describe, expect, it } from 'vitest'

import type {
  NewOrder,
  OrderRow,
  OrderSummary,
  OrderView,
} from '@/lib/modules/pedidos/domain/order-view'
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'

const NEW_ORDER: NewOrder = {
  recipeId: '11111111-1111-4111-8111-111111111111',
  quantity: '12.5000',
  priority: 'ALTA',
  status: 'EN_CURSO',
  unitId: '33333333-3333-4333-8333-333333333333',
  customerId: null,
  presentationLines: [],
}

/** `true` si el tipo declara esa clave. Se evalua en COMPILACION; el `expect` de abajo solo
 *  hace visible el resultado en el informe del test. */
type Declara<T, K extends string> = K extends keyof T ? true : false

describe('pedidos — NewOrder no puede expresar una cancelacion (R24, R26)', () => {
  it('acepta los tres estados editables', () => {
    const pendiente: NewOrder = { ...NEW_ORDER, status: 'PENDIENTE' }
    const enCurso: NewOrder = { ...NEW_ORDER, status: 'EN_CURSO' }
    const entregado: NewOrder = { ...NEW_ORDER, status: 'ENTREGADO' }
    expect([pendiente.status, enCurso.status, entregado.status]).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'ENTREGADO',
    ])
  })

  it('NO acepta el estado CANCELADO: el typecheck lo rechaza', () => {
    // `status` es `EditableOrderStatus`, no `OrderStatus`. Ni `create` ni `updateAlive` pueden
    // formular una cancelacion, y el unico camino es `cancelAlive` (el unico con `reason`).
    // @ts-expect-error CANCELADO no pertenece a EditableOrderStatus (R24)
    const cancelado: NewOrder = { ...NEW_ORDER, status: 'CANCELADO' }
    expect(cancelado.status).toBe('CANCELADO')
  })

  it('NO declara cancellationReason: el motivo no viaja por la edicion', () => {
    // @ts-expect-error NewOrder no tiene cancellationReason (R24, R26)
    const conMotivo: NewOrder = { ...NEW_ORDER, cancellationReason: 'me arrepenti' }
    expect(conMotivo).toBeTruthy()

    const declara: Declara<NewOrder, 'cancellationReason'> = false
    expect(declara).toBe(false)
  })

  it('tampoco declara el correlativo, las fechas ni los autores: los pone el sistema', () => {
    // R6, R9, R11: el estado de alta, el numero y los dos autores no salen de la entrada.
    const correlativo: Declara<NewOrder, 'orderYear'> = false
    const autor: Declara<NewOrder, 'createdBy'> = false
    const fecha: Declara<NewOrder, 'createdAt'> = false
    expect([correlativo, autor, fecha]).toEqual([false, false, false])
  })
})

describe('pedidos — la salida de las consultas (R40, R46, R47)', () => {
  it('OrderView NO tiene campo total, ni subtotal, ni nada calculado', () => {
    // R47 y pregunta abierta 3: el total no se persiste (QC-33 R10) y esta salida tampoco lo
    // calcula. Devolverlo obligaria a multiplicar dos decimales de 14 digitos, que no se puede
    // hacer con `number` y hoy no tiene aritmetica aprobada (`design.md > 13`).
    const total: Declara<OrderView, 'total'> = false
    const subtotal: Declara<OrderView, 'subtotal'> = false
    const enLaFila: Declara<OrderSummary, 'total'> = false
    expect([total, subtotal, enLaFila]).toEqual([false, false, false])
  })

  it('OrderView y OrderRow NO devuelven deletedAt', () => {
    // R40: ninguna consulta devuelve borrados, asi que el campo seria siempre `null` y solo
    // invitaria a filtrar en memoria lo que ya filtro el puerto.
    const enLaVista: Declara<OrderView, 'deletedAt'> = false
    const enLaFila: Declara<OrderRow, 'deletedAt'> = false
    expect([enLaVista, enLaFila]).toEqual([false, false])
  })

  it('los dos autores son identificadores, no nombres', () => {
    // R46: resolver el nombre del autor es de QC-35; este modulo no consulta el modelo `User`.
    const nombreDeAutor: Declara<OrderView, 'createdByName'> = false
    expect(nombreDeAutor).toBe(false)

    const autor: OrderView['createdBy'] = null
    expect(autor).toBeNull()
  })

  it('OrderRow NO trae los nombres de receta y unidad: los resuelve el caso de uso', () => {
    // R43, R45: los nombres llegan por los contratos publicos de `recetas` y `unidades`, con
    // UNA consulta a cada uno por pagina. Si el puerto los trajera, saldrian de `orders`.
    const nombreDeReceta: Declara<OrderRow, 'recipeName'> = false
    const nombreDeUnidad: Declara<OrderRow, 'unitName'> = false
    expect([nombreDeReceta, nombreDeUnidad]).toEqual([false, false])

    // Y en la vista SI estan, anulables: la fila sigue apareciendo aunque el id no vuelva.
    const enLaVista: Declara<OrderView, 'recipeName'> = true
    expect(enLaVista).toBe(true)
  })

  it('los filtros del listado son solo estado, prioridad y fecha, y la busqueda ya se abrio (R11)', () => {
    // R38/R39 heredados, dichos sobre la forma NUEVA. QC-57 (R25) borro `OrderFilters`: estado
    // y prioridad dejaron de ser parametros propios del listado y son filtros `select` del
    // contrato generico. Lo que aquel tipo garantizaba lo garantiza ahora la lista blanca, y se
    // afirma sobre ella -no sobre un tipo que ya no existe-.
    expect(Object.keys(ORDER_QUERYABLE.filterable).sort()).toEqual([
      'createdAt',
      'priority',
      'status',
    ])
    expect(ORDER_QUERYABLE.filterable.status).toBe('select')
    expect(ORDER_QUERYABLE.filterable.priority).toBe('select')

    // Nota fechada 2026-09-18: `orders` no tiene columna `name` propia, pero desde QC-68 la
    // busqueda casa por el nombre de la receta del pedido, resuelta antes de llegar al puerto.
    // Ya no es cierto que sea la unica de las siete que no busca.
    expect(ORDER_QUERYABLE.searchable).toBe(true)

    // Y no hay filtro por el numero correlativo (R39): no esta declarado.
    expect(Object.keys(ORDER_QUERYABLE.filterable)).not.toContain('orderNumber')
  })
})

describe('pedidos — el coste de ingredientes en la salida', () => {
  it('la salida del pedido no declara ningun campo de precio de venta (R1)', () => {
    const precio: Declara<OrderView, 'price'> = false
    const precioUnitario: Declara<OrderView, 'unitPrice'> = false
    const precioDeVenta: Declara<OrderView, 'salePrice'> = false
    const total: Declara<OrderView, 'total'> = false
    expect([precio, precioUnitario, precioDeVenta, total]).toEqual([false, false, false, false])
  })

  it('OrderRow y OrderView llevan ingredientsCost', () => {
    const enLaFila: Declara<OrderRow, 'ingredientsCost'> = true
    const enLaVista: Declara<OrderView, 'ingredientsCost'> = true
    expect([enLaFila, enLaVista]).toEqual([true, true])
  })

  it('ingredientsCost en null no se vuelve "0.0000"', () => {
    const sinCoste: OrderView['ingredientsCost'] = null
    expect(sinCoste).toBeNull()
    expect(sinCoste).not.toBe('0.0000')
  })

  it('la salida no tiene ningun campo de moneda', () => {
    const moneda: Declara<OrderView, 'currency'> = false
    const codigoDeMoneda: Declara<OrderView, 'currencyCode'> = false
    expect([moneda, codigoDeMoneda]).toEqual([false, false])
  })
})

describe('pedidos — el puerto declara sus metodos de LECTURA: los dos de design.md > 5.3 y findBlockedIds', () => {
  it('un doble que implementa la interfaz completa compila', () => {
    // No se ejecuta ninguna operacion: lo que se comprueba es la FORMA del puerto. Si algun dia
    // se le anadiera un tercer metodo, este doble dejaria de compilar y habria que decidirlo.
    // La escritura salio entera hacia `OrderWriteRepository`, dentro de la transaccion
    // compartida con `inventario`; este puerto ya solo lee.
    const doble: OrderRepository = {
      findAliveById: async () => null,
      // `listAlive` devuelve una `Page` ya armada, no `{ rows, total }`: la firma se corrigio
      // el 2026-09-04 (nota al final de `design.md > 7.4`, aprobada por el leader) para que el
      // caso de uso no tenga que calcular el `offset`, que es la reimplementacion que R37
      // prohibe. Quien pagina es el adaptador driven con `lib/shared/pagination`.
      listAlive: async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
      // QC-138: los bloqueados de la empresa, para la revision que los desbloquea.
      findBlockedIds: async () => [],
    }
    expect(Object.keys(doble).sort()).toEqual(['findAliveById', 'findBlockedIds', 'listAlive'])
  })

  it('no existe ningun metodo de restaurar ni de listar borrados', () => {
    // R31: lo que no se puede expresar no se puede hacer por descuido.
    const restaurar: Declara<OrderRepository, 'restore'> = false
    const listarBorrados: Declara<OrderRepository, 'listDeleted'> = false
    expect([restaurar, listarBorrados]).toEqual([false, false])
  })
})
