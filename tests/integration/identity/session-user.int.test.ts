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
 * EL ROL NO SE MUEVE (R13, R14): sigue saliendo de `users.role_id`, en el mismo `select` y sin
 * ninguna consulta adicional. El caso «el rol cambiado entre dos lecturas devuelve el nuevo»
 * ya lo demuestra, y esta ficha lo deja intacto a proposito.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

const sufijo = randomUUID();
const nombreDeUsuario = `qc8_session_${sufijo}`;
/** QC-47: nombre irrepetible de la empresa efimera de este fixture. */
const nombreDeEmpresa = `qc8-session-${sufijo}`;

let usuarioId = '';
let rolId = '';
let rolAlternativoId = '';
let empresaId = '';

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
    },
    select: { id: true },
  });
  usuarioId = usuario.id;
}, 30_000);

afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: usuarioId } });
  } finally {
    // QC-47: el orden es `users -> companies`; la FK hacia la empresa es `ON DELETE RESTRICT`.
    await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
    await prisma.company.deleteMany({ where: { id: empresaId } });
    await prisma.$disconnect();
  }
});

describe('findActiveSessionUserById contra Postgres real', () => {
  it('un usuario activo devuelve nombres, username y el rol actual', async () => {
    // R10 — consulta por sub (id de la fila real).
    const resultado = await findActiveSessionUserById(usuarioId);

    expect(resultado).toEqual({
      id: usuarioId,
      username: nombreDeUsuario,
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      roleName: `qc8-session-${sufijo}`,
      // QC-48 R13: la empresa de la ficha y su estado, en la misma fila.
      companyId: empresaId,
      companyDeletedAt: null,
    });
  });

  it('un usuario con deleted_at con valor devuelve null', async () => {
    // R11 — dado de baja aunque el id sea correcto.
    await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: new Date() } });

    try {
      expect(await findActiveSessionUserById(usuarioId)).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: null } });
    }
  });

  it('un id inexistente devuelve null', async () => {
    // R11 — sin fila, sin excepcion.
    expect(await findActiveSessionUserById(randomUUID())).toBeNull();
  });

  it('el rol cambiado entre dos lecturas devuelve el nuevo', async () => {
    // R12 — el rol es siempre el actual, nunca el que tenia al iniciar sesion.
    const primeraLectura = await findActiveSessionUserById(usuarioId);
    expect(primeraLectura?.roleName).toBe(`qc8-session-${sufijo}`);

    await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolAlternativoId } });

    try {
      const segundaLectura = await findActiveSessionUserById(usuarioId);
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
      const resultado = await findActiveSessionUserById(usuarioId);

      expect(resultado?.companyId).toBe(empresaId);
      expect(resultado?.companyDeletedAt).toEqual(bajada);
    } finally {
      await prisma.company.update({ where: { id: empresaId }, data: { deletedAt: null } });
    }
  });

  // QC-48 R13 — la condicion dura de `design.md > 4.1`: empresa y estado salen del MISMO
  // `findFirst`. Si alguien anadiera una segunda ida a la base, este contador lo delata.
  it('trae empresa y estado sin una segunda consulta', async () => {
    const espia = vi.spyOn(prisma.user, 'findFirst');

    try {
      const resultado = await findActiveSessionUserById(usuarioId);

      expect(resultado?.companyId).toBe(empresaId);
      expect(resultado?.companyDeletedAt).toBeNull();
      expect(espia).toHaveBeenCalledTimes(1);
    } finally {
      espia.mockRestore();
    }
  });
});
