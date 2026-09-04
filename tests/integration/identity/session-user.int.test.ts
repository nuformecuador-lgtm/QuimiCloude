/**
 * T6 — Integracion de `findActiveSessionUserById` contra Postgres real (`design.md > 4.2`,
 * `design.md > 7` nivel 3).
 *
 * QUE SE EJERCITA AQUI Y NO EN LOS UNITARIOS: el adaptador Prisma de verdad, con la API tipada
 * por clave primaria, el `where` con `deletedAt: null` y el `select` minimo con el join a
 * `role.name`. Mismo patron que `login.int.test.ts`: fixture propio con prefijo y `uuid`,
 * limpieza en `afterAll` dentro de `try`/`finally`, sin seed (R21 de QC-7).
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
    },
    select: { id: true },
  });
  usuarioId = usuario.id;
}, 30_000);

afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: usuarioId } });
  } finally {
    await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
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
});
