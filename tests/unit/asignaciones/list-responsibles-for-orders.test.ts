// QC-102 T4 — La consulta EN LOTE de responsables (R1, R2, R4, R6, R7, R8, R9, R10, R11, R12).
//
// Con dobles de puerto que CUENTAN INVOCACIONES: R4 no se puede demostrar mirando el resultado
// —un resultado correcto sale igual con dos consultas que con veinte— asi que lo que se afirma es
// cuantas veces se llamo a cada puerto con una pagina llena. Lo que la base demuestra —el `where`
// por empresa (R3) y los cuatro estados (R10) contra Postgres— vive en
// `tests/integration/asignaciones/batch-*.int.test.ts`.
//
// El caso de uso se importa por su ruta de `domain/`, igual que hace el test de la consulta
// singular.

import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import {
  createListResponsiblesForOrders,
  MAX_ORDERS_PER_BATCH,
  type ListResponsiblesForOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-responsibles-for-orders';
import { createListOrderResponsibles } from '@/lib/modules/asignaciones/domain/list-order-responsibles';
import type { OrderAssignmentRowWithOrder } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PersonRef } from '@/lib/modules/identity';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PEDIDO_A = '44444444-4444-4444-8444-444444444444';
const PEDIDO_B = '55555555-5555-4555-8555-555555555555';
const PEDIDO_SIN_NADIE = '66666666-6666-4666-8666-666666666666';
const GRUPO = '77777777-7777-4777-8777-777777777777';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLA = '88888888-8888-4888-8888-888888888888';

/** El nombre CONGELADO en la fila: como se llamaba el grupo cuando se aplico al pedido. */
const NOMBRE_CONGELADO = 'Turno de manana';
/** El nombre que el grupo tiene HOY. R12 dice que este NO puede aparecer en la salida. */
const NOMBRE_ACTUAL_DEL_GRUPO = 'Turno de manana (renombrado en marzo)';

/** Un uuid valido y distinto por cada posicion: lo unico que importa de el es que pase el `uuid()`
 *  del esquema y que no se repita. */
function pedidoNumero(i: number): string {
  const sufijo = i.toString(16).padStart(2, '0');
  return `444444${sufijo}-4444-4444-8444-4444444444${sufijo}`;
}

function actorCon(...permissions: readonly string[]): Actor {
  return { id: ANA, companyId: EMPRESA, permissions };
}

/** El actor de R2: puede consultar pedidos y NO tiene NINGUNO de `asignaciones.*`. */
const CONSULTOR_DE_PEDIDOS = actorCon('pedidos.consultar');

type Dobles = {
  readonly deps: ListResponsiblesForOrdersDeps;
  readonly listByOrdersInCompany: ReturnType<typeof vi.fn>;
  readonly listByOrderInCompany: ReturnType<typeof vi.fn>;
  readonly insertMissing: ReturnType<typeof vi.fn>;
  readonly deleteOne: ReturnType<typeof vi.fn>;
  readonly deleteByWorkGroup: ReturnType<typeof vi.fn>;
  readonly findAliveRefsInCompany: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeletedInCompany: ReturnType<typeof vi.fn>;
  /** TODOS los metodos de puerto del montaje: es lo que hace verificable «sin tocar ningun
   *  puerto» (R8, R9) y «dos invocaciones y ni una mas» (R4). */
  readonly todos: readonly ReturnType<typeof vi.fn>[];
};

