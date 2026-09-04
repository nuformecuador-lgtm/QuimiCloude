import { describe, expect, it } from 'vitest';

import {
  buildRecipePayload,
  type RecipeFormState,
  type RecipeLineFormValue,
  type RecipeStepFormValue,
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
    quantity: '1.0000',
    unitId: 'unit-1',
    ...overrides,
  };
}

function step(text: string, key = `step-${text}`): RecipeStepFormValue {
  return { key, text };
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

describe('buildRecipePayload — la cantidad viaja como la MISMA cadena que se escribió (R29)', () => {
  it.each(['0.1005', '1.0000', '10.0001'])(
    'copia "%s" tal cual, sin pasar por conversión a coma flotante',
    (quantity) => {
      const payload = buildRecipePayload('edit', baseState({ lines: [line({ quantity })] }));

      // Igualdad de CADENA, no de número: `1.0000` !== `String(1)`, y una conversión a
      // `Number`/`parseFloat` de por medio perdería los ceros o redondearía `0.1005`.
      expect(payload.lines[0]?.quantity).toBe(quantity);
      expect(typeof payload.lines[0]?.quantity).toBe('string');
    },
  );
});

describe('buildRecipePayload — los pasos salen en el orden mostrado (R32)', () => {
  it('payload.steps sigue exactamente el orden de state.steps', () => {
    const state = baseState({ steps: [step('Mezclar'), step('Calentar'), step('Enfriar')] });

    const payload = buildRecipePayload('edit', state);

    expect(payload.steps).toEqual(['Mezclar', 'Calentar', 'Enfriar']);
  });

  it('un orden distinto en state.steps produce un payload.steps distinto', () => {
    // Prueba complementaria en negativo: si `buildRecipePayload` ignorase el orden de entrada
    // -por ejemplo ordenando alfabéticamente-, esta aserción lo delataría.
    const reordenado = baseState({ steps: [step('Enfriar'), step('Mezclar'), step('Calentar')] });

    const payload = buildRecipePayload('edit', reordenado);

    expect(payload.steps).toEqual(['Enfriar', 'Mezclar', 'Calentar']);
  });
});

describe('buildRecipePayload — las líneas van completas y quitar una la saca de la lista (R22)', () => {
  it('cada línea viaja con productId, quantity y unitId; sin "key" ni "productName"', () => {
    const theLine = line({ productId: 'p-9', quantity: '3.5', unitId: 'u-9' });

    const payload = buildRecipePayload('edit', baseState({ lines: [theLine] }));

    expect(payload.lines[0]).toEqual({ productId: 'p-9', quantity: '3.5', unitId: 'u-9' });
    expect(payload.lines[0]).not.toHaveProperty('key');
    expect(payload.lines[0]).not.toHaveProperty('productName');
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
