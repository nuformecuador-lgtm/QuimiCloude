import { describe, expect, it } from 'vitest';

import { recipeStepSchema, type RecipeStepDocument } from '@/lib/modules/recetas';

import {
  buildRecipePayload,
  type RecipeFormState,
  type RecipeLineFormValue,
  type RecipeStepFormValue,
  type RecipeStepPayload,
} from '@/app/(private)/produccion/formulas/components/recipe-form-state';

/**
 * `buildRecipePayload` — el armado PURO del payload del formulario de receta (T21, R20-R24,
 * R26-R38; `specs/QC-26-pantalla-de-recetas/tasks.md > T21`, `design.md > 5`, `> 8`).
 *
 * Archivo del proyecto `node` de Vitest (`vitest.config.mts`): importa directamente
 * `recipe-form-state.ts` -nunca el barrel de la ruta, que arrastra componentes de cliente con
 * `react`/`next/navigation`- porque esta función no sabe que React existe (T13).
 *
 * **Criterio de honestidad, aplicado test a test**: cada aserción de este archivo se rompe si se
 * borra la línea de producción que la sostiene. Los dos casos más delicados -R35 y R36- se
 * verificaron rompiendo a mano el caso `untouched` de `buildRecipePayload` (ver el reporte de la
 * task): con el `case 'untouched': return base;` sustituido por `return { ...base, image:
 * undefined };`, la primera prueba de este archivo se puso en rojo, tal como exige el criterio.
 */

function line(overrides: Partial<RecipeLineFormValue> = {}): RecipeLineFormValue {
  return {
    key: 'line-key-1',
    productId: 'product-1',
    productName: 'Producto uno',
    percentage: '100',
    productUnitId: null,
    ...overrides,
  };
}

/**
 * Paso del ESTADO del formulario. Desde QC-64 T4 el estado guarda EL DOCUMENTO del contrato, no
 * una cadena: este helper construye el documento minimo -un parrafo con un fragmento- para los
 * casos que solo hablan de orden o de cantidad de pasos.
 */
function step(text: string, key = `step-${text}`): RecipeStepFormValue {
  return { key, document: { blocks: [{ kind: 'paragraph', spans: [{ text }] }] } };
}

/** Paso del estado con un documento cualquiera, para los casos que si hablan de su contenido. */
function stepDoc(document: RecipeStepDocument, key = 'step-doc'): RecipeStepFormValue {
  return { key, document };
}

/**
 * Texto plano de cada paso del payload, aplanando sus parrafos. Sirve para afirmar sobre el
 * ORDEN de los pasos sin repetir el documento entero; nunca sustituye a una igualdad estructural
 * cuando lo que se comprueba es el contenido.
 */
function stepTexts(steps: readonly RecipeStepPayload[]): string[] {
  return steps.map((document) =>
    document.blocks
      .filter((block) => block.kind === 'paragraph')
      .map((block) => block.spans.map((span) => span.text).join(''))
      .join('\n'),
  );
}

function baseState(overrides: Partial<RecipeFormState> = {}): RecipeFormState {
  return {
    name: 'Receta de prueba',
    description: '',
    lines: [],
    steps: [],
    image: { kind: 'untouched' },
    ...overrides,
  };
}

describe('buildRecipePayload — los tres estados de la imagen, por presencia de la clave (R35)', () => {
  // R35: la prueba correcta es `'image' in payload`, NUNCA `payload.image === undefined` -un
  // test que solo mirase el valor pasaría en verde con la clave presente y el backend
  // conservaría la imagen que el usuario pidió quitar (`design.md > 8`, riesgo 6).

  it('untouched: el payload NO tiene la clave "image"', () => {
    const payload = buildRecipePayload('edit', baseState({ image: { kind: 'untouched' } }));

    expect('image' in payload).toBe(false);
  });

  it('replaced: el payload lleva image: { bytes } con los bytes elegidos', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const payload = buildRecipePayload('edit', baseState({ image: { kind: 'replaced', bytes } }));

    expect('image' in payload).toBe(true);
    expect(payload.image).toEqual({ bytes });
  });

  it('cleared: el payload lleva image: null EXPLICITO, no ausente', () => {
    const payload = buildRecipePayload('edit', baseState({ image: { kind: 'cleared' } }));

    expect('image' in payload).toBe(true);
    expect(payload.image).toBeNull();
  });
});

