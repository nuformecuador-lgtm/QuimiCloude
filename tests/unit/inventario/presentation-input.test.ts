// QC-80 T4 — El esquema de entrada de la presentacion, que es el MISMO objeto que valida el
// formulario de cliente y el caso de uso (`design.md > 4.1`). Se importa por el CONTRATO del
// modulo, no por una ruta profunda: si el barrel dejara de publicarlo, el formulario se
// quedaria sin validacion previa y este archivo no compilaria.
//
// HONESTIDAD: aqui no hay base. Que el `unitId` corresponda a una unidad REAL del catalogo no
// lo cierra ningun esquema zod -lo cierra la FK `presentations_unit_id_fkey`, y se prueba en
// `tests/integration/inventario/`-. Lo que se prueba aqui es la FORMA de la entrada.

import {
  createPresentationSchema,
  updatePresentationSchema,
} from '@/lib/modules/inventario';

const UNIDAD = '11111111-1111-4111-8111-111111111111';

/** El primer `issue` que senala un campo concreto, que es lo que el formulario mapea con
 *  `issue.path[0]`. */
function camposConError(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path[0]);
}

describe('createPresentationSchema — la unidad es obligatoria (R10)', () => {
  it('acepta un uuid como unidad y lo devuelve tal cual', () => {
    const result = createPresentationSchema.safeParse({ name: 'Bidon 20 L', unitId: UNIDAD });

    expect(result.success).toBe(true);
    expect(result.success && result.data.unitId).toBe(UNIDAD);
  });

  it('rechaza la AUSENCIA de unidad senalando el campo unitId (R10)', () => {
    const result = createPresentationSchema.safeParse({ name: 'Bidon 20 L' });

    expect(result.success).toBe(false);
    expect(camposConError(result)).toContain('unitId');
  });

  it('rechaza la unidad VACIA senalando el campo unitId (R10)', () => {
    // R17: el formulario no ofrece ninguna opcion «sin unidad»; si aun asi llegara la cadena
    // vacia -un `FormData` sin el campo la produce-, el esquema la rechaza.
    const result = createPresentationSchema.safeParse({ name: 'Bidon 20 L', unitId: '' });

    expect(result.success).toBe(false);
    expect(camposConError(result)).toContain('unitId');
  });

  it('rechaza lo que no tiene forma de uuid senalando el campo unitId (R10)', () => {
    const result = createPresentationSchema.safeParse({
      name: 'Bidon 20 L',
      unitId: 'kilogramo',
    });

    expect(result.success).toBe(false);
    expect(camposConError(result)).toContain('unitId');
  });

  it('no le pone ningun valor por defecto a la unidad (R10)', () => {
    // Un `default` convertiria «el usuario no eligio» en «eligio kilogramo» sin decirlo. La
    // columna es NOT NULL: el defecto lo pone la MIGRACION sobre las filas viejas, no el
    // esquema sobre las nuevas.
    const result = createPresentationSchema.safeParse({ name: 'Bidon 20 L', unitId: undefined });

    expect(result.success).toBe(false);
  });
});

describe('updatePresentationSchema — la edicion es reemplazo completo (R12)', () => {
  it('es exactamente el mismo esquema que el alta, asi que tambien exige la unidad', () => {
    expect(updatePresentationSchema).toBe(createPresentationSchema);

    const result = updatePresentationSchema.safeParse({ name: 'Bidon 20 L' });
    expect(result.success).toBe(false);
    expect(camposConError(result)).toContain('unitId');
  });

  it('acepta la edicion con una unidad DISTINTA de la anterior', () => {
    const otra = '22222222-2222-4222-8222-222222222222';
    const result = updatePresentationSchema.safeParse({ name: 'Bidon 20 L', unitId: otra });

    expect(result.success && result.data.unitId).toBe(otra);
  });
});

// QC-150 — el contenido de la presentacion (absorbe QC-130).
describe('createPresentationSchema — el contenido (R6)', () => {
  it('R6: acepta un decimal mayor que cero, hasta diez enteros y cuatro decimales', () => {
    const result = createPresentationSchema.safeParse({
      name: 'Botella 1L',
      unitId: UNIDAD,
      content: '1234567890.1234',
    });

    expect(result.success && result.data.content).toBe('1234567890.1234');
  });

  it('R6: se vacia con ausencia o con null, y no con la cadena vacia', () => {
    const sinCampo = createPresentationSchema.safeParse({ name: 'Botella 1L', unitId: UNIDAD });
    const conNull = createPresentationSchema.safeParse({
      name: 'Botella 1L',
      unitId: UNIDAD,
      content: null,
    });

    expect(sinCampo.success && sinCampo.data.content).toBeUndefined();
    expect(conNull.success && conNull.data.content).toBeNull();
  });
});

describe('createPresentationSchema — los seis rechazos del contenido (R7)', () => {
  const casos: Array<[string, string]> = [
    ['cero', '0'],
    ['negativo', '-1'],
    ['mas de cuatro decimales', '1.12345'],
    ['mas de diez cifras enteras', '12345678901'],
    ['notacion cientifica, no es un decimal plano', '1e3'],
    ['coma en vez de punto, no es un decimal plano', '1,5'],
  ];

  it.each(casos)('rechaza %s (%s) con invalid_input, sin escribir nada', (_motivo, valor) => {
    const result = createPresentationSchema.safeParse({
      name: 'Botella 1L',
      unitId: UNIDAD,
      content: valor,
    });

    expect(result.success).toBe(false);
    expect(camposConError(result)).toContain('content');
  });
});
