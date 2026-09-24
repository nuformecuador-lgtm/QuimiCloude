// T11 (QC-52) — Esquemas de entrada de la linea del catalogo (`design.md > 7`).
//
// Cubre R9, R10, R11, R14, R24 y R31. Vigila el BORDE: nombre recortado y no vacio -ni
// literalmente ni al normalizarlo-, presentacion OBLIGATORIA, unidad e imagen opcionales,
// costo estrictamente mayor que cero, minimo y plazo no negativos y opcionales, y dos
// esquemas `strictObject` que RECHAZAN el campo de mas en vez de ignorarlo.
//
// Reemplaza al archivo de QC-43 T6. Lo que se cayo y por que:
//   - los casos que pasaban `productId` como campo VALIDO del alta: la linea ya no guarda
//     ninguna referencia a un articulo del inventario (R9, decision cerrada 3). El
//     identificador sigue apareciendo, pero ahora del otro lado: como campo que se RECHAZA.
//   - el assert de que la edicion tiene exactamente tres claves: la edicion es reemplazo
//     completo de los SIETE campos de negocio (R24, P6).
//
// La defensa de la BASE para el costo (`CHECK ("cost" > 0)`) es otra y se prueba contra
// Postgres real en `tests/integration/proveedores/proveedores-constraints.int.test.ts`: que
// `zod` llegue antes no demuestra que la base rechace.

import { describe, expect, it, vi } from 'vitest'

import {
  createCatalogLineSchema,
  updateCatalogLineSchema,
} from '@/lib/modules/proveedores/domain/catalog-line-input'
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name'

const SUPPLIER_ID = '11111111-1111-4111-8111-111111111111'
const PRESENTATION_ID = '22222222-2222-4222-8222-222222222222'
const UNIT_ID = '55555555-5555-4555-8555-555555555555'
const PRODUCTO_INVENTARIO = '66666666-6666-4666-8666-666666666666'

/** Los nueve campos de negocio, validos. Cada caso cambia solo lo que quiere probar. */
const CAMPOS_VALIDOS = {
  name: 'Acido citrico anhidro',
  presentationId: PRESENTATION_ID,
  unitId: null,
  imagePath: null,
  cost: '1250.5000',
  minPurchase: null,
  deliveryTime: null,
  material: null,
  measurements: null,
}

/** Alta valida minima. */
const ALTA_VALIDA = { supplierId: SUPPLIER_ID, ...CAMPOS_VALIDOS }

/** Edicion valida minima: los mismos nueve campos, sin proveedor. */
const EDICION_VALIDA = { ...CAMPOS_VALIDOS }