describe('buildRecipePayload — en el alta el valor nulo nunca viaja (R36, en negativo)', () => {
  it('untouched en alta: tampoco lleva la clave "image"', () => {
    const payload = buildRecipePayload('create', baseState({ image: { kind: 'untouched' } }));

    expect('image' in payload).toBe(false);
  });

  it('replaced en alta: lleva los bytes, nunca null', () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const payload = buildRecipePayload('create', baseState({ image: { kind: 'replaced', bytes } }));

    expect(payload.image).not.toBeNull();
    expect(payload.image).toEqual({ bytes });
  });

  it('cleared en alta es un estado que la interfaz nunca ofrece, y buildRecipePayload lo rechaza en vez de enviar null', () => {
    // R36: "el sistema NO DEBE enviar el valor nulo explícito en el alta". El control de quitar
    // no se ofrece en modo alta (`recipe-image-field.tsx`), así que si este estado llegara de
    // todos modos sería un error de programación del formulario -no un caso válido para el que
    // haya que inventar una representación-.
    expect(() =>
      buildRecipePayload('create', baseState({ image: { kind: 'cleared' } })),
    ).toThrow();
  });
});

describe('buildRecipePayload — el porcentaje viaja con una única sustitución de coma por punto (R1, R25)', () => {
  it('sustituye la coma por un punto sin pasar por número', () => {
    const payload = buildRecipePayload('edit', baseState({ lines: [line({ percentage: '92,5' })] }));

    expect(payload.lines[0]?.percentage).toBe('92.5');
    expect(typeof payload.lines[0]?.percentage).toBe('string');
  });

  it('un porcentaje ya escrito con punto se copia tal cual', () => {
    const payload = buildRecipePayload('edit', baseState({ lines: [line({ percentage: '7.50' })] }));

    expect(payload.lines[0]?.percentage).toBe('7.50');
  });

  it('no redondea ni convierte: "100,00" sale "100.00", no "100"', () => {
    const payload = buildRecipePayload('edit', baseState({ lines: [line({ percentage: '100,00' })] }));

    expect(payload.lines[0]?.percentage).toBe('100.00');
  });
});

describe('buildRecipePayload — cada paso viaja como el documento del contrato (QC-64 R5)', () => {
  it('el documento del estado sale TAL CUAL, sin proyección de texto de por medio', () => {
    const state = baseState({ steps: [step('Mezclar'), step('Comprobar', 'step-check')] });

    const payload = buildRecipePayload('edit', state);

    expect(payload.steps).toEqual([
      { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] },
      { blocks: [{ kind: 'paragraph', spans: [{ text: 'Comprobar' }] }] },
    ]);
    // La clave local de React es de PRESENTACIÓN: nunca cruza al contrato.
    expect(payload.steps[0]).not.toHaveProperty('key');
    expect(payload.steps[0]).not.toHaveProperty('text');
    // El `type` DESAPARECIÓ del contrato (QC-62 R9): no vuelve por la puerta de atrás.
    expect(payload.steps[0]).not.toHaveProperty('type');
    expect(payload.steps[0]).not.toHaveProperty('body');
  });

  it('R5: el paso con marcas y lista de verificación pasa recipeStepSchema y NO lleva ninguna clave que el contrato no declare', () => {
    // El documento que produciría el editor: dos marcas combinadas sobre el mismo fragmento, un
    // párrafo en blanco y una lista de verificación. Es lo que el estado guarda desde T4.
    const documento: RecipeStepDocument = {
      blocks: [
        {
          kind: 'paragraph',
          spans: [{ text: 'Mezclar ' }, { text: 'despacio', bold: true, italic: true }],
        },
        { kind: 'paragraph', spans: [] },
        { kind: 'checklist', items: [{ spans: [{ text: 'Balanza calibrada' }] }] },
      ],
    };

    const payload = buildRecipePayload('edit', baseState({ steps: [stepDoc(documento)] }));

    // 1. Va el MISMO documento, no una copia aplanada ni recortada.
    expect(payload.steps).toEqual([documento]);

    // 2. Lo acepta el esquema del contrato SIN ninguna limpieza posterior. `recipeStepSchema` es
    //    `.strict()` (QC-62 R4): si `buildRecipePayload` colara una clave de más, esto sería rojo.
    const parsed = recipeStepSchema.safeParse(payload.steps[0]);
    expect(parsed.success).toBe(true);

    // 3. Y ninguna clave extra, dicha en negativo y clave a clave: ni estado de marcado, ni tipo
    //    de paso, ni identificador de bloque, ni versión (R5).
    const serializado = JSON.stringify(payload.steps[0]);
    for (const prohibida of ['checked', 'type', 'id', 'version', 'key', 'body']) {
      expect(serializado).not.toContain(`"${prohibida}"`);
    }
    expect(Object.keys(payload.steps[0] as object)).toEqual(['blocks']);
    const primero = (payload.steps[0] as RecipeStepDocument).blocks[0];
    expect(Object.keys(primero as object).sort()).toEqual(['kind', 'spans']);
  });

  it('el texto se copia TAL CUAL: ni se recorta ni se parte por los saltos de línea (QC-62 R5)', () => {
    const payload = buildRecipePayload('edit', baseState({ steps: [step('  Mezclar\ndespacio  ')] }));

    expect(payload.steps).toEqual([
      { blocks: [{ kind: 'paragraph', spans: [{ text: '  Mezclar\ndespacio  ' }] }] },
    ]);
  });
});

