/**
 * T6 — Integracion de `findActiveSessionUserById` contra Postgres real (`design.md > 4.2`,
 * `design.md > 7` nivel 3).
 *
 * QUE SE EJERCITA AQUI Y NO EN LOS UNITARIOS: el adaptador Prisma de verdad, con la API tipada
 * por clave primaria, el `where` con `deletedAt: null` y el `select` minimo con el join a
 * `role.name`. Mismo patron que `login.int.test.ts`: fixture propio con prefijo y `uuid`,
 * limpieza en `afterAll` dentro de `try`/`finally`, sin seed (R21 de QC-7).
 *
 * QC-47 (T17, T19) — `users.company_id` es obligatoria, asi que este fixture crea tambien su
 * PROPIA empresa efimera (`qc8-session-<uuid>`) en el `beforeAll` y mete al usuario dentro;
 * nunca la de instalacion, porque `companies_name_unique` es global. El `afterAll` barre en
 * orden `users -> companies` (`users_company_id_fkey` es `ON DELETE RESTRICT`).
 *
 * QC-48 (T6, R13) — el mismo `select` trae ahora `companyId` y `company.deletedAt`. Se afirma
 * aqui, contra Postgres, que los dos campos salen de verdad y que salen en UNA SOLA llamada a
 * `findFirst`: la condicion de `design.md > 4.1` era «cero consultas nuevas por peticion», no
 * «un JOIN mas y ya veremos».
 *
 * QC-74 (T8, R7, R11) — el mismo `select` trae ademas los permisos del rol, por la relacion
 * `Role.permissions`. Se afirma aqui, contra Postgres, que salen de verdad y que salen en UNA
 * SOLA llamada a `findFirst`: la condicion de `design.md > 4` era «ni una consulta adicional por
 * peticion». El fixture crea su PROPIO catalogo efimero (`qc74-<uuid>`) y no toca el catalogo
 * real: `permissions.code` es clave primaria global, igual que `companies_name_unique`.
 *
 * QC-23 (T9, R11, R14) — el mismo `select` trae ahora el sello `sessions_valid_from` y, por la
 * relacion `User.revokedSessions` acotada al `sid` de la sesion en curso, el `revoked_at` de la
 * fila del registro de sesiones cerradas. Se afirma aqui, contra Postgres, que los dos salen de
 * verdad y que siguen saliendo en UNA SOLA llamada a `findFirst`: la condicion de R14 era «ni una
 * invocacion nueva del puerto por peticion». El `sid` del caso corriente es uno que nadie cerro.
 *
 * EL ROL NO SE MUEVE (R13, R14): sigue saliendo de `users.role_id`, en el mismo `select` y sin
 * ninguna consulta adicional. El caso «el rol cambiado entre dos lecturas devuelve el nuevo»
 * ya lo demuestra, y esta ficha lo deja intacto a proposito.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  ROLE_MAESTRO,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';
import { prisma } from '@/lib/shared/db/prisma';

const sufijo = randomUUID();
const nombreDeUsuario = `qc8_session_${sufijo}`;
/** QC-47: nombre irrepetible de la empresa efimera de este fixture. */
const nombreDeEmpresa = `qc8-session-${sufijo}`;

let usuarioId = '';
let rolId = '';
let rolAlternativoId = '';
let empresaId = '';
/** QC-74: catalogo efimero de este fixture. `module` es irrepetible por el `@@unique`. */
const moduloDePrueba = `qc74-${sufijo}`;
/** QC-23 T9: el `sid` de la sesion en curso del caso corriente. Nadie lo cerro, asi que el
 *  registro de sesiones cerradas no tiene fila para el y `sessionRevokedAt` sale `null`. */
const SID_SIN_CERRAR = randomUUID();
const CODIGO_CONSULTAR = `${moduloDePrueba}.consultar`;
const CODIGO_MODIFICAR = `${moduloDePrueba}.modificar`;

