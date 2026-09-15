// tests/unit/asignaciones/assign-responsibles.test.ts
//
// QC-87 T7 — El caso de uso `assignResponsibles` con DOBLES de sus cuatro puertos
// (R1, R2, R5, R6, R14-R28, R42).
//
// Dos bloques, con dos clases de doble y a proposito:
//
//   1. Los `vi.fn` de siempre, para lo que se afirma sobre COMO se llama a los puertos: el permiso
//      primero (R1, R2), la entrada invalida sin tocar nada (R42), los rechazos enteros (R17, R18,
//      R25), la empresa del actor (R5) y la composicion determinista (R24).
//   2. Una BASE EN MEMORIA que honra la semantica declarada de `insertMissing` —clave
//      `(order_id, user_id)` y `ON CONFLICT DO NOTHING`—, para lo que solo se puede afirmar
//      mirando el ESTADO: reaplicar un grupo no toca ninguna fila vieja (R15, R22), renombrarlo
//      despues tampoco (R28, R36), a quien se desasigno a mano se le vuelve a crear fila (R23) y
//      todo el lote viaja en una sola escritura (R27).
//
// Lo que este archivo NO prueba y donde se prueba: que Prisma y Postgres se comporten como el
// puerto declara es T14, contra la base real (`design.md > 8`). Aqui el sujeto es el CASO DE USO.
//
// Cubre R1, R2, R5, R6, R14-R20, R22-R28 y R42.

import { describe, expect, it, vi } from 'vitest';

