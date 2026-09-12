// QC-84 T12 — Los cinco casos de uso de escritura y los dos de lectura contra DOBLES del puerto:
// ambito de empresa, grupo dado de baja como inexistente, crear, renombrar, dar de baja, meter y
// sacar; y que NO EXISTE ninguna operacion de restaurar.
//
// Cubre R8, R9, R10, R11, R12, R13, R14, R16, R17, R18 (la mitad de dominio), R28, R29, R30, R32,
// R33, R34, R35, R36, R37, R38 (la mitad de dominio) y R40.
//
// Dos propiedades de este archivo son el requisito, no un estilo:
//
//   1. **Los dobles explotan por defecto.** Cada metodo del puerto que un caso NO declara lanza si
//      alguien lo llama. Asi «ningun caso de error escribe por el puerto» (`tasks.md > T12`) no se
//      afirma solo con `not.toHaveBeenCalled()` al final —que se puede olvidar— sino tambien con
//      una excepcion en el momento.
//   2. **Se afirma sobre el PRIMER argumento de cada llamada.** `companyId` es el primer parametro
//      obligatorio de los siete metodos (`design.md > 5`), y que salga del ACTOR y de ningun otro
//      sitio es R8 y R11. Un caso de uso que leyera la empresa de la entrada pasaria el typecheck
//      y fallaria aqui.
//
// Los cuatro caminos del duplicado de pertenencia (R30, R31) viven en `add-member-errors.test.ts`,
// que es su propio archivo porque son cuatro `code` distintos y merecen una tabla propia.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createAddWorkGroupMember } from '@/lib/modules/identity/domain/add-work-group-member';
import { createCreateWorkGroup } from '@/lib/modules/identity/domain/create-work-group';
import { createDeleteWorkGroup } from '@/lib/modules/identity/domain/delete-work-group';
import {
  IdentityError,
  UserNotFoundError,
  ValidationError,
  WorkGroupDuplicateNameError,
  WorkGroupMemberExistsError,
  WorkGroupMemberNotFoundError,
  WorkGroupNotFoundError,
} from '@/lib/modules/identity/domain/errors';
import { createListWorkGroupMembers } from '@/lib/modules/identity/domain/list-work-group-members';
import { createListWorkGroups } from '@/lib/modules/identity/domain/list-work-groups';
import { createRemoveWorkGroupMember } from '@/lib/modules/identity/domain/remove-work-group-member';
import { createRenameWorkGroup } from '@/lib/modules/identity/domain/rename-work-group';
import { normalizeWorkGroupName } from '@/lib/modules/identity/domain/work-group-name';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type {
  MemberCandidate,
  WorkGroupRepository,
} from '@/lib/modules/identity/ports/work-group-repository';

const identityDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'identity',
);

