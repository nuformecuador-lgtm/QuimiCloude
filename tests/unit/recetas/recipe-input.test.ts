// Contrato de entrada de receta en porcentaje. Validacion de borde: el esquema exige
// porcentaje en vez de cantidad y unidad, ordena las lineas, exige que su suma sea exacta, y
// el test explicito de que el esquema no colapsa `undefined` y `null` del campo `image`.
//
// El paso dejo de ser `{ body, type }` y es un DOCUMENTO. La forma del documento en si la
// cubre `recipe-step-document.test.ts`.
//
// Las herramientas viajan aparte de las lineas: entero positivo, sin repetir producto, y en la
// edicion omitirlas (conservar) no es lo mismo que mandar `[]` (quitarlas).

import {
  MAX_STEP_ELEMENTS,
  MAX_TOOL_QUANTITY,
  createRecipeSchema,
  createRecipeVersionSchema,
  recipeLineSchema,
  recipeToolSchema,
  recipeToolsSchema,
  updateRecipeSchema,
  updateRecipeVersionSchema,
} from '@/lib/modules/recetas/domain/recipe-input';
import * as contrato from '@/lib/modules/recetas';
import { pageQuerySchema } from '@/lib/modules/recetas/domain/page';

const LINEA_VALIDA = {
  productId: '11111111-1111-4111-8111-111111111111',
  percentage: '100',
};

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: 'Formula base',
  steps: [
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] },
    { blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Envasar' }] }] }] },
  ],
  lines: [LINEA_VALIDA],
};

describe('recipeLineSchema — porcentaje invalido (R2)', () => {
  it.each(['0', '-1', '100.01', '12.345', 'abc'])(
    'rechaza "%s" con el issue en la propia linea',
    (percentage) => {
      const result = recipeLineSchema.safeParse({ ...LINEA_VALIDA, percentage });
      expect(result.success).toBe(false);
    },
  );

  it.each(['0', '-1', '100.01', '12.345', 'abc'])(
    'la linea invalida "%s" ubica el issue en [lines, i, percentage] dentro de una receta',
    (percentage) => {
      const result = createRecipeSchema.safeParse({
        ...RECETA_VALIDA,
        lines: [LINEA_VALIDA, { ...LINEA_VALIDA, percentage, productId: '22222222-2222-4222-8222-222222222222' }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const rutas = result.error.issues.map((issue) => issue.path);
        expect(rutas).toContainEqual(['lines', 1, 'percentage']);
      }
    },
  );

  it('acepta un porcentaje valido de hasta 3 enteros y 2 decimales', () => {
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, percentage: '97.5' }).success).toBe(true);
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, percentage: '0.01' }).success).toBe(true);
    expect(recipeLineSchema.safeParse({ ...LINEA_VALIDA, percentage: '100.00' }).success).toBe(true);
  });
});