beforeAll(async () => {
  const rol = await prisma.role.create({
    data: { name: `qc8-session-${sufijo}`, description: 'Rol de prueba de QC-8' },
    select: { id: true },
  });
  rolId = rol.id;

  const rolAlternativo = await prisma.role.create({
    data: { name: `qc8-session-alt-${sufijo}`, description: 'Rol alternativo de prueba de QC-8' },
    select: { id: true },
  });
  rolAlternativoId = rolAlternativo.id;

  // QC-47: empresa PROPIA del fixture, nunca la de instalacion.
  const empresa = await prisma.company.create({
    data: { name: nombreDeEmpresa, nameNormalized: normalizeCompanyName(nombreDeEmpresa) },
    select: { id: true },
  });
  empresaId = empresa.id;

  const usuario = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `qc8.session.${sufijo}@example.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: sufijo.replaceAll('-', '').slice(0, 20),
      username: nombreDeUsuario,
      passwordHash: 'no-se-usa-en-este-test',
      roleId: rolId,
      companyId: empresaId,
      // QC-78 (T12): el estado se escribe EXPLICITO y no se deja al `@default(pending)` de la
      // columna. Este fixture representa la cuenta corriente que si tiene sesion, y dejarla
      // `pending` haria que los casos heredados dependieran de un valor que nadie eligio.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  usuarioId = usuario.id;

  // QC-74 T8: dos permisos propios del fixture, asignados SOLO al rol principal. El rol
  // alternativo se queda sin ninguno a proposito: es el caso «rol sin asignaciones» -> `[]`.
  await prisma.permission.createMany({
    data: [
      {
        code: CODIGO_CONSULTAR,
        module: moduloDePrueba,
        action: 'consultar',
        description: 'Permiso de prueba de QC-74',
      },
      {
        code: CODIGO_MODIFICAR,
        module: moduloDePrueba,
        action: 'modificar',
        description: 'Permiso de prueba de QC-74',
      },
    ],
  });
  await prisma.rolePermission.createMany({
    data: [
      { roleId: rolId, permissionCode: CODIGO_CONSULTAR },
      { roleId: rolId, permissionCode: CODIGO_MODIFICAR },
    ],
  });
}, 30_000);

afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: usuarioId } });
  } finally {
    // QC-74: primero las asignaciones y luego el catalogo; las dos FKs son `ON DELETE RESTRICT`,
    // asi que borrar el rol antes que su `role_permissions` reventaria.
    await prisma.rolePermission.deleteMany({
      where: { permissionCode: { in: [CODIGO_CONSULTAR, CODIGO_MODIFICAR] } },
    });
    await prisma.permission.deleteMany({
      where: { code: { in: [CODIGO_CONSULTAR, CODIGO_MODIFICAR] } },
    });
    // QC-47: el orden es `users -> companies`; la FK hacia la empresa es `ON DELETE RESTRICT`.
    await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
    await prisma.company.deleteMany({ where: { id: empresaId } });
    await prisma.$disconnect();
  }
});

describe('findActiveSessionUserById contra Postgres real', () => {
  it('un usuario activo devuelve nombres, username y el rol actual', async () => {
    // R10 — consulta por sub (id de la fila real).
    const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

    expect(resultado).toEqual({
      id: usuarioId,
      username: nombreDeUsuario,
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      roleName: `qc8-session-${sufijo}`,
      // QC-48 R13: la empresa de la ficha y su estado, en la misma fila.
      companyId: empresaId,
      companyDeletedAt: null,
      // QC-74 R7: los permisos del rol, en la misma fila. `arrayContaining` porque la consulta
      // no lleva `orderBy` —el adaptador no ordena a proposito— y el orden de `role_permissions`
      // lo decide Postgres; el `toHaveLength` de abajo cierra la puerta a que sobre alguno.
      permissions: expect.arrayContaining([CODIGO_CONSULTAR, CODIGO_MODIFICAR]),
      // QC-78 R20: el estado de cuenta y el plazo de bloqueo, en la misma fila.
      accountStatus: 'active',
      lockedUntil: null,
      // QC-23 R7, R11: el sello —que toda fila tiene, por el `DEFAULT now()` de la migracion— y
      // el instante de cierre de ESTA sesion, que nadie cerro.
      sessionsValidFrom: expect.any(Date),
      sessionRevokedAt: null,
    });
    expect(resultado?.permissions).toHaveLength(2);
  });

  // QC-74 R7 — los permisos salen de la ASIGNACION, no del nombre del rol: el rol alternativo
  // existe, tiene nombre, y no tiene ninguna fila en `role_permissions`.
  it('un rol sin asignaciones devuelve permissions vacio', async () => {
    await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolAlternativoId } });

    try {
      const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(resultado?.roleName).toBe(`qc8-session-alt-${sufijo}`);
      expect(resultado?.permissions).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolId } });
    }
  });

  // QC-74 R11 — la condicion dura de `design.md > 4`: los permisos salen del MISMO `findFirst`.
  // Se cuenta la unica via tipada que podria haber servido para una segunda ida a la base
  // (`prisma.rolePermission.findMany`) ademas del contador de `findFirst`: si alguien resolviera
  // los permisos aparte, uno de los dos contadores lo delata.
  it('trae los permisos del rol sin una segunda consulta', async () => {
    const espiaUsuario = vi.spyOn(prisma.user, 'findFirst');
    const espiaAsignaciones = vi.spyOn(prisma.rolePermission, 'findMany');

    try {
      const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(resultado?.permissions).toHaveLength(2);
      expect(espiaUsuario).toHaveBeenCalledTimes(1);
      expect(espiaAsignaciones).not.toHaveBeenCalled();
    } finally {
      espiaUsuario.mockRestore();
      espiaAsignaciones.mockRestore();
    }
  });

  it('un usuario con deleted_at con valor devuelve null', async () => {
    // R11 — dado de baja aunque el id sea correcto.
    await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: new Date() } });

    try {
      expect(await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR)).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: null } });
    }
  });

  it('un id inexistente devuelve null', async () => {
    // R11 — sin fila, sin excepcion.
    expect(await findActiveSessionUserById(randomUUID(), SID_SIN_CERRAR)).toBeNull();
  });

  it('el rol cambiado entre dos lecturas devuelve el nuevo', async () => {
    // R12 — el rol es siempre el actual, nunca el que tenia al iniciar sesion.
    const primeraLectura = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);
    expect(primeraLectura?.roleName).toBe(`qc8-session-${sufijo}`);

    await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolAlternativoId } });

    try {
      const segundaLectura = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);
      expect(segundaLectura?.roleName).toBe(`qc8-session-alt-${sufijo}`);
    } finally {
      await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolId } });
    }
  });

  // QC-48 R13 — la empresa dada de baja SI devuelve fila, con su marca de tiempo: el corte es
  // del dominio (`resolve-session.ts`), no de este adaptador.
  it('un usuario de una empresa dada de baja devuelve companyDeletedAt no nulo', async () => {
    const bajada = new Date();
    await prisma.company.update({ where: { id: empresaId }, data: { deletedAt: bajada } });

    try {
      const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(resultado?.companyId).toBe(empresaId);
      expect(resultado?.companyDeletedAt).toEqual(bajada);
    } finally {
      await prisma.company.update({ where: { id: empresaId }, data: { deletedAt: null } });
    }
  });

  // QC-78 (T12, R20, R21) — el estado de cuenta y el plazo salen de la FILA REAL, crudos, y salen
  // en la MISMA unica consulta: las dos son columnas de `users`, asi que ni un `JOIN` mas ni una
  // segunda ida a la base. La fila se pone `blocked` con plazo a proposito: el adaptador la
  // devuelve igualmente —no filtra por estado, el corte es del dominio— y devuelve los dos valores
  // tal y como estan escritos, sin traducir nada.
  it('trae accountStatus y lockedUntil de la fila real en la misma unica consulta', async () => {
    const plazo = new Date('2026-09-01T10:30:00.000Z');
    await prisma.user.update({
      where: { id: usuarioId },
      data: { accountStatus: 'blocked', lockedUntil: plazo },
    });
    const espia = vi.spyOn(prisma.user, 'findFirst');

    try {
      const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(resultado?.accountStatus).toBe('blocked');
      expect(resultado?.lockedUntil).toEqual(plazo);
      expect(espia).toHaveBeenCalledTimes(1);
    } finally {
      espia.mockRestore();
      await prisma.user.update({
        where: { id: usuarioId },
        data: { accountStatus: 'active', lockedUntil: null },
      });
    }
  });

  // QC-23 (T9, R11, R14) — el caso que importa: ESTA sesion esta en el registro de cerradas, asi
  // que `sessionRevokedAt` sale con su instante; y sale en la MISMA unica consulta, por
  // `revoked_sessions_session_id_key`. La fila se devuelve igualmente —el adaptador no filtra por
  // revocacion, el corte 8 es del dominio— igual que no filtra por empresa muerta ni por estado.
  it('trae sessionRevokedAt de la fila del registro en la misma unica consulta', async () => {
    const sidCerrado = randomUUID();
    const cerradaEn = new Date('2026-09-01T09:00:00.000Z');
    await prisma.revokedSession.create({
      data: {
        sessionId: sidCerrado,
        userId: usuarioId,
        // Caducidad NATURAL en el futuro: una fila ya caducada seria carne de la purga de R39.
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        revokedAt: cerradaEn,
      },
    });
    const espia = vi.spyOn(prisma.user, 'findFirst');

    try {
      const cerrada = await findActiveSessionUserById(usuarioId, sidCerrado);
      const otra = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(cerrada?.sessionRevokedAt).toEqual(cerradaEn);
      // R20: cerrar UNA sesion no toca las demas de la misma persona.
      expect(otra?.sessionRevokedAt).toBeNull();
      expect(espia).toHaveBeenCalledTimes(2);
    } finally {
      espia.mockRestore();
      await prisma.revokedSession.deleteMany({ where: { sessionId: sidCerrado } });
    }
  });

  // QC-48 R13 — la condicion dura de `design.md > 4.1`: empresa y estado salen del MISMO
  // `findFirst`. Si alguien anadiera una segunda ida a la base, este contador lo delata.
  it('trae empresa y estado sin una segunda consulta', async () => {
    const espia = vi.spyOn(prisma.user, 'findFirst');

    try {
      const resultado = await findActiveSessionUserById(usuarioId, SID_SIN_CERRAR);

      expect(resultado?.companyId).toBe(empresaId);
      expect(resultado?.companyDeletedAt).toBeNull();
      expect(espia).toHaveBeenCalledTimes(1);
    } finally {
      espia.mockRestore();
    }
  });
});

// La ficha de quien no tiene empresa (el Maestro). Fixture propio, creado y borrado en el
// propio caso: nunca el Maestro del seed. Se confirma y se limpia en `finally` porque el adaptador
// lee con el cliente global, igual que el resto de este archivo.
describe('findActiveSessionUserById sin empresa (QC-161)', () => {
  async function crearMaestro(): Promise<{ id: string; username: string }> {
    const marca = randomUUID();
    const { id: rolMaestroId } = await prisma.role.findUniqueOrThrow({
      where: { name: ROLE_MAESTRO },
      select: { id: true },
    });
    const username = `qc161_session_${marca}`;
    const { id } = await prisma.user.create({
      data: {
        firstNames: 'Plataforma',
        lastNames: 'Inicial',
        birthDate: new Date('1990-01-01T00:00:00.000Z'),
        email: `qc161.session.${marca}@example.test`,
        phone: '+57 300 000 0000',
        documentTypeCode: DOCUMENT_TYPE_CC,
        documentNumber: `64${marca.replaceAll('-', '').slice(0, 18)}`,
        username,
        passwordHash: 'no-se-usa-en-este-test',
        roleId: rolMaestroId,
        companyId: null,
        accountStatus: 'active',
      },
      select: { id: true },
    });
    return { id, username };
  }

  it('QC-161 R31: resuelve la ficha del Maestro sin empresa, con sus permisos, en una sola consulta', async () => {
    const maestro = await crearMaestro();
    const espia = vi.spyOn(prisma.user, 'findFirst');

    try {
      const resultado = await findActiveSessionUserById(maestro.id, SID_SIN_CERRAR);

      expect(resultado).toEqual({
        id: maestro.id,
        username: maestro.username,
        firstNames: 'Plataforma',
        lastNames: 'Inicial',
        roleName: ROLE_MAESTRO,
        companyId: null,
        companyDeletedAt: null,
        permissions: expect.arrayContaining([...(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO] ?? [])]),
        accountStatus: 'active',
        lockedUntil: null,
        sessionsValidFrom: expect.any(Date),
        sessionRevokedAt: null,
      });
      expect(resultado?.permissions).toHaveLength(
        (SEED_ROLE_PERMISSIONS[ROLE_MAESTRO] ?? []).length,
      );
      expect(espia).toHaveBeenCalledTimes(1);
    } finally {
      espia.mockRestore();
      await prisma.user.deleteMany({ where: { id: maestro.id } });
    }
  });

  it('QC-161 R31: la cadena real de resolucion da usuario con permisos y ningun contexto de empresa', async () => {
    const maestro = await crearMaestro();

    try {
      const ahora = new Date();
      const resolveSession = createResolveSession({
        session: {
          readClaims: async () => ({
            sub: maestro.id,
            roleName: ROLE_MAESTRO,
            companyId: null,
            sessionId: SID_SIN_CERRAR,
            // Emitida un minuto en el futuro respecto del sello `DEFAULT now()` de la fila.
            issuedAt: new Date(ahora.getTime() + 60_000),
            expiresAt: new Date(ahora.getTime() + 3_600_000),
          }),
        },
        users: { findActiveById: findActiveSessionUserById },
        log: { log: () => undefined },
      });

      const resuelta = await resolveSession(new Date(ahora.getTime() + 120_000));

      expect(resuelta?.user.id).toBe(maestro.id);
      expect(resuelta?.user.roleName).toBe(ROLE_MAESTRO);
      expect([...(resuelta?.user.permissions ?? [])].sort()).toEqual(
        [...(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO] ?? [])].sort(),
      );
      expect(resuelta?.context).toBeNull();
    } finally {
      await prisma.user.deleteMany({ where: { id: maestro.id } });
    }
  });
});
