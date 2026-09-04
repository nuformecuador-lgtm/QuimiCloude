// T8 — El DOCUMENTO de un paso (QC-62, `design.md > 2` y `> 3`). Cubre R1-R5, R7, R11 y R12
// sobre `recipeStepSchema` directamente, y R13 sobre `recipeStepsSchema` a traves del esquema
// de alta. R6 y R8 -validacion en el borde y posicion del paso que falla- viven en
// `recipe-input.test.ts`, que es donde se ejercita `createRecipeSchema`.
//
// Cada requisito tiene su caso POSITIVO y su caso NEGATIVO: un test que solo comprueba que lo
// bueno pasa no vigila nada.

import {
  MAX_STEP_ELEMENTS,
  countRecipeStepElements,
  recipeStepSchema,
} from '@/lib/modules/recetas';

/** Parrafo de un solo fragmento, sin marcas: el caso mas comun y el mas corto de escribir. */
function parrafo(text: string) {
  return { kind: 'paragraph' as const, spans: [{ text }] };
}

/** Lista de verificacion de un item por texto. */
function checklist(...textos: readonly string[]) {
  return {
    kind: 'checklist' as const,
    items: textos.map((text) => ({ spans: [{ text }] })),
  };
}

describe('recipeStepSchema — forma del documento (R1, R2)', () => {
  it('acepta un documento que mezcla parrafo y lista de verificacion, y lo devuelve en el mismo orden', () => {
    const documento = {
      blocks: [
        parrafo('Preparar el area'),
        checklist('Guantes', 'Gafas'),
        parrafo('Pesar el tensioactivo'),
      ],
    };

    const result = recipeStepSchema.safeParse(documento);
    expect(result.success).toBe(true);
    // El orden es el que llego, sin reordenar y sin perder ningun bloque (R1).
    if (result.success) {
      expect(result.data).toEqual(documento);
      expect(result.data.blocks.map((block) => block.kind)).toEqual([
        'paragraph',
        'checklist',
        'paragraph',
      ]);
    }
  });

  it('rechaza el documento que no es un objeto con `blocks`, y la lista de verificacion sin items', () => {
    // Negativo de R1: el paso ya no es una cadena suelta ni una lista pelada de bloques.
    expect(recipeStepSchema.safeParse('Mezclar').success).toBe(false);
    expect(recipeStepSchema.safeParse([parrafo('Mezclar')]).success).toBe(false);
    expect(recipeStepSchema.safeParse({ blocks: 'Mezclar' }).success).toBe(false);
    // Negativo de R2: una lista de verificacion vacia no representa nada (`design.md > 2`).
    expect(
      recipeStepSchema.safeParse({ blocks: [parrafo('Antes'), { kind: 'checklist', items: [] }] })
        .success,
    ).toBe(false);
  });

  it('acepta y conserva el parrafo SIN fragmentos: la linea en blanco del paso (R2)', () => {
    const documento = {
      blocks: [parrafo('Primera linea'), { kind: 'paragraph', spans: [] }, parrafo('Tercera')],
    };

    const result = recipeStepSchema.safeParse(documento);
    expect(result.success).toBe(true);
    // Los saltos de linea SON estos bloques: el vacio se conserva, no se colapsa (R2).
    if (result.success) expect(result.data.blocks[1]).toEqual({ kind: 'paragraph', spans: [] });
  });
});

describe('recipeStepSchema — marcas de los fragmentos (R3)', () => {
  it('acepta negrilla, cursiva y las dos combinadas sobre el mismo fragmento', () => {
    const documento = {
      blocks: [
        {
          kind: 'paragraph',
          spans: [
            { text: 'normal' },
            { text: 'negrilla', bold: true },
            { text: 'cursiva', italic: true },
            { text: 'las dos', bold: true, italic: true },
          ],
        },
      ],
    };

    const result = recipeStepSchema.safeParse(documento);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(documento);
  });

  it('rechaza el fragmento sin ningun caracter y la marca que no es booleana', () => {
    expect(
      recipeStepSchema.safeParse({ blocks: [{ kind: 'paragraph', spans: [{ text: '' }] }] }).success,
    ).toBe(false);
    expect(
      recipeStepSchema.safeParse({
        blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar', bold: 'si' }] }],
      }).success,
    ).toBe(false);
  });
});

describe('recipeStepSchema — estructura cerrada (R4)', () => {
  it('rechaza un encabezado, un enlace, una marca desconocida y una clave extra', () => {
    // Clase de bloque que no existe (decision cerrada 1: parrafo y lista, nada mas).
    expect(
      recipeStepSchema.safeParse({
        blocks: [{ kind: 'heading', level: 1, spans: [{ text: 'Titulo' }] }],
      }).success,
    ).toBe(false);
    expect(
      recipeStepSchema.safeParse({ blocks: [{ kind: 'link', href: 'https://x', spans: [] }] })
        .success,
    ).toBe(false);
    // Marca que no es negrilla ni cursiva.
    expect(
      recipeStepSchema.safeParse({
        blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar', underline: true }] }],
      }).success,
    ).toBe(false);
    // Clave extra en un bloque admitido: sin `.strict()` zod la descartaria en silencio y el
    // documento cruzaria el borde recortado (`design.md > 2`).
    expect(
      recipeStepSchema.safeParse({
        blocks: [{ kind: 'paragraph', level: 2, spans: [{ text: 'Mezclar' }] }],
      }).success,
    ).toBe(false);
    // Clave extra en el documento y en un item de lista de verificacion.
    expect(
      recipeStepSchema.safeParse({ blocks: [parrafo('Mezclar')], version: 1 }).success,
    ).toBe(false);
    expect(
      recipeStepSchema.safeParse({
        blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Guantes' }], done: true }] }],
      }).success,
    ).toBe(false);
  });

  it('acepta el mismo documento sin la clase ni la clave sobrantes', () => {
    expect(recipeStepSchema.safeParse({ blocks: [parrafo('Titulo')] }).success).toBe(true);
    expect(recipeStepSchema.safeParse({ blocks: [checklist('Guantes')] }).success).toBe(true);
  });
});

