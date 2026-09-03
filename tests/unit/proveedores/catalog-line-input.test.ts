// T6 (QC-43) — Esquemas de entrada de la linea del catalogo (`design.md > 6.2`).
//
// Cubre R28, R30, R33 y R41. Vigila el BORDE: costo estrictamente mayor que cero, minimo
// y plazo no negativos y opcionales, y un esquema de edicion que RECHAZA el `productId` o
// el `supplierId` de mas en vez de ignorarlo en silencio (P5, `design.md > 6.3`).
//
// La defensa de la BASE para el costo (R29, `CHECK ("cost" > 0)`) es otra y se prueba
// contra Postgres real en `tests/integration/proveedores/catalog-line.int.test.ts` (T18):
// que `zod` llegue antes no demuestra que la base rechace.

import { describe, expect, it, vi } from 'vitest'

import {
  createCatalogLineSchema,
  updateCatalogLineSchema,
} from '@/lib/modules/proveedores/domain/catalog-line-input'

const SUPPLIER_ID = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222'

/** Alta valida minima; cada caso cambia solo lo que quiere probar. */
const ALTA_VALIDA = {
  supplierId: SUPPLIER_ID,
  productId: PRODUCT_ID,
  cost: '1250.5000',
  minPurchase: null,
  deliveryTime: null,
}

/** Edicion valida minima. */
const EDICION_VALIDA = { cost: '1250.5000', minPurchase: null, deliveryTime: null }

