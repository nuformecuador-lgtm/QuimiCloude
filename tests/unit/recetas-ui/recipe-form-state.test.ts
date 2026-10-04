import { describe, expect, it } from 'vitest';

import {
  buildRecipePayload,
  buildRecipeVersionPayload,
  extractGeneralToolsError,
  extractToolErrors,
  toToolFormValues,
  type RecipeFormState,
  type RecipeToolFormValue,
} from '@/app/(private)/produccion/formulas/components';
import {
  createRecipeSchema,
  createRecipeVersionSchema,
  updateRecipeSchema,
  type RecipeToolView,
} from '@/lib/modules/recetas';

const TOOL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOOL_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const MESSAGES = { productId: 'Elige una herramienta.', quantity: 'Cantidad no válida.' };

function tool(overrides: Partial<RecipeToolFormValue> = {}): RecipeToolFormValue {
  return { key: 't', productId: TOOL_A, productName: 'Agitador', quantity: '1', ...overrides };
}

function state(tools: readonly RecipeToolFormValue[]): RecipeFormState {
  return {
    name: 'Jabón',
    description: '',
    lines: [{ key: 'l', productId: PRODUCT, productName: 'Agua', percentage: '100', productUnitId: null }],
    tools,
    steps: [],
    image: { kind: 'untouched' },
  };
}

describe('buildRecipePayload y buildRecipeVersionPayload — herramientas', () => {
  it('R26 — el payload lleva siempre la clave tools, también vacía, en los dos builders', () => {
    expect(buildRecipePayload('create', state([])).tools).toStrictEqual([]);
    expect(buildRecipePayload('edit', state([])).tools).toStrictEqual([]);
    expect('tools' in buildRecipeVersionPayload({ name: 'V', lines: [], tools: [] })).toBe(true);
  });

  it('R26 — cada herramienta viaja como { productId, quantity } con la cantidad entera, sin key ni nombre', () => {
    const payload = buildRecipePayload(
      'edit',
      state([tool({ key: 'k1', quantity: '3' }), tool({ key: 'k2', productId: TOOL_B, quantity: '12' })]),
    );

    expect(payload.tools).toStrictEqual([
      { productId: TOOL_A, quantity: 3 },
      { productId: TOOL_B, quantity: 12 },
    ]);
    expect(updateRecipeSchema.safeParse(payload).success).toBe(true);
  });

  it('R26 — la herramienta no disponible viaja tal cual, con su cantidad', () => {
    const tools = [tool({ productName: null, quantity: '2' })];

    expect(buildRecipePayload('create', state(tools)).tools).toStrictEqual([
      { productId: TOOL_A, quantity: 2 },
    ]);
    expect(buildRecipeVersionPayload({ name: 'V', lines: [], tools }).tools).toStrictEqual([
      { productId: TOOL_A, quantity: 2 },
    ]);
  });

  it('R26 — el payload de alta con herramientas pasa el esquema de alta del contrato', () => {
    const payload = buildRecipePayload('create', state([tool({ quantity: '5' })]));
    expect(createRecipeSchema.safeParse(payload).success).toBe(true);
  });
});

describe('toToolFormValues — precarga del tab', () => {
  const views: readonly RecipeToolView[] = [
    { id: 'r1', productId: TOOL_A, productName: 'Agitador', quantity: 2 },
    { id: 'r2', productId: TOOL_B, productName: null, quantity: 7 },
  ];

  it('R22 — el estado inicial de edición sale de recipe.tools con nombre y cantidad, en orden', () => {
    const values = toToolFormValues(views);
    expect(values.map((v) => [v.productId, v.productName, v.quantity])).toEqual([
      [TOOL_A, 'Agitador', '2'],
      [TOOL_B, null, '7'],
    ]);
  });

  it('R23 — la precarga de alta de versión conserva la no disponible y vuelve al payload intacta', () => {
    const payload = buildRecipeVersionPayload({ name: 'V', lines: [], tools: toToolFormValues(views) });
    expect(payload.tools).toStrictEqual([
      { productId: TOOL_A, quantity: 2 },
      { productId: TOOL_B, quantity: 7 },
    ]);
  });

  it('cada herramienta precargada tiene su propia clave local, distinta del id del detalle', () => {
    const values = toToolFormValues(views);
    expect(new Set(values.map((v) => v.key)).size).toBe(2);
    expect(values.map((v) => v.key)).not.toContain('r1');
  });
});

describe('extractToolErrors — errores por fila a partir del path', () => {
  function issuesOf(tools: readonly RecipeToolFormValue[]) {
    const parsed = createRecipeVersionSchema.safeParse(
      buildRecipeVersionPayload({ name: 'V', lines: [], tools }),
    );
    if (parsed.success) throw new Error('se esperaba un rechazo');
    return parsed.error.issues;
  }

  it('R25 — fila sin herramienta: error de producto en su índice, con el texto propio', () => {
    const errors = extractToolErrors(issuesOf([tool(), tool({ productId: '', productName: '' })]), MESSAGES);
    expect(errors).toEqual({ 1: { productId: MESSAGES.productId } });
  });

  it.each(['', '0'])('R25 — cantidad %j: error de cantidad en su fila', (quantity) => {
    const errors = extractToolErrors(issuesOf([tool({ quantity })]), MESSAGES);
    expect(errors).toEqual({ 0: { quantity: MESSAGES.quantity } });
  });

  it('R25 — nunca pinta el mensaje en inglés de zod', () => {
    const errors = extractToolErrors(issuesOf([tool({ quantity: '0' })]), MESSAGES);
    expect(JSON.stringify(errors)).not.toMatch(/Too small|expected/);
  });

  it('el producto repetido no apunta a una fila: sale como error general', () => {
    const issues = issuesOf([tool({ key: 'a' }), tool({ key: 'b' })]);
    expect(extractToolErrors(issues, MESSAGES)).toEqual({});
    expect(extractGeneralToolsError(issues)).toBe(
      'No puede haber dos herramientas con el mismo producto.',
    );
  });
});