function montar(options?: {
  readonly rows?: readonly OrderAssignmentRowWithOrder[];
  readonly refs?: readonly PersonRef[];
}): Dobles {
  const listByOrdersInCompany = vi.fn(async () => options?.rows ?? []);
  const listByOrderInCompany = vi.fn(async () => {
    throw new Error('el LOTE no puede resolverse con la consulta de UN pedido (R4)');
  });
  const insertMissing = vi.fn(async () => 0);
  const deleteOne = vi.fn(async () => 'ok' as const);
  const deleteByWorkGroup = vi.fn(async () => 0);
  const findAliveRefsInCompany = vi.fn(async () => {
    throw new Error('la CONSULTA no puede usar el metodo que EXCLUYE a las personas de baja (R11)');
  });
  const findRefsIncludingDeletedInCompany = vi.fn(async () => options?.refs ?? []);

  return {
    deps: {
      assignments: {
        insertMissing,
        listByOrderInCompany,
        listByOrdersInCompany,
        deleteOne,
        deleteByWorkGroup,
      },
      people: { findAliveRefsInCompany, findRefsIncludingDeletedInCompany },
      now: () => new Date('2026-09-13T10:00:00.000Z'),
    } as unknown as ListResponsiblesForOrdersDeps,
    listByOrdersInCompany,
    listByOrderInCompany,
    insertMissing,
    deleteOne,
    deleteByWorkGroup,
    findAliveRefsInCompany,
    findRefsIncludingDeletedInCompany,
    todos: [
      listByOrdersInCompany,
      listByOrderInCompany,
      insertMissing,
      deleteOne,
      deleteByWorkGroup,
      findAliveRefsInCompany,
      findRefsIncludingDeletedInCompany,
    ],
  };
}

/** Una fila suelta del lote: sin grupo y sin nombre congelado. */
function filaSuelta(orderId: string, userId: string): OrderAssignmentRowWithOrder {
  return { orderId, userId, workGroupId: null, workGroupName: null };
}

/** Una fila que vino de un grupo, con su nombre CONGELADO. */
function filaDeGrupo(
  orderId: string,
  userId: string,
  workGroupName = NOMBRE_CONGELADO,
): OrderAssignmentRowWithOrder {
  return { orderId, userId, workGroupId: GRUPO, workGroupName };
}

function persona(id: string, displayName: string, isActive = true): PersonRef {
  return { id, displayName, isActive, permissions: [] };
}

// ---------------------------------------------------------------------------------------------
// R2 — el permiso, PRIMERA LINEA
// ---------------------------------------------------------------------------------------------

