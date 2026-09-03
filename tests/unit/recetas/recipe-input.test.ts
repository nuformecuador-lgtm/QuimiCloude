// T4 — Esquemas de entrada zod de receta (`design.md > 7.1`, `tasks.md > T4`). Validacion
// de borde (R38): cierra R7, R9, R14, R15, R16, R19, R20, R30 (minimo e integridad) y el
// test explicito de que el esquema no colapsa `undefined` y `null` del campo `image`.

import { createRecipeSchema, recipeLineSchema, updateRecipeSchema } from '@/lib/modules/recetas/domain/recipe-input';
import { pageQuerySchema } from '@/lib/modules/recetas/domain/page';

const LINEA_VALIDA = {
  productId: '11111111-1111-4111-8111-111111111111',
  quantity: '10.5000',
  unit: 'litros',
};

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: 'Formula base',
  steps: ['Mezclar', 'Envasar'],
  lines: [LINEA_VALIDA],
};

describe('recipeLineSchema — cantidad y unidad (R14, R15)', () => {
  it('rechaza la cantidad cero, negativa o ausente, y la unidad vacia o solo espacios', () => {
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, quantity: '0' }).success).toBe(false);
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, quantity: '0.0000' }).success).toBe(false);
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, quantity: '-1' }).success).toBe(false);
    expect(recipeLineSchema.safeParse({ productId: LINEA_VALIDA.productId, unit: 'litros' }).success).toBe(
      false,
    );
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, unit: '' }).success).toBe(false);
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, unit: '   ' }).success).toBe(false);
  });

  it('acepta cualquier texto no vacio como unidad, sin catalogo', () => {
    // R15
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, unit: 'kg/mol raro' }).success).toBe(true);
  });

  it('acepta una cantidad decimal valida de hasta 14 digitos y 4 decimales, mayor que cero', () => {
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, quantity: '1234567890.1234' }).success).toBe(
      true,
    );
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, quantity: '0.0001' }).success).toBe(true);
  });
});

describe('createRecipeSchema — nombre, descripcion (R7)', () => {
  it('rechaza el nombre vacio o de solo espacios y recorta los extremos del nombre valido', () => {
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, name: '' }).success).toBe(false);
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, name: '   ' }).success).toBe(false);

    const parsed = createRecipeSchema.parse({ ...RECETA_VALIDA, name: '  Cloro Granulado  ' });
    expect(parsed.name).toBe('Cloro Granulado');
  });

  it('rechaza el nombre de mas de 120 caracteres y la descripcion de mas de 500', () => {
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, name: 'a'.repeat(121) }).success).toBe(
      false,
    );
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, name: 'a'.repeat(120) }).success).toBe(true);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, description: 'a'.repeat(501) }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, description: 'a'.repeat(500) }).success,
    ).toBe(true);
  });
});

describe('createRecipeSchema — nombre invalido al normalizar (R9)', () => {
  it('rechaza como nombre invalido el que queda vacio al normalizarlo', () => {
    const result = createRecipeSchema.safeParse({ ...RECETA_VALIDA, name: '---' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Debe ser un fallo de zod (invalid_input desde el borde), no un DuplicateNameError
      // del dominio: este esquema no conoce la base y no puede lanzar ese error.
      const issue = result.error.issues[0];
      expect(issue.code).toBe('custom');
    }
  });
});

describe('createRecipeSchema — lineas repetidas (R16)', () => {
  it('rechaza dos lineas con el mismo producto', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [LINEA_VALIDA, { ...LINEA_VALIDA, quantity: '2.0000' }],
    });
    expect(result.success).toBe(false);
  });

  it('acepta lineas con productos distintos', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [
        LINEA_VALIDA,
        { ...LINEA_VALIDA, productId: '22222222-2222-4222-8222-222222222222' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('createRecipeSchema — pasos (R19, R20)', () => {
  it('rechaza unos pasos que no son lista de textos o que traen alguno vacio, y guarda lista vacia si no hay pasos', () => {
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: 'no es una lista' }).success,
    ).toBe(false);
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: ['Mezclar', ''] }).success).toBe(
      false,
    );
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: ['Mezclar', '   '] }).success).toBe(
      false,
    );

    const { name, description, lines } = RECETA_VALIDA;
    const parsed = createRecipeSchema.parse({ name, description, lines });
    expect(parsed.steps).toEqual([]);
  });

  it('rechaza mas de 50 pasos y el paso de mas de 1000 caracteres', () => {
    const pasos51 = Array.from({ length: 51 }, (_, i) => `Paso ${i}`);
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: pasos51 }).success).toBe(false);

    const pasos50 = Array.from({ length: 50 }, (_, i) => `Paso ${i}`);
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: pasos50 }).success).toBe(true);

    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: ['a'.repeat(1001)] }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: ['a'.repeat(1000)] }).success,
    ).toBe(true);
  });
});

describe('pageQuerySchema (R30)', () => {
  it('rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1', () => {
    expect(pageQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: -1 }).success).toBe(false);

    expect(pageQuerySchema.safeParse({ pageSize: 1.5 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: -1 }).success).toBe(false);

    expect(pageQuerySchema.safeParse({ page: 1, pageSize: 10 }).success).toBe(true);
  });
});

describe('updateRecipeSchema — los tres estados del campo image (R47)', () => {
  it('CRITICO: no colapsa el campo image omitido y el campo image null en el mismo valor', () => {
    // Omitido: la clave `image` del resultado debe salir `undefined` (ausente).
    const sinTocarImagen = updateRecipeSchema.parse({
      name: RECETA_VALIDA.name,
      description: RECETA_VALIDA.description,
      steps: RECETA_VALIDA.steps,
      lines: RECETA_VALIDA.lines,
    });
    expect(sinTocarImagen.image).toBeUndefined();
    expect('image' in sinTocarImagen ? sinTocarImagen.image : undefined).toBeUndefined();

    // Null explicito: la clave `image` del resultado debe salir `null`, sin que el caso
    // de arriba lo pise ni al reves.
    const quitarImagen = updateRecipeSchema.parse({
      name: RECETA_VALIDA.name,
      description: RECETA_VALIDA.description,
      steps: RECETA_VALIDA.steps,
      lines: RECETA_VALIDA.lines,
      image: null,
    });
    expect(quitarImagen.image).toBeNull();

    // Bytes nuevos: el tercer estado sigue distinguible de los otros dos.
    const nuevaImagen = updateRecipeSchema.parse({
      name: RECETA_VALIDA.name,
      description: RECETA_VALIDA.description,
      steps: RECETA_VALIDA.steps,
      lines: RECETA_VALIDA.lines,
      image: { bytes: new Uint8Array([1, 2, 3]) },
    });
    expect(nuevaImagen.image).toEqual({ bytes: new Uint8Array([1, 2, 3]) });
  });

  it('el alta solo admite image omitido o { bytes }, nunca null explicito', () => {
    const result = createRecipeSchema.safeParse({ ...RECETA_VALIDA, image: null });
    expect(result.success).toBe(false);

    expect(createRecipeSchema.safeParse(RECETA_VALIDA).success).toBe(true);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, image: { bytes: new Uint8Array([1]) } })
        .success,
    ).toBe(true);
  });
});