describe('esquemas de entrada de la linea del catalogo (QC-52 T11)', () => {
  it('exige un nombre que no quede vacio al recortarlo ni al normalizarlo, y lo recorta antes de guardarlo', () => {
    // R14. Tres reglas distintas y las tres se miden aparte:
    //
    // 1. El vacio y el blanco caen. Que `'   '` caiga es la prueba de que `trim()` va ANTES
    //    de `min(1)`: al reves, tres espacios pasarian el minimo de longitud y solo se
    //    recortarian despues.
    // 2. El nombre que NORMALIZA a vacio -'###', '---', '...'- tambien cae, aunque tenga
    //    longitud. Sin esto entraria una fila con `name_normalized = ''` que chocaria contra
    //    el indice unico parcial con un mensaje que nadie entiende.
    // 3. El nombre valido sale RECORTADO del esquema, no tal como llego.
    for (const name of ['', '   ', '\t\n ', '###', '---', '...', '   ###   ']) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, name }).success,
        `el alta debe rechazar el nombre ${JSON.stringify(name)}`,
      ).toBe(false)
      expect(
        updateCatalogLineSchema.safeParse({ ...EDICION_VALIDA, name }).success,
        `la edicion debe rechazar el nombre ${JSON.stringify(name)}`,
      ).toBe(false)
    }

    // Y los que caen por normalizar a vacio caen POR ESO, no por casualidad: la misma
    // funcion que usa la escritura los deja en cadena vacia.
    for (const name of ['###', '---', '...']) {
      expect(normalizeSupplierName(name)).toBe('')
    }

    expect(createCatalogLineSchema.parse({ ...ALTA_VALIDA, name: '  Sosa caustica  ' }).name).toBe(
      'Sosa caustica',
    )

    // El largo maximo es 120: 120 pasa, 121 cae.
    expect(
      createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, name: 'a'.repeat(120) }).success,
    ).toBe(true)
    expect(
      createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, name: 'a'.repeat(121) }).success,
    ).toBe(false)
  })

  it('exige la presentacion y admite la linea sin unidad y sin imagen', () => {
    // R10. La presentacion es OBLIGATORIA -es parte de la identidad de la linea (decision
    // cerrada 4)- y la unidad es OPCIONAL. Que las dos EXISTAN de verdad no lo mira este
    // esquema: lo garantiza la clave foranea (`design.md > 6.2`), y eso se prueba contra
    // Postgres en integracion.
    const { presentationId: _omitida, ...sinPresentacion } = ALTA_VALIDA
    void _omitida
    expect(createCatalogLineSchema.safeParse(sinPresentacion).success).toBe(false)
    for (const presentationId of [null, undefined, '', 'no-es-uuid', 42]) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, presentationId }).success,
        `presentacion ${JSON.stringify(presentationId)} debe caer`,
      ).toBe(false)
    }

    // Unidad: omitida, nula o con un uuid valido; las tres formas pasan.
    const { unitId: _sinUnidad, ...sinUnitId } = ALTA_VALIDA
    void _sinUnidad
    expect(createCatalogLineSchema.safeParse(sinUnitId).success).toBe(true)
    expect(createCatalogLineSchema.parse(sinUnitId).unitId ?? null).toBeNull()
    expect(createCatalogLineSchema.parse({ ...ALTA_VALIDA, unitId: UNIT_ID }).unitId).toBe(UNIT_ID)
    expect(createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, unitId: 'no-es-uuid' }).success).toBe(
      false,
    )

    // Imagen: opcional y SIN patron de forma (P1, `design.md > 7`). Se acepta cualquier
    // texto no vacio -clave de Storage, ruta relativa o URL- porque la forma de la ruta no
    // esta acordada en el repo y un patron inventado aqui la definiria de facto. Lo unico
    // que se rechaza es la cadena vacia: «no tengo el dato» se escribe `null`.
    for (const imagePath of [
      'catalogo/linea-1.png',
      '/tmp/x.jpg',
      'https://ejemplo.test/a.webp',
      'sin-extension',
    ]) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, imagePath }).success,
        `imagePath ${imagePath} debe pasar: no hay patron de forma acordado`,
      ).toBe(true)
    }
    expect(createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, imagePath: '' }).success).toBe(false)
    const { imagePath: _sinImagen, ...sinImagePath } = ALTA_VALIDA
    void _sinImagen
    expect(createCatalogLineSchema.parse(sinImagePath).imagePath ?? null).toBeNull()
  })

  it('rechaza el costo cero y el costo negativo antes de llegar al repositorio', () => {
    // R10, decision cerrada 6: el costo tiene que ser ESTRICTAMENTE mayor que cero. Un cero
    // casi siempre es un dato a medio escribir; la consecuencia aceptada es que una muestra
    // gratis no se registra como linea de catalogo.
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
    // R10. El minimo admite fracciones (decision 5 de QC-42, heredada) y el cero SI vale en
    // los dos: «sin minimo pactado» y «entrega el mismo dia» son datos legitimos, no datos a
    // medio escribir. Lo que no vale es el negativo.
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
    // valor llega al repositorio como ausencia, no como cero.
    const omitidos = createCatalogLineSchema.parse({
      supplierId: SUPPLIER_ID,
      name: 'Acido citrico anhidro',
      presentationId: PRESENTATION_ID,
      cost: '10.0000',
    })
    expect(omitidos.minPurchase ?? null).toBeNull()
    expect(omitidos.deliveryTime ?? null).toBeNull()

    const nulos = createCatalogLineSchema.parse({ ...ALTA_VALIDA })
    expect(nulos.minPurchase).toBeNull()
    expect(nulos.deliveryTime).toBeNull()
  })

  it('los importes viajan como cadena decimal y nunca como numero', () => {
    // R11. El binario de coma flotante esta prohibido para importes en todo el recorrido, y
    // el borde es donde se puede colar: un `<input type="number">` entrega texto, pero un
    // JSON entrega `number`. Los dos esquemas lo rechazan.
    expect(createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, cost: 1250.5 }).success).toBe(false)
    expect(createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, minPurchase: 2.5 }).success).toBe(
      false,
    )
    expect(updateCatalogLineSchema.safeParse({ ...EDICION_VALIDA, cost: 1250.5 }).success).toBe(
      false,
    )

    // Y lo que SI pasa sale del esquema como cadena, con su escritura intacta: el esquema no
    // redondea, no normaliza y no convierte.
    expect(createCatalogLineSchema.parse({ ...ALTA_VALIDA, cost: '0.0001' }).cost).toBe('0.0001')
  })

  it('los dos esquemas rechazan un identificador de articulo del inventario, no lo ignoran', () => {
    // R9. Es la mitad que un `z.object` no daria: `strictObject` RECHAZA la clave de mas.
    // Ignorarla seria peor, porque quien la envia creeria haber vinculado algo que desde
    // QC-52 no tiene ninguna columna donde guardarse.
    for (const extra of [
      { productId: PRODUCTO_INVENTARIO },
      { product_id: PRODUCTO_INVENTARIO },
      { productName: 'Acido citrico' },
    ]) {
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, ...extra }).success,
        `el alta debe RECHAZAR ${JSON.stringify(extra)}, no ignorarlo`,
      ).toBe(false)
      expect(
        updateCatalogLineSchema.safeParse({ ...EDICION_VALIDA, ...extra }).success,
        `la edicion debe RECHAZAR ${JSON.stringify(extra)}, no ignorarlo`,
      ).toBe(false)
    }

    // Y ninguno de los dos esquemas DECLARA ninguna clave con ese concepto.
    expect(Object.keys(createCatalogLineSchema.shape).some((k) => /product/i.test(k))).toBe(false)
    expect(Object.keys(updateCatalogLineSchema.shape).some((k) => /product/i.test(k))).toBe(false)
  })

  it('la edicion reemplaza los nueve campos de negocio y no puede cambiar el proveedor', () => {
    // R24, P6 (cerrada por el humano el 2026-09-04). La edicion es REEMPLAZO COMPLETO,
    // nombre y presentacion incluidos: al desaparecer la referencia al articulo del
    // inventario, la identidad de la linea pasa a ser un texto escrito a mano y una errata
    // seria incorregible. Lo UNICO que nunca cambia es el proveedor, y no porque se filtre
    // sino porque el tipo no lo tiene. `material` y `measurements` se suman como ampliacion nombrada.
    expect(Object.keys(updateCatalogLineSchema.shape).sort()).toEqual([
      'cost',
      'deliveryTime',
      'imagePath',
      'material',
      'measurements',
      'minPurchase',
      'name',
      'presentationId',
      'unitId',
    ])

    for (const extra of [
      { supplierId: SUPPLIER_ID },
      { id: '33333333-3333-4333-8333-333333333333' },
      { createdBy: SUPPLIER_ID },
      { deletedAt: null },
    ]) {
      expect(
        updateCatalogLineSchema.safeParse({ ...EDICION_VALIDA, ...extra }).success,
        `la edicion debe RECHAZAR ${JSON.stringify(extra)}, no ignorarlo`,
      ).toBe(false)
    }

    // Y la edicion sin campos de mas si pasa, con los nueve.
    expect(
      updateCatalogLineSchema.parse({
        name: 'Sosa caustica',
        presentationId: PRESENTATION_ID,
        unitId: UNIT_ID,
        imagePath: 'catalogo/sosa.png',
        cost: '99.9900',
        minPurchase: '5',
        deliveryTime: 3,
        material: 'Polietileno',
        measurements: { diameter: null, height: null, mouth: '28/410' },
      }),
    ).toEqual({
      name: 'Sosa caustica',
      presentationId: PRESENTATION_ID,
      unitId: UNIT_ID,
      imagePath: 'catalogo/sosa.png',
      cost: '99.9900',
      minPurchase: '5',
      deliveryTime: 3,
      material: 'Polietileno',
      measurements: { diameter: null, height: null, mouth: '28/410' },
    })

    // El alta lleva los nueve MAS el proveedor, y nada mas.
    expect(Object.keys(createCatalogLineSchema.shape).sort()).toEqual([
      'cost',
      'deliveryTime',
      'imagePath',
      'material',
      'measurements',
      'minPurchase',
      'name',
      'presentationId',
      'supplierId',
      'unitId',
    ])
  })

  describe('material y measurements (QC-158, R27, R35)', () => {
    it('recorta material, lo deja en blanco -> ausente, y exige hasta 120 caracteres', () => {
      expect(createCatalogLineSchema.parse({ ...ALTA_VALIDA, material: '  Polietileno  ' }).material).toBe(
        'Polietileno',
      )
      for (const material of ['', '   ', null, undefined]) {
        const { material: _omitido, ...sinMaterial } = { ...ALTA_VALIDA, material }
        void _omitido
        expect(
          createCatalogLineSchema.parse({ ...sinMaterial, material }).material,
          `material ${JSON.stringify(material)} debe quedar ausente`,
        ).toBeNull()
      }
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, material: 'a'.repeat(120) }).success,
      ).toBe(true)
      expect(
        createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, material: 'a'.repeat(121) }).success,
      ).toBe(false)
      // Nunca un numero.
      expect(createCatalogLineSchema.safeParse({ ...ALTA_VALIDA, material: 7 }).success).toBe(false)
    })

    it('measurements: las tres ausentes colapsan a null entero', () => {
      for (const measurements of [
        null,
        undefined,
        { diameter: null, height: null, mouth: null },
        {},
      ]) {
        expect(
          createCatalogLineSchema.parse({ ...ALTA_VALIDA, measurements }).measurements,
          `measurements ${JSON.stringify(measurements)} debe colapsar a null`,
        ).toBeNull()
      }
    })

    it('diametro y alto exigen la MISMA cadena decimal que el costo, mayor que cero y sin number', () => {
      for (const value of ['0', '0.0000', '-1', '1,5', '10.00001', '12345678901']) {
        expect(
          createCatalogLineSchema.safeParse({
            ...ALTA_VALIDA,
            measurements: { diameter: { value, unit: 'cm' }, height: null, mouth: null },
          }).success,
          `diameter.value ${value} debe caer`,
        ).toBe(false)
      }
      // Un numero JSON en vez de cadena tambien cae.
      expect(
        createCatalogLineSchema.safeParse({
          ...ALTA_VALIDA,
          measurements: { diameter: { value: 7.5, unit: 'cm' }, height: null, mouth: null },
        }).success,
      ).toBe(false)

      const valido = createCatalogLineSchema.parse({
        ...ALTA_VALIDA,
        measurements: { diameter: { value: '7.5000', unit: 'cm' }, height: { value: '12', unit: 'mm' }, mouth: null },
      }).measurements
      expect(valido).toEqual({
        diameter: { value: '7.5000', unit: 'cm' },
        height: { value: '12', unit: 'mm' },
        mouth: null,
      })
    })

    it('la unidad de una medida solo admite mm o cm', () => {
      for (const unit of ['m', 'in', 'MM', '']) {
        expect(
          createCatalogLineSchema.safeParse({
            ...ALTA_VALIDA,
            measurements: { diameter: { value: '5', unit }, height: null, mouth: null },
          }).success,
          `unit ${JSON.stringify(unit)} debe caer`,
        ).toBe(false)
      }
      for (const unit of ['mm', 'cm'] as const) {
        expect(
          createCatalogLineSchema.safeParse({
            ...ALTA_VALIDA,
            measurements: { diameter: { value: '5', unit }, height: null, mouth: null },
          }).success,
        ).toBe(true)
      }
    })

    it('la boca es texto libre recortado, en blanco -> ausente, hasta 40 caracteres', () => {
      expect(
        createCatalogLineSchema.parse({
          ...ALTA_VALIDA,
          measurements: { diameter: null, height: null, mouth: '  28/410  ' },
        }).measurements,
      ).toEqual({ diameter: null, height: null, mouth: '28/410' })

      expect(
        createCatalogLineSchema.parse({
          ...ALTA_VALIDA,
          measurements: { diameter: null, height: null, mouth: '   ' },
        }).measurements,
      ).toBeNull()

      expect(
        createCatalogLineSchema.safeParse({
          ...ALTA_VALIDA,
          measurements: { diameter: null, height: null, mouth: 'a'.repeat(40) },
        }).success,
      ).toBe(true)
      expect(
        createCatalogLineSchema.safeParse({
          ...ALTA_VALIDA,
          measurements: { diameter: null, height: null, mouth: 'a'.repeat(41) },
        }).success,
      ).toBe(false)
    })
  })

  it('rechaza la entrada que no cumple el esquema antes de llamar al caso de uso', () => {
    // R31: nada sin validar ni sin tipar cruza hacia el dominio. El doble del repositorio
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
      { supplierId: SUPPLIER_ID },
      { supplierId: SUPPLIER_ID, name: 'Acido citrico', presentationId: PRESENTATION_ID },
      { ...ALTA_VALIDA, supplierId: 'no-es-uuid' },
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