import {
  createAssignResponsibles,
  type AssignResponsiblesDeps,
} from '@/lib/modules/asignaciones/domain/assign-responsibles';
import { AsignacionesError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type {
  NewAssignment,
  OrderAssignmentRepository,
} from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type {
  PeopleDirectory,
  PersonRef,
  WorkGroupDirectory,
  WorkGroupSnapshot,
} from '@/lib/modules/identity';
import type { OrderAssignmentTarget, OrderCatalog } from '@/lib/modules/pedidos';

/** Un uuid valido y legible a partir de un solo digito hexadecimal. */
function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const OTRA_EMPRESA = uuid('7');
const PEDIDO = uuid('a');
const ANA = uuid('1');
const BEA = uuid('2');
const CARLOS = uuid('c');
const TURNO_NOCHE = uuid('e');
const TURNO_DIA = uuid('f');
const AHORA = new Date('2026-09-13T10:00:00.000Z');

const ACTOR: Actor = { id: uuid('9'), companyId: EMPRESA, permissions: ['asignaciones.modificar'] };

function persona(id: string, isActive = true): PersonRef {
  return { id, displayName: `Persona ${id.slice(0, 1)}`, isActive };
}

function grupo(id: string, name: string, activeMemberIds: readonly string[]): WorkGroupSnapshot {
  return { id, name, activeMemberIds };
}

type Montaje = {
  readonly assign: ReturnType<typeof createAssignResponsibles>;
  readonly orders: { findAliveById: ReturnType<typeof vi.fn> };
  readonly people: Record<keyof PeopleDirectory, ReturnType<typeof vi.fn>>;
  readonly groups: Record<keyof WorkGroupDirectory, ReturnType<typeof vi.fn>>;
  readonly assignments: Record<keyof OrderAssignmentRepository, ReturnType<typeof vi.fn>>;
  /** Las filas que el caso de uso mando escribir, tal cual las mando. */
  filas(): readonly NewAssignment[];
};

/**
 * Dobles de los cuatro puertos. `personas` y `gruposVivos` son lo que CONTESTAN los directorios de
 * `identity`: quien decide si una cuenta esta activa es ese modulo (R21), y por eso aqui es un dato
 * de entrada del doble y no una regla que este test reimplemente.
 *
 * `añadidas` permite que el puerto de escritura devuelva un numero DISTINTO del de filas enviadas,
 * que es como se comprueba que R16 sale del puerto —de la base— y no de un `rows.length` local.
 */
function montar(opts: {
  readonly order?: OrderAssignmentTarget | null;
  readonly personas?: readonly PersonRef[];
  readonly gruposVivos?: readonly WorkGroupSnapshot[];
  readonly añadidas?: number;
}): Montaje {
  const order = opts.order === undefined ? { id: PEDIDO, status: 'PENDIENTE' as const } : opts.order;
  const personas = opts.personas ?? [];
  const gruposVivos = opts.gruposVivos ?? [];

  const orders = { findAliveById: vi.fn(async () => order) };

  const assignments = {
    insertMissing: vi.fn(async (rows: readonly NewAssignment[]) => opts.añadidas ?? rows.length),
    listByOrderInCompany: vi.fn(async () => []),
    // QC-102 T1: el puerto gano un quinto metodo (la consulta EN LOTE). El doble lo declara
    // para seguir satisfaciendo la interfaz; ningun caso de uso de QC-87 lo invoca.
    listByOrdersInCompany: vi.fn(async () => []),
    deleteOne: vi.fn(async () => 'ok' as const),
    deleteByWorkGroup: vi.fn(async () => 0),
  };

  const people = {
    // Un id que no existe, esta de baja o es de otra empresa simplemente NO vuelve (R6): el doble
    // se comporta igual que el contrato, devolviendo solo los que conoce.
    findAliveRefsInCompany: vi.fn(async (_companyId: string, ids: readonly string[]) =>
      personas.filter((p) => ids.includes(p.id)),
    ),
    findRefsIncludingDeletedInCompany: vi.fn(async () => []),
  };

  const groups = {
    findSnapshotAliveInCompany: vi.fn(
      async (_companyId: string, workGroupId: string) =>
        gruposVivos.find((g) => g.id === workGroupId) ?? null,
    ),
  };

  const deps: AssignResponsiblesDeps = {
    assignments: assignments as unknown as OrderAssignmentRepository,
    orders: orders as unknown as OrderCatalog,
    people: people as unknown as PeopleDirectory,
    groups: groups as unknown as WorkGroupDirectory,
  };

  return {
    assign: createAssignResponsibles(deps),
    orders,
    people,
    groups,
    assignments,
    filas: () => (assignments.insertMissing.mock.calls[0]?.[0] ?? []) as readonly NewAssignment[],
  };
}

/** «Ningun puerto se toco»: los SIETE metodos de los cuatro dobles, sin excepcion (R2, R42). */
function ningunPuertoSeToco(m: Montaje): void {
  expect(m.orders.findAliveById).not.toHaveBeenCalled();
  expect(m.people.findAliveRefsInCompany).not.toHaveBeenCalled();
  expect(m.people.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled();
  expect(m.groups.findSnapshotAliveInCompany).not.toHaveBeenCalled();
  expect(m.assignments.insertMissing).not.toHaveBeenCalled();
  expect(m.assignments.deleteOne).not.toHaveBeenCalled();
  expect(m.assignments.deleteByWorkGroup).not.toHaveBeenCalled();
}

async function codigoDelFallo(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    expect.unreachable('tenia que haber lanzado');
  } catch (error) {
    expect(error).toBeInstanceOf(AsignacionesError);
    return (error as AsignacionesError).code;
  }
  return 'inalcanzable';
}

describe('QC-87 — `assignResponsibles`', () => {
  /**
   * R1, R2 — el permiso es la PRIMERA LINEA. Los cuatro actores denegados de R2 se rechazan **sin
   * tocar ningun puerto**: ni la lectura del pedido, que es lo primero que ocurre despues.
   *
   * Los casos de `requirePermission` por si misma viven en `authorization.test.ts` (T6); aqui lo
   * que se prueba es que ESTE caso de uso la llama antes que nada.
   */
  describe('permiso primero (R1, R2)', () => {
    const DENEGADOS: readonly (readonly [string, Actor | null | undefined])[] = [
      ['actor nulo', null],
      ['actor ausente', undefined],
      ['sin conjunto de permisos', { id: ANA, companyId: EMPRESA } as unknown as Actor],
      ['con el conjunto vacio', { id: ANA, companyId: EMPRESA, permissions: [] }],
      [
        'con otros permisos pero no el exigido',
        { id: ANA, companyId: EMPRESA, permissions: ['pedidos.consultar', 'usuarios.modificar'] },
      ],
    ];

    for (const [nombre, actor] of DENEGADOS) {
      it(`${nombre}: 'unauthorized' y ningun puerto tocado`, async () => {
        const m = montar({ personas: [persona(ANA)] });

        expect(
          await codigoDelFallo(m.assign(actor, { orderId: PEDIDO, userIds: [ANA], workGroupIds: [] }, AHORA)),
        ).toBe('unauthorized');
        ningunPuertoSeToco(m);
      });
    }

    it('rechaza antes que `zod`: entrada INVALIDA y actor sin permiso dan `unauthorized`', async () => {
      const m = montar({});
      // Si `zod` corriera primero, esto seria `invalid_input` y revelaria que la entrada se miro
      // antes de saber quien pregunta.
      expect(await codigoDelFallo(m.assign(null, { patatas: true }, AHORA))).toBe('unauthorized');
      ningunPuertoSeToco(m);
    });
  });

  /** R42 — la entrada invalida se rechaza **sin tocar ningun puerto**. */
  describe('entrada invalida (R42)', () => {
    const INVALIDAS: readonly (readonly [string, unknown])[] = [
      ['sin `orderId`', { userIds: [ANA], workGroupIds: [] }],
      ['`orderId` que no es uuid', { orderId: 'pedido-7', userIds: [ANA], workGroupIds: [] }],
      ['sin ninguna persona y sin ningun grupo', { orderId: PEDIDO, userIds: [], workGroupIds: [] }],
      ['con identificadores repetidos', { orderId: PEDIDO, userIds: [ANA, ANA], workGroupIds: [] }],
      // R5: la empresa NO es un dato de entrada, y mandarla FALLA en vez de ignorarse.
      [
        'con `companyId` en la entrada',
        { orderId: PEDIDO, userIds: [ANA], workGroupIds: [], companyId: OTRA_EMPRESA },
      ],
    ];

    for (const [nombre, input] of INVALIDAS) {
      it(`${nombre}: 'invalid_input' y ningun puerto tocado`, async () => {
        const m = montar({ personas: [persona(ANA)] });
        expect(await codigoDelFallo(m.assign(ACTOR, input, AHORA))).toBe('invalid_input');
        ningunPuertoSeToco(m);
      });
    }
  });

  /** R14, R16 — una fila por persona, con origen SUELTO, y cuantas se anadieron. */
  describe('personas sueltas (R14, R16)', () => {
    it('crea una fila por persona, las dos columnas de grupo a `null`', async () => {
      const m = montar({ personas: [persona(ANA), persona(BEA)] });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [ANA, BEA], workGroupIds: [] },
        AHORA,
      );

      expect(outcome).toEqual({ added: 2 });
      expect(m.filas()).toEqual([
        { orderId: PEDIDO, userId: ANA, companyId: EMPRESA, workGroupId: null, workGroupName: null },
        { orderId: PEDIDO, userId: BEA, companyId: EMPRESA, workGroupId: null, workGroupName: null },
      ]);
      // UNA sola escritura, y ningun borrado: «borrar y reinsertar» es el riesgo n.o 1.
      expect(m.assignments.insertMissing).toHaveBeenCalledTimes(1);
      expect(m.assignments.deleteOne).not.toHaveBeenCalled();
      expect(m.assignments.deleteByWorkGroup).not.toHaveBeenCalled();
    });

    it('R16: el numero devuelto es el del PUERTO, no el de filas enviadas', async () => {
      // Tres filas enviadas, una sola creada: las otras dos ya estaban y las descarto la base
      // (R15, R22). Un `rows.length` local diria 3 y este test caeria.
      const m = montar({
        personas: [persona(ANA), persona(BEA), persona(CARLOS)],
        añadidas: 1,
      });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [ANA, BEA, CARLOS], workGroupIds: [] },
        AHORA,
      );

      expect(m.filas()).toHaveLength(3);
      expect(outcome).toEqual({ added: 1 });
    });

    it('el `now` de la operacion viaja a la escritura y a los dos directorios (R21, R28)', async () => {
      const m = montar({ personas: [persona(ANA)], gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [])] });

      await m.assign(ACTOR, { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE] }, AHORA);

      expect(m.people.findAliveRefsInCompany).toHaveBeenCalledWith(EMPRESA, [ANA], AHORA);
      expect(m.groups.findSnapshotAliveInCompany).toHaveBeenCalledWith(EMPRESA, TURNO_NOCHE, AHORA);
      expect(m.assignments.insertMissing).toHaveBeenCalledWith(expect.anything(), AHORA);
    });
  });

  /** R5 — la empresa de cada fila sale del ACTOR, y de ningun otro sitio. */
  it('R5: la empresa de las filas y de las lecturas es la del actor', async () => {
    const m = montar({ personas: [persona(ANA)], gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [BEA])] });
    const otroActor: Actor = { id: uuid('9'), companyId: OTRA_EMPRESA, permissions: ['asignaciones.modificar'] };

    await m.assign(otroActor, { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE] }, AHORA);

    expect(m.people.findAliveRefsInCompany).toHaveBeenCalledWith(OTRA_EMPRESA, [ANA], AHORA);
    expect(m.groups.findSnapshotAliveInCompany).toHaveBeenCalledWith(OTRA_EMPRESA, TURNO_NOCHE, AHORA);
    expect(m.filas().map((fila) => fila.companyId)).toEqual([OTRA_EMPRESA, OTRA_EMPRESA]);
  });

  /** R17, R18, R6 — rechazo ENTERO: el puerto de escritura no se llamo. */
  describe('personas que no se pueden asignar (R17, R18, R6)', () => {
    it("R17: una persona que no vuelve del directorio -> 'user_not_found', ninguna fila", async () => {
      // ANA existe; BEA no vuelve (no existe, esta de baja o es de otra empresa: el mismo caso).
      const m = montar({ personas: [persona(ANA)] });

      expect(
        await codigoDelFallo(
          m.assign(ACTOR, { orderId: PEDIDO, userIds: [ANA, BEA], workGroupIds: [] }, AHORA),
        ),
      ).toBe('user_not_found');

      expect(m.assignments.insertMissing).not.toHaveBeenCalled();
    });

    it("R18: una persona con la cuenta no activa -> 'user_not_assignable', ninguna fila", async () => {
      const m = montar({ personas: [persona(ANA), persona(BEA, false)] });

      expect(
        await codigoDelFallo(
          m.assign(ACTOR, { orderId: PEDIDO, userIds: [ANA, BEA], workGroupIds: [] }, AHORA),
        ),
      ).toBe('user_not_assignable');

      expect(m.assignments.insertMissing).not.toHaveBeenCalled();
    });

    it('R17 y R18 son codigos DISTINTOS: no existe no es lo mismo que no asignable', async () => {
      const noExiste = montar({ personas: [] });
      const noActiva = montar({ personas: [persona(ANA, false)] });
      const entrada = { orderId: PEDIDO, userIds: [ANA], workGroupIds: [] };

      const a = await codigoDelFallo(noExiste.assign(ACTOR, entrada, AHORA));
      const b = await codigoDelFallo(noActiva.assign(ACTOR, entrada, AHORA));

      expect(a).toBe('user_not_found');
      expect(b).toBe('user_not_assignable');
      expect(a).not.toBe(b);
    });

    it('el rechazo es ENTERO: ni siquiera se escriben las personas validas que iban delante', async () => {
      const m = montar({ personas: [persona(ANA), persona(CARLOS)] });

      await codigoDelFallo(
        m.assign(ACTOR, { orderId: PEDIDO, userIds: [ANA, CARLOS, BEA], workGroupIds: [] }, AHORA),
      );

      expect(m.assignments.insertMissing).not.toHaveBeenCalled();
    });
  });

  /** R19, R20, R25, R26, R28 — aplicar grupos. */
  describe('aplicar grupos (R19, R20, R25, R26, R28)', () => {
    it('R19, R28: una fila por miembro activo, con la referencia y el NOMBRE CONGELADO', async () => {
      const m = montar({ gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [ANA, BEA])] });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] },
        AHORA,
      );

      expect(outcome).toEqual({ added: 2 });
      expect(m.filas()).toEqual([
        {
          orderId: PEDIDO,
          userId: ANA,
          companyId: EMPRESA,
          workGroupId: TURNO_NOCHE,
          workGroupName: 'Turno noche',
        },
        {
          orderId: PEDIDO,
          userId: BEA,
          companyId: EMPRESA,
          workGroupId: TURNO_NOCHE,
          workGroupName: 'Turno noche',
        },
      ]);
    });

    /**
     * R28 — el nombre congelado va en la MISMA escritura, no se relee. El doble del directorio se
     * llama UNA sola vez por grupo, y el nombre que viaja en la fila es el de ese snapshot: no hay
     * ninguna segunda consulta de la que pudiera salir el nombre de despues.
     */
    it('R28: el nombre sale del snapshot, y el grupo no se vuelve a consultar', async () => {
      const m = montar({ gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [ANA])] });

      await m.assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, AHORA);

      expect(m.groups.findSnapshotAliveInCompany).toHaveBeenCalledTimes(1);
      expect(m.filas()[0]?.workGroupName).toBe('Turno noche');
    });

    it('R20: los miembros que el directorio no da por activos no reciben fila, y no fallan nada', async () => {
      // El snapshot ya viene filtrado por `identity` (R21): CARLOS no esta en `activeMemberIds`.
      const m = montar({ gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [ANA])] });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] },
        AHORA,
      );

      expect(outcome).toEqual({ added: 1 });
      expect(m.filas().map((fila) => fila.userId)).toEqual([ANA]);
      expect(m.filas().map((fila) => fila.userId)).not.toContain(CARLOS);
    });

    it("R25: un grupo que no vuelve -> 'work_group_not_found' y ninguna fila", async () => {
      const m = montar({ personas: [persona(ANA)], gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [BEA])] });

      expect(
        await codigoDelFallo(
          m.assign(
            ACTOR,
            { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE, TURNO_DIA] },
            AHORA,
          ),
        ),
      ).toBe('work_group_not_found');

      expect(m.assignments.insertMissing).not.toHaveBeenCalled();
    });

    it('R26: un grupo VIVO sin ningun miembro activo termina con EXITO y cero anadidas', async () => {
      const m = montar({ gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [])] });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] },
        AHORA,
      );

      // Ni error, ni fila. Un grupo vacio NO es `work_group_not_found`: el grupo existe.
      expect(outcome).toEqual({ added: 0 });
      expect(m.filas()).toEqual([]);
    });
  });

  /**
   * R24 — LA MISMA PERSONA POR DOS CAMINOS: **gana el PRIMERO**, con el orden documentado en
   * `assign-responsibles.ts` (sueltas en el orden recibido, luego cada grupo en el orden recibido y
   * sus miembros en el orden del snapshot).
   *
   * Estos tres casos son los que caen si alguien invierte la regla para que gane el ULTIMO: cada
   * uno afirma sobre el ORIGEN persistido, que es lo que cambia al invertirla, y no solo sobre el
   * numero de filas —que seria el mismo con las dos reglas y no probaria nada—.
   */
  describe('la misma persona por dos caminos: gana el primero (R24)', () => {
    it('suelta primero y luego en un grupo: la fila queda SUELTA', async () => {
      const m = montar({
        personas: [persona(ANA)],
        gruposVivos: [grupo(TURNO_NOCHE, 'Turno noche', [ANA, BEA])],
      });

      await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE] },
        AHORA,
      );

      expect(m.filas()).toEqual([
        // ANA una sola vez, y con el origen del PRIMER camino: suelta.
        { orderId: PEDIDO, userId: ANA, companyId: EMPRESA, workGroupId: null, workGroupName: null },
        {
          orderId: PEDIDO,
          userId: BEA,
          companyId: EMPRESA,
          workGroupId: TURNO_NOCHE,
          workGroupName: 'Turno noche',
        },
      ]);
    });

    it('en dos grupos: gana el PRIMERO de la lista recibida, con SU nombre congelado', async () => {
      const m = montar({
        gruposVivos: [
          grupo(TURNO_NOCHE, 'Turno noche', [ANA]),
          grupo(TURNO_DIA, 'Turno dia', [ANA, BEA]),
        ],
      });

      await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE, TURNO_DIA] },
        AHORA,
      );

      expect(m.filas()).toEqual([
        {
          orderId: PEDIDO,
          userId: ANA,
          companyId: EMPRESA,
          workGroupId: TURNO_NOCHE,
          workGroupName: 'Turno noche',
        },
        {
          orderId: PEDIDO,
          userId: BEA,
          companyId: EMPRESA,
          workGroupId: TURNO_DIA,
          workGroupName: 'Turno dia',
        },
      ]);
    });

    it('el orden de los grupos recibido MANDA: al invertirlo, gana el otro', async () => {
      // El mismo escenario con las dos listas al reves. Que el resultado cambie es lo que
      // demuestra que la regla es «el primer CAMINO» y no «el grupo con tal nombre» ni el azar de
      // un `Object.keys`.
      const m = montar({
        gruposVivos: [
          grupo(TURNO_NOCHE, 'Turno noche', [ANA]),
          grupo(TURNO_DIA, 'Turno dia', [ANA]),
        ],
      });

      await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_DIA, TURNO_NOCHE] },
        AHORA,
      );

      expect(m.filas()).toEqual([
        {
          orderId: PEDIDO,
          userId: ANA,
          companyId: EMPRESA,
          workGroupId: TURNO_DIA,
          workGroupName: 'Turno dia',
        },
      ]);
    });

    it('una sola fila por persona aunque llegue por tres caminos', async () => {
      const m = montar({
        personas: [persona(ANA)],
        gruposVivos: [
          grupo(TURNO_NOCHE, 'Turno noche', [ANA]),
          grupo(TURNO_DIA, 'Turno dia', [ANA]),
        ],
      });

      const outcome = await m.assign(
        ACTOR,
        { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE, TURNO_DIA] },
        AHORA,
      );

      expect(m.filas()).toHaveLength(1);
      expect(outcome).toEqual({ added: 1 });
    });
  });
});

