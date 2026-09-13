// QC-87 T9 — La CONSULTA de responsables de un pedido (R3, R7, R8, R13, R35-R40).
//
// Con dobles de puerto: aqui no hay base. Lo que la base demuestra —que la persona dada de baja
// sigue volviendo del directorio (R37)— es de `tests/integration/asignaciones/` (T14); lo que este
// archivo demuestra es la REGLA del caso de uso, que es donde se puede romper en silencio.
//
// El test mas importante del archivo es el de R3, y no es una formalidad: `design.md > 10` riesgo 3
// dice que alguien exigira `asignaciones.consultar` aqui «porque se llama asi», y eso dejaria a un
// Administrador sin ver los responsables de un pedido que si puede abrir. El test construye un
// actor con `pedidos.consultar` y SIN ninguno de `asignaciones.*` y espera EXITO.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo: quien reexporta
// desde `lib/modules/asignaciones/index.ts` es T10, y este test no debe adelantarlo.

import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import { OrderNotFoundError } from '@/lib/modules/asignaciones/domain/errors';
import {
  createListOrderResponsibles,
  type ListOrderResponsiblesDeps,
} from '@/lib/modules/asignaciones/domain/list-order-responsibles';
import type { AssignmentRow } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PersonRef } from '@/lib/modules/identity';
import type { OrderStatus } from '@/lib/modules/pedidos';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '99999999-9999-4999-8999-999999999999';
const PEDIDO = '44444444-4444-4444-8444-444444444444';
const GRUPO = '55555555-5555-4555-8555-555555555555';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLA = '66666666-6666-4666-8666-666666666666';

/** El nombre CONGELADO en la fila: como se llamaba el grupo cuando se aplico al pedido. */
const NOMBRE_CONGELADO = 'Turno de manana';
/** El nombre que el grupo tiene HOY. R36 dice que este NO puede aparecer en la salida. */
const NOMBRE_ACTUAL_DEL_GRUPO = 'Turno de manana (renombrado en marzo)';

/**
 * Los cuatro estados del pedido, sacados del CONTRATO de `pedidos` y no escritos a mano: si QC-34
 * anadiera un quinto, este test lo recorreria solo en vez de quedarse callado.
 */
const ESTADOS: readonly OrderStatus[] = ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO'];

function actorCon(...permissions: readonly string[]): Actor {
  return { id: ANA, companyId: EMPRESA, permissions };
}

/** El actor de R3: puede consultar pedidos y NO tiene NINGUNO de `asignaciones.*`. */
const CONSULTOR_DE_PEDIDOS = actorCon('pedidos.consultar');

type Dobles = {
  readonly deps: ListOrderResponsiblesDeps;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly listByOrderInCompany: ReturnType<typeof vi.fn>;
  readonly insertMissing: ReturnType<typeof vi.fn>;
  readonly deleteOne: ReturnType<typeof vi.fn>;
  readonly deleteByWorkGroup: ReturnType<typeof vi.fn>;
  readonly findAliveRefsInCompany: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeletedInCompany: ReturnType<typeof vi.fn>;
  /**
   * El directorio de GRUPOS. NO es dependencia de este caso de uso a proposito, y esta aqui para
   * poder AFIRMAR que nadie lo consulta: si alguien resolviera el nombre del grupo «de hoy», este
   * doble seria el unico sitio de donde podria salir. Es la forma de escribir R36 como algo que
   * se comprueba y no como una promesa.
   */
  readonly nombreActualDelGrupo: ReturnType<typeof vi.fn>;
};

