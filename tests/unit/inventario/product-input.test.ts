import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { ValidationError } from '@/lib/modules/inventario/domain/errors';
import {
  createPresentationSchema,
} from '@/lib/modules/inventario/domain/presentation-input';
import {
  createProductSchema,
  updateProductSchema,
} from '@/lib/modules/inventario/domain/product-input';
import { pageQuerySchema } from '@/lib/modules/inventario/domain/page';

/**
 * El campo que la decision del humano del 2026-09-03 volvio OBLIGATORIO en la entrada
 * (`qtyAlert`) para PRODUCT y PACKAGING. Se anade a cada caso que espera un producto VALIDO
 * de ese tipo: sin el cualquier `safeParse` correcto fallaria por un motivo que ese caso
 * no esta midiendo. Su propia obligatoriedad -y la ausencia en MACHINE- tiene caso aparte.
 */
const REQUERIDOS = { qtyAlert: '0' } as const;

/** Unidad de fixture para las presentaciones (QC-80 R10). */
const UNIDAD_FIXTURE = '11111111-1111-4111-8111-111111111111';

/** Lote minimo valido para PRODUCT/PACKAGING (el `type` lo pone el preprocess si falta). */
const LOTE_MINIMO = {
  stock: '1',
  presentationId: UNIDAD_FIXTURE,
  unitCost: '10.0000',
} as const;

/** Producto valido para el ALTA con lote, sin `type` (preprocess -> PRODUCT). */
const ALTA_PRODUCTO = {
  name: 'Producto',
  ...REQUERIDOS,
  ...LOTE_MINIMO,
} as const;

/** Producto valido para la EDICION (base del producto, sin lote). */
const EDICION_PRODUCTO = {
  name: 'Producto',
  ...REQUERIDOS,
} as const;