// ---------------------------------------------------------------------------
// Reaplicar un grupo, con una BASE DE MENTIRA que honra el contrato del puerto
// ---------------------------------------------------------------------------

/**
 * QC-87 T7 — R15, R22, R23, R27 y R28/R36 vistos DESDE EL DOMINIO.
 *
 * Los dobles de `vi.fn` de arriba no pueden demostrar nada sobre «la fila vieja no cambio»: no
 * guardan nada. Lo que se monta aqui es una base en memoria que implementa `insertMissing` con
 * **exactamente** la semantica que el puerto declara (`design.md > 3`) y que QC-86 puso en la
 * tabla: la clave primaria es `(order_id, user_id)` y el insert es
 * `INSERT ... ON CONFLICT DO NOTHING`. Con eso, «reaplicar» deja de ser una promesa del comentario
 * y pasa a ser una observacion: se guarda la FOTO de las filas, se vuelve a aplicar el grupo —ya
 * renombrado, ya con gente nueva— y se compara la foto entera, `createdAt` incluido.
 *
 * **Que NO demuestra esto, y donde se demuestra**: que Prisma y Postgres se comporten asi es T14,
 * contra la base real (`design.md > 8`); aqui el sujeto es el CASO DE USO. Y es un sujeto con
 * trabajo propio: la unica forma de que estos tres casos pasen es que el dominio mande **una sola
 * escritura con las filas que faltan**. Si alguien implementara la reaplicacion como «borrar y
 * volver a insertar» —riesgo n.o 1 de `design.md > 10`— la foto cambiaria entera y los tres caen.
 */