describe('QC-102 R2 — exige `pedidos.consultar` antes de zod y antes de ningun puerto', () => {
  it('quien puede consultar pedidos y NADA de `asignaciones.*` recibe su resultado', async () => {
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [persona(ANA, 'Ana Perez')] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(salida).toEqual([
      { orderId: PEDIDO_A, responsibles: [{ userId: ANA, displayName: 'Ana Perez', origin: { kind: 'direct' } }] },
    ]);
  });

  it.each([
    ['sin ningun permiso', actorCon()],
    ['solo con `asignaciones.consultar`', actorCon('asignaciones.consultar')],
    ['solo con `asignaciones.modificar`', actorCon('asignaciones.modificar')],
    ['actor ausente', null],
    ['actor indefinido', undefined],
  ])('%s: `unauthorized` y NINGUN puerto tocado', async (_caso, actor) => {
    const m = montar();

    const error = await createListResponsiblesForOrders(m.deps)(actor, [PEDIDO_A]).catch(
      (caught: unknown) => caught,
    );

    expect((error as { code?: string }).code).toBe('unauthorized');
    for (const metodo of m.todos) expect(metodo).not.toHaveBeenCalled();
  });

  it('el permiso se comprueba ANTES que zod: una entrada basura sin permiso sale `unauthorized`', async () => {
    // Si el orden fuera el contrario, esta llamada saldria con `invalid_input` y revelaria que la
    // entrada se miro antes de saber quien pregunta.
    const m = montar();

    const error = await createListResponsiblesForOrders(m.deps)(actorCon(), 'no-es-una-lista').catch(
      (caught: unknown) => caught,
    );

    expect((error as { code?: string }).code).toBe('unauthorized');
    for (const metodo of m.todos) expect(metodo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// R1, R7 — una entrada por identificador PEDIDO, tambien para los que no tienen a nadie
// ---------------------------------------------------------------------------------------------

describe('QC-102 R1 — una entrada por cada identificador pedido', () => {
  it('devuelve tantas entradas como ids, en el orden en que se pidieron', async () => {
    const m = montar({
      rows: [filaSuelta(PEDIDO_A, ANA), filaSuelta(PEDIDO_B, BRUNO)],
      refs: [persona(ANA, 'Ana Perez'), persona(BRUNO, 'Bruno Diaz')],
    });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [
      PEDIDO_B,
      PEDIDO_SIN_NADIE,
      PEDIDO_A,
    ]);

    expect(salida.map((entrada) => entrada.orderId)).toEqual([PEDIDO_B, PEDIDO_SIN_NADIE, PEDIDO_A]);
    expect(salida.map((entrada) => entrada.responsibles.length)).toEqual([1, 0, 1]);
  });

  it('R7: un pedido inexistente, de baja o de OTRA empresa devuelve entrada VACIA y no rompe la consulta', async () => {
    // Los tres casos son el mismo desde aqui: el `where` por empresa no devolvio ninguna fila suya
    // y la salida no los distingue. No hay `OrderNotFoundError` en el lote (hallazgo H3).
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [persona(ANA, 'Ana Perez')] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [
      PEDIDO_A,
      PEDIDO_SIN_NADIE,
    ]);

    expect(salida[1]).toEqual({ orderId: PEDIDO_SIN_NADIE, responsibles: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// R4 — el numero de consultas es CONSTANTE: se CUENTAN invocaciones
// ---------------------------------------------------------------------------------------------

describe('QC-102 R4 — dos invocaciones de puerto, con 1 pedido y con 20', () => {
  it('con 20 pedidos y 20 responsables: exactamente 2 invocaciones de puerto', async () => {
    const pedidos = Array.from({ length: 20 }, (_, i) => pedidoNumero(i));
    const rows = pedidos.map((pedido, i) => filaSuelta(pedido, i % 2 === 0 ? ANA : BRUNO));
    const m = montar({ rows, refs: [persona(ANA, 'Ana Perez'), persona(BRUNO, 'Bruno Diaz')] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, pedidos);

    expect(salida).toHaveLength(20);
    expect(m.listByOrdersInCompany).toHaveBeenCalledTimes(1);
    expect(m.findRefsIncludingDeletedInCompany).toHaveBeenCalledTimes(1);
    // Y NINGUNA consulta por fila: el metodo de UN pedido revienta si alguien lo llama.
    expect(m.listByOrderInCompany).not.toHaveBeenCalled();
  });

  it('las personas repetidas se preguntan UNA sola vez, aunque esten en cinco pedidos', async () => {
    const pedidos = [PEDIDO_A, PEDIDO_B, PEDIDO_SIN_NADIE];
    const m = montar({
      rows: pedidos.map((pedido) => filaSuelta(pedido, ANA)),
      refs: [persona(ANA, 'Ana Perez')],
    });

    await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, pedidos);

    expect(m.findRefsIncludingDeletedInCompany).toHaveBeenCalledTimes(1);
    expect(m.findRefsIncludingDeletedInCompany.mock.calls[0]?.[1]).toEqual([ANA]);
  });

  it('la EMPRESA que viaja a los dos puertos es la del ACTOR, en la PRIMERA posicion (R3)', async () => {
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [persona(ANA, 'Ana Perez')] });

    await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(m.listByOrdersInCompany.mock.calls[0]?.[0]).toBe(EMPRESA);
    expect(m.findRefsIncludingDeletedInCompany.mock.calls[0]?.[0]).toBe(EMPRESA);
  });
});

// ---------------------------------------------------------------------------------------------
// R6 — el MISMO orden que la consulta de un solo pedido
// ---------------------------------------------------------------------------------------------

describe('QC-102 R6 — dentro de cada pedido, el orden del singular', () => {
  it('ordena por nombre mostrable con desempate por identificador, y dos lecturas dan lo mismo', async () => {
    const rows = [filaSuelta(PEDIDO_A, CARLA), filaSuelta(PEDIDO_A, BRUNO), filaSuelta(PEDIDO_A, ANA)];
    // ANA y CARLA son HOMONIMAS: el desempate por identificador es lo unico que hace total el orden.
    const refs = [
      persona(ANA, 'Zulema Ortiz'),
      persona(BRUNO, 'Bruno Diaz'),
      persona(CARLA, 'Zulema Ortiz'),
    ];
    const m = montar({ rows, refs });

    const listar = createListResponsiblesForOrders(m.deps);
    const primera = await listar(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);
    const segunda = await listar(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(primera[0]?.responsibles.map((r) => r.userId)).toEqual([BRUNO, ANA, CARLA]);
    expect(segunda).toEqual(primera);
  });

  it('el lote y el SINGULAR devuelven exactamente la misma secuencia para el mismo pedido', async () => {
    // La prueba de que el comparador es UNO SOLO (T3): si alguien copiara el orden en vez de
    // importarlo, esta igualdad seria lo primero en caer al tocar uno de los dos.
    const filas = [
      { userId: CARLA, workGroupId: null, workGroupName: null },
      { userId: BRUNO, workGroupId: null, workGroupName: null },
      { userId: ANA, workGroupId: null, workGroupName: null },
    ];
    const refs = [
      persona(ANA, 'Zulema Ortiz'),
      persona(BRUNO, 'Bruno Diaz'),
      persona(CARLA, 'Zulema Ortiz'),
    ];

    const singular = createListOrderResponsibles({
      orders: { findAliveById: async (id: string) => ({ id, status: 'PENDIENTE' }) } as unknown as OrderCatalog,
      assignments: {
        listByOrderInCompany: async () => filas,
      } as never,
      people: { findRefsIncludingDeletedInCompany: async () => refs } as never,
      now: () => new Date('2026-09-13T10:00:00.000Z'),
    });

    const m = montar({ rows: filas.map((fila) => ({ ...fila, orderId: PEDIDO_A })), refs });
    const lote = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(lote[0]?.responsibles).toEqual(await singular(CONSULTOR_DE_PEDIDOS, PEDIDO_A));
  });
});

// ---------------------------------------------------------------------------------------------
// R8, R9 — el borde: lista vacia y entrada invalida, SIN tocar ningun puerto
// ---------------------------------------------------------------------------------------------

describe('QC-102 R8 — la lista vacia no cuesta ninguna consulta', () => {
  it('devuelve [] con los puertos a CERO invocaciones y sin lanzar nada', async () => {
    const m = montar();

    expect(await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [])).toEqual([]);
    for (const metodo of m.todos) expect(metodo).not.toHaveBeenCalled();
  });
});

describe('QC-102 R9 — la entrada invalida se rechaza con `invalid_input` sin tocar ningun puerto', () => {
  it.each([
    ['un identificador que no es uuid', [PEDIDO_A, 'no-soy-un-uuid']],
    ['un numero en la lista', [1]],
    ['algo que no es una lista', { orderId: PEDIDO_A }],
    ['null', null],
    [
      `${MAX_ORDERS_PER_BATCH + 1} identificadores`,
      Array.from({ length: MAX_ORDERS_PER_BATCH + 1 }, (_, i) => pedidoNumero(i)),
    ],
  ])('%s', async (_caso, entrada) => {
    const m = montar();

    const error = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, entrada).catch(
      (caught: unknown) => caught,
    );

    expect((error as { code?: string }).code).toBe('invalid_input');
    for (const metodo of m.todos) expect(metodo).not.toHaveBeenCalled();
  });

  it('justo en el tope declarado la consulta SE ACEPTA: el limite es el de arriba, no uno menos', async () => {
    const pedidos = Array.from({ length: MAX_ORDERS_PER_BATCH }, (_, i) => pedidoNumero(i));
    const m = montar();

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, pedidos);

    expect(salida).toHaveLength(MAX_ORDERS_PER_BATCH);
  });

  it('los identificadores repetidos se consultan UNA vez y dan UNA entrada', async () => {
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [persona(ANA, 'Ana Perez')] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [
      PEDIDO_A,
      PEDIDO_A,
      PEDIDO_A,
    ]);

    expect(salida).toHaveLength(1);
    expect(m.listByOrdersInCompany.mock.calls[0]?.[1]).toEqual([PEDIDO_A]);
  });

  it('H4: el tope del dominio y `MAX_PAGE_SIZE` son el MISMO numero', () => {
    // El dominio no puede importar `lib/shared/**`, asi que el numero esta escrito dos veces; este
    // test es lo unico que impide que ampliar la pagina a 50 deje media pagina sin responsables.
    expect(MAX_ORDERS_PER_BATCH).toBe(MAX_PAGE_SIZE);
  });
});

// ---------------------------------------------------------------------------------------------
// R10 — los cuatro estados dan lo mismo, y aqui se ve POR QUE: el estado no es consultable
// ---------------------------------------------------------------------------------------------

describe('QC-102 R10 — el estado del pedido no entra en esta consulta', () => {
  it('`OrderCatalog` NO es dependencia: no hay forma de mirar el estado ni de saber si el pedido vive', () => {
    // Hallazgo H3: comprobar el pedido costaria una consulta POR PEDIDO. Lo que se afirma aqui es
    // estructural —las dependencias son DOS— y es lo que hace que los cuatro estados sean
    // indistinguibles para este caso de uso. El recorrido de los cuatro contra Postgres esta en
    // `tests/integration/asignaciones/batch-states.int.test.ts`.
    const claves = Object.keys(montar().deps).sort();

    expect(claves).toEqual(['assignments', 'now', 'people']);
    expect(claves).not.toContain('orders');
  });
});

// ---------------------------------------------------------------------------------------------
// R11, R12 — la forma de cada responsable y el origen CONGELADO
// ---------------------------------------------------------------------------------------------

describe('QC-102 R11 — tres claves exactas, y la persona de baja sigue saliendo', () => {
  it('cada responsable lleva `userId`, `displayName` y `origin`, y ninguna clave mas', async () => {
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [persona(ANA, 'Ana Perez', false)] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    const responsable = salida[0]?.responsibles[0] as Record<string, unknown>;
    expect(Object.keys(responsable).sort()).toEqual(['displayName', 'origin', 'userId']);
    // Ni correo, ni documento, ni estado de cuenta, ni marca de baja.
    expect(responsable.isActive).toBeUndefined();
  });

  it('la persona dada de baja, inactiva o bloqueada sigue apareciendo con su nombre mostrable', async () => {
    const m = montar({
      rows: [filaSuelta(PEDIDO_A, ANA), filaSuelta(PEDIDO_A, BRUNO)],
      refs: [persona(ANA, 'Ana Perez', false), persona(BRUNO, 'Bruno Diaz', true)],
    });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(salida[0]?.responsibles.map((r) => r.displayName)).toEqual(['Ana Perez', 'Bruno Diaz']);
  });

  it('la persona que NO vuelve del directorio sigue saliendo, con su identificador por nombre', async () => {
    const m = montar({ rows: [filaSuelta(PEDIDO_A, ANA)], refs: [] });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(salida[0]?.responsibles).toEqual([
      { userId: ANA, displayName: ANA, origin: { kind: 'direct' } },
    ]);
  });
});

describe('QC-102 R12 — el origen y el nombre del grupo salen de LA FILA', () => {
  it('devuelve la referencia al grupo y el nombre CONGELADO, no el de hoy', async () => {
    const nombreDeHoy = vi.fn(() => NOMBRE_ACTUAL_DEL_GRUPO);
    const m = montar({
      rows: [filaDeGrupo(PEDIDO_A, ANA)],
      refs: [persona(ANA, 'Ana Perez')],
    });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(salida[0]?.responsibles[0]?.origin).toEqual({
      kind: 'workGroup',
      workGroupId: GRUPO,
      workGroupName: NOMBRE_CONGELADO,
    });
    // Nadie fue a buscar el nombre de hoy: no hay puerto de grupos en estas dependencias.
    expect(nombreDeHoy).not.toHaveBeenCalled();
  });

  it('una fila a medias —grupo sin nombre congelado— se lee como responsable SUELTO', async () => {
    const m = montar({
      rows: [{ orderId: PEDIDO_A, userId: ANA, workGroupId: GRUPO, workGroupName: null }],
      refs: [persona(ANA, 'Ana Perez')],
    });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [PEDIDO_A]);

    expect(salida[0]?.responsibles[0]?.origin).toEqual({ kind: 'direct' });
  });

  it('dos pedidos con la misma persona por CAMINOS distintos conservan cada uno su origen', async () => {
    const m = montar({
      rows: [filaSuelta(PEDIDO_A, ANA), filaDeGrupo(PEDIDO_B, ANA)],
      refs: [persona(ANA, 'Ana Perez')],
    });

    const salida = await createListResponsiblesForOrders(m.deps)(CONSULTOR_DE_PEDIDOS, [
      PEDIDO_A,
      PEDIDO_B,
    ]);

    expect(salida[0]?.responsibles[0]?.origin.kind).toBe('direct');
    expect(salida[1]?.responsibles[0]?.origin.kind).toBe('workGroup');
  });
});