// Esquemas zod de entrada del borde (R9, R10, R11, R25, R28, R37; `design.md > 6`, T4 de tasks.md).
describe('createProductSchema', () => {
  it('rechaza el nombre vacio o de solo espacios y recorta los extremos del nombre valido', () => {
    // R9
    const base = { ...ALTA_PRODUCTO, name: '' };

    expect(createProductSchema.safeParse(base).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, name: '   ' }).success,
    ).toBe(false);

    const parsed = createProductSchema.parse({ ...ALTA_PRODUCTO, name: '  Cloro Granulado  ' });
    expect(parsed.name).toBe('Cloro Granulado');
    expect(parsed.type).toBe(PRODUCT_TYPES.PRODUCT);
  });

  it('rechaza el nombre de producto de mas de 120 caracteres y el de presentacion de mas de 60', () => {
    // R11
    const productName121 = 'a'.repeat(121);
    const productName120 = 'a'.repeat(120);
    expect(
      createProductSchema.safeParse({
        ...ALTA_PRODUCTO,
        name: productName121,
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...ALTA_PRODUCTO,
        name: productName120,
      }).success,
    ).toBe(true);

    const presentationName61 = 'b'.repeat(61);
    const presentationName60 = 'b'.repeat(60);
    expect(
      createPresentationSchema.safeParse({ name: presentationName61, unitId: UNIDAD_FIXTURE })
        .success,
    ).toBe(false);
    expect(
      createPresentationSchema.safeParse({ name: presentationName60, unitId: UNIDAD_FIXTURE })
        .success,
    ).toBe(true);
  });

  it('rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1', () => {
    // R25
    expect(pageQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: -1 }).success).toBe(false);

    expect(pageQuerySchema.safeParse({ pageSize: 1.5 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: -1 }).success).toBe(false);

    expect(pageQuerySchema.safeParse({ page: 1, pageSize: 10 }).success).toBe(true);
  });

  it('rechaza como nombre invalido la presentacion cuyo nombre normalizado queda vacio', () => {
    // R37
    const result = createPresentationSchema.safeParse({ name: '---' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.code).toBe('custom');
      expect(issue.message).toBe(
        'El nombre de la presentacion no contiene ningun caracter valido.',
      );
    }
  });

  // QC-52 R1: el costo, la compra minima y el tiempo de entrega dejaron de ser del producto.
  it('rechaza la entrada que trae costo, compra minima o tiempo de entrega', () => {
    // R1
    for (const sobra of [
      { cost: '1234.5678' },
      { cost: null },
      { minPurchase: 0 },
      { deliveryTime: 5 },
      { deliveryTime: null },
    ]) {
      const alta = createProductSchema.safeParse({ ...ALTA_PRODUCTO, ...sobra });
      expect(alta.success).toBe(false);
      if (!alta.success) {
        expect(alta.error.issues[0].code).toBe('unrecognized_keys');
      }

      expect(updateProductSchema.safeParse({ ...EDICION_PRODUCTO, ...sobra }).success).toBe(false);
    }
  });

  it('el caso de uso traduce la entrada con costo a invalid_input y no toca el puerto', async () => {
    // R1, R32
    const products = {
      create: vi.fn(),
      findAliveById: vi.fn(),
      updateAlive: vi.fn(),
      softDeleteAlive: vi.fn(),
      listAlive: vi.fn(),
      findAliveIdByNameInPresentationUnit: vi.fn(),
      createWithFirstBatch: vi.fn(),
      addBatchToAlive: vi.fn(),
      adjustBatchStock: vi.fn(),
      findBatchesOfAliveProduct: vi.fn(),
      findBatchMovements: vi.fn(),
    };
    const createProduct = createCreateProduct({ products });

    const error = await createProduct(
      {
        name: 'Producto',
        stock: '0',
        qtyAlert: '0',
        presentationId: UNIDAD_FIXTURE,
        unitCost: '10.0000',
        cost: '10.0000',
      },
      { id: 'actor-1', companyId: 'company-a', permissions: ['inventario.modificar'] },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
    expect(products.create).not.toHaveBeenCalled();
    expect(products.findAliveIdByNameInPresentationUnit).not.toHaveBeenCalled();
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
  });

  it('el alta NO acepta ninguna unidad: `unitId` es campo desconocido (QC-80, R21)', () => {
    // R21
    const conUnidad = { ...ALTA_PRODUCTO, unitId: '22222222-2222-4222-8222-222222222222' };
    expect(createProductSchema.safeParse(conUnidad).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...EDICION_PRODUCTO, unitId: conUnidad.unitId }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...ALTA_PRODUCTO, unitId: null }).success).toBe(false);

    const veredicto = createProductSchema.safeParse(conUnidad);
    expect(veredicto.success).toBe(false);
    if (!veredicto.success) {
      expect(
        veredicto.error.issues.some(
          (issue) => issue.code === 'unrecognized_keys' && issue.keys.includes('unitId'),
        ),
      ).toBe(true);
    }
  });

  it('exige qtyAlert, y ahora lo acepta decimal de hasta cuatro decimales, cero o mas', () => {
    // `qtyAlert` sigue obligatorio, pero la columna paso a `Decimal(14,4)` para compararse con
    // la existencia sin convertir. Ni ausente, ni nulo, ni negativo, ni con mas de cuatro
    // decimales, ni en notacion cientifica.
    const soloObligatoriosDeAntes = {
      name: 'Producto',
      ...LOTE_MINIMO,
      type: PRODUCT_TYPES.PRODUCT,
    };

    expect(createProductSchema.safeParse(soloObligatoriosDeAntes).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: null }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: '-1' }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: '1.00001' }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: '1e3' }).success,
    ).toBe(false);

    // Decimal de hasta cuatro cifras: ya no se rechaza.
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: '1.5' }).success,
    ).toBe(true);

    const parsed = createProductSchema.parse({
      ...soloObligatoriosDeAntes,
      qtyAlert: '3',
    });
    expect(parsed.type).toBe(PRODUCT_TYPES.PRODUCT);
    if (parsed.type !== PRODUCT_TYPES.MACHINE) {
      expect(parsed.qtyAlert).toBe('3');
    }

    // Los campos del primer lote viajan en el ALTA (QC-90), asi que ademas de nombre, alerta
    // y tipo quedan existencia, presentacion y costos -este ultimo con su default `PRODUCT`
    // puesto por el esquema, aunque la entrada no lo haya declarado-.
    expect(Object.keys(parsed).sort()).toEqual([
      'name',
      'presentationId',
      'qtyAlert',
      'stock',
      'type',
      'unitCost',
    ]);
  });

  it('la edicion rechaza la existencia como invalid_input: R9', () => {
    expect(updateProductSchema.safeParse(EDICION_PRODUCTO).success).toBe(true);

    const conExistencia = updateProductSchema.safeParse({ ...EDICION_PRODUCTO, stock: '5' });
    expect(conExistencia.success).toBe(false);
    if (!conExistencia.success) {
      expect(
        conExistencia.error.issues.some(
          (issue) => issue.code === 'unrecognized_keys' && issue.keys.includes('stock'),
        ),
      ).toBe(true);
    }
  });
});

