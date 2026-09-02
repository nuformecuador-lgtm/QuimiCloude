import {
  createPresentationSchema,
} from '@/lib/modules/inventario/domain/presentation-input';
import { createProductSchema } from '@/lib/modules/inventario/domain/product-input';
import { pageQuerySchema } from '@/lib/modules/inventario/domain/page';

// Esquemas zod de entrada del borde (R9, R10, R11, R25, R28, R37; `design.md > 6`, T4 de tasks.md).
describe('createProductSchema', () => {
  it('rechaza el nombre vacio o de solo espacios y recorta los extremos del nombre valido', () => {
    // R9
    const base = { name: '', presentationId: '11111111-1111-4111-8111-111111111111' };

    expect(createProductSchema.safeParse(base).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, name: '   ' }).success,
    ).toBe(false);

    const parsed = createProductSchema.parse({ ...base, name: '  Cloro Granulado  ' });
    expect(parsed.name).toBe('Cloro Granulado');
  });

  it('rechaza un tiempo de entrega negativo', () => {
    // R10
    const base = {
      name: 'Producto',
      presentationId: '11111111-1111-4111-8111-111111111111',
    };

    expect(
      createProductSchema.safeParse({ ...base, deliveryTime: -1 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, deliveryTime: 0 }).success,
    ).toBe(true);
  });

  it('rechaza el nombre de producto de mas de 120 caracteres y el de presentacion de mas de 60', () => {
    // R11
    const productName121 = 'a'.repeat(121);
    const productName120 = 'a'.repeat(120);
    expect(
      createProductSchema.safeParse({
        name: productName121,
        presentationId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        name: productName120,
        presentationId: '11111111-1111-4111-8111-111111111111',
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

  it('acepta el cost como cadena decimal valida y rechaza number o mas de 4 decimales', () => {
    const base = {
      name: 'Producto',
      presentationId: '11111111-1111-4111-8111-111111111111',
    };

    expect(
      createProductSchema.safeParse({ ...base, cost: '1234.5678' }).success,
    ).toBe(true);
    expect(
      createProductSchema.safeParse({ ...base, cost: 1234.5678 as unknown as string })
        .success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, cost: '1234.56789' }).success,
    ).toBe(false);
  });

  it('usa 0 como valor por defecto de minPurchase cuando no se indica', () => {
    const parsed = createProductSchema.parse({
      name: 'Producto',
      presentationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.minPurchase).toBe(0);
  });
});