function montar(options?: {
  readonly status?: OrderStatus | null;
  readonly rows?: readonly AssignmentRow[];
  readonly refs?: readonly PersonRef[];
}): Dobles {
  const status = options?.status === undefined ? 'PENDIENTE' : options.status;
  const findAliveById = vi.fn(async (id: string) =>
    status === null ? null : { id, status },
  );
  const listByOrderInCompany = vi.fn(async () => options?.rows ?? []);
  const insertMissing = vi.fn(async () => 0);
  const deleteOne = vi.fn(async () => 'ok' as const);
  const deleteByWorkGroup = vi.fn(async () => 0);
  const findAliveRefsInCompany = vi.fn(async () => {
    throw new Error('la CONSULTA no puede usar el metodo que EXCLUYE a las personas de baja (R37)');
  });
  const findRefsIncludingDeletedInCompany = vi.fn(async () => options?.refs ?? []);
  const nombreActualDelGrupo = vi.fn(() => NOMBRE_ACTUAL_DEL_GRUPO);

  return {
    deps: {
      orders: { findAliveById },
      assignments: { insertMissing, listByOrderInCompany, deleteOne, deleteByWorkGroup },
      people: { findAliveRefsInCompany, findRefsIncludingDeletedInCompany },
      now: () => new Date('2026-09-13T10:00:00.000Z'),
    } as unknown as ListOrderResponsiblesDeps,
    findAliveById,
    listByOrderInCompany,
    insertMissing,
    deleteOne,
    deleteByWorkGroup,
    findAliveRefsInCompany,
    findRefsIncludingDeletedInCompany,
    nombreActualDelGrupo,
  };
}

/** Una fila suelta de la tabla: sin grupo y sin nombre congelado (R14). */
function filaSuelta(userId: string): AssignmentRow {
  return { userId, workGroupId: null, workGroupName: null };
}

/** Una fila que vino de un grupo, con su nombre CONGELADO. */
function filaDeGrupo(userId: string, workGroupName = NOMBRE_CONGELADO): AssignmentRow {
  return { userId, workGroupId: GRUPO, workGroupName };
}

function persona(id: string, displayName: string, isActive = true): PersonRef {
  return { id, displayName, isActive };
}