/** Una fila tal como queda GUARDADA: lo que el caso de uso mando, mas los dos sellos de tiempo. */
type FilaGuardada = NewAssignment & { readonly createdAt: Date; readonly updatedAt: Date };

/**
 * La base de mentira. `insertMissing` NO mira las filas antes de escribir ni actualiza ninguna: la
 * que ya esta se descarta por la clave, que es lo que hace la base de verdad (R15, R22). Los dos
 * borrados existen para poder afirmar que el caso de uso **no los llama nunca**, y `quitarAMano`
 * simula la desasignacion de R23 sin pasar por el caso de uso de T8.
 */
function baseEnMemoria(): {
  readonly repo: OrderAssignmentRepository;
  readonly escrituras: () => number;
  readonly borrados: () => number;
  readonly foto: () => readonly FilaGuardada[];
  readonly quitarAMano: (userId: string) => void;
} {
  const filas = new Map<string, FilaGuardada>();
  const clave = (orderId: string, userId: string): string => `${orderId}|${userId}`;
  let escrituras = 0;
  let borrados = 0;

  const repo: OrderAssignmentRepository = {
    async insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number> {
      escrituras += 1;
      let added = 0;
      for (const row of rows) {
        const key = clave(row.orderId, row.userId);
        // ON CONFLICT DO NOTHING: la que ya estaba se queda EXACTAMENTE como estaba.
        if (filas.has(key)) continue;
        filas.set(key, { ...row, createdAt: now, updatedAt: now });
        added += 1;
      }
      return added;
    },
    async listByOrderInCompany(): Promise<readonly never[]> {
      return [];
    },
    // QC-102 T1: el quinto metodo del puerto. Este doble en memoria no lo ejercita: la
    // consulta EN LOTE es de QC-102 y tiene sus propios tests.
    async listByOrdersInCompany(): Promise<readonly never[]> {
      return [];
    },
    async deleteOne(): Promise<'ok'> {
      borrados += 1;
      return 'ok';
    },
    async deleteByWorkGroup(): Promise<number> {
      borrados += 1;
      return 0;
    },
  };

  return {
    repo,
    escrituras: () => escrituras,
    borrados: () => borrados,
    // Ordenada por `userId` para que la comparacion no dependa del orden de insercion.
    foto: () => [...filas.values()].sort((a, b) => a.userId.localeCompare(b.userId)),
    quitarAMano: (userId: string) => {
      filas.delete(clave(PEDIDO, userId));
    },
  };
}

