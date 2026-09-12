// QC-84 T11 — Autorizacion POR PERMISO de los SIETE casos de uso de grupos de trabajo
// (R1, R2, R3, R4, R5).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como
// dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS de `work_groups` y
// `work_group_members` **no filtran ninguna consulta de esta app** (R7). La frontera real es el
// caso de uso, y una comprobacion que se saltara UNO de los siete —o que estuviera puesta DESPUES
// de tocar el puerto— seria justo el agujero que este archivo existe para encontrar.
//
// Por eso los TRES colaboradores —el repositorio de grupos, el log de campos omitidos de QC-57 y
// la politica de paginacion de `design.md > 5.3`— son dobles que **FALLAN SI LOS LLAMAN**: no
// basta con que la operacion lance, tiene que lanzar **sin haber tocado nada**. Y se afirma
// `not.toHaveBeenCalled()` sobre **CADA** metodo de **CADA** uno en los SIETE casos
// (`tasks.md > T11 > Hecho cuando`).
//
// Estilo y estructura: `tests/unit/identity/usuarios/authorization.test.ts` (QC-66 T11), que es el
// precedente literal. La unica diferencia de forma es que aqui son siete casos y no seis, y que
// `listWorkGroupMembers` lleva el `now` por parametro (`design.md > 5.2`).
//
// Cubre R1, R2, R3, R4, R5.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createAddWorkGroupMember } from '@/lib/modules/identity/domain/add-work-group-member';
import { createCreateWorkGroup } from '@/lib/modules/identity/domain/create-work-group';
import { createDeleteWorkGroup } from '@/lib/modules/identity/domain/delete-work-group';
import { IdentityError, UnauthorizedError } from '@/lib/modules/identity/domain/errors';
import { createListWorkGroupMembers } from '@/lib/modules/identity/domain/list-work-group-members';
import { createListWorkGroups } from '@/lib/modules/identity/domain/list-work-groups';
import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { createRemoveWorkGroupMember } from '@/lib/modules/identity/domain/remove-work-group-member';
import { createRenameWorkGroup } from '@/lib/modules/identity/domain/rename-work-group';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { PaginationPolicy } from '@/lib/modules/identity/domain/list-work-group-members';
import type { PermissionCode } from '@/lib/modules/identity/domain/permissions';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type { WorkGroupRepository } from '@/lib/modules/identity/ports/work-group-repository';

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'identity',
);

/**
 * Los archivos NUEVOS de esta feature dentro de `lib/modules/identity/**`, escritos UNO A UNO y no
 * por barrido del directorio: `identity` es un modulo viejo y lleno de archivos ajenos (sesion,
 * login, usuarios, roles), asi que un barrido probaria cosas de otras fichas y no probaria que
 * ESTOS existen. La lista se afirma contra el disco antes de usarse, de modo que un archivo que se
 * renombre ponga el test rojo en vez de dejarlo verde por vacuidad.
 *
 * `domain/errors.ts` NO esta: se AMPLIA, no nace aqui, y sus diez clases de QC-66 las vigila
 * `errors.test.ts`. Los adaptadores tampoco: son de T8 y T9 y los cierran sus propios tests.
 */
const ARCHIVOS_NUEVOS: readonly string[] = [
  'domain/work-group-input.ts',
  'domain/work-group-view.ts',
  'domain/work-group-queryable.ts',
  'domain/create-work-group.ts',
  'domain/rename-work-group.ts',
  'domain/delete-work-group.ts',
  'domain/add-work-group-member.ts',
  'domain/remove-work-group-member.ts',
  'domain/list-work-groups.ts',
  'domain/list-work-group-members.ts',
  'ports/work-group-repository.ts',
];

/** Los siete archivos de caso de uso, que son los que R1, R4 y R5 vigilan mas de cerca. */
const ARCHIVOS_DE_CASO_DE_USO: readonly string[] = [
  'domain/create-work-group.ts',
  'domain/rename-work-group.ts',
  'domain/delete-work-group.ts',
  'domain/add-work-group-member.ts',
  'domain/remove-work-group-member.ts',
  'domain/list-work-groups.ts',
  'domain/list-work-group-members.ts',
];

