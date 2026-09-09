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
 * Los dos campos que la decision del humano del 2026-09-03 volvio OBLIGATORIOS en la entrada
 * (`stock` y `qtyAlert`). Se anaden a cada caso que espera un producto VALIDO: sin ellos
 * cualquier `safeParse` correcto fallaria por un motivo que ese caso no esta midiendo.
 * Su propia obligatoriedad tiene caso aparte, al final del describe.
 */
const REQUERIDOS = { stock: 0, qtyAlert: 0 } as const;

// Esquemas zod de entrada del borde (R9, R10, R11, R25, R28, R37; `design.md > 6`, T4 de tasks.md).
describe('createProductSchema', () => {
  it('rechaza el nombre vacio o de solo espacios y recorta los extremos del nombre valido', () => {
    // R9
    const base = { name: '', ...REQUERIDOS };

    expect(createProductSchema.safeParse(base).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, name: '   ' }).success,
    ).toBe(false);

    const parsed = createProductSchema.parse({ ...base, name: '  Cloro Granulado  ' });
    expect(parsed.name).toBe('Cloro Granulado');
  });

  it('rechaza el nombre de producto de mas de 120 caracteres y el de presentacion de mas de 60', () => {
    // R11
    const productName121 = 'a'.repeat(121);
    const productName120 = 'a'.repeat(120);
    expect(
      createProductSchema.safeParse({
        name: productName121,
        ...REQUERIDOS,
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        name: productName120,
        ...REQUERIDOS,
      }).success,
    ).toBe(true);

    const presentationName61 = 'b'.repeat(61);
    const presentationName60 = 'b'.repeat(60);
    expect(
      createPresentationSchema.safeParse({ name: presentationName61 }).success,
    ).toBe(false);
    expect(
      createPresentationSchema.safeParse({ name: presentationName60 }).success,
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
      // El error tiene que distinguirse de un duplicado: aqui es un fallo de zod
      // (invalid_input), nunca un `DuplicateNameError` del dominio -este esquema no
      // conoce la base y no puede lanzar ese error-.
      const issue = result.error.issues[0];
      expect(issue.code).toBe('custom');
      expect(issue.message).toBe(
        'El nombre de la presentacion no contiene ningun caracter valido.',
      );
    }
  });

  // QC-52 R1: el costo, la compra minima y el tiempo de entrega dejaron de ser del
  // producto. Aqui se prueba lo contrario de lo que probaba QC-14: ya no se validan,
  // se RECHAZAN. El esquema es `strictObject` justamente para eso -con `z.object` los
  // tres se ignorarian en silencio y quien enviara un costo creeria haberlo guardado-.
  it('rechaza la entrada que trae costo, compra minima o tiempo de entrega', () => {
    // R1
    const valida = {
      name: 'Producto',
      ...REQUERIDOS,
    };

    // La entrada valida SIN los tres campos pasa.
    expect(createProductSchema.safeParse(valida).success).toBe(true);
    expect(updateProductSchema.safeParse(valida).success).toBe(true);

    for (const sobra of [
      { cost: '1234.5678' },
      { cost: null },
      { minPurchase: 0 },
      { deliveryTime: 5 },
      { deliveryTime: null },
    ]) {
      const alta = createProductSchema.safeParse({ ...valida, ...sobra });
      expect(alta.success).toBe(false);
      if (!alta.success) {
        expect(alta.error.issues[0].code).toBe('unrecognized_keys');
      }

      // La edicion es reemplazo completo con el MISMO esquema: rechaza igual.
      expect(updateProductSchema.safeParse({ ...valida, ...sobra }).success).toBe(false);
    }
  });

  // El rechazo de R1 tiene que llegar al llamante como `invalid_input`, no como un
  // detalle de zod: es el `code` estable que el adaptador driving traduce (R32).
  it('el caso de uso traduce la entrada con costo a invalid_input y no toca el puerto', async () => {
    // R1, R32
    const products = {
      create: vi.fn(),
      findAliveById: vi.fn(),
      updateAlive: vi.fn(),
      softDeleteAlive: vi.fn(),
      listAlive: vi.fn(),
    };
    const createProduct = createCreateProduct({ products });

    const error = await createProduct(
      {
        name: 'Producto',
        stock: 0,
        qtyAlert: 0,
        cost: '10.0000',
      },
      { id: 'actor-1', permissions: ['inventario.modificar'] },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
    expect(products.create).not.toHaveBeenCalled();
  });

  it('acepta la unidad ausente y exige que la presente sea una referencia con forma de uuid', () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este archivo no
    // tenia caso propio para la unidad —el campo `unit` era texto libre y no habia nada que
    // validar en el borde—, asi que al cambiar la FORMA queda cubierto aqui lo que sigue
    // vigilandose: la unidad del producto SIGUE SIENDO OPCIONAL (QC-14 R5, QC-32 R10) y
    // SIGUE SIENDO ANOTATIVA (QC-32 R14) —zod no la compara con nada ni la restringe segun
    // el producto—. Lo unico nuevo es que hoy se valida su forma de uuid.
    //
    // Que el uuid EXISTA no lo comprueba zod: lo rechaza la base con 23503 (QC-32 R12), y
    // eso se prueba en `tests/integration/unidades/unidades-constraints.int.test.ts`.
    const base = {
      name: 'Producto',
      ...REQUERIDOS,
    };

    expect(createProductSchema.safeParse(base).success).toBe(true);
    expect(createProductSchema.parse(base).unitId).toBeUndefined();
    expect(createProductSchema.safeParse({ ...base, unitId: null }).success).toBe(true);
    expect(
      createProductSchema.safeParse({
        ...base,
        unitId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(true);
    // Ya no vale cualquier texto: la unidad es una referencia, no una etiqueta.
    expect(createProductSchema.safeParse({ ...base, unitId: 'kg' }).success).toBe(false);
  });

  it('exige stock y qtyAlert, y los sigue queriendo enteros de 0 o mas', () => {
    // DECISION DEL HUMANO, 2026-09-03: acota a R5, que los declaraba opcionales. La COLUMNA sigue
    // siendo nullable -eso lo afirma `inventario-schema.test.ts`-; lo que cambia es lo que la
    // aplicacion acepta. Ni ausente, ni nulo, ni negativo, ni con decimales.
    const soloObligatoriosDeAntes = {
      name: 'Producto',
    };

    expect(createProductSchema.safeParse(soloObligatoriosDeAntes).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, stock: 0 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: 0 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, stock: null, qtyAlert: null })
        .success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, stock: -1, qtyAlert: 0 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, stock: 1.5, qtyAlert: 0 })
        .success,
    ).toBe(false);

    const parsed = createProductSchema.parse({
      ...soloObligatoriosDeAntes,
      stock: 7,
      qtyAlert: 3,
    });
    expect(parsed.stock).toBe(7);
    expect(parsed.qtyAlert).toBe(3);

    // El unico opcional que queda tras QC-52 sigue pudiendo faltar.
    expect(parsed.unitId).toBeUndefined();
  });
});
