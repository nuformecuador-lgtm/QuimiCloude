import { createProductWithFirstBatchSchema } from '@/lib/modules/inventario';

/**
 * Esquema de entrada del alta CON su primer lote (QC-90, T3; `design.md > 4`). Cubre **R2,
 * R4, R5, R8, R10, R11, R12, R14 y R24**.
 *
 * QC-81 (T4) anade `purchaseDate`: cubre **R6** y el lado ENTRADA de **R2** y **R8** (el bloque
 * `QC-81 — purchaseDate`).
 *
 * Se importa por el CONTRATO PUBLICO del modulo, no por la ruta profunda: el formulario de
 * cliente lo consume por ahi (R24, R27), y si el barrel dejara de exportarlo este archivo no
 * compilaria.
 */

/** Alta valida minima: producto completo, presentacion y un solo costo. */
const VALIDA = {
  name: 'Cloro Granulado',
  stock: 10,
  qtyAlert: 2,
  presentationId: '11111111-1111-4111-8111-111111111111',
  unitCost: '12.5000',
} as const;

/** Los `path` de los issues de un rechazo, como cadenas, para comparar sin ceremonia. */
function camposRechazados(input: unknown): readonly string[] {
  const result = createProductWithFirstBatchSchema.safeParse(input);
  expect(result.success, 'se esperaba un rechazo y el esquema acepto la entrada').toBe(false);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createProductWithFirstBatchSchema', () => {
  it('acepta el alta con los campos del producto, la presentacion y un solo costo', () => {
    // R2, R4, R12: lote y fecha de expiracion son opcionales y su ausencia no rechaza nada.
    const parsed = createProductWithFirstBatchSchema.parse({ ...VALIDA });

    expect(parsed.name).toBe('Cloro Granulado');
    expect(parsed.presentationId).toBe(VALIDA.presentationId);
    expect(parsed.unitCost).toBe('12.5000');
  });

  it('acepta el lote y la fecha de expiracion cuando vienen, y tambien cuando vienen en nulo', () => {
    // R12, R13
    const conDatos = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      lot: 'L-2026-01',
      expiryDate: '2026-12-31',
    });
    expect(conDatos.lot).toBe('L-2026-01');
    expect(conDatos.expiryDate).toBe('2026-12-31');

    const enNulo = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      lot: null,
      expiryDate: null,
    });
    expect(enNulo.lot).toBeNull();
    expect(enNulo.expiryDate).toBeNull();
  });

  it('acepta el importe con la forma de decimal(14,4) y rechaza cualquier otra', () => {
    // R4: hasta 10 enteros y 4 decimales, sin signo, sin notacion cientifica y sin coma.
    for (const valido of ['1', '0.0001', '12.5', '9999999999.9999']) {
      expect(
        createProductWithFirstBatchSchema.safeParse({ ...VALIDA, unitCost: valido }).success,
        `${valido} deberia aceptarse`,
      ).toBe(true);
    }

    for (const invalido of ['12,5', '-1', '1.00005', '12345678901', '1e3', ' ', 'abc']) {
      expect(camposRechazados({ ...VALIDA, unitCost: invalido })).toContain('unitCost');
    }
  });

  it('rechaza el importe de todos ceros senalando el campo del importe recibido', () => {
    // R5: '0', '0.0' y '0.0000' se descartan LEXICAMENTE, no convirtiendo a numero.
    for (const cero of ['0', '0.0', '0.0000']) {
      expect(camposRechazados({ ...VALIDA, unitCost: cero })).toEqual(['unitCost']);
      expect(
        camposRechazados({ ...VALIDA, unitCost: undefined, totalCost: cero }),
      ).toEqual(['totalCost']);
    }
  });

  it('rechaza un campo desconocido en vez de ignorarlo en silencio', () => {
    // R24: `strictObject`. Quien manda un campo de mas cree haber guardado algo que no se
    // guardo; ignorarlo es peor que rechazarlo.
    // El issue de `strictObject` no cuelga de un campo: lleva `code: 'unrecognized_keys'` y
    // la lista de claves sobrantes, que es donde hay que mirar.
    for (const desconocido of ['cost', 'batchId', 'unitCostNumber']) {
      const result = createProductWithFirstBatchSchema.safeParse({
        ...VALIDA,
        [desconocido]: '10',
      });

      expect(result.success, `${desconocido} deberia rechazarse`).toBe(false);
      if (result.success) continue;
      const rechazo = result.error.issues.find((issue) => issue.code === 'unrecognized_keys');
      expect(rechazo, `${desconocido} no produjo un rechazo de campo desconocido`).toBeDefined();
      expect(rechazo && 'keys' in rechazo ? rechazo.keys : []).toContain(desconocido);
    }
  });

  it('recorta el lote y rechaza el que pasa de 60 caracteres una vez recortado', () => {
    // R14
    const parsed = createProductWithFirstBatchSchema.parse({ ...VALIDA, lot: '  L-2026-01  ' });
    expect(parsed.lot).toBe('L-2026-01');

    expect(createProductWithFirstBatchSchema.safeParse({ ...VALIDA, lot: 'a'.repeat(60) }).success).toBe(
      true,
    );
    expect(camposRechazados({ ...VALIDA, lot: 'a'.repeat(61) })).toEqual(['lot']);
    // Un lote de solo espacios queda vacio al recortar: no es un lote, y `trim()` antes de
    // `min(1)` es lo que lo caza.
    expect(camposRechazados({ ...VALIDA, lot: '   ' })).toEqual(['lot']);
  });

  it('rechaza la presentacion ausente o sin forma de uuid senalando presentationId', () => {
    // R2: la presentacion es obligatoria en el alta, y solo se valida su FORMA -que exista lo
    // garantiza la clave foranea, no zod-.
    expect(camposRechazados({ ...VALIDA, presentationId: undefined })).toEqual(['presentationId']);
    expect(camposRechazados({ ...VALIDA, presentationId: 'no-es-un-uuid' })).toEqual([
      'presentationId',
    ]);
  });

  it('rechaza la fecha de expiracion que no es una fecha civil YYYY-MM-DD', () => {
    // R13: viaja como fecha civil, no como instante. Un `2026-12-31T00:00:00Z` no entra.
    expect(camposRechazados({ ...VALIDA, expiryDate: '31/12/2026' })).toEqual(['expiryDate']);
    expect(camposRechazados({ ...VALIDA, expiryDate: '2026-12-31T00:00:00Z' })).toEqual([
      'expiryDate',
    ]);
  });

  it('rechaza el alta sin ninguno de los dos costos senalando LOS DOS campos', () => {
    // R11
    expect(camposRechazados({ ...VALIDA, unitCost: undefined })).toEqual(['unitCost', 'totalCost']);
    expect(camposRechazados({ ...VALIDA, unitCost: null, totalCost: null })).toEqual([
      'unitCost',
      'totalCost',
    ]);
  });

  it('rechaza el alta con solo costo total y existencia 0 senalando el campo de la existencia', () => {
    // R8: no hay costo unitario posible y la columna es NOT NULL, asi que el rechazo se pinta
    // en EXISTENCIA -no en el costo-, que es el dato que hay que corregir.
    const result = createProductWithFirstBatchSchema.safeParse({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '100',
      stock: 0,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toEqual(['stock']);
    expect(result.error.issues[0]?.message).toMatch(/existencia de 1 o mas/i);
  });

  it('rechaza el alta con solo costo total cuyo unitario derivado redondea a cero, en totalCost', () => {
    // R9: 0.0001 / 5 = 0.0000 en cuatro decimales, y la columna exige `> 0`.
    const rechazados = camposRechazados({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '0.0001',
      stock: 5,
    });
    expect(rechazados).toEqual(['totalCost']);
  });

  it('acepta el alta con solo costo total cuando el derivado es guardable', () => {
    // R7, R8: con existencia de 1 o mas y un derivado mayor que cero no hay rechazo. Derivar
    // no es del esquema, es del caso de uso: aqui solo se comprueba que deja pasar.
    const parsed = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '10',
      stock: 3,
    });
    expect(parsed.totalCost).toBe('10');
    expect(parsed.unitCost ?? null).toBeNull();
  });

  it('acepta el alta con LOS DOS costos y no los compara entre si', () => {
    // R10: prevalece el unitario y el total se ignora, sin comprobar que uno concuerde con el
    // otro -una discrepancia de un centimo por redondeo seria un rechazo incorregible-. Quien
    // ignora el total es el caso de uso, no este esquema.
    const parsed = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      unitCost: '2.0000',
      totalCost: '999',
      stock: 10,
    });

    expect(parsed.unitCost).toBe('2.0000');
    expect(parsed.totalCost).toBe('999');
  });

  describe('QC-81 — purchaseDate', () => {
    it('acepta una fecha civil YYYY-MM-DD existente y la entrega como la misma cadena', () => {
      // R3: sale TEXTO, no `Date`. Incluye un 29 de febrero de año bisiesto, que existe.
      for (const valida of ['2026-09-10', '2024-02-29', '2026-12-31', '2026-01-01']) {
        const result = createProductWithFirstBatchSchema.safeParse({ ...VALIDA, purchaseDate: valida });
        expect(result.success, `${valida} deberia aceptarse`).toBe(true);
        if (result.success) expect(result.data.purchaseDate).toBe(valida);
      }
    });

    it('rechaza la fecha sin forma YYYY-MM-DD con un solo issue en purchaseDate', () => {
      // R6. Un solo issue: el corte del patron evita que la comprobacion de calendario sume otro.
      for (const invalida of [
        '10/09/2026',
        '2026-9-1',
        '2026-09-10T00:00:00Z',
        '20260910',
        '',
        ' 2026-09-10',
      ]) {
        expect(camposRechazados({ ...VALIDA, purchaseDate: invalida }), invalida).toEqual([
          'purchaseDate',
        ]);
      }
      expect(camposRechazados({ ...VALIDA, purchaseDate: 20260910 })).toEqual(['purchaseDate']);
    });

    it('rechaza la fecha con forma correcta que no existe en el calendario', () => {
      // R6: el patron solo no distingue estas. `2025-02-29` es un 29 de febrero de año NO bisiesto.
      for (const inexistente of ['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-09-00']) {
        expect(camposRechazados({ ...VALIDA, purchaseDate: inexistente }), inexistente).toEqual([
          'purchaseDate',
        ]);
      }
    });

    it('acepta el alta sin purchaseDate, ausente o en null (ausente = hoy, lo resuelve el caso de uso)', () => {
      // R2, lado entrada. `nullish()` es lo que mantiene funcionando la pantalla de hoy, que no
      // manda el campo (QC-81 R28): el esquema deja pasar y «hoy» lo pone `create-product.ts`.
      const ausente = createProductWithFirstBatchSchema.parse({ ...VALIDA });
      expect(ausente.purchaseDate).toBeUndefined();

      const enNulo = createProductWithFirstBatchSchema.parse({ ...VALIDA, purchaseDate: null });
      expect(enNulo.purchaseDate).toBeNull();
    });

    it('no rechaza una fecha futura: la no-futuridad es del caso de uso, que tiene el reloj', () => {
      // R4 NO vive aqui (`design.md > 4.1`): zod no conoce el `now()` inyectado. Este caso fija el
      // limite para que nadie meta un `new Date()` en el esquema creyendo que falta.
      expect(
        createProductWithFirstBatchSchema.safeParse({ ...VALIDA, purchaseDate: '2999-01-01' }).success,
      ).toBe(true);
    });

    it('sigue rechazando un campo desconocido parecido a la fecha de compra (strictObject)', () => {
      // R24 de QC-90 sigue en pie tras anadir el campo: solo `purchaseDate` es conocido.
      for (const desconocido of ['purchasedAt', 'purchase_date', 'fechaCompra']) {
        const result = createProductWithFirstBatchSchema.safeParse({
          ...VALIDA,
          [desconocido]: '2026-09-10',
        });

        expect(result.success, `${desconocido} deberia rechazarse`).toBe(false);
        if (result.success) continue;
        const rechazo = result.error.issues.find((issue) => issue.code === 'unrecognized_keys');
        expect(rechazo && 'keys' in rechazo ? rechazo.keys : []).toContain(desconocido);
      }
    });

    it('lot sigue siendo opcional en la ENTRADA: ausente pide generarlo, no es un rechazo', () => {
      // QC-81 R8, lado entrada: lo obligatorio es la FILA, no el campo.
      const parsed = createProductWithFirstBatchSchema.parse({ ...VALIDA });
      expect(parsed.lot ?? null).toBeNull();
      // Pero el de solo espacios sigue rechazandose: no se confunde con «generalo».
      expect(camposRechazados({ ...VALIDA, lot: '   ' })).toEqual(['lot']);
    });
  });

  it('acepta la existencia 0 mientras venga el costo unitario', () => {
    // R3: una existencia de 0 no es motivo de rechazo por si sola; solo lo es cuando hay que
    // dividir el total entre ella (R8).
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: 0 }).success,
    ).toBe(true);
  });
});