describe('recipeStepSchema — el texto sale tal como llego (R5)', () => {
  it('no recorta ni normaliza los espacios del fragmento', () => {
    const result = recipeStepSchema.safeParse({ blocks: [parrafo('  Mezclar  ')] });
    expect(result.success).toBe(true);
    // Sin `.trim()` en `text` (`design.md > 3`): lo que se guarda es lo que llego.
    if (result.success) expect(result.data.blocks[0]).toEqual({
      kind: 'paragraph',
      spans: [{ text: '  Mezclar  ' }],
    });
  });

  it('el documento de solo espacios se rechaza pese a que no se recorta nada', () => {
    // Negativo de R5 y positivo del "paso vacio" de R7: no recortar NO significa admitir vacio.
    expect(recipeStepSchema.safeParse({ blocks: [parrafo('   ')] }).success).toBe(false);
  });
});

describe('recipeStepSchema — paso e item vacios (R7)', () => {
  it('rechaza el documento sin ningun caracter distinto de espacio y el item de solo espacios', () => {
    expect(recipeStepSchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(
      recipeStepSchema.safeParse({ blocks: [{ kind: 'paragraph', spans: [] }] }).success,
    ).toBe(false);
    expect(recipeStepSchema.safeParse({ blocks: [parrafo(' \t\n ')] }).success).toBe(false);
    // El item vacio cae aunque el resto del documento tenga texto de sobra.
    expect(
      recipeStepSchema.safeParse({ blocks: [parrafo('Antes'), checklist('  ')] }).success,
    ).toBe(false);
    expect(
      recipeStepSchema.safeParse({
        blocks: [parrafo('Antes'), { kind: 'checklist', items: [{ spans: [] }] }],
      }).success,
    ).toBe(false);
  });

  it('acepta el documento cuyo unico caracter visible esta en un item de la lista', () => {
    expect(
      recipeStepSchema.safeParse({ blocks: [{ kind: 'paragraph', spans: [] }, checklist('Guantes')] })
        .success,
    ).toBe(true);
  });
});

describe('countRecipeStepElements y MAX_STEP_ELEMENTS (R11)', () => {
  it('cuenta parrafos e items, y el bloque de lista en si no suma', () => {
    expect(countRecipeStepElements({ blocks: [] })).toBe(0);
    expect(
      countRecipeStepElements({
        blocks: [parrafo('a'), checklist('b', 'c', 'd'), parrafo('e')],
      }),
    ).toBe(5);
  });

  it(`acepta ${MAX_STEP_ELEMENTS} elementos y rechaza uno mas`, () => {
    const justo = { blocks: Array.from({ length: MAX_STEP_ELEMENTS }, (_, i) => parrafo(`P${i}`)) };
    expect(countRecipeStepElements(justo)).toBe(MAX_STEP_ELEMENTS);
    expect(recipeStepSchema.safeParse(justo).success).toBe(true);

    const unoMas = {
      blocks: Array.from({ length: MAX_STEP_ELEMENTS + 1 }, (_, i) => parrafo(`P${i}`)),
    };
    expect(recipeStepSchema.safeParse(unoMas).success).toBe(false);
  });

  it('el tope se pasa tambien sumando items de listas de verificacion, no solo parrafos', () => {
    // El conteo es parrafos + items (`design.md > 3`): dos listas que juntas se pasan del tope
    // caen igual que 31 parrafos.
    const items = Array.from({ length: MAX_STEP_ELEMENTS }, (_, i) => `Item ${i}`);
    const justo = { blocks: [checklist(...items)] };
    expect(recipeStepSchema.safeParse(justo).success).toBe(true);

    const unoMas = { blocks: [parrafo('Encabeza'), checklist(...items)] };
    expect(countRecipeStepElements(unoMas)).toBe(MAX_STEP_ELEMENTS + 1);
    expect(recipeStepSchema.safeParse(unoMas).success).toBe(false);
  });
});

describe('recipeStepSchema — sin tope de caracteres (R12)', () => {
  it('acepta un parrafo de 5.000 caracteres y una suma de fragmentos aun mayor', () => {
    const largo = 'a'.repeat(5000);
    const result = recipeStepSchema.safeParse({ blocks: [parrafo(largo)] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.blocks[0]).toEqual({
      kind: 'paragraph',
      spans: [{ text: largo }],
    });

    expect(
      recipeStepSchema.safeParse({
        blocks: [
          { kind: 'paragraph', spans: [{ text: largo }, { text: largo, bold: true }] },
          checklist(largo),
        ],
      }).success,
    ).toBe(true);
  });

  it('lo que sigue cayendo es el fragmento sin caracteres, no el largo', () => {
    // Negativo de R12: el unico limite por abajo es `min(1)` (R3); por arriba no hay ninguno.
    expect(
      recipeStepSchema.safeParse({ blocks: [{ kind: 'paragraph', spans: [{ text: '' }] }] }).success,
    ).toBe(false);
  });
});