/** El fuente SIN comentarios: lo que se vigila es el codigo, no lo que el comentario explica. */
function codigoSinComentarios(relativo: string): string {
  return readFileSync(join(moduloDir, relativo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

const CONSULTAR: PermissionCode = 'usuarios.consultar';
const MODIFICAR: PermissionCode = 'usuarios.modificar';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const NOW = new Date('2026-09-11T12:00:00.000Z');

/** Entradas VALIDAS: lo unico que puede fallar en ellas es la autorizacion. */
const ENTRADA_CREAR = { name: 'Turno noche' };
const ENTRADA_RENOMBRAR = { workGroupId: GROUP_ID, name: 'Turno noche' };
const ENTRADA_MIEMBRO = { workGroupId: GROUP_ID, userId: USER_ID };
const ENTRADA_BAJA = { workGroupId: GROUP_ID };
const ENTRADA_LISTA = { page: 1, pageSize: 10 };

/** Entrada que zod RECHAZA en los siete: demuestra que el permiso va ANTES de validar (R1). */
const BASURA = { name: 42, workGroupId: 'no-es-un-uuid', page: 'primera' };

/**
 * Los tres colaboradores. Cada metodo explota si alguien lo llama: si un caso de uso comprobara el
 * permiso DESPUES de tocar el puerto, el test caeria por la excepcion del doble aunque el
 * `toBeInstanceOf(UnauthorizedError)` pudiera enganarse. Un doble permisivo dejaria pasar
 * exactamente ese defecto.
 */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`);
    });

  // Los SIETE metodos del puerto de `design.md > 5`, ninguno de adorno.
  const workGroups = {
    createInCompany: explota('workGroups.createInCompany'),
    renameAliveInCompany: explota('workGroups.renameAliveInCompany'),
    softDeleteAliveInCompany: explota('workGroups.softDeleteAliveInCompany'),
    listAliveInCompany: explota('workGroups.listAliveInCompany'),
    listMembersAliveInCompany: explota('workGroups.listMembersAliveInCompany'),
    addMemberAliveInCompany: explota('workGroups.addMemberAliveInCompany'),
    removeMemberAliveInCompany: explota('workGroups.removeMemberAliveInCompany'),
  };
  // QC-57 R6: el log del campo omitido tampoco puede sonar sin autorizacion. `requirePermission`
  // es la primera linea de los dos listados, antes de zod y antes de sanear, asi que un actor
  // rechazado no llega ni a saber que su consulta traia campos raros.
  const log = { ignoredFields: explota('log.ignoredFields') };
  // Y la politica de paginacion de `design.md > 5.3`: cortar una pagina para alguien que no puede
  // consultarla no tiene sentido, y que este doble explote lo demuestra.
  const pagination = {
    toOffsetLimit: explota('pagination.toOffsetLimit'),
    buildPage: explota('pagination.buildPage'),
  };

  return {
    workGroups: workGroups as unknown as WorkGroupRepository,
    log: log as unknown as ListQueryLog,
    pagination: pagination as unknown as PaginationPolicy,
    espias: [
      ...Object.values(workGroups),
      ...Object.values(log),
      ...Object.values(pagination),
    ],
  };
}

type Deps = ReturnType<typeof dobles>;

type Caso = {
  readonly nombre: string;
  readonly archivo: string;
  /** El codigo EXACTO que exige este caso de uso (R1), ni uno mas. */
  readonly permiso: PermissionCode;
  /** Invocacion con entrada VALIDA: lo unico que puede fallar es la autorizacion. */
  readonly ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>;
  /** La MISMA invocacion con entrada que zod rechaza. Los siete validan, asi que los siete la tienen. */
  readonly ejecutarConBasura: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>;
};

/**
 * Los SIETE casos de uso con el permiso de su fila (R1): `usuarios.consultar` en las dos consultas
 * y `usuarios.modificar` en las cinco escrituras. El actor va PRIMERO en todas las firmas.
 */
const CASOS_DE_USO: readonly Caso[] = [
  {
    nombre: 'createWorkGroup',
    archivo: 'create-work-group.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createCreateWorkGroup({ workGroups: d.workGroups })(actor, ENTRADA_CREAR),
    ejecutarConBasura: (d, actor) =>
      createCreateWorkGroup({ workGroups: d.workGroups })(actor, BASURA),
  },
  {
    nombre: 'renameWorkGroup',
    archivo: 'rename-work-group.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createRenameWorkGroup({ workGroups: d.workGroups })(actor, ENTRADA_RENOMBRAR),
    ejecutarConBasura: (d, actor) =>
      createRenameWorkGroup({ workGroups: d.workGroups })(actor, BASURA),
  },
  {
    nombre: 'deleteWorkGroup',
    archivo: 'delete-work-group.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createDeleteWorkGroup({ workGroups: d.workGroups })(actor, ENTRADA_BAJA),
    ejecutarConBasura: (d, actor) =>
      createDeleteWorkGroup({ workGroups: d.workGroups })(actor, BASURA),
  },
  {
    nombre: 'addWorkGroupMember',
    archivo: 'add-work-group-member.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createAddWorkGroupMember({ workGroups: d.workGroups })(actor, ENTRADA_MIEMBRO),
    ejecutarConBasura: (d, actor) =>
      createAddWorkGroupMember({ workGroups: d.workGroups })(actor, BASURA),
  },
  {
    nombre: 'removeWorkGroupMember',
    archivo: 'remove-work-group-member.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createRemoveWorkGroupMember({ workGroups: d.workGroups })(actor, ENTRADA_MIEMBRO),
    ejecutarConBasura: (d, actor) =>
      createRemoveWorkGroupMember({ workGroups: d.workGroups })(actor, BASURA),
  },
  {
    nombre: 'listWorkGroups',
    archivo: 'list-work-groups.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) =>
      createListWorkGroups({ workGroups: d.workGroups, log: d.log })(actor, ENTRADA_LISTA),
    ejecutarConBasura: (d, actor) =>
      createListWorkGroups({ workGroups: d.workGroups, log: d.log })(actor, BASURA),
  },
  {
    nombre: 'listWorkGroupMembers',
    archivo: 'list-work-group-members.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) =>
      createListWorkGroupMembers({
        workGroups: d.workGroups,
        pagination: d.pagination,
        log: d.log,
      })(actor, GROUP_ID, ENTRADA_LISTA, NOW),
    ejecutarConBasura: (d, actor) =>
      createListWorkGroupMembers({
        workGroups: d.workGroups,
        pagination: d.pagination,
        log: d.log,
      })(actor, GROUP_ID, BASURA, NOW),
  },
];

/**
 * Actor con EXACTAMENTE los permisos que se le den. Sin ningun campo de rol: el tipo `Actor` es
 * `{ id, companyId, permissions }` y nada mas (R4).
 */
function actorCon(...permissions: readonly string[]): Actor {
  return { id: ACTOR_ID, companyId: COMPANY_ID, permissions };
}

/** Todos los codigos del catalogo REAL menos uno: el conjunto que NO debe abrir el caso. */
function todosMenos(permiso: PermissionCode): readonly string[] {
  return PERMISSIONS.map((p) => p.code).filter((code) => code !== permiso);
}

/** Ejecuta un caso de uso con un actor no autorizado y exige rechazo SIN tocar ningun puerto. */
async function esperarRechazoSinTocarNada(
  caso: Caso,
  actor: Actor | null | undefined,
  etiqueta: string,
  ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown> = caso.ejecutar,
): Promise<void> {
  const d = dobles();
  const fallo = await ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  );

  // R43: se afirma sobre la CLASE y sobre el `code` estable, nunca sobre el texto del mensaje.
  expect(fallo, `${caso.nombre} con ${etiqueta} no rechazo`).toBeInstanceOf(UnauthorizedError);
  expect(fallo, `${caso.nombre} con ${etiqueta} no lanzo un error del modulo`).toBeInstanceOf(
    IdentityError,
  );
  expect((fallo as UnauthorizedError).code).toBe('unauthorized');

  // R2: sin efectos, y se afirma CONTANDO invocaciones de CADA metodo de CADA colaborador.
  for (const espia of d.espias) {
    expect(espia, `${caso.nombre} con ${etiqueta} toco un puerto`).not.toHaveBeenCalled();
  }
}

/**
 * Ejecuta un caso de uso con un actor AUTORIZADO y exige que AVANCE hasta el puerto: se ve porque
 * el doble explota con SU mensaje, no con `unauthorized`. Esto es lo que impide que la concesion
 * pase por un `throw new UnauthorizedError()` incondicional o por un caso de uso que no llame a
 * nadie —los dos dejarian todos los rechazos en verde—.
 */
async function esperarQueLlegueAlPuerto(caso: Caso, actor: Actor): Promise<void> {
  const d = dobles();
  const resultado = await caso.ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  );

  expect(resultado, `${caso.nombre} no llego al puerto con ${caso.permiso}`).not.toBeNull();
  expect(resultado, `${caso.nombre} rechazo teniendo ${caso.permiso}`).not.toBeInstanceOf(
    UnauthorizedError,
  );
  expect((resultado as Error).message).toMatch(/no debe llamarse sin autorizacion/);
}

describe('autorizacion por permiso de los siete casos de uso de grupos (QC-84 T11)', () => {
  it('los siete casos de uso del dominio estan cubiertos por esta tabla', () => {
    // Guardia de la propia guardia: si manana nace un octavo caso de uso y nadie lo mete en
    // `CASOS_DE_USO`, este test cae. Sin esto, la cobertura «de los siete» seria una promesa del
    // comentario de cabecera y no una afirmacion ejecutable.
    expect(CASOS_DE_USO).toHaveLength(7);
    expect([...CASOS_DE_USO].map((c) => c.archivo).sort()).toEqual(
      [...ARCHIVOS_DE_CASO_DE_USO].map((ruta) => ruta.replace('domain/', '')).sort(),
    );

    // R1: el reparto EXACTO de la tabla —dos lecturas con `usuarios.consultar`, cinco escrituras
    // con `usuarios.modificar`—.
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual(['listWorkGroupMembers', 'listWorkGroups']);
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual([
      'addWorkGroupMember',
      'createWorkGroup',
      'deleteWorkGroup',
      'removeWorkGroupMember',
      'renameWorkGroup',
    ]);

    // Y los dos codigos existen en el catalogo REAL de `identity`, no en una copia a mano: R47
    // dice que esta ficha NO crea ninguno y que el catalogo se queda en quince.
    const codigos: readonly string[] = PERMISSIONS.map((p) => p.code);
    expect(codigos).toContain(CONSULTAR);
    expect(codigos).toContain(MODIFICAR);
  });

  it('R1 — cada caso de uso avanza con EXACTAMENTE el codigo de su fila y con ningun otro', async () => {
    for (const caso of CASOS_DE_USO) {
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso));

      // La otra mitad: con TODOS los otros codigos del catalogo real y sin el suyo, rechaza. Es
      // lo que impide que alguien exija un codigo de otro modulo —o dos a la vez— y siga verde.
      await esperarRechazoSinTocarNada(
        caso,
        actorCon(...todosMenos(caso.permiso)),
        `todo el catalogo menos ${caso.permiso}`,
      );
    }
  });

  it('R2 — falla cerrado: actor ausente, sin conjunto, con el conjunto vacio y con un conjunto que no es una lista', async () => {
    const NO_AUTORIZADOS: readonly {
      readonly etiqueta: string;
      readonly actor: Actor | null | undefined;
    }[] = [
      { etiqueta: 'actor ausente (null)', actor: null },
      { etiqueta: 'actor ausente (undefined)', actor: undefined },
      { etiqueta: 'conjunto de permisos vacio', actor: actorCon() },
      {
        // Lo que llegaria de un adaptador que se olvidara del campo: falla cerrado igual, no
        // revienta con un `TypeError` ni concede por descuido.
        etiqueta: 'sin conjunto de permisos',
        actor: { id: ACTOR_ID, companyId: COMPANY_ID } as unknown as Actor,
      },
      {
        // El `cast` es el punto: un `permissions` que no es lista llega en ejecucion aunque el
        // tipo lo prohiba, y lo que importa es que se rechace —no que se caiga de otra forma—.
        // Un `String.prototype.includes` concederia aqui por coincidencia PARCIAL.
        etiqueta: 'conjunto que es una cadena',
        actor: {
          id: ACTOR_ID,
          companyId: COMPANY_ID,
          permissions: 'usuarios.consultar,usuarios.modificar',
        } as unknown as Actor,
      },
      {
        etiqueta: 'conjunto que es un objeto',
        actor: {
          id: ACTOR_ID,
          companyId: COMPANY_ID,
          permissions: { 'usuarios.modificar': true, 'usuarios.consultar': true },
        } as unknown as Actor,
      },
      {
        etiqueta: 'conjunto nulo',
        actor: { id: ACTOR_ID, companyId: COMPANY_ID, permissions: null } as unknown as Actor,
      },
    ];

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, actor } of NO_AUTORIZADOS) {
        await esperarRechazoSinTocarNada(caso, actor, etiqueta);
      }
    }
  });

  it('R2 — la pertenencia es EXACTA: ni el prefijo, ni otra caja, ni un codigo parecido conceden nada', async () => {
    // Sin normalizacion y sin coincidencia parcial: cada conjunto de abajo CONTIENE algo que se
    // parece a los dos codigos exigidos y ninguno lo es.
    const PARECIDOS: readonly {
      readonly etiqueta: string;
      readonly permisos: readonly string[];
    }[] = [
      { etiqueta: 'solo el nombre del modulo', permisos: ['usuarios'] },
      { etiqueta: 'el prefijo con el punto', permisos: ['usuarios.'] },
      {
        etiqueta: 'un codigo mas largo',
        permisos: ['usuarios.consultarlo', 'usuarios.modificarlo'],
      },
      {
        // El codigo de OTRO modulo con el mismo verbo: `asignaciones.modificar` administra la
        // asignacion de pedidos (QC-86) y no abre nada de grupos.
        etiqueta: 'el mismo verbo en otro modulo',
        permisos: ['asignaciones.modificar', 'asignaciones.consultar'],
      },
      {
        etiqueta: 'los dos codigos en otra caja',
        permisos: [CONSULTAR.toUpperCase(), MODIFICAR.toUpperCase()],
      },
      {
        etiqueta: 'los dos codigos con espacios alrededor',
        permisos: [`${CONSULTAR} `, ` ${MODIFICAR}`],
      },
    ];

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, permisos } of PARECIDOS) {
        await esperarRechazoSinTocarNada(caso, actorCon(...permisos), etiqueta);
      }
    }
  });

  it('R3 — solo `usuarios.modificar` no abre ninguna de las dos consultas', async () => {
    // El sentido que la intuicion se salta: quien puede escribir NO puede leer por ello.
    const consultas = CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR);
    expect(consultas).toHaveLength(2);

    for (const caso of consultas) {
      await esperarRechazoSinTocarNada(caso, actorCon(MODIFICAR), 'solo usuarios.modificar');
      await esperarRechazoSinTocarNada(caso, actorCon(), 'ningun permiso');
    }
  });

  it('R3 — solo `usuarios.consultar` no abre ninguna de las cinco escrituras', async () => {
    const escrituras = CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR);
    expect(escrituras).toHaveLength(5);

    for (const caso of escrituras) {
      await esperarRechazoSinTocarNada(caso, actorCon(CONSULTAR), 'solo usuarios.consultar');
      await esperarRechazoSinTocarNada(caso, actorCon(), 'ningun permiso');
    }
  });

  it('R1 — el permiso se comprueba ANTES de zod: con entrada invalida el rechazo sigue siendo `unauthorized`', async () => {
    // Si validara primero, un actor no autorizado con una entrada rota recibiria `invalid_input`
    // y sabria algo del sistema sin tener derecho a preguntarlo: esa es la diferencia entre
    // autorizar de verdad y un `if` decorativo. Mutacion que lo pone rojo: mover
    // `requirePermission` debajo del `safeParse` en cualquiera de los siete.
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinTocarNada(
        caso,
        actorCon(),
        'entrada invalida y sin permiso',
        caso.ejecutarConBasura,
      );

      // Y con el permiso correcto esa MISMA entrada si llega a zod: `invalid_input`, no
      // `unauthorized`. Sin esta mitad, un `throw new UnauthorizedError()` incondicional dejaria
      // el caso anterior en verde.
      const d = dobles();
      const fallo = await caso.ejecutarConBasura(d, actorCon(caso.permiso)).then(
        () => null,
        (error: unknown) => error,
      );
      expect((fallo as IdentityError).code, `${caso.nombre} con permiso y basura`).toBe(
        'invalid_input',
      );
    }
  });

  it('R4 — el rol del actor no participa: un Actor sin ningun campo de rol autoriza igual', async () => {
    // El tipo, primero: `Actor` es `{ id, companyId, permissions }` y nada mas. Mutacion que lo
    // pone rojo: anadir `roleName` «por si acaso» y compararlo en algun caso de uso.
    const actorTs = codigoSinComentarios('domain/actor.ts');
    expect(actorTs).toMatch(
      /export type Actor = \{\s*readonly id: string;\s*readonly companyId: string;\s*readonly permissions: readonly string\[\];\s*\}/,
    );

    // Y el comportamiento: el objeto que se pasa tiene EXACTAMENTE tres claves y los siete casos
    // de uso avanzan hasta el puerto con el codigo de su fila.
    for (const caso of CASOS_DE_USO) {
      const actor = actorCon(caso.permiso);
      expect(Object.keys(actor).sort()).toEqual(['companyId', 'id', 'permissions']);
      await esperarQueLlegueAlPuerto(caso, actor);
    }
  });

  it('R4 — ningun archivo NUEVO de la feature nombra un rol, ni el administrador ni ningun otro', () => {
    // `domain/roles.ts` es quien DECLARA `ROLE_ADMINISTRADOR` y `ROLE_OPERADOR` (QC-54), y esta
    // ficha no lo toca ni lo importa: los grupos se autorizan por PERMISO y por nada mas.
    expect(ARCHIVOS_NUEVOS).not.toContain('domain/roles.ts');

    for (const relativo of ARCHIVOS_NUEVOS) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente.length, `${relativo} no existe o esta vacio`).toBeGreaterThan(0);
      expect(fuente, `${relativo} incrusta el literal del rol`).not.toMatch(
        /['"`](Administrador|Operador)/,
      );
      expect(fuente, `${relativo} importa el catalogo de roles`).not.toMatch(
        /ROLE_ADMINISTRADOR|ROLE_OPERADOR|SEED_ROLES|from '\.\/roles'/,
      );
      // Ni ninguna autorizacion por rol de la epoca anterior a QC-74.
      expect(fuente, `${relativo} autoriza por rol`).not.toMatch(
        /requireAdmin|assertAdminRole|\broleName\b|\broleId\b/,
      );
    }
  });

  it('R5 — el actor entra por parametro y el dominio no lee sesion, cookie ni cabecera', async () => {
    // Mitad de TEXTO: ninguno de los siete casos de uso nombra la sesion, la cookie, la cabecera
    // ni el lector de sesion de `identity`. Quien resuelve el actor es el adaptador driving con
    // `identity.getSessionUser()` via `@/lib/composition`, y esa es la unica puerta (R6).
    for (const relativo of ARCHIVOS_DE_CASO_DE_USO) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente, `${relativo} lee la sesion`).not.toMatch(
        /getSessionUser|next\/headers|\bcookies?\b|\bheaders\(\)|@\/lib\/composition/i,
      );
    }

    // Mitad de COMPORTAMIENTO: el mismo caso de uso, en el mismo entorno, acepta o rechaza segun
    // lo que se le PASE. Nada ambiental decide.
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinTocarNada(caso, actorCon('inventario.consultar'), 'otro modulo');
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso));
    }
  });
});