describe('recipeLineSchema — sin unidad (R5)', () => {
  it('rechaza una linea que trae unitId', () => {
    const result = recipeLineSchema.safeParse({
      ...LINEA_VALIDA,
      unitId: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.success).toBe(false);
  });
});

describe('recipeLinesSchema — suma distinta de 100,00 % (R3)', () => {
  it('rechaza 97,50 % con el issue general en [lines]', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [
        { productId: '11111111-1111-4111-8111-111111111111', percentage: '90' },
        { productId: '22222222-2222-4222-8222-222222222222', percentage: '7.5' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const rutas = result.error.issues.map((issue) => issue.path);
      expect(rutas).toContainEqual(['lines']);
    }
  });
});

describe('recipeLinesSchema — receta sin ninguna linea (R3, R23)', () => {
  it('rechaza lines: [] con el mismo issue en [lines], en alta y en edicion', () => {
    const alta = createRecipeSchema.safeParse({ ...RECETA_VALIDA, lines: [] });
    const edicion = updateRecipeSchema.safeParse({ ...RECETA_VALIDA, lines: [] });

    expect(alta.success).toBe(false);
    expect(edicion.success).toBe(false);
    if (!alta.success) {
      expect(alta.error.issues.map((issue) => issue.path)).toContainEqual(['lines']);
    }
    if (!edicion.success) {
      expect(edicion.error.issues.map((issue) => issue.path)).toContainEqual(['lines']);
    }
  });

  it('rechaza la ausencia de la clave lines con el mismo issue en [lines], en alta y en edicion', () => {
    const sinLineas = { name: RECETA_VALIDA.name, description: RECETA_VALIDA.description, steps: RECETA_VALIDA.steps };
    const alta = createRecipeSchema.safeParse(sinLineas);
    const edicion = updateRecipeSchema.safeParse(sinLineas);

    expect(alta.success).toBe(false);
    expect(edicion.success).toBe(false);
    if (!alta.success) {
      expect(alta.error.issues.map((issue) => issue.path)).toContainEqual(['lines']);
    }
    if (!edicion.success) {
      expect(edicion.error.issues.map((issue) => issue.path)).toContainEqual(['lines']);
    }
  });
});

describe('recipeLinesSchema — suma exacta de 100,00 % (R4)', () => {
  it('acepta 97,5 + 2,5', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [
        { productId: '11111111-1111-4111-8111-111111111111', percentage: '97.5' },
        { productId: '22222222-2222-4222-8222-222222222222', percentage: '2.5' },
      ],
    });
    expect(result.success).toBe(true);
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
      // Debe ser un fallo de zod (invalid_input desde el borde), no un RecipeDuplicateNameError
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
      lines: [LINEA_VALIDA, { ...LINEA_VALIDA, percentage: '50' }],
    });
    expect(result.success).toBe(false);
  });

  it('acepta lineas con productos distintos que suman 100 %', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [
        { ...LINEA_VALIDA, percentage: '60' },
        { productId: '22222222-2222-4222-8222-222222222222', percentage: '40' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

/** Paso valido del contrato: el documento mas corto que existe, un parrafo de un fragmento. */
function paso(text: string) {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] };
}

describe('createRecipeSchema — el documento del paso se valida EN EL BORDE (QC-62 R6)', () => {
  it('rechaza el documento invalido antes de que llegue al caso de uso', () => {
    // R6: el esquema de alta es la frontera. Lo que no tiene la forma admitida no cruza, y
    // rechaza el ALTA ENTERA, no solo el paso.
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: 'no es una lista' }).success).toBe(
      false,
    );
    // La cadena suelta dejo de ser un paso valido: hoy un paso es un DOCUMENTO (QC-62 R1).
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: ['Mezclar'] }).success).toBe(
      false,
    );
    // Y el campo `type` que desaparecio del contrato se rechaza como cualquier clave extra (R4, R9).
    expect(
      createRecipeSchema.safeParse({
        ...RECETA_VALIDA,
        steps: [{ ...paso('Mezclar'), type: 'texto' }],
      }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [{ body: 'Mezclar' }] }).success,
    ).toBe(false);
  });

  it('acepta un texto raro pero bien formado: el borde juzga la FORMA, nunca el contenido', () => {
    // R6 en positivo, y R5: `  <script>  ` y los emojis son texto valido; el borde no opina
    // sobre lo que dice el paso, solo sobre como esta hecho.
    const raro = createRecipeSchema.parse({
      ...RECETA_VALIDA,
      steps: [paso('  <script>alert(1)</script> 50% H2O2 — 15 °C  ')],
    });
    expect(raro.steps[0]).toEqual(paso('  <script>alert(1)</script> 50% H2O2 — 15 °C  '));
  });
});

describe('createRecipeSchema — la posicion del paso que falla (QC-62 R8)', () => {
  it('el issue del segundo paso invalido apunta a `steps` con el indice 1', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      steps: [paso('Mezclar'), paso('   '), paso('Envasar')],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // El error identifica QUE paso falla por su posicion en la lista: la da zod sola en el
      // `path` del issue, no hay que componer ningun mensaje a mano (`design.md > 3`).
      const rutas = result.error.issues.map((issue) => issue.path.slice(0, 2));
      expect(rutas).toContainEqual(['steps', 1]);
      expect(rutas).not.toContainEqual(['steps', 0]);
      expect(rutas).not.toContainEqual(['steps', 2]);
    }
  });

  it('el issue de una clave extra apunta al paso y al bloque que la trae', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      steps: [paso('Mezclar'), { blocks: [{ kind: 'paragraph', spans: [], level: 2 }] }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.slice(0, 2))).toContainEqual(['steps', 1]);
    }
  });
});

