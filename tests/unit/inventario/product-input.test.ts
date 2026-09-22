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
 * (`qtyAlert`). Se anade a cada caso que espera un producto VALIDO: sin el cualquier
 * `safeParse` correcto fallaria por un motivo que ese caso no esta midiendo.
 * Su propia obligatoriedad tiene caso aparte, al final del describe.
 */
const REQUERIDOS = { qtyAlert: 0 } as const;

/**
 * Unidad de fixture para las presentaciones (QC-80 R10): desde esta feature
 * `createPresentationSchema` EXIGE `unitId` con forma de uuid. Se anade a los casos que miden
 * OTRA cosa -el limite de 60 caracteres del nombre- para que sigan midiendo esa cosa; sin el,
 * el `safeParse` fallaria siempre por un campo que no es el sujeto del caso y el limite
 * dejaria de estar vigilado en silencio. Que la unidad sea obligatoria tiene sus propios casos
 * en `tests/unit/inventario/presentation-input.test.ts`.
 */
const UNIDAD_FIXTURE = '11111111-1111-4111-8111-111111111111';

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
      // El error tiene que distinguirse de un duplicado: aqui es un fallo de zod
      // (invalid_input), nunca un `PresentationDuplicateNameError` del dominio -este esquema no
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
      // QC-90 (T4): los tres metodos del alta con primer lote. Estan aqui porque el doble
      // tiene que cumplir el puerto ENTERO; ninguno debe llegar a llamarse en este caso.
      findAliveIdByNameInPresentationUnit: vi.fn(),
      createWithFirstBatch: vi.fn(),
      addBatchToAlive: vi.fn(),
      // QC-92: mismo criterio, ninguno debe llegar a llamarse en este caso.
      adjustBatchStock: vi.fn(),
      findBatchesOfAliveProduct: vi.fn(),
      findBatchMovements: vi.fn(),
    };
    const createProduct = createCreateProduct({ products });

    const error = await createProduct(
      {
        name: 'Producto',
        stock: 0,
        qtyAlert: 0,
        cost: '10.0000',
      },
      { id: 'actor-1', companyId: 'company-a', permissions: ['inventario.modificar'] },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
    expect(products.create).not.toHaveBeenCalled();
    // QC-90: el alta ya no pasa por `create`, asi que «no toca el puerto» tambien tiene
    // que afirmarse sobre los metodos por los que ahora SI pasaria.
    expect(products.findAliveIdByNameInPresentationUnit).not.toHaveBeenCalled();
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
  });

  it('el alta NO acepta ninguna unidad: `unitId` es campo desconocido (QC-80, R21)', () => {
    // R21 — el producto dejo de declarar unidad EN TODO EL CAMINO, y este es el borde de
    // entrada. Hasta QC-80 `unitId` era un uuid opcional (QC-32, decision cerrada 13); la
    // columna `products.unit_id` ya no existe -se fue con su indice y su FK en
    // `20260911120000_presentation_unit`-, asi que no hay nada que validar ni donde escribirlo.
    //
    // Se comprueba lo que de verdad importa, que son DOS cosas distintas:
    //   1. Un alta SIN unidad es valida -y su salida NO trae la clave-, no es que el campo
    //      sobre y se ignore.
    //   2. Un alta CON unidad se RECHAZA, aunque el uuid tenga forma perfecta. `strictObject`
    //      (QC-52 R1) convierte el campo de mas en `invalid_input`: ignorarlo en silencio le
    //      haria creer a quien lo envia que guardo una unidad que nunca se guardo.
    //
    // La unidad de un producto hoy se LEE, no se envia: la escribe `createWithFirstBatch`
    // copiandola de la presentacion del lote -el disparador solo rechaza lo que no cuadra-, y
    // eso se prueba en `product-prisma.test.ts`.
    const base = { name: 'Producto', ...REQUERIDOS };

    const parsed = createProductSchema.parse(base);
    expect(Object.keys(parsed)).not.toContain('unitId');

    const conUnidad = { ...base, unitId: '22222222-2222-4222-8222-222222222222' };
    expect(createProductSchema.safeParse(conUnidad).success).toBe(false);
    expect(updateProductSchema.safeParse(conUnidad).success).toBe(false);
    // Ni siquiera nula: lo que no se declara no se acepta de ninguna forma.
    expect(createProductSchema.safeParse({ ...base, unitId: null }).success).toBe(false);

    // Y el rechazo NOMBRA el campo: `unrecognized_keys` con `unitId` dentro. Asi el motivo es
    // legible para quien depure, en vez de un `invalid_input` mudo.
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

  it('exige qtyAlert, y lo sigue queriendo entero de 0 o mas', () => {
    // DECISION DEL HUMANO, 2026-09-03: acota a R5, que lo declaraba opcional. La COLUMNA sigue
    // siendo nullable -eso lo afirma `inventario-schema.test.ts`-; lo que cambia es lo que la
    // aplicacion acepta. Ni ausente, ni nulo, ni negativo, ni con decimales.
    const soloObligatoriosDeAntes = {
      name: 'Producto',
    };

    expect(createProductSchema.safeParse(soloObligatoriosDeAntes).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: null }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: -1 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...soloObligatoriosDeAntes, qtyAlert: 1.5 }).success,
    ).toBe(false);

    const parsed = createProductSchema.parse({
      ...soloObligatoriosDeAntes,
      qtyAlert: 3,
    });
    expect(parsed.qtyAlert).toBe(3);

    // La existencia ya no cruza el borde del producto -ni en el alta ni en la edicion-, asi que
    // solo quedan nombre y alerta.
    expect(Object.keys(parsed).sort()).toEqual(['name', 'qtyAlert']);
  });

  it('la edicion rechaza la existencia como invalid_input: R9', () => {
    const base = { name: 'Producto', ...REQUERIDOS };

    expect(updateProductSchema.safeParse(base).success).toBe(true);

    const conExistencia = updateProductSchema.safeParse({ ...base, stock: 5 });
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
