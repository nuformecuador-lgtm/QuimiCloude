/**
 * Comenzar el acondicionamiento con equipo contra Postgres real y con la composicion real
 * (`asignaciones` de `@/lib/composition`): el pedido y el equipo se escriben en la transaccion de
 * ejecucion, y un fallo al insertar el equipo deshace tambien el cambio de estado.
 *
 * Como se fuerza el fallo: el repositorio del equipo atado a la transaccion se envuelve para que,
 * con `falloDelEquipo.activo`, `insertAll` lance despues de que el pedido ya se escribio. El
 * repositorio global (el que lee el detalle) no se toca.
 *
 * AISLAMIENTO: `commit`. `withExecutionTransaction` abre su propia transaccion sobre el cliente
 * global; lo que se mide es su ROLLBACK y la carrera de dos Comenzar reales. Cada caso fabrica su
 * empresa efimera con randomUUID y la borra en su `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';

const falloDelEquipo = vi.hoisted(() => ({ activo: false }));

vi.mock(
  '@/lib/modules/asignaciones/adapters/driven/persistence/conditioning-team-prisma',
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import('@/lib/modules/asignaciones/adapters/driven/persistence/conditioning-team-prisma')
      >();
    return {
      ...real,
      createConditioningTeamRepository: (db?: Parameters<typeof real.createConditioningTeamRepository>[0]) => {
        const repo = real.createConditioningTeamRepository(db);
        if (db === undefined) return repo;
        return {
          ...repo,
          insertAll: async (rows: Parameters<typeof repo.insertAll>[0]) => {
            if (falloDelEquipo.activo) throw new Error('fallo inyectado al insertar el equipo');
            return repo.insertAll(rows);
          },
        };
      },
    };
  },
);

import { asignaciones } from '@/lib/composition';
import { normalizeCompanyName, normalizeWorkGroupName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

type Actor = { readonly id: string; readonly companyId: string; readonly permissions: readonly string[] };

const PERMISOS_ACONDICIONADOR = ['asignaciones.consultar', 'acondicionamiento.modificar'] as const;
const PERMISOS_OPERADOR = ['asignaciones.consultar', 'asignaciones.ejecutar'] as const;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let nextSequence = 950_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

type Fixture = {
  readonly companyId: string;
  readonly documentTypeCode: string;
  readonly roleIds: readonly string[];
  readonly recipeId: string;
  readonly packerId: string;
  readonly acondicionador1: string;
  readonly acondicionador2: string;
  readonly operario1: string;
  readonly operario2: string;
  readonly operario3: string;
  readonly administrador: string;
  readonly groupId: string;
  readonly groupName: string;
};

async function crearRol(marca: string, permisos: readonly string[]): Promise<string> {
  const role = await prisma.role.create({
    data: { name: `rol-${marca}-${token()}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  for (const permissionCode of permisos) {
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionCode } });
  }
  return role.id;
}

async function crearPersona(companyId: string, roleId: string, documentTypeCode: string, nombre: string): Promise<string> {
  const marca = token();
  const user = await prisma.user.create({
    data: {
      firstNames: nombre,
      lastNames: 'Prueba',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode,
      documentNumber: marca.slice(0, 12),
      username: `u.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const nombre = `Empresa equipo ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const rolAcondicionador = await crearRol('acondicionador', PERMISOS_ACONDICIONADOR);
  const rolOperador = await crearRol('operador', PERMISOS_OPERADOR);
  const rolAdministrador = await crearRol('administrador', ['pedidos.consultar', 'asignaciones.consultar']);
  const rolEmpacador = await crearRol('empacador', ['empaque.modificar']);

  const persona = (roleId: string, n: string) => crearPersona(company.id, roleId, documentType.code, n);
  const packerId = await persona(rolEmpacador, 'Empacador');
  const acondicionador1 = await persona(rolAcondicionador, 'Alba');
  const acondicionador2 = await persona(rolAcondicionador, 'Bruno');
  const operario1 = await persona(rolOperador, 'Olga');
  const operario2 = await persona(rolOperador, 'Oscar');
  const operario3 = await persona(rolOperador, 'Omar');
  const administrador = await persona(rolAdministrador, 'Adela');

  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });
  const groupName = `Turno ${marca}`;
  const group = await prisma.workGroup.create({
    data: { name: groupName, nameNormalized: normalizeWorkGroupName(groupName), companyId: company.id },
    select: { id: true },
  });
  for (const userId of [operario2, administrador]) {
    await prisma.workGroupMember.create({ data: { workGroupId: group.id, userId, companyId: company.id } });
  }

  return {
    companyId: company.id,
    documentTypeCode: documentType.code,
    roleIds: [rolAcondicionador, rolOperador, rolAdministrador, rolEmpacador],
    recipeId: recipe.id,
    packerId,
    acondicionador1,
    acondicionador2,
    operario1,
    operario2,
    operario3,
    administrador,
    groupId: group.id,
    groupName,
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  const companyId = fixture.companyId;
  await prisma.orderConditioningTeamMember.deleteMany({ where: { companyId } });
  await prisma.orderAssignment.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.workGroupMember.deleteMany({ where: { companyId } });
  await prisma.workGroup.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [...fixture.roleIds] } } });
  await prisma.role.deleteMany({ where: { id: { in: [...fixture.roleIds] } } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function pedidoPorAcondicionar(fixture: Fixture): Promise<string> {
  const order = await prisma.order.create({
    data: {
      companyId: fixture.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: freshSequence(),
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: 'POR_ACONDICIONAR',
      packedBy: fixture.packerId,
    },
    select: { id: true },
  });
  return order.id;
}

function actor(fixture: Fixture, id: string, permissions: readonly string[]): Actor {
  return { id, companyId: fixture.companyId, permissions };
}

async function leerPedido(id: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, packedBy: true, conditionedBy: true, finishedAt: true },
  });
}

async function leerEquipo(orderId: string) {
  return prisma.orderConditioningTeamMember.findMany({
    where: { orderId },
    orderBy: { position: 'asc' },
    select: { userId: true, companyId: true, workGroupId: true, workGroupName: true, position: true },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Comenzar con equipo: pedido y equipo en una transaccion (R12, R13, R15)', () => {
  it('R12, R13, R15: escribe el pedido y el equipo juntos, sueltas primero y del grupo sin el Administrador', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoPorAcondicionar(fixture);
      const acondicionador = actor(fixture, fixture.acondicionador1, PERMISOS_ACONDICIONADOR);

      await asignaciones.startConditioning(acondicionador, {
        orderId: pedido,
        userIds: [fixture.operario1, fixture.acondicionador1],
        workGroupIds: [fixture.groupId],
      });

      expect(await leerPedido(pedido)).toEqual({
        status: 'EN_ACONDICIONAMIENTO',
        packedBy: fixture.packerId,
        conditionedBy: fixture.acondicionador1,
        finishedAt: null,
      });
      expect(await leerEquipo(pedido)).toEqual([
        { userId: fixture.operario1, companyId: fixture.companyId, workGroupId: null, workGroupName: null, position: 0 },
        { userId: fixture.acondicionador1, companyId: fixture.companyId, workGroupId: null, workGroupName: null, position: 1 },
        {
          userId: fixture.operario2,
          companyId: fixture.companyId,
          workGroupId: fixture.groupId,
          workGroupName: fixture.groupName,
          position: 2,
        },
      ]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R12: si insertar el equipo falla dentro de la transaccion, el pedido sigue POR_ACONDICIONAR y sin equipo', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoPorAcondicionar(fixture);
      const acondicionador = actor(fixture, fixture.acondicionador1, PERMISOS_ACONDICIONADOR);

      falloDelEquipo.activo = true;
      try {
        await expect(
          asignaciones.startConditioning(acondicionador, {
            orderId: pedido,
            userIds: [fixture.operario1],
            workGroupIds: [],
          }),
        ).rejects.toThrow('fallo inyectado al insertar el equipo');
      } finally {
        falloDelEquipo.activo = false;
      }

      expect(await leerPedido(pedido)).toEqual({
        status: 'POR_ACONDICIONAR',
        packedBy: fixture.packerId,
        conditionedBy: null,
        finishedAt: null,
      });
      expect(await leerEquipo(pedido)).toEqual([]);

      // Sin el fallo, el mismo Comenzar escribe las dos cosas: el rollback no dejo nada a medias.
      await asignaciones.startConditioning(acondicionador, { orderId: pedido, userIds: [fixture.operario1], workGroupIds: [] });
      expect((await leerPedido(pedido)).status).toBe('EN_ACONDICIONAMIENTO');
      expect(await leerEquipo(pedido)).toHaveLength(1);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R13, R14: el grupo se resuelve al comenzar, no al abrir el modal, y renombrarlo despues no cambia el equipo', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoPorAcondicionar(fixture);
      const acondicionador = actor(fixture, fixture.acondicionador1, PERMISOS_ACONDICIONADOR);

      // Al abrir el modal el grupo aporta una persona (el Administrador no cuenta).
      const candidatos = await asignaciones.listConditioningTeamCandidates(acondicionador, {});
      expect(candidatos.workGroups.find((g) => g.id === fixture.groupId)).toMatchObject({
        contributes: 1,
        excludedAdministrators: 1,
      });

      // Entre abrir el modal y comenzar, alguien entra en el grupo.
      await prisma.workGroupMember.create({
        data: { workGroupId: fixture.groupId, userId: fixture.operario3, companyId: fixture.companyId },
      });

      await asignaciones.startConditioning(acondicionador, { orderId: pedido, userIds: [], workGroupIds: [fixture.groupId] });

      const equipo = await leerEquipo(pedido);
      expect(equipo.map((fila) => fila.userId).sort()).toEqual([fixture.operario2, fixture.operario3].sort());
      expect(equipo.every((fila) => fila.workGroupName === fixture.groupName)).toBe(true);
      expect(equipo.map((fila) => fila.position)).toEqual([0, 1]);

      await prisma.workGroup.update({
        where: { id: fixture.groupId },
        data: { name: `Renombrado ${token()}`, nameNormalized: `renombrado${token()}` },
      });
      expect(await leerEquipo(pedido)).toEqual(equipo);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

describe('Dos Comenzar a la vez con equipos distintos (R22)', () => {
  it('R22: queda un solo quien acondiciona con su equipo, ninguna fila del otro, y el otro recibe order_conditioning_taken', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoPorAcondicionar(fixture);
      const uno = actor(fixture, fixture.acondicionador1, PERMISOS_ACONDICIONADOR);
      const dos = actor(fixture, fixture.acondicionador2, PERMISOS_ACONDICIONADOR);
      const equipoDe: Record<string, readonly string[]> = {
        [fixture.acondicionador1]: [fixture.operario1],
        [fixture.acondicionador2]: [fixture.operario3, fixture.operario2],
      };

      const resultados = await Promise.allSettled([
        asignaciones.startConditioning(uno, { orderId: pedido, userIds: [...equipoDe[fixture.acondicionador1]!], workGroupIds: [] }),
        asignaciones.startConditioning(dos, { orderId: pedido, userIds: [...equipoDe[fixture.acondicionador2]!], workGroupIds: [] }),
      ]);

      const ganadas = resultados.filter((r) => r.status === 'fulfilled');
      const perdidas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ganadas).toHaveLength(1);
      expect(perdidas).toHaveLength(1);
      expect((perdidas[0]!.reason as { code?: string }).code).toBe('order_conditioning_taken');

      const fila = await leerPedido(pedido);
      expect(fila.status).toBe('EN_ACONDICIONAMIENTO');
      const ganador = fila.conditionedBy!;
      expect([fixture.acondicionador1, fixture.acondicionador2]).toContain(ganador);
      expect((await leerEquipo(pedido)).map((m) => m.userId)).toEqual(equipoDe[ganador]);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

describe('El equipo es solo constancia (R24, R27, R29)', () => {
  it('R24, R29: el miembro no ve el pedido ni puede actuar, los responsables no cambian y solo quien acondiciona termina', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoPorAcondicionar(fixture);
      await prisma.orderAssignment.create({
        data: { orderId: pedido, userId: fixture.operario2, companyId: fixture.companyId },
      });
      const responsablesAntes = await prisma.orderAssignment.findMany({
        where: { orderId: pedido },
        select: { userId: true, workGroupId: true, workGroupName: true, updatedAt: true },
      });

      const uno = actor(fixture, fixture.acondicionador1, PERMISOS_ACONDICIONADOR);
      const dos = actor(fixture, fixture.acondicionador2, PERMISOS_ACONDICIONADOR);
      const miembroSinPermiso = actor(fixture, fixture.operario1, PERMISOS_OPERADOR);

      await asignaciones.startConditioning(uno, {
        orderId: pedido,
        userIds: [fixture.operario1, fixture.acondicionador2],
        workGroupIds: [],
      });

      // Ni en «Mis asignados» del miembro, ni nuevas filas de responsables.
      const misAsignados = await asignaciones.listAssignedOrders(miembroSinPermiso, { page: 1 });
      expect(misAsignados.items.map((item) => item.id)).not.toContain(pedido);
      expect(
        await prisma.orderAssignment.findMany({
          where: { orderId: pedido },
          select: { userId: true, workGroupId: true, workGroupName: true, updatedAt: true },
        }),
      ).toEqual(responsablesAntes);

      // El miembro sin el permiso no comienza ni termina.
      await expect(
        asignaciones.startConditioning(miembroSinPermiso, { orderId: pedido, userIds: [fixture.operario1], workGroupIds: [] }),
      ).rejects.toMatchObject({ code: 'unauthorized' });
      await expect(asignaciones.finishConditioning(miembroSinPermiso, { orderId: pedido })).rejects.toMatchObject({
        code: 'unauthorized',
      });

      // El acondicionador que es miembro del equipo pero no acondiciona no termina.
      const equipoAntes = await leerEquipo(pedido);
      await expect(asignaciones.finishConditioning(dos, { orderId: pedido })).rejects.toMatchObject({
        code: 'order_conditioning_taken',
      });
      expect(await leerPedido(pedido)).toMatchObject({
        status: 'EN_ACONDICIONAMIENTO',
        conditionedBy: fixture.acondicionador1,
        finishedAt: null,
      });
      expect(await leerEquipo(pedido)).toEqual(equipoAntes);

      // R27: quien acondiciona termina, el pedido queda TERMINADO y conserva el equipo.
      const { numberText } = await asignaciones.finishConditioning(uno, { orderId: pedido });
      expect(numberText.length).toBeGreaterThan(0);
      const terminado = await leerPedido(pedido);
      expect(terminado.status).toBe('TERMINADO');
      expect(terminado.finishedAt).not.toBeNull();
      expect(await leerEquipo(pedido)).toEqual(equipoAntes);

      // R25: el detalle de quien lo acondiciono lo devuelve con su equipo.
      const detalle = await asignaciones.getConditioningOrder(uno, { orderId: pedido });
      expect(detalle.team.map((m) => [m.userId, m.origin.kind])).toEqual([
        [fixture.operario1, 'direct'],
        [fixture.acondicionador2, 'direct'],
      ]);
      expect(detalle.team.map((m) => m.displayName)).toEqual(['Olga Prueba', 'Bruno Prueba']);
    } finally {
      await borrarFixture(fixture);
    }
  });
});