describe('QC-87 — consultar los responsables de un pedido', () => {
  // -------------------------------------------------------------------------------------
  // R3 — el permiso. Es el test del riesgo 3 del design.
  // -------------------------------------------------------------------------------------
  describe('el permiso exigido es `pedidos.consultar` y NO `asignaciones.consultar` (R3)', () => {
    it('un actor con SOLO `pedidos.consultar` y sin ningun `asignaciones.*` CONSULTA', async () => {
      const dobles = montar({ rows: [filaSuelta(ANA)], refs: [persona(ANA, 'Ana Perez')] });
      const listar = createListOrderResponsibles(dobles.deps);

      expect(CONSULTOR_DE_PEDIDOS.permissions).toEqual(['pedidos.consultar']);
      expect(CONSULTOR_DE_PEDIDOS.permissions.some((p) => p.startsWith('asignaciones.'))).toBe(false);

      await expect(listar(CONSULTOR_DE_PEDIDOS, PEDIDO)).resolves.toEqual([
        { userId: ANA, displayName: 'Ana Perez', origin: { kind: 'direct' } },
      ]);
    });

    it.each([
      ['solo `asignaciones.consultar`', ['asignaciones.consultar']],
      ['solo `asignaciones.modificar`', ['asignaciones.modificar']],
      ['los dos de `asignaciones` y ninguno de pedidos', ['asignaciones.consultar', 'asignaciones.modificar']],
    ])('%s NO sustituye a `pedidos.consultar`: rechaza sin tocar ningun puerto', async (_caso, permisos) => {
      const dobles = montar({ rows: [filaSuelta(ANA)] });
      const listar = createListOrderResponsibles(dobles.deps);

      await expect(listar(actorCon(...permisos), PEDIDO)).rejects.toMatchObject({
        code: 'unauthorized',
      });
      expect(dobles.findAliveById).not.toHaveBeenCalled();
      expect(dobles.listByOrderInCompany).not.toHaveBeenCalled();
      expect(dobles.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled();
    });

    it.each([
      ['actor nulo', null],
      ['actor ausente', undefined],
      ['con el conjunto vacio', actorCon()],
    ])('%s: falla cerrado, antes de tocar ningun puerto', async (_caso, actor) => {
      const dobles = montar({ rows: [filaSuelta(ANA)] });
      const listar = createListOrderResponsibles(dobles.deps);

      await expect(listar(actor as Actor | null | undefined, PEDIDO)).rejects.toMatchObject({
        code: 'unauthorized',
      });
      expect(dobles.findAliveById).not.toHaveBeenCalled();
      expect(dobles.listByOrderInCompany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------------------
  // R8, R7 — el pedido y la empresa.
  // -------------------------------------------------------------------------------------
  describe('el pedido y la empresa', () => {
    it('pedido inexistente o dado de baja: `order_not_found` y no se leen asignaciones (R8)', async () => {
      const dobles = montar({ status: null });
      const listar = createListOrderResponsibles(dobles.deps);

      await expect(listar(CONSULTOR_DE_PEDIDOS, PEDIDO)).rejects.toBeInstanceOf(OrderNotFoundError);
      await expect(listar(CONSULTOR_DE_PEDIDOS, PEDIDO)).rejects.toMatchObject({
        code: 'order_not_found',
      });
      expect(dobles.listByOrderInCompany).not.toHaveBeenCalled();
    });

    it('la lectura se acota a la empresa DEL ACTOR, que no es dato de entrada (R5, R7)', async () => {
      const dobles = montar({ rows: [filaSuelta(ANA)], refs: [persona(ANA, 'Ana Perez')] });
      const listar = createListOrderResponsibles(dobles.deps);

      await listar(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(dobles.listByOrderInCompany).toHaveBeenCalledWith(EMPRESA, PEDIDO);
      expect(dobles.listByOrderInCompany).not.toHaveBeenCalledWith(OTRA_EMPRESA, PEDIDO);
      // El directorio se pregunta con la MISMA empresa: una persona de otra empresa no puede
      // colarse ni siquiera para poner un nombre.
      expect(dobles.findRefsIncludingDeletedInCompany).toHaveBeenCalledWith(
        EMPRESA,
        [ANA],
        expect.any(Date),
      );
    });
  });

  // -------------------------------------------------------------------------------------
  // R13 — los cuatro estados devuelven lo mismo.
  // -------------------------------------------------------------------------------------
  describe('el estado del pedido NO cambia el resultado (R13)', () => {
    const rows = [filaSuelta(ANA), filaDeGrupo(BRUNO)];
    const refs = [persona(ANA, 'Ana Perez'), persona(BRUNO, 'Bruno Diaz')];

    it('los CUATRO estados son exactamente estos cuatro', () => {
      expect([...ESTADOS].sort()).toEqual(['CANCELADO', 'ENTREGADO', 'EN_CURSO', 'PENDIENTE']);
    });

    it.each(ESTADOS)('%s: no se rechaza y devuelve la misma lista', async (status) => {
      const dobles = montar({ status, rows, refs });
      const listar = createListOrderResponsibles(dobles.deps);

      await expect(listar(CONSULTOR_DE_PEDIDOS, PEDIDO)).resolves.toEqual([
        { userId: ANA, displayName: 'Ana Perez', origin: { kind: 'direct' } },
        {
          userId: BRUNO,
          displayName: 'Bruno Diaz',
          origin: { kind: 'workGroup', workGroupId: GRUPO, workGroupName: NOMBRE_CONGELADO },
        },
      ]);
    });

    it('el resultado de los cuatro estados es IDENTICO entre si', async () => {
      const salidas = await Promise.all(
        ESTADOS.map(async (status) => {
          const dobles = montar({ status, rows, refs });
          return createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);
        }),
      );

      for (const salida of salidas) expect(salida).toEqual(salidas[0]);
    });
  });

  // -------------------------------------------------------------------------------------
  // R35, R36 — la proyeccion: origen y nombre CONGELADO, los dos de la fila.
  // -------------------------------------------------------------------------------------
  describe('lo que devuelve cada entrada (R35, R36)', () => {
    it('identificador, nombre mostrable y origen; con grupo, la referencia y el nombre congelado', async () => {
      const dobles = montar({
        rows: [filaSuelta(ANA), filaDeGrupo(BRUNO)],
        refs: [persona(ANA, 'Ana Perez'), persona(BRUNO, 'Bruno Diaz')],
      });

      const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(salida[0]).toEqual({ userId: ANA, displayName: 'Ana Perez', origin: { kind: 'direct' } });
      expect(salida[1]).toEqual({
        userId: BRUNO,
        displayName: 'Bruno Diaz',
        origin: { kind: 'workGroup', workGroupId: GRUPO, workGroupName: NOMBRE_CONGELADO },
      });
    });

    it('el nombre CONGELADO de la fila gana al nombre ACTUAL del grupo (R36)', async () => {
      const dobles = montar({
        rows: [filaDeGrupo(BRUNO, NOMBRE_CONGELADO)],
        refs: [persona(BRUNO, 'Bruno Diaz')],
      });
      // Los dos nombres DIFIEREN: sin eso el test no distinguiria cual salio.
      expect(NOMBRE_CONGELADO).not.toBe(NOMBRE_ACTUAL_DEL_GRUPO);

      const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(salida[0]?.origin).toEqual({
        kind: 'workGroup',
        workGroupId: GRUPO,
        workGroupName: NOMBRE_CONGELADO,
      });
      expect(JSON.stringify(salida)).not.toContain(NOMBRE_ACTUAL_DEL_GRUPO);
      // Y la unica forma de haber sabido el nombre de hoy habria sido preguntarlo: NO se pregunto.
      expect(dobles.nombreActualDelGrupo).not.toHaveBeenCalled();
    });

    it('la lista NO se deriva de la pertenencia vigente: sale lo que hay en las FILAS (R36)', async () => {
      // El grupo «de hoy» tendria a CARLA; la fila congelada dice BRUNO. Sale BRUNO, y CARLA no.
      const dobles = montar({
        rows: [filaDeGrupo(BRUNO)],
        refs: [persona(BRUNO, 'Bruno Diaz'), persona(CARLA, 'Carla Ruiz')],
      });

      const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(salida.map((uno) => uno.userId)).toEqual([BRUNO]);
    });
  });

  // -------------------------------------------------------------------------------------
  // R38 — orden determinista y estable.
  // -------------------------------------------------------------------------------------
  describe('el orden (R38)', () => {
    it('ordena por nombre mostrable, no por el orden en que vienen las filas', async () => {
      const dobles = montar({
        rows: [filaSuelta(CARLA), filaSuelta(ANA), filaSuelta(BRUNO)],
        refs: [
          persona(CARLA, 'Carla Ruiz'),
          persona(ANA, 'Ana Perez'),
          persona(BRUNO, 'Bruno Diaz'),
        ],
      });

      const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(salida.map((uno) => uno.displayName)).toEqual(['Ana Perez', 'Bruno Diaz', 'Carla Ruiz']);
    });

    it('dos HOMONIMAS se desempatan por identificador, y el desempate es el que manda', async () => {
      // Las filas llegan con el id MAYOR primero: si no hubiera desempate, saldrian asi.
      const rows = [filaSuelta(CARLA), filaSuelta(ANA), filaSuelta(BRUNO)];
      const refs = [
        persona(CARLA, 'Ana Perez'),
        persona(ANA, 'Ana Perez'),
        persona(BRUNO, 'Ana Perez'),
      ];
      const dobles = montar({ rows, refs });

      const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(new Set(salida.map((uno) => uno.displayName))).toEqual(new Set(['Ana Perez']));
      expect(salida.map((uno) => uno.userId)).toEqual([...[ANA, BRUNO, CARLA]].sort());
      // Y no es el orden de llegada: eso es lo que hace que el test CAIGA si se quita el desempate.
      expect(salida.map((uno) => uno.userId)).not.toEqual(rows.map((fila) => fila.userId));
    });

    it('dos lecturas seguidas del mismo pedido devuelven la MISMA secuencia', async () => {
      const dobles = montar({
        rows: [filaSuelta(CARLA), filaDeGrupo(BRUNO), filaSuelta(ANA)],
        refs: [
          persona(CARLA, 'Ana Perez'),
          persona(BRUNO, 'Ana Perez'),
          persona(ANA, 'Ana Perez'),
        ],
      });
      const listar = createListOrderResponsibles(dobles.deps);

      const primera = await listar(CONSULTOR_DE_PEDIDOS, PEDIDO);
      const segunda = await listar(CONSULTOR_DE_PEDIDOS, PEDIDO);

      expect(segunda).toEqual(primera);
      expect(segunda.map((uno) => uno.userId)).toEqual(primera.map((uno) => uno.userId));
    });
  });

  // -------------------------------------------------------------------------------------
  // R39 — lo que la consulta NO devuelve.
  // -------------------------------------------------------------------------------------
  it('no devuelve credencial, correo, documento, estado de cuenta ni marca de baja (R39)', async () => {
    // El directorio devuelve `isActive` —y, en este doble, de propina lo que NUNCA debe salir—.
    const contaminada = {
      ...persona(ANA, 'Ana Perez', false),
      credentialHash: '$2b$12$loquesea',
      email: 'ana@ejemplo.com',
      documentNumber: '1020304050',
      accountStatus: 'inactive',
      deletedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as PersonRef;
    const dobles = montar({ rows: [filaSuelta(ANA)], refs: [contaminada] });

    const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

    expect(Object.keys(salida[0] ?? {}).sort()).toEqual(['displayName', 'origin', 'userId']);
    const serializada = JSON.stringify(salida);
    for (const prohibido of [
      'credentialHash',
      'email',
      'documentNumber',
      'accountStatus',
      'deletedAt',
      'isActive',
      '$2b$12$loquesea',
      'ana@ejemplo.com',
      '1020304050',
      'inactive',
    ]) {
      expect(serializada).not.toContain(prohibido);
    }
  });

  // -------------------------------------------------------------------------------------
  // R40 y la persona ausente del directorio.
  // -------------------------------------------------------------------------------------
  it('un pedido sin asignaciones devuelve lista VACIA y ningun error (R40)', async () => {
    const dobles = montar({ rows: [] });

    await expect(
      createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO),
    ).resolves.toEqual([]);
  });

  it('la persona que NO vuelve del directorio SIGUE SALIENDO, con su identificador por nombre', async () => {
    // ANA vuelve; BRUNO no —borrado fisicamente por consola, el caso raro de `design.md > 5`—.
    const dobles = montar({
      rows: [filaSuelta(ANA), filaDeGrupo(BRUNO)],
      refs: [persona(ANA, 'Ana Perez')],
    });

    const salida = await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

    expect(salida).toHaveLength(2);
    expect(salida.map((uno) => uno.userId).sort()).toEqual([ANA, BRUNO].sort());
    const ausente = salida.find((uno) => uno.userId === BRUNO);
    expect(ausente?.displayName).toBe(BRUNO);
    // Y conserva su origen: no se degrada a «suelto» por no tener nombre.
    expect(ausente?.origin).toEqual({
      kind: 'workGroup',
      workGroupId: GRUPO,
      workGroupName: NOMBRE_CONGELADO,
    });
  });

  it('usa el metodo que INCLUYE a las personas de baja, no el del camino de escritura (R37)', async () => {
    const dobles = montar({
      rows: [filaSuelta(ANA)],
      refs: [persona(ANA, 'Ana Perez', false)],
    });

    await expect(
      createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO),
    ).resolves.toHaveLength(1);
    expect(dobles.findRefsIncludingDeletedInCompany).toHaveBeenCalledTimes(1);
    expect(dobles.findAliveRefsInCompany).not.toHaveBeenCalled();
  });

  it('la consulta NO escribe: ningun metodo de escritura del puerto se llama', async () => {
    const dobles = montar({ rows: [filaSuelta(ANA)], refs: [persona(ANA, 'Ana Perez')] });

    await createListOrderResponsibles(dobles.deps)(CONSULTOR_DE_PEDIDOS, PEDIDO);

    expect(dobles.insertMissing).not.toHaveBeenCalled();
    expect(dobles.deleteOne).not.toHaveBeenCalled();
    expect(dobles.deleteByWorkGroup).not.toHaveBeenCalled();
  });
});