function codigoSinComentarios(relativo: string): string {
  return readFileSync(join(identityDir, relativo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

/** Los SIETE metodos del puerto (`design.md > 5`). La lista se afirma contra el fuente real. */
const METODOS = [
  'createInCompany',
  'renameAliveInCompany',
  'softDeleteAliveInCompany',
  'listAliveInCompany',
  'listMembersAliveInCompany',
  'addMemberAliveInCompany',
  'removeMemberAliveInCompany',
] as const;

type Metodo = (typeof METODOS)[number];

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
/** La empresa del vecino: ninguna llamada del actor de arriba puede nombrarla nunca. */
const OTRA_COMPANY_ID = '88888888-8888-4888-8888-888888888888';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const NOW = new Date('2026-09-11T12:00:00.000Z');

const actor: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const otroActor: Actor = { ...actor, companyId: OTRA_COMPANY_ID };

/**
 * Dobles del puerto. Lo que no se declara en `respuestas` **explota si lo llaman**: un caso de
 * error que escribiera «de paso» no llegaria a la asercion final, caeria en el acto.
 */
function dobles(respuestas: Partial<Record<Metodo, unknown>> = {}) {
  const espias = {} as Record<Metodo, ReturnType<typeof vi.fn>>;

  for (const metodo of METODOS) {
    espias[metodo] = Object.hasOwn(respuestas, metodo)
      ? vi.fn(async () => respuestas[metodo])
      : vi.fn(() => {
          throw new Error(`el puerto ${metodo} no debia llamarse en este caso`);
        });
  }

  return { workGroups: espias as unknown as WorkGroupRepository, espias };
}

const log: ListQueryLog = { ignoredFields: vi.fn() } as unknown as ListQueryLog;

const pagination = { toOffsetLimit, buildPage };

function soloSeLlamo(
  espias: Record<Metodo, ReturnType<typeof vi.fn>>,
  metodo: Metodo,
  veces = 1,
): void {
  for (const otro of METODOS) {
    if (otro === metodo) {
      expect(espias[otro], `${otro} debia llamarse ${veces} vez/veces`).toHaveBeenCalledTimes(veces);
    } else {
      expect(espias[otro], `${otro} no debia llamarse`).not.toHaveBeenCalled();
    }
  }
}

function ningunoSeLlamo(espias: Record<Metodo, ReturnType<typeof vi.fn>>): void {
  for (const metodo of METODOS) {
    expect(espias[metodo], `${metodo} no debia llamarse`).not.toHaveBeenCalled();
  }
}

async function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => null,
    (error: unknown) => error,
  );
}

function esperarCodigo(fallo: unknown, code: string, etiqueta: string): void {
  expect(fallo, `${etiqueta}: no fallo`).toBeInstanceOf(IdentityError);
  expect((fallo as IdentityError).code, etiqueta).toBe(code);
}

const CANDIDATO: MemberCandidate = {
  id: USER_ID,
  firstNames: 'Ana Maria',
  lastNames: 'Perez Loor',
  username: 'aperez',
  accountStatus: 'active',
  lockedUntil: null,
};

describe('QC-84 T12 — los siete casos de uso contra dobles del puerto', () => {
  describe('ambito de empresa (R8, R11)', () => {
    it('R8 — los siete metodos reciben la empresa del ACTOR como PRIMER argumento', async () => {
      const casos: readonly {
        readonly metodo: Metodo;
        readonly respuesta: unknown;
        readonly ejecutar: (repo: WorkGroupRepository, quien: Actor) => Promise<unknown>;
      }[] = [
        {
          metodo: 'createInCompany',
          respuesta: { id: GROUP_ID },
          ejecutar: (workGroups, quien) =>
            createCreateWorkGroup({ workGroups })(quien, { name: 'Turno noche' }),
        },
        {
          metodo: 'renameAliveInCompany',
          respuesta: 'ok',
          ejecutar: (workGroups, quien) =>
            createRenameWorkGroup({ workGroups })(quien, {
              workGroupId: GROUP_ID,
              name: 'Turno tarde',
            }),
        },
        {
          metodo: 'softDeleteAliveInCompany',
          respuesta: 'ok',
          ejecutar: (workGroups, quien) =>
            createDeleteWorkGroup({ workGroups })(quien, { workGroupId: GROUP_ID }),
        },
        {
          metodo: 'addMemberAliveInCompany',
          respuesta: { kind: 'created' },
          ejecutar: (workGroups, quien) =>
            createAddWorkGroupMember({ workGroups })(quien, {
              workGroupId: GROUP_ID,
              userId: USER_ID,
            }),
        },
        {
          metodo: 'removeMemberAliveInCompany',
          respuesta: 'ok',
          ejecutar: (workGroups, quien) =>
            createRemoveWorkGroupMember({ workGroups })(quien, {
              workGroupId: GROUP_ID,
              userId: USER_ID,
            }),
        },
        {
          metodo: 'listAliveInCompany',
          respuesta: buildPage([], 0, 1, 10),
          ejecutar: (workGroups, quien) =>
            createListWorkGroups({ workGroups, log })(quien, { page: 1 }),
        },
        {
          metodo: 'listMembersAliveInCompany',
          respuesta: [],
          ejecutar: (workGroups, quien) =>
            createListWorkGroupMembers({ workGroups, pagination, log })(
              quien,
              GROUP_ID,
              { page: 1 },
              NOW,
            ),
        },
      ];

      expect(casos.map((c) => c.metodo).sort()).toEqual([...METODOS].sort());

      for (const { metodo, respuesta, ejecutar } of casos) {
        const d = dobles({ [metodo]: respuesta });
        await ejecutar(d.workGroups, actor);

        soloSeLlamo(d.espias, metodo);
        expect(d.espias[metodo].mock.calls[0]?.[0], `${metodo} no recibio la empresa del actor`).toBe(
          COMPANY_ID,
        );

        // Y la otra mitad: el MISMO input con otro actor nombra la OTRA empresa. La empresa sale
        // del actor y de ningun otro sitio (R11).
        const d2 = dobles({ [metodo]: respuesta });
        await ejecutar(d2.workGroups, otroActor);
        expect(d2.espias[metodo].mock.calls[0]?.[0]).toBe(OTRA_COMPANY_ID);
      }
    });

    it('R8 — un grupo de otra empresa responde «grupo no encontrado» y no modifica ninguna fila', async () => {
      // El puerto contesta `not_found` porque su `WHERE` lleva `company_id = ?`: para el dominio,
      // «de otra empresa» y «no existe» son EL MISMO caso, que es lo que impide usar la operacion
      // como oraculo de existencia sobre datos ajenos.
      const renombrar = dobles({ renameAliveInCompany: 'not_found' });
      esperarCodigo(
        await capturar(
          createRenameWorkGroup({ workGroups: renombrar.workGroups })(actor, {
            workGroupId: GROUP_ID,
            name: 'Turno noche',
          }),
        ),
        'work_group_not_found',
        'renombrar un grupo ajeno',
      );
      soloSeLlamo(renombrar.espias, 'renameAliveInCompany');

      const miembros = dobles({ listMembersAliveInCompany: 'not_found' });
      esperarCodigo(
        await capturar(
          createListWorkGroupMembers({ workGroups: miembros.workGroups, pagination, log })(
            actor,
            GROUP_ID,
            { page: 1 },
            NOW,
          ),
        ),
        'work_group_not_found',
        'consultar los miembros de un grupo ajeno',
      );
      soloSeLlamo(miembros.espias, 'listMembersAliveInCompany');
    });

    it('R11 — mandar `companyId` en la entrada falla y no toca el puerto', async () => {
      // El esquema es `strictObject`: crear un grupo en otra empresa no es expresable, ni siquiera
      // por un adaptador descuidado que reenviara el cuerpo entero de un formulario.
      const d = dobles();
      const fallo = await capturar(
        createCreateWorkGroup({ workGroups: d.workGroups })(actor, {
          name: 'Turno noche',
          companyId: OTRA_COMPANY_ID,
        }),
      );

      expect(fallo).toBeInstanceOf(ValidationError);
      ningunoSeLlamo(d.espias);
    });
  });

  describe('el grupo dado de baja es inexistente para las SIETE operaciones (R9)', () => {
    it('renombrar, dar de baja, meter, sacar y consultar los miembros responden «no encontrado»', async () => {
      // El puerto filtra `deleted_at IS NULL` (por eso los metodos se llaman `…AliveInCompany`),
      // asi que un grupo dado de baja llega al dominio como el `not_found` de siempre. Lo que este
      // test fija es que NINGUNA de las cinco lo distingue ni escribe nada al encontrarselo.
      const casos: readonly {
        readonly nombre: string;
        readonly metodo: Metodo;
        readonly respuesta: unknown;
        readonly ejecutar: (workGroups: WorkGroupRepository) => Promise<unknown>;
      }[] = [
        {
          nombre: 'renombrar',
          metodo: 'renameAliveInCompany',
          respuesta: 'not_found',
          ejecutar: (workGroups) =>
            createRenameWorkGroup({ workGroups })(actor, {
              workGroupId: GROUP_ID,
              name: 'Turno noche',
            }),
        },
        {
          nombre: 'volver a darlo de baja',
          metodo: 'softDeleteAliveInCompany',
          respuesta: 'not_found',
          ejecutar: (workGroups) =>
            createDeleteWorkGroup({ workGroups })(actor, { workGroupId: GROUP_ID }),
        },
        {
          nombre: 'meter a una persona',
          metodo: 'addMemberAliveInCompany',
          respuesta: { kind: 'group_not_found' },
          ejecutar: (workGroups) =>
            createAddWorkGroupMember({ workGroups })(actor, {
              workGroupId: GROUP_ID,
              userId: USER_ID,
            }),
        },
        {
          nombre: 'sacar a una persona',
          metodo: 'removeMemberAliveInCompany',
          respuesta: 'group_not_found',
          ejecutar: (workGroups) =>
            createRemoveWorkGroupMember({ workGroups })(actor, {
              workGroupId: GROUP_ID,
              userId: USER_ID,
            }),
        },
        {
          nombre: 'consultar sus miembros',
          metodo: 'listMembersAliveInCompany',
          respuesta: 'not_found',
          ejecutar: (workGroups) =>
            createListWorkGroupMembers({ workGroups, pagination, log })(
              actor,
              GROUP_ID,
              { page: 1 },
              NOW,
            ),
        },
      ];

      for (const { nombre, metodo, respuesta, ejecutar } of casos) {
        const d = dobles({ [metodo]: respuesta });
        esperarCodigo(await capturar(ejecutar(d.workGroups)), 'work_group_not_found', nombre);
        soloSeLlamo(d.espias, metodo);
      }
    });

    it('R9, R24 — el listado no puede pedir los grupos dados de baja por la puerta del filtro', async () => {
      // `deletedAt` esta en `NEVER_QUERYABLE` (QC-57) y ademas no esta declarado en
      // `WORK_GROUP_QUERYABLE`: el campo se OMITE —y se anota— en vez de viajar al `WHERE`.
      const d = dobles({ listAliveInCompany: buildPage([], 0, 1, 10) });
      const anotados = vi.fn();

      await createListWorkGroups({
        workGroups: d.workGroups,
        log: { ignoredFields: anotados } as unknown as ListQueryLog,
      })(actor, {
        page: 1,
        sort: { columnId: 'deletedAt', direction: 'desc' },
        filters: { deletedAt: { kind: 'text', value: 'no-null' } },
      });

      const query = d.espias.listAliveInCompany.mock.calls[0]?.[1] as {
        sort: unknown;
        filters: Record<string, unknown>;
      };
      expect(query.sort).toBeNull();
      expect(query.filters).toEqual({});
      expect(anotados).toHaveBeenCalledWith('work-groups', ['deletedAt']);
    });
  });

  describe('crear un grupo (R10, R12, R13, R14)', () => {
    it('R10, R13 — persiste el nombre Y su forma normalizada, y devuelve el identificador', async () => {
      const d = dobles({ createInCompany: { id: GROUP_ID } });

      // Nombre con espacios de sobra, mayusculas y acento: los tres lo hacen distinto de su forma
      // normalizada, asi que si alguien mandara el mismo valor dos veces este test cae.
      const resultado = await createCreateWorkGroup({ workGroups: d.workGroups })(actor, {
        name: '  Turno Nocturno Ñandú  ',
      });

      expect(resultado).toEqual({ id: GROUP_ID });
      soloSeLlamo(d.espias, 'createInCompany');
      expect(d.espias.createInCompany).toHaveBeenCalledWith(
        COMPANY_ID,
        'Turno Nocturno Ñandú',
        normalizeWorkGroupName('Turno Nocturno Ñandú'),
      );

      const [, nombre, normalizado] = d.espias.createInCompany.mock.calls[0] as [
        string,
        string,
        string,
      ];
      expect(normalizado, 'el normalizado no puede ser el nombre tal cual').not.toBe(nombre);
      // La forma normalizada de QC-83: sin mayusculas, sin acentos y sin nada que no sea letra o
      // digito. Se escribe LITERAL para que cambiar la regla en silencio ponga este test rojo.
      expect(normalizado).toBe('turnonocturnonandu');
    });

    it('R13 — la normalizacion es la UNICA del modulo: ningun archivo nuevo declara una segunda', () => {
      // `normalizeWorkGroupName` (QC-83 R3) es la unica definicion de «mismo nombre de grupo». Una
      // segunda —un `toLowerCase()` suelto, un `normalize('NFD')` a mano— haria que el nombre
      // guardado y el comparado divergieran en silencio.
      for (const relativo of [
        'domain/create-work-group.ts',
        'domain/rename-work-group.ts',
        'domain/work-group-input.ts',
      ]) {
        const fuente = codigoSinComentarios(relativo);
        expect(fuente, `${relativo} normaliza por su cuenta`).not.toMatch(
          /toLowerCase\(|toLocaleLowerCase\(|normalize\('NF|\\u0300-\\u036f/,
        );
      }
    });

    it('R12 — el nombre duplicado se rechaza DICIENDOLO, con `code` estable y sin crear nada', async () => {
      const d = dobles({ createInCompany: 'duplicate_name' });
      const fallo = await capturar(
        createCreateWorkGroup({ workGroups: d.workGroups })(actor, { name: 'Turno noche' }),
      );

      expect(fallo).toBeInstanceOf(WorkGroupDuplicateNameError);
      esperarCodigo(fallo, 'work_group_duplicate_name', 'crear duplicado');
      // No es el error generico de entrada: la entrada era perfectamente valida.
      expect(fallo).not.toBeInstanceOf(ValidationError);
      soloSeLlamo(d.espias, 'createInCompany');
    });

    it('R12 — la garantia es el indice, no un SELECT previo: el puerto no ofrece ninguna busqueda', () => {
      // Sin metodo de busqueda por nombre, la comprobacion previa de existencia —que es una
      // carrera— ni siquiera es expresable. `design.md > 5`, propiedad 2.
      const puerto = codigoSinComentarios('ports/work-group-repository.ts');
      expect(puerto).not.toMatch(/findByName|existsByName|searchByName|findByNameNormalized/);

      const crear = codigoSinComentarios('domain/create-work-group.ts');
      expect(crear.match(/deps\.workGroups\./g) ?? []).toHaveLength(1);
    });

    it('R14 — el nombre vacio o solo con espacios se rechaza sin escribir ninguna fila', async () => {
      for (const name of ['', '   ', '\t\n']) {
        const d = dobles();
        const fallo = await capturar(
          createCreateWorkGroup({ workGroups: d.workGroups })(actor, { name }),
        );
        expect(fallo, `el nombre ${JSON.stringify(name)} no se rechazo`).toBeInstanceOf(
          ValidationError,
        );
        ningunoSeLlamo(d.espias);
      }
    });
  });

  describe('renombrar un grupo (R16, R17, R18)', () => {
    it('R16 — reemplaza nombre Y normalizado en UNA escritura y no toca ninguna otra cosa', async () => {
      const d = dobles({ renameAliveInCompany: 'ok' });

      await createRenameWorkGroup({ workGroups: d.workGroups })(actor, {
        workGroupId: GROUP_ID,
        name: 'Turno Matutino',
      });

      // UNA sola llamada: dos escrituras dejarian una ventana con la fila incoherente. Y ningun
      // metodo de pertenencia: renombrar no toca las filas de miembros.
      soloSeLlamo(d.espias, 'renameAliveInCompany');
      expect(d.espias.renameAliveInCompany).toHaveBeenCalledWith(
        COMPANY_ID,
        GROUP_ID,
        'Turno Matutino',
        normalizeWorkGroupName('Turno Matutino'),
      );
    });

    it('R17 — el duplicado al renombrar es el MISMO error que al crear', async () => {
      const d = dobles({ renameAliveInCompany: 'duplicate_name' });
      const fallo = await capturar(
        createRenameWorkGroup({ workGroups: d.workGroups })(actor, {
          workGroupId: GROUP_ID,
          name: 'Turno noche',
        }),
      );

      expect(fallo).toBeInstanceOf(WorkGroupDuplicateNameError);
      esperarCodigo(fallo, 'work_group_duplicate_name', 'renombrar a un nombre ocupado');
      soloSeLlamo(d.espias, 'renameAliveInCompany');
    });

    it('R18, R39 — ningun caso de uso de la feature sabe siquiera que existen las asignaciones', () => {
      // La mitad de dominio de R18 y R39: el nombre congelado que QC-86 guardo no se puede tocar
      // desde aqui porque estos archivos no nombran esa tabla, no la importan y no tienen ningun
      // puerto que llegue a ella. La prueba contra datos reales es T16.
      for (const relativo of [
        'domain/create-work-group.ts',
        'domain/rename-work-group.ts',
        'domain/delete-work-group.ts',
        'domain/add-work-group-member.ts',
        'domain/remove-work-group-member.ts',
        'domain/list-work-groups.ts',
        'domain/list-work-group-members.ts',
        'ports/work-group-repository.ts',
      ]) {
        const fuente = codigoSinComentarios(relativo);
        expect(fuente, `${relativo} nombra las asignaciones`).not.toMatch(
          /order_assignments|orderAssignment|@\/lib\/modules\/asignaciones|workGroupName/,
        );
      }
    });
  });

  describe('dar de baja un grupo (R37, R38, R40)', () => {
    it('R37 — la baja es un metodo propio, con el instante, y NO pasa por el borrado de miembros', async () => {
      const d = dobles({ softDeleteAliveInCompany: 'ok' });

      await createDeleteWorkGroup({ workGroups: d.workGroups, now: () => NOW })(actor, {
        workGroupId: GROUP_ID,
      });

      // R38 en su mitad de dominio: la unica llamada es la de la baja. Ni un `removeMember`, ni un
      // barrido de pertenencias «de paso». Quien estaba dentro se conserva.
      soloSeLlamo(d.espias, 'softDeleteAliveInCompany');
      expect(d.espias.softDeleteAliveInCompany).toHaveBeenCalledWith(COMPANY_ID, GROUP_ID, NOW);
    });

    it('R40 — no existe ninguna operacion de restaurar ni ningun listado de bajas', () => {
      // Lo que no se puede expresar no se puede hacer por descuido. Se mira el PUERTO —que es
      // quien podria ofrecer el `UPDATE … SET deleted_at = NULL`— y los siete casos de uso.
      const fuentes = [
        'ports/work-group-repository.ts',
        'domain/create-work-group.ts',
        'domain/rename-work-group.ts',
        'domain/delete-work-group.ts',
        'domain/add-work-group-member.ts',
        'domain/remove-work-group-member.ts',
        'domain/list-work-groups.ts',
        'domain/list-work-group-members.ts',
        'domain/work-group-input.ts',
        'domain/work-group-queryable.ts',
      ];

      for (const relativo of fuentes) {
        const fuente = codigoSinComentarios(relativo);
        expect(fuente, `${relativo} ofrece restaurar`).not.toMatch(
          /restore|Restore|undelete|Undelete|reactivat|Reactivat|listDeleted|includeDeleted|onlyDeleted/,
        );
      }

      // Y el puerto tiene EXACTAMENTE los siete metodos de `design.md > 5`: ni un octavo.
      const puerto = codigoSinComentarios('ports/work-group-repository.ts');
      const cuerpo = puerto.slice(puerto.indexOf('export interface WorkGroupRepository'));
      const declarados = [...cuerpo.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1]);
      expect(declarados.sort()).toEqual([...METODOS].sort());

      // El barril del modulo tampoco reexporta ninguna factory de restauracion.
      const barril = readFileSync(join(identityDir, 'index.ts'), 'utf8');
      expect(barril).not.toMatch(/RestoreWorkGroup|createRestoreWorkGroup/);
    });
  });

  describe('meter a una persona (R28, R29, R30, R32, R33)', () => {
    it('R28 — la pertenencia se crea sin consultar el estado de cuenta: UNA sola llamada al puerto', async () => {
      const d = dobles({ addMemberAliveInCompany: { kind: 'created' } });

      await expect(
        createAddWorkGroupMember({ workGroups: d.workGroups, now: () => NOW })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      ).resolves.toBeUndefined();

      soloSeLlamo(d.espias, 'addMemberAliveInCompany');
      expect(d.espias.addMemberAliveInCompany).toHaveBeenCalledWith(
        COMPANY_ID,
        GROUP_ID,
        USER_ID,
        NOW,
      );

      // Y no hay ninguna lectura previa de los miembros para «ver si esta»: la garantia es la
      // clave primaria (R32) y la lectura del adaptador sirve solo para elegir el mensaje.
      expect(d.espias.listMembersAliveInCompany).not.toHaveBeenCalled();
    });

    it('R29 — la persona inexistente, borrada o de otra empresa es el MISMO caso, sin crear nada', async () => {
      const d = dobles({ addMemberAliveInCompany: { kind: 'user_not_found' } });
      const fallo = await capturar(
        createAddWorkGroupMember({ workGroups: d.workGroups })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      );

      // Reutiliza `user_not_found` de QC-66: crear un octavo codigo para repetir el mismo
      // significado seria partir un mensaje en dos (`design.md > 7.1`).
      expect(fallo).toBeInstanceOf(UserNotFoundError);
      esperarCodigo(fallo, 'user_not_found', 'meter a una persona que no existe');
      soloSeLlamo(d.espias, 'addMemberAliveInCompany');
    });

    it('R30 — quien ya pertenece Y se ve da el error de pertenencia duplicada, sin escribir', async () => {
      const d = dobles({
        addMemberAliveInCompany: { kind: 'already_member', account: CANDIDATO },
      });
      const fallo = await capturar(
        createAddWorkGroupMember({ workGroups: d.workGroups, now: () => NOW })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      );

      expect(fallo).toBeInstanceOf(WorkGroupMemberExistsError);
      esperarCodigo(fallo, 'work_group_member_exists', 'duplicado visible');
      soloSeLlamo(d.espias, 'addMemberAliveInCompany');
    });

    it('R33 — meter y sacar son operaciones PROPIAS, de a una: ningun esquema acepta un conjunto', async () => {
      // La decision 6 descarto mandar la lista completa de miembros al editar. Aqui no se
      // descarta con un comentario: la forma del borde lo hace INEXPRESABLE.
      const conLista = [
        { workGroupId: GROUP_ID, userIds: [USER_ID] },
        { workGroupId: GROUP_ID, members: [USER_ID] },
        { workGroupId: GROUP_ID, name: 'Turno noche', userIds: [USER_ID] },
      ];

      for (const entrada of conLista) {
        const meter = dobles();
        expect(
          await capturar(
            createAddWorkGroupMember({ workGroups: meter.workGroups })(actor, entrada),
          ),
          `${JSON.stringify(entrada)} no se rechazo al meter`,
        ).toBeInstanceOf(ValidationError);
        ningunoSeLlamo(meter.espias);

        const renombrar = dobles();
        expect(
          await capturar(
            createRenameWorkGroup({ workGroups: renombrar.workGroups })(actor, entrada),
          ),
          `${JSON.stringify(entrada)} no se rechazo al renombrar`,
        ).toBeInstanceOf(ValidationError);
        ningunoSeLlamo(renombrar.espias);
      }

      // Y son dos factories distintas que llaman a dos metodos distintos del puerto: no hay
      // ninguna «editar el grupo» que haga las dos cosas.
      expect(createAddWorkGroupMember).not.toBe(createRemoveWorkGroupMember);
    });
  });

  describe('sacar a una persona (R34, R35, R36)', () => {
    it('R34, R35 — la unica llamada es la de sacar: ni la persona ni el grupo se tocan', async () => {
      const d = dobles({ removeMemberAliveInCompany: 'ok' });

      await expect(
        createRemoveWorkGroupMember({ workGroups: d.workGroups })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      ).resolves.toBeUndefined();

      // Aunque fuera su ultimo miembro: nada de dar de baja el grupo «porque se quedo vacio».
      soloSeLlamo(d.espias, 'removeMemberAliveInCompany');
      expect(d.espias.removeMemberAliveInCompany).toHaveBeenCalledWith(
        COMPANY_ID,
        GROUP_ID,
        USER_ID,
      );
      expect(d.espias.softDeleteAliveInCompany).not.toHaveBeenCalled();
    });

    it('R36 — sacar a quien no pertenece lo DICE, y con un `code` distinto del de grupo no encontrado', async () => {
      const sinMiembro = dobles({ removeMemberAliveInCompany: 'member_not_found' });
      const fallo = await capturar(
        createRemoveWorkGroupMember({ workGroups: sinMiembro.workGroups })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      );

      expect(fallo).toBeInstanceOf(WorkGroupMemberNotFoundError);
      esperarCodigo(fallo, 'work_group_member_not_found', 'sacar a quien no esta');
      soloSeLlamo(sinMiembro.espias, 'removeMemberAliveInCompany');

      // Los dos «no encontrado» son dos mensajes distintos: la persona puede existir
      // perfectamente; lo que falta es la fila de PERTENENCIA.
      const sinGrupo = dobles({ removeMemberAliveInCompany: 'group_not_found' });
      const otro = await capturar(
        createRemoveWorkGroupMember({ workGroups: sinGrupo.workGroups })(actor, {
          workGroupId: GROUP_ID,
          userId: USER_ID,
        }),
      );
      expect(otro).toBeInstanceOf(WorkGroupNotFoundError);
      expect((otro as IdentityError).code).not.toBe('work_group_member_not_found');
    });
  });
});