describe('buildRecipePayload — los pasos salen en el orden mostrado (R32)', () => {
  it('payload.steps sigue exactamente el orden de state.steps', () => {
    const state = baseState({ steps: [step('Mezclar'), step('Calentar'), step('Enfriar')] });

    const payload = buildRecipePayload('edit', state);

    expect(stepTexts(payload.steps)).toEqual(['Mezclar', 'Calentar', 'Enfriar']);
  });

  it('un orden distinto en state.steps produce un payload.steps distinto', () => {
    // Prueba complementaria en negativo: si `buildRecipePayload` ignorase el orden de entrada
    // -por ejemplo ordenando alfabéticamente-, esta aserción lo delataría.
    const reordenado = baseState({ steps: [step('Enfriar'), step('Mezclar'), step('Calentar')] });

    const payload = buildRecipePayload('edit', reordenado);

    expect(stepTexts(payload.steps)).toEqual(['Enfriar', 'Mezclar', 'Calentar']);
  });
});

describe('buildRecipePayload — las líneas van completas y quitar una la saca de la lista (R1, R22)', () => {
  it('cada línea viaja con productId y percentage, sin unidad ni "key" ni "productName"', () => {
    const theLine = line({ productId: 'p-9', percentage: '3.5' });

    const payload = buildRecipePayload('edit', baseState({ lines: [theLine] }));

    expect(payload.lines[0]).toEqual({ productId: 'p-9', percentage: '3.5' });
    expect(payload.lines[0]).not.toHaveProperty('key');
    expect(payload.lines[0]).not.toHaveProperty('productName');
    expect(payload.lines[0]).not.toHaveProperty('unitId');
  });

  it('quitar una línea de state.lines la excluye del payload enviado', () => {
    const kept = line({ key: 'l1', productId: 'p1' });
    const removed = line({ key: 'l2', productId: 'p2' });

    // Con las dos líneas: el payload lleva las dos.
    const withBoth = buildRecipePayload('edit', baseState({ lines: [kept, removed] }));
    expect(withBoth.lines.map((l) => l.productId)).toEqual(['p1', 'p2']);

    // Quitar una línea en la interfaz es exactamente esto: `RecipeLinesField.removeLine`
    // filtra el array y llama a `onChange` con el resultado -así llega aquí una `state.lines`
    // sin la línea quitada, nunca un flag que la marque como borrada-.
    const afterRemoval = buildRecipePayload('edit', baseState({ lines: [kept] }));
    expect(afterRemoval.lines).toHaveLength(1);
    expect(afterRemoval.lines[0]?.productId).toBe('p1');
    expect(afterRemoval.lines.some((l) => l.productId === 'p2')).toBe(false);
  });
});