describe('createRecipeSchema — pasos vacios y lista de pasos (R19, R20; QC-62 R7, R13)', () => {
  it('rechaza el paso sin contenido y persiste lista vacia cuando no se indican pasos', () => {
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [paso('Mezclar'), paso('')] }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [paso('Mezclar'), paso('   ')] })
        .success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [{ blocks: [] }] }).success,
    ).toBe(false);

    // R13: sin `steps` sale `[]`, no `undefined`. Se mantiene lo vigente de QC-24/QC-25.
    const { name, description, lines } = RECETA_VALIDA;
    const parsed = createRecipeSchema.parse({ name, description, lines });
    expect(parsed.steps).toEqual([]);
  });

  it('acepta 50 pasos y rechaza 51 (R13)', () => {
    const pasos50 = Array.from({ length: 50 }, (_, i) => paso(`Paso ${i}`));
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: pasos50 }).success).toBe(true);

    const pasos51 = Array.from({ length: 51 }, (_, i) => paso(`Paso ${i}`));
    expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: pasos51 }).success).toBe(false);
  });

  it('el paso ya no tiene tope de caracteres, pero si tope de elementos (QC-62 R11, R12)', () => {
    // Los 1.000 caracteres por paso de QC-24 R20 ESTAN DEROGADOS por QC-62 R12.
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [paso('a'.repeat(5000))] }).success,
    ).toBe(true);

    // Lo que si acota el paso es el numero de elementos, y el tope es la constante del
    // contrato: nadie lo reescribe a mano aqui (R11).
    const parrafos = (n: number) => ({
      blocks: Array.from({ length: n }, (_, i) => ({
        kind: 'paragraph',
        spans: [{ text: `P${i}` }],
      })),
    });
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [parrafos(MAX_STEP_ELEMENTS)] })
        .success,
    ).toBe(true);
    expect(
      createRecipeSchema.safeParse({ ...RECETA_VALIDA, steps: [parrafos(MAX_STEP_ELEMENTS + 1)] })
        .success,
    ).toBe(false);
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

const MAQUINA_A = '33333333-3333-4333-8333-333333333333';
const MAQUINA_B = '44444444-4444-4444-8444-444444444444';
const HERRAMIENTA_VALIDA = { productId: MAQUINA_A, quantity: 2 };

describe('recipeToolSchema / recipeToolsSchema — forma de una herramienta', () => {
  it('R1: acepta producto y cantidad entera positiva, hasta el tope de la columna', () => {
    expect(recipeToolSchema.safeParse(HERRAMIENTA_VALIDA).success).toBe(true);
    expect(recipeToolSchema.safeParse({ productId: MAQUINA_A, quantity: 1 }).success).toBe(true);
    expect(recipeToolSchema.safeParse({ productId: MAQUINA_A, quantity: MAX_TOOL_QUANTITY }).success).toBe(true);
    expect(recipeToolSchema.safeParse({ productId: MAQUINA_A, quantity: MAX_TOOL_QUANTITY + 1 }).success).toBe(false);
    expect(MAX_TOOL_QUANTITY).toBe(2147483647);
  });

  it.each([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ["'2'", '2'],
  ])('R6: rechaza la cantidad %s', (_etiqueta, quantity) => {
    expect(recipeToolSchema.safeParse({ productId: MAQUINA_A, quantity }).success).toBe(false);
  });

  it('R6: rechaza la cantidad ausente y el producto ausente o que no es uuid', () => {
    expect(recipeToolSchema.safeParse({ productId: MAQUINA_A }).success).toBe(false);
    expect(recipeToolSchema.safeParse({ quantity: 1 }).success).toBe(false);
    expect(recipeToolSchema.safeParse({ productId: 'no-uuid', quantity: 1 }).success).toBe(false);
  });

  it('rechaza una clave extra', () => {
    expect(recipeToolSchema.safeParse({ ...HERRAMIENTA_VALIDA, percentage: '10' }).success).toBe(false);
  });

  it('R4: rechaza dos herramientas con el mismo producto', () => {
    const result = recipeToolsSchema.safeParse([
      { productId: MAQUINA_A, quantity: 1 },
      { productId: MAQUINA_A, quantity: 3 },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'No puede haber dos herramientas con el mismo producto.',
      );
    }
    expect(
      recipeToolsSchema.safeParse([
        { productId: MAQUINA_A, quantity: 1 },
        { productId: MAQUINA_B, quantity: 1 },
      ]).success,
    ).toBe(true);
  });

  it('R25: el issue de una fila invalida apunta a [tools, i, campo] dentro de la receta', () => {
    const result = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      tools: [HERRAMIENTA_VALIDA, { productId: MAQUINA_B, quantity: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['tools', 1, 'quantity']]);
    }
  });

  it('el contrato publico del modulo exporta los esquemas y el tope', () => {
    expect(contrato.recipeToolSchema).toBe(recipeToolSchema);
    expect(contrato.recipeToolsSchema).toBe(recipeToolsSchema);
    expect(contrato.MAX_TOOL_QUANTITY).toBe(MAX_TOOL_QUANTITY);
  });
});