describe('esquemas de entrada de la linea del catalogo (QC-43 T6)', () => {
  it('rechaza el costo cero y el costo negativo antes de llegar al repositorio', () => {
    // R28, decision cerrada 4: el costo tiene que ser ESTRICTAMENTE mayor que cero. Un
    // cero casi siempre es un dato a medio escribir; la consecuencia aceptada es que una
    // muestra gratis no se registra como linea de catalogo.
    //
    // El cero se prueba en todas sus escrituras ('0', '0.0', '00.0000'): un test que solo
    // probara '0' seguiria verde con un `Number(value) !== 0` mal escrito o con un
    // `value !== '0'`.
    const CEROS = ['0', '0.0', '0.00', '0.0000', '00', '00.0000']
    const NEGATIVOS = ['-1', '-0.0001', '-1250.5']

    for (const [nombre, schema, base] of [
      ['createCatalogLineSchema', createCatalogLineSchema, ALTA_VALIDA],
      ['updateCatalogLineSchema', updateCatalogLineSchema, EDICION_VALIDA],
    ] as const) {
      for (const cost of [...CEROS, ...NEGATIVOS]) {
        expect(
          schema.safeParse({ ...base, cost }).success,
          `${nombre} debe rechazar el costo ${cost}`,
        ).toBe(false)
      }

      // El primer valor positivo representable con DECIMAL(14,4) si pasa: la regla es
      // «mayor que cero», no «mayor que uno».
      expect(schema.safeParse({ ...base, cost: '0.0001' }).success, `${nombre}: 0.0001`).toBe(true)
      expect(schema.safeParse({ ...base, cost: '1250.5000' }).success, `${nombre}: 1250.5`).toBe(
        true,
      )
    }
  })

  it('rechaza el minimo de compra y el tiempo de entrega negativos, y admite la linea sin ninguno de los dos', () => {
    // R30. El minimo admite fracciones (decision 5 de QC-42, heredada) y el cero SI vale
    // en los dos: «sin minimo pactado» y «entrega el mismo dia» son datos legitimos, no
    // datos a medio escribir. Lo que no vale es el negativo.
    for (const minPurchase of ['-1', '-0.5', '-0.0001']) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, minPurchase }).success,
        `minPurchase ${minPurchase} debe caer`,
      ).toBe(false)
    }
    for (const deliveryTime of [-1, -30, 1.5]) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, deliveryTime }).success,
        `deliveryTime ${deliveryTime} debe caer`,
      ).toBe(false)
    }

    // Cero vale en los dos.
    expect(
      createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, minPurchase: '0', deliveryTime: 0 })
        .success,
    ).toBe(true)
    // Con fracciones, tambien.
    expect(
      createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, minPurchase: '2.5', deliveryTime: 15 })
        .success,
    ).toBe(true)

    // Y la linea SIN ninguno de los dos existe: omitidos o nulos, ambas formas pasan y el
    // valor llega al repositorio como ausencia, no como cero (R30, segunda mitad).
    const omitidos = createCatalogLineSchema.parse({
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
      cost: '10.0000',
    })
    expect(omitidos.minPurchase ?? null).toBeNull()
    expect(omitidos.deliveryTime ?? null).toBeNull()

    const nulos = createCatalogLineSchema.parse({ ...ALTA_VALIDA })
    expect(nulos.minPurchase).toBeNull()
    expect(nulos.deliveryTime).toBeNull()
  })

  it('el esquema de edicion rechaza un productId o un supplierId de mas', () => {
    // R33 y P5 (`design.md > 6.3`): la pareja proveedor-producto es la IDENTIDAD de la
    // linea. El esquema de edicion no la declara y ADEMAS rechaza el campo de mas en vez
    // de ignorarlo: ignorarlo seria peor, porque quien lo enviara creeria haber cambiado
    // el producto y la linea seguiria apuntando al anterior sin ningun aviso.
    expect(Object.keys(updateCatalogLineSchema.shape).sort()).toEqual([
      'cost',
      'deliveryTime',
      'minPurchase',
    ])

    for (const extra of [
      { productId: PRODUCT_ID },
      { supplierId: SUPPLIER_ID },
      { productId: PRODUCT_ID, supplierId: SUPPLIER_ID },
      { id: '33333333-3333-4333-8333-333333333333' },
    ]) {
      expect(
        updateCatalogLineSchema.safeParse({ ...EDICION_VALIDA, ...extra }).success,
        `la edicion debe RECHAZAR ${JSON.stringify(extra)}, no ignorarlo`,
      ).toBe(false)
    }

    // Y la edicion sin campos de mas si pasa, con las tres condiciones comerciales.
    const parsed = updateCatalogLineSchema.parse({
      cost: '99.9900',
      minPurchase: '5',
      deliveryTime: 3,
    })
    expect(parsed).toEqual({ cost: '99.9900', minPurchase: '5', deliveryTime: 3 })
  })

  it('rechaza la entrada que no cumple el esquema antes de llamar al caso de uso', () => {
    // R41: nada sin validar ni sin tipar cruza hacia el dominio. El doble del repositorio
    // solo se llama si el esquema paso.
    const repositorio = vi.fn()

    function crear(input: unknown): boolean {
      const parsed = createCatalogLineSchema.safeParse(input)
      if (!parsed.success) return false
      repositorio(parsed.data)
      return true
    }

    for (const input of [
      {},
      { supplierId: SUPPLIER_ID, productId: PRODUCT_ID },
      { supplierId: 'no-es-uuid', productId: PRODUCT_ID, cost: '10' },
      { supplierId: SUPPLIER_ID, productId: 'no-es-uuid', cost: '10' },
      { ...ALTA_VALIDA, cost: 1250.5 },
      { ...ALTA_VALIDA, cost: '10,50' },
      { ...ALTA_VALIDA, cost: '1250.50001' },
      { ...ALTA_VALIDA, cost: '12345678901' },
      { ...ALTA_VALIDA, deliveryTime: '3' },
      null,
      'linea',
    ]) {
      expect(crear(input), `debe rechazar ${JSON.stringify(input)}`).toBe(false)
    }
    expect(
      repositorio,
      'ninguna entrada invalida puede llegar al repositorio',
    ).not.toHaveBeenCalled()

    expect(crear(ALTA_VALIDA)).toBe(true)
    expect(repositorio).toHaveBeenCalledTimes(1)
  })
})
