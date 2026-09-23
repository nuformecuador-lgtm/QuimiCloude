import { createProductWithFirstBatchSchema } from '@/lib/modules/inventario';

/**
 * Se importa por el CONTRATO PUBLICO del modulo y no por la ruta profunda: si el barrel dejara de
 * exportar el esquema, este archivo no compilaria.
 */

const VALIDA = {
  name: 'Cloro Granulado',
  stock: '10',
  qtyAlert: '2',
  presentationId: '11111111-1111-4111-8111-111111111111',
  unitCost: '12.5000',
} as const;

function camposRechazados(input: unknown): readonly string[] {
  const result = createProductWithFirstBatchSchema.safeParse(input);
  expect(result.success, 'se esperaba un rechazo y el esquema acepto la entrada').toBe(false);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createProductWithFirstBatchSchema', () => {
  it('acepta el alta con los campos del producto, la presentacion y un solo costo', () => {
    const parsed = createProductWithFirstBatchSchema.parse({ ...VALIDA });

    expect(parsed.name).toBe('Cloro Granulado');
    expect(parsed.presentationId).toBe(VALIDA.presentationId);
    expect(parsed.unitCost).toBe('12.5000');
  });

  it('acepta el lote y la fecha de expiracion cuando vienen, y tambien cuando vienen en nulo', () => {
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
    // Hasta 10 enteros y 4 decimales, sin signo, sin notacion cientifica y sin coma.
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
    // '0', '0.0' y '0.0000' se descartan LEXICAMENTE, no convirtiendo a numero.
    for (const cero of ['0', '0.0', '0.0000']) {
      expect(camposRechazados({ ...VALIDA, unitCost: cero })).toEqual(['unitCost']);
      expect(
        camposRechazados({ ...VALIDA, unitCost: undefined, totalCost: cero }),
      ).toEqual(['totalCost']);
    }
  });

  it('rechaza un campo desconocido en vez de ignorarlo en silencio', () => {
    // Quien manda un campo de mas cree haber guardado algo que no se guardo. El issue de
    // `strictObject` no cuelga de un campo: lleva `code: 'unrecognized_keys'` y la lista de claves.
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
    // Solo se valida la FORMA: que exista lo garantiza la clave foranea, no zod.
    expect(camposRechazados({ ...VALIDA, presentationId: undefined })).toEqual(['presentationId']);
    expect(camposRechazados({ ...VALIDA, presentationId: 'no-es-un-uuid' })).toEqual([
      'presentationId',
    ]);
  });

  it('rechaza la fecha de expiracion que no es una fecha civil YYYY-MM-DD', () => {
    expect(camposRechazados({ ...VALIDA, expiryDate: '31/12/2026' })).toEqual(['expiryDate']);
    expect(camposRechazados({ ...VALIDA, expiryDate: '2026-12-31T00:00:00Z' })).toEqual([
      'expiryDate',
    ]);
  });

  it('rechaza el alta sin ninguno de los dos costos senalando LOS DOS campos', () => {
    expect(camposRechazados({ ...VALIDA, unitCost: undefined })).toEqual(['unitCost', 'totalCost']);
    expect(camposRechazados({ ...VALIDA, unitCost: null, totalCost: null })).toEqual([
      'unitCost',
      'totalCost',
    ]);
  });

  it('rechaza el alta con solo costo total y existencia 0 senalando el campo de la existencia', () => {
    // No hay costo unitario posible y la columna es NOT NULL, asi que el rechazo se pinta en
    // EXISTENCIA -no en el costo-, que es el dato que hay que corregir.
    const result = createProductWithFirstBatchSchema.safeParse({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '100',
      stock: '0',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toEqual(['stock']);
    expect(result.error.issues[0]?.message).toMatch(/existencia mayor que 0/i);
  });

  it('rechaza el alta con solo costo total cuyo unitario derivado redondea a cero, en totalCost', () => {
    // 0.0001 / 5 = 0.0000 en cuatro decimales, y la columna exige `> 0`.
    const rechazados = camposRechazados({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '0.0001',
      stock: '5',
    });
    expect(rechazados).toEqual(['totalCost']);
  });

  it('acepta el alta con solo costo total cuando el derivado es guardable', () => {
    // Derivar no es del esquema, es del caso de uso: aqui solo se comprueba que deja pasar.
    const parsed = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      unitCost: undefined,
      totalCost: '10',
      stock: '3',
    });
    expect(parsed.totalCost).toBe('10');
    expect(parsed.unitCost ?? null).toBeNull();
  });

  it('acepta el alta con LOS DOS costos y no los compara entre si', () => {
    // Una discrepancia de un centimo por redondeo seria un rechazo incorregible. Quien ignora el
    // total es el caso de uso, no este esquema.
    const parsed = createProductWithFirstBatchSchema.parse({
      ...VALIDA,
      unitCost: '2.0000',
      totalCost: '999',
      stock: '10',
    });

    expect(parsed.unitCost).toBe('2.0000');
    expect(parsed.totalCost).toBe('999');
  });

  describe('QC-81 — purchaseDate', () => {
    it('acepta una fecha civil YYYY-MM-DD existente y la entrega como la misma cadena', () => {
      // Sale TEXTO, no `Date`. Incluye un 29 de febrero de año bisiesto, que existe.
      for (const valida of ['2026-09-10', '2024-02-29', '2026-12-31', '2026-01-01']) {
        const result = createProductWithFirstBatchSchema.safeParse({ ...VALIDA, purchaseDate: valida });
        expect(result.success, `${valida} deberia aceptarse`).toBe(true);
        if (result.success) expect(result.data.purchaseDate).toBe(valida);
      }
    });

    it('rechaza la fecha sin forma YYYY-MM-DD con un solo issue en purchaseDate', () => {
      // Un solo issue: el corte del patron evita que la comprobacion de calendario sume otro.
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
      // El patron solo no distingue estas. `2025-02-29` es un 29 de febrero de año NO bisiesto.
      for (const inexistente of ['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-09-00']) {
        expect(camposRechazados({ ...VALIDA, purchaseDate: inexistente }), inexistente).toEqual([
          'purchaseDate',
        ]);
      }
    });

    it('acepta el alta sin purchaseDate, ausente o en null (ausente = hoy, lo resuelve el caso de uso)', () => {
      // `nullish()` mantiene funcionando la pantalla de hoy, que no manda el campo: el esquema deja
      // pasar y «hoy» lo pone `create-product.ts`.
      const ausente = createProductWithFirstBatchSchema.parse({ ...VALIDA });
      expect(ausente.purchaseDate).toBeUndefined();

      const enNulo = createProductWithFirstBatchSchema.parse({ ...VALIDA, purchaseDate: null });
      expect(enNulo.purchaseDate).toBeNull();
    });

    it('no rechaza una fecha futura: la no-futuridad es del caso de uso, que tiene el reloj', () => {
      // zod no conoce el `now()` inyectado. Este caso fija el limite para que nadie meta un
      // `new Date()` en el esquema creyendo que falta.
      expect(
        createProductWithFirstBatchSchema.safeParse({ ...VALIDA, purchaseDate: '2999-01-01' }).success,
      ).toBe(true);
    });

    it('sigue rechazando un campo desconocido parecido a la fecha de compra (strictObject)', () => {
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
      // Lo obligatorio es la FILA, no el campo.
      const parsed = createProductWithFirstBatchSchema.parse({ ...VALIDA });
      expect(parsed.lot ?? null).toBeNull();
      // Pero el de solo espacios sigue rechazandose: no se confunde con «generalo».
      expect(camposRechazados({ ...VALIDA, lot: '   ' })).toEqual(['lot']);
    });
  });

  describe('QC-81 D13 — el lote tecleado de solo digitos no llega a 60 caracteres', () => {
    const MENSAJE = 'Un lote de solo números puede tener hasta 59 caracteres.';

    /** Los issues ENTEROS y no solo sus rutas: aqui importan cuantos son, su codigo y su texto. */
    function issuesDe(input: unknown) {
      const result = createProductWithFirstBatchSchema.safeParse(input);
      expect(result.success, 'se esperaba un rechazo y el esquema acepto la entrada').toBe(false);
      return result.success ? [] : result.error.issues;
    }

    it('R34: 60 digitos se rechazan con UN solo issue en lot, de codigo custom y con su mensaje', () => {
      const issues = issuesDe({ ...VALIDA, lot: '9'.repeat(60) });

      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(['lot']);
      expect(issues[0]?.code).toBe('custom');
      expect(issues[0]?.message).toBe(MENSAJE);
    });

    it('R34: 60 digitos con ceros a la izquierda se rechazan igual (cuenta caracteres, no magnitud)', () => {
      const lote = `${'0'.repeat(59)}1`;
      expect(lote).toHaveLength(60);

      const issues = issuesDe({ ...VALIDA, lot: lote });
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(['lot']);
      expect(issues[0]?.code).toBe('custom');
    });

    it('R34: 60 digitos rodeados de espacios se rechazan, porque cuenta el valor recortado', () => {
      const issues = issuesDe({ ...VALIDA, lot: `  ${'1'.repeat(60)}  ` });

      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(['lot']);
      expect(issues[0]?.code).toBe('custom');
      expect(issues[0]?.message).toBe(MENSAJE);
    });

    it('R34: 61 digitos cobran UN solo issue, el del largo, y no tambien el de solo digitos', () => {
      const issues = issuesDe({ ...VALIDA, lot: '9'.repeat(61) });

      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(['lot']);
      expect(issues[0]?.code).toBe('too_big');
      expect(issues[0]?.message).not.toBe(MENSAJE);
    });

    it('R35: 59 digitos se aceptan y llegan tal cual', () => {
      const lote = '9'.repeat(59);
      const result = createProductWithFirstBatchSchema.safeParse({ ...VALIDA, lot: lote });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.lot).toBe(lote);
    });

    it('R35: 60 caracteres con una letra o un guion se aceptan y llegan tal cual', () => {
      for (const lote of [`${'9'.repeat(59)}A`, `${'9'.repeat(30)}-${'9'.repeat(29)}`, `L${'0'.repeat(59)}`]) {
        expect(lote).toHaveLength(60);
        const result = createProductWithFirstBatchSchema.safeParse({ ...VALIDA, lot: lote });
        expect(result.success, `${lote} deberia aceptarse`).toBe(true);
        if (result.success) expect(result.data.lot).toBe(lote);
      }
    });

    it('R8: el lote ausente o en null sigue siendo valido (sin regresion por la regla nueva)', () => {
      expect(createProductWithFirstBatchSchema.safeParse({ ...VALIDA }).success).toBe(true);
      expect(createProductWithFirstBatchSchema.safeParse({ ...VALIDA, lot: null }).success).toBe(true);
    });
  });

  it('acepta la existencia 0 mientras venga el costo unitario', () => {
    // Una existencia de 0 solo es motivo de rechazo cuando hay que dividir el total entre ella.
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '0' }).success,
    ).toBe(true);
  });

  it('R3: el alta exige la existencia como decimal de hasta cuatro decimales, cero o mas', () => {
    expect(createProductWithFirstBatchSchema.safeParse({ ...VALIDA }).success).toBe(true);

    const sinExistencia: Record<string, unknown> = { ...VALIDA };
    delete sinExistencia.stock;
    expect(createProductWithFirstBatchSchema.safeParse(sinExistencia).success).toBe(false);
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '-1' }).success,
    ).toBe(false);
    // Decimal con hasta cuatro cifras: ya no se rechaza (R3).
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '1.5' }).success,
    ).toBe(true);
    // Mas de cuatro decimales, mas de diez enteros o notacion no plana si se rechazan.
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '1.00001' }).success,
    ).toBe(false);
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '12345678901' }).success,
    ).toBe(false);
    expect(
      createProductWithFirstBatchSchema.safeParse({ ...VALIDA, stock: '1e3' }).success,
    ).toBe(false);
  });
});
