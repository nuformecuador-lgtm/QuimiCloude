// T9 — El contrato publico del modulo `recetas` ya no conoce ningun tipo de paso (QC-62 R9,
// R10, decision cerrada 2).
//
// Se afirma EN RUNTIME sobre el barrel, no con tipos: un `expect-error` de TypeScript se
// borraria sin que nadie lo notara, y lo que hay que vigilar es que el simbolo no vuelva.
// Si alguien reintroduce `RECIPE_STEP_TYPES` -o un campo `type` en el paso-, este test cae.

import type { Prisma } from '@prisma/client';

import * as recetas from '@/lib/modules/recetas';
import { MAX_STEP_ELEMENTS, countRecipeStepElements, recipeStepSchema } from '@/lib/modules/recetas';

// El adaptador se importa por `toSteps` -que es lo que alimenta los pasos del detalle-, no por
// la base: el cliente Prisma se mockea porque este test no toca Postgres.
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

const { toSteps } = await import('@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma');

/** Lo que hay en la columna es `Json`: se escribe como tal, sin fingir que ya viene tipado. */
function columna(value: unknown): Prisma.JsonValue {
  return value as Prisma.JsonValue;
}

const PASO = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: 'Pesar el tensioactivo' }] },
    { kind: 'checklist', items: [{ spans: [{ text: 'Guantes' }] }] },
  ],
};

describe('contrato publico de `recetas` — el tipo de paso desaparecio (R9)', () => {
  it('el barrel no exporta RECIPE_STEP_TYPES ni ningun simbolo con `STEP_TYPE` en el nombre', () => {
    const exportados = Object.keys(recetas);
    expect(exportados).not.toContain('RECIPE_STEP_TYPES');
    expect(exportados.filter((name) => /STEP_TYPE/i.test(name))).toEqual([]);
  });

  it('el barrel si publica el esquema del documento, el tope y la funcion de conteo', () => {
    // Positivo de R9/R11: lo que sustituye a los tipos de paso esta publicado, y el tope vive
    // en UNA sola constante que las demas capas importan en vez de reescribir.
    expect(Object.keys(recetas)).toEqual(
      expect.arrayContaining([
        'recipeStepSchema',
        'MAX_STEP_ELEMENTS',
        'countRecipeStepElements',
      ]),
    );
    expect(typeof MAX_STEP_ELEMENTS).toBe('number');
    expect(countRecipeStepElements(recipeStepSchema.parse(PASO))).toBe(2);
  });

  it('el parse de un paso no deja ningun campo `type` en la salida', () => {
    const parsed = recipeStepSchema.parse(PASO);
    expect(parsed).not.toHaveProperty('type');
    expect(parsed).toEqual(PASO);
    // Y si alguien lo manda igualmente, `.strict()` rechaza la operacion entera (R4).
    expect(recipeStepSchema.safeParse({ ...PASO, type: 'checklist' }).success).toBe(false);
  });
});

describe('el paso del detalle es el documento y nada mas (R10)', () => {
  it('el paso que sale del puerto no lleva `type` ni marca derivada de lista de verificacion', () => {
    // `toSteps` es lo que alimenta `RecipeRow.steps` y, con el, los pasos de `RecipeDetail`.
    const [paso] = toSteps(columna([PASO]));

    expect(paso).toEqual(PASO);
    expect(paso).not.toHaveProperty('type');
    // Ningun dato DERIVADO del documento: quien necesite saber si el paso lleva checks lo
    // deduce de sus bloques (decision cerrada 2, mismo criterio que el total del pedido de QC-33).
    expect(Object.keys(paso as object)).toEqual(['blocks']);
    for (const marca of ['hasChecklist', 'checklist', 'isChecklist', 'kind', 'body']) {
      expect(paso).not.toHaveProperty(marca);
    }
  });

  it('el documento con lista de verificacion se distingue mirando sus bloques, sin campo auxiliar', () => {
    const [conChecks] = toSteps(columna([PASO]));
    const [sinChecks] = toSteps(
      columna([{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar' }] }] }]),
    );

    expect(conChecks?.blocks.some((block) => block.kind === 'checklist')).toBe(true);
    expect(sinChecks?.blocks.some((block) => block.kind === 'checklist')).toBe(false);
  });
});