/**
 * El caso de uso sobre la base en memoria, con un grupo MUTABLE: `snapshot()` decide que contesta
 * el directorio de `identity` en cada llamada, que es como se simula «entretanto el grupo cambio»
 * —crecio, encogio o lo renombraron— sin tocar ninguna fila ya escrita.
 */
function montarSobreBase(
  base: ReturnType<typeof baseEnMemoria>,
  snapshot: () => WorkGroupSnapshot,
): ReturnType<typeof createAssignResponsibles> {
  const deps: AssignResponsiblesDeps = {
    assignments: base.repo,
    orders: { findAliveById: async () => ({ id: PEDIDO, status: 'PENDIENTE' as const }) },
    people: {
      findAliveRefsInCompany: async (_companyId: string, ids: readonly string[]) =>
        ids.map((id) => persona(id)),
      findRefsIncludingDeletedInCompany: async () => [],
    } as unknown as PeopleDirectory,
    groups: {
      findSnapshotAliveInCompany: async (_companyId: string, workGroupId: string) =>
        workGroupId === snapshot().id ? snapshot() : null,
    } as unknown as WorkGroupDirectory,
  };
  return createAssignResponsibles(deps);
}

describe('QC-87 — reaplicar un grupo no toca lo que ya estaba (R15, R22, R23, R27, R28, R36)', () => {
  const MAS_TARDE = new Date('2026-09-14T08:30:00.000Z');

  it('R22, R15: reaplicar un grupo que crecio anade SOLO a los que faltan, y NINGUNA fila vieja cambia', async () => {
    const base = baseEnMemoria();
    let turno: WorkGroupSnapshot = grupo(TURNO_NOCHE, 'Turno noche', [BEA]);
    const assign = montarSobreBase(base, () => turno);

    // Primera aplicacion: ANA a mano —suelta— y BEA por el grupo.
    const primera = await assign(
      ACTOR,
      { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE] },
      AHORA,
    );
    expect(primera).toEqual({ added: 2 });
    const antes = base.foto();

    // Entretanto entra CARLOS en el turno, y ANA tambien —pero ANA ya tiene su fila SUELTA—.
    turno = grupo(TURNO_NOCHE, 'Turno noche', [ANA, BEA, CARLOS]);

    const segunda = await assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, MAS_TARDE);

    // Solo CARLOS es nuevo: BEA ya estaba por el grupo y ANA ya estaba suelta (R16, R22).
    expect(segunda).toEqual({ added: 1 });

    const despues = base.foto();
    expect(despues).toHaveLength(3);
    // NINGUNA fila vieja cambio: ni su origen, ni su referencia de grupo, ni su nombre congelado,
    // ni sus sellos de tiempo. Se compara la foto ENTERA, que es lo que cae si alguien reescribe.
    expect(despues.filter((fila) => fila.userId !== CARLOS)).toEqual(antes);
    // ANA sigue SUELTA aunque ahora tambien sea miembro del grupo: gana el primer origen (R24).
    expect(despues.find((fila) => fila.userId === ANA)).toMatchObject({
      workGroupId: null,
      workGroupName: null,
      createdAt: AHORA,
    });
    expect(despues.find((fila) => fila.userId === CARLOS)).toMatchObject({
      workGroupId: TURNO_NOCHE,
      workGroupName: 'Turno noche',
      createdAt: MAS_TARDE,
    });
    // R27 y riesgo n.o 1: una escritura por operacion y CERO borrados. «Borrar y reinsertar»
    // dejaria esta cuenta en otro sitio y la foto de arriba, irreconocible.
    expect(base.escrituras()).toBe(2);
    expect(base.borrados()).toBe(0);
  });

  it('R28, R36: renombrar el grupo DESPUES no cambia ninguna fila ya creada', async () => {
    const base = baseEnMemoria();
    let turno: WorkGroupSnapshot = grupo(TURNO_NOCHE, 'Turno noche', [ANA, BEA]);
    const assign = montarSobreBase(base, () => turno);

    await assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, AHORA);
    const antes = base.foto();
    expect(antes.map((fila) => fila.workGroupName)).toEqual(['Turno noche', 'Turno noche']);

    // El grupo se renombra —y ademas entra CARLOS—. El nombre de AHORA es el que se congela en las
    // filas NUEVAS, y solo en ellas.
    turno = grupo(TURNO_NOCHE, 'Turno de noche (planta 2)', [ANA, BEA, CARLOS]);

    const segunda = await assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, MAS_TARDE);
    expect(segunda).toEqual({ added: 1 });

    const despues = base.foto();
    // Las dos filas viejas, intactas: el nombre congelado sigue diciendo como se llamaba ENTONCES.
    expect(despues.filter((fila) => fila.userId !== CARLOS)).toEqual(antes);
    expect(despues.find((fila) => fila.userId === CARLOS)?.workGroupName).toBe('Turno de noche (planta 2)');
    expect(base.borrados()).toBe(0);
  });

  it('R23: a quien se desasigno a mano y sigue en el grupo, reaplicar le vuelve a crear fila', async () => {
    const base = baseEnMemoria();
    const turno = grupo(TURNO_NOCHE, 'Turno noche', [ANA, BEA]);
    const assign = montarSobreBase(base, () => turno);

    await assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, AHORA);
    // Alguien saca a BEA del pedido a mano (T8, aqui simulado sobre la base).
    base.quitarAMano(BEA);
    expect(base.foto().map((fila) => fila.userId)).toEqual([ANA]);

    const segunda = await assign(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [TURNO_NOCHE] }, MAS_TARDE);

    // Vuelve a entrar, y su fila es NUEVA —sello de tiempo de la reaplicacion—; la de ANA, la de
    // siempre. Es la consecuencia escrita de la decision cerrada 2.
    expect(segunda).toEqual({ added: 1 });
    expect(base.foto().map((fila) => fila.userId)).toEqual([ANA, BEA]);
    expect(base.foto().find((fila) => fila.userId === BEA)?.createdAt).toEqual(MAS_TARDE);
    expect(base.foto().find((fila) => fila.userId === ANA)?.createdAt).toEqual(AHORA);
  });

  it('R27: todas las filas del lote viajan en UNA sola escritura, sueltas y grupos juntos', async () => {
    const base = baseEnMemoria();
    const turno = grupo(TURNO_NOCHE, 'Turno noche', [BEA, CARLOS]);
    const assign = montarSobreBase(base, () => turno);

    const outcome = await assign(
      ACTOR,
      { orderId: PEDIDO, userIds: [ANA], workGroupIds: [TURNO_NOCHE] },
      AHORA,
    );

    expect(outcome).toEqual({ added: 3 });
    expect(base.escrituras()).toBe(1);
    expect(base.borrados()).toBe(0);
  });
});
