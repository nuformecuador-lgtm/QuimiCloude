/**
 * T6 — Integracion de `findActiveSessionUserById` contra Postgres real (`design.md > 4.2`,
 * `design.md > 7` nivel 3).
 *
 * QUE SE EJERCITA AQUI Y NO EN LOS UNITARIOS: el adaptador Prisma de verdad, con la API tipada
 * por clave primaria, el `where` con `deletedAt: null` y el `select` minimo con el join al
 * nombre del rol. Mismo patron que `login.int.test.ts`: fixture propio con prefijo y `uuid`,
 * limpieza en `afterAll` dentro de `try`/`finally`, sin seed (R21 de QC-7).
 *
 * QC-47 (R15, R17) — el rol ya NO sale de `users.role_id`, que dejo de existir, sino de la
 * PERTENENCIA. El fixture crea ademas una empresa y una fila de `memberships`; el caso «el rol
 * cambiado entre dos lecturas» mueve ahora el rol EN LA PERTENENCIA, y hay uno nuevo: un usuario
 * vivo SIN ninguna pertenencia devuelve `null`, sin rol inventado y sin sesion (R17).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

const sufijo = randomUUID();
const nombreDeUsuario = `qc8_session_${sufijo}`;

let usuarioId = '';
let rolId = '';
let rolAlternativoId = '';
let empresaId = '';
/** Usuario vivo, pero SIN ninguna pertenencia (R17). */
let usuarioSinPertenenciaId = '';
const sufijoSinPertenencia = randomUUID();

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

  // La empresa de la pertenencia: nombre propio de esta ejecucion para no chocar con
  // `companies_name_unique` ni con la empresa inicial del seed.
  const empresa = await prisma.company.create({
    data: { name: `QC-47 Session ${sufijo}`, nameNormalized: `qc47session${sufijo}` },
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
    },
    select: { id: true },
  });
  usuarioId = usuario.id;

  // QC-47 — el rol de esta persona vive AQUI, no en `users`.
  await prisma.membership.create({
    data: { userId: usuarioId, companyId: empresaId, roleId: rolId },
    select: { id: true },
  });

  // Segundo usuario, identico salvo por lo unico que importa: no tiene pertenencia (R17).
  const usuarioSinPertenencia = await prisma.user.create({
    data: {
      firstNames: 'Juan Carlos',
      lastNames: 'Rojas Diaz',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `qc47.session.sin.${sufijoSinPertenencia}@example.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: sufijoSinPertenencia.replaceAll('-', '').slice(0, 20),
      username: `qc47_session_sin_${sufijoSinPertenencia}`,
      passwordHash: 'no-se-usa-en-este-test',
    },
    select: { id: true },
  });
  usuarioSinPertenenciaId = usuarioSinPertenencia.id;
}, 30_000);

afterAll(async () => {
  // El orden es el de las FK `RESTRICT`: pertenencias, usuarios, y empresa y roles al final.
  try {
    await prisma.membership.deleteMany({ where: { userId: usuarioId } });
  } finally {
    try {
      await prisma.user.deleteMany({
        where: { id: { in: [usuarioId, usuarioSinPertenenciaId] } },
      });
    } finally {
      await prisma.company.deleteMany({ where: { id: empresaId } });
      await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
      await prisma.$disconnect();
    }
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

  it('el rol cambiado en la pertenencia entre dos lecturas devuelve el nuevo', async () => {
    // R12 de QC-8 y R15 de QC-47 — el rol es siempre el actual, y su unica fuente es la
    // pertenencia: se mueve ahi (el usuario ya no tiene columna de rol) y la segunda lectura
    // tiene que traer el nuevo.
    const primeraLectura = await findActiveSessionUserById(usuarioId);
    expect(primeraLectura?.roleName).toBe(`qc8-session-${sufijo}`);

    await prisma.membership.updateMany({
      where: { userId: usuarioId, companyId: empresaId },
      data: { roleId: rolAlternativoId },
    });

    try {
      const segundaLectura = await findActiveSessionUserById(usuarioId);
      expect(segundaLectura?.roleName).toBe(`qc8-session-alt-${sufijo}`);
    } finally {
      await prisma.membership.updateMany({
        where: { userId: usuarioId, companyId: empresaId },
        data: { roleId: rolId },
      });
    }
  });

  it('un usuario vivo sin ninguna pertenencia devuelve null', async () => {
    // R17 de QC-47 — sin pertenencia no hay rol que resolver, y la lectura de sesion devuelve
    // `null` en vez de inventar un rol por defecto o emitir una sesion sin rol.
    expect(
      await prisma.user.count({ where: { id: usuarioSinPertenenciaId, deletedAt: null } }),
    ).toBe(1);
    expect(await prisma.membership.count({ where: { userId: usuarioSinPertenenciaId } })).toBe(0);

    expect(await findActiveSessionUserById(usuarioSinPertenenciaId)).toBeNull();
  });
});