describe('tools en los cuatro esquemas — omitir no es lo mismo que []', () => {
  const EDICION = { ...RECETA_VALIDA };

  it('R2, R18: el alta sin tools las deja vacias', () => {
    const result = createRecipeSchema.parse(RECETA_VALIDA);
    expect(result.tools).toEqual([]);
  });

  it('R1: el alta conserva las herramientas enviadas', () => {
    const result = createRecipeSchema.parse({ ...RECETA_VALIDA, tools: [HERRAMIENTA_VALIDA] });
    expect(result.tools).toEqual([HERRAMIENTA_VALIDA]);
  });

  it('R17, R18: la edicion sin tools da undefined y con [] da [], distinguibles', () => {
    const omitidas = updateRecipeSchema.parse(EDICION);
    const vacias = updateRecipeSchema.parse({ ...EDICION, tools: [] });
    expect('tools' in omitidas ? omitidas.tools : undefined).toBeUndefined();
    expect(vacias.tools).toEqual([]);
    expect(omitidas.tools).not.toEqual(vacias.tools);
  });

  it('R11: el alta de version sin tools da undefined (copia de la original)', () => {
    const result = createRecipeVersionSchema.parse({ name: 'Version A' });
    expect(result.tools).toBeUndefined();
    expect(createRecipeVersionSchema.parse({ name: 'Version A', tools: [] }).tools).toEqual([]);
  });

  it('R17: la edicion de version sin tools da undefined y con [] da []', () => {
    const base = { name: 'Version A', lines: [LINEA_VALIDA] };
    expect(updateRecipeVersionSchema.parse(base).tools).toBeUndefined();
    expect(updateRecipeVersionSchema.parse({ ...base, tools: [] }).tools).toEqual([]);
  });

  it('R4, R6: los cuatro esquemas aplican la misma validacion de herramientas', () => {
    const repetidas = [HERRAMIENTA_VALIDA, HERRAMIENTA_VALIDA];
    const cantidadCero = [{ productId: MAQUINA_A, quantity: 0 }];
    for (const tools of [repetidas, cantidadCero]) {
      expect(createRecipeSchema.safeParse({ ...RECETA_VALIDA, tools }).success).toBe(false);
      expect(updateRecipeSchema.safeParse({ ...EDICION, tools }).success).toBe(false);
      expect(createRecipeVersionSchema.safeParse({ name: 'V', tools }).success).toBe(false);
      expect(updateRecipeVersionSchema.safeParse({ name: 'V', lines: [LINEA_VALIDA], tools }).success).toBe(false);
    }
  });

  it('R7: lineas al 100 % mas herramientas pasa; las herramientas no cuentan en la suma', () => {
    expect(
      createRecipeSchema.safeParse({
        ...RECETA_VALIDA,
        tools: [{ productId: MAQUINA_A, quantity: 50 }],
      }).success,
    ).toBe(true);
    const incompletas = createRecipeSchema.safeParse({
      ...RECETA_VALIDA,
      lines: [{ ...LINEA_VALIDA, percentage: '60' }],
      tools: [{ productId: MAQUINA_A, quantity: 40 }],
    });
    expect(incompletas.success).toBe(false);
  });
});