describe('union discriminada por tipo de producto', () => {
  it('MACHINE crea producto + lote: sin qtyAlert, solo stock y purchaseDate en el borde', () => {
    // El formulario de Instrumento pinta unicamente existencia y fecha de compra (2026-09-23):
    // presentationId y unitCost son anulables SOLO para MACHINE.
    const machine = {
      name: 'Instrumento',
      type: PRODUCT_TYPES.MACHINE,
      stock: '1',
    };
    expect(createProductSchema.safeParse(machine).success).toBe(true);

    const parsed = createProductSchema.parse(machine);
    expect(parsed.type).toBe(PRODUCT_TYPES.MACHINE);
    expect('qtyAlert' in parsed).toBe(false);
    expect(parsed).toMatchObject({
      name: 'Instrumento',
      stock: '1',
    });
    expect(parsed.presentationId ?? null).toBeNull();
    expect(parsed.unitCost ?? null).toBeNull();

    // purchaseDate viaja en el lote; presentationId y unitCost pueden venir si el llamante
    // los manda, pero no son obligatorios.
    expect(
      createProductSchema.safeParse({
        ...machine,
        purchaseDate: '2026-01-01',
        presentationId: UNIDAD_FIXTURE,
        unitCost: '10.0000',
      }).success,
    ).toBe(true);
    expect(createProductSchema.safeParse({ ...machine, purchaseDate: 'no-es-fecha' }).success).toBe(
      false,
    );

    // qtyAlert sigue siendo campo desconocido para Instrumento.
    expect(
      createProductSchema.safeParse({ ...machine, qtyAlert: '1' }).success,
    ).toBe(false);

    // Sin existencia el alta de MACHINE se rechaza (stock es obligatorio en los tres tipos).
    expect(
      createProductSchema.safeParse({ name: 'Instrumento', type: PRODUCT_TYPES.MACHINE }).success,
    ).toBe(false);

    // PRODUCT sigue exigiendo presentacion: la anulabilidad es UNICAMENTE de MACHINE.
    expect(
      createProductSchema.safeParse({
        name: 'Producto',
        type: PRODUCT_TYPES.PRODUCT,
        qtyAlert: '0',
        stock: '1',
        unitCost: '10.0000',
      }).success,
    ).toBe(false);
  });

  it('PACKAGING acepta lote pero rechaza expiryDate', () => {
    const packaging = {
      name: 'Bidon',
      type: PRODUCT_TYPES.PACKAGING,
      ...REQUERIDOS,
      ...LOTE_MINIMO,
    };
    expect(createProductSchema.safeParse(packaging).success).toBe(true);

    expect(
      createProductSchema.safeParse({ ...packaging, expiryDate: '2027-01-31' }).success,
    ).toBe(false);
  });

  it('PRODUCT acepta expiryDate opcional', () => {
    const product = {
      name: 'Cloro',
      type: PRODUCT_TYPES.PRODUCT,
      ...REQUERIDOS,
      ...LOTE_MINIMO,
    };
    expect(createProductSchema.safeParse(product).success).toBe(true);
    expect(
      createProductSchema.safeParse({ ...product, expiryDate: '2027-01-31' }).success,
    ).toBe(true);
  });

  it('el alta sin type se interpreta como PRODUCT (preprocess)', () => {
    expect(createProductSchema.safeParse(ALTA_PRODUCTO).success).toBe(true);
    expect(updateProductSchema.safeParse(EDICION_PRODUCTO).success).toBe(true);
  });
});

describe('updateProductSchema — qtyAlert por tipo', () => {
  it('PRODUCT y PACKAGING exigen qtyAlert; MACHINE no lo acepta', () => {
    expect(
      updateProductSchema.safeParse({
        name: 'Acido',
        type: PRODUCT_TYPES.PRODUCT,
        qtyAlert: '0',
      }).success,
    ).toBe(true);
    expect(
      updateProductSchema.safeParse({
        name: 'Acido',
        type: PRODUCT_TYPES.PRODUCT,
      }).success,
    ).toBe(false);

    expect(
      updateProductSchema.safeParse({
        name: 'Bidon',
        type: PRODUCT_TYPES.PACKAGING,
        qtyAlert: '3',
      }).success,
    ).toBe(true);

    const machine = updateProductSchema.safeParse({
      name: 'Instrumento',
      type: PRODUCT_TYPES.MACHINE,
    });
    expect(machine.success).toBe(true);
    if (machine.success) {
      expect(machine.data).toEqual({ name: 'Instrumento', type: PRODUCT_TYPES.MACHINE });
      expect(Object.keys(machine.data)).not.toContain('qtyAlert');
    }

    // En MACHINE, mandar qtyAlert es campo desconocido para su rama.
    expect(
      updateProductSchema.safeParse({
        name: 'Instrumento',
        type: PRODUCT_TYPES.MACHINE,
        qtyAlert: '1',
      }).success,
    ).toBe(false);
  });

  it('la edicion sigue rechazando stock y campos de lote (R9, R26)', () => {
    for (const sobra of [
      { stock: '5' },
      { presentationId: UNIDAD_FIXTURE },
      { unitCost: '10.0000' },
      { lot: 'L-1' },
      { expiryDate: '2027-01-31' },
      { purchaseDate: '2026-01-01' },
    ]) {
      expect(
        updateProductSchema.safeParse({ ...EDICION_PRODUCTO, ...sobra }).success,
        JSON.stringify(sobra),
      ).toBe(false);
    }
  });
});
