/**
 * El choque del correlativo, AUTENTICO y contra Postgres real, a traves de
 * `withOrderTransaction` + `createOrderWriteRepository` -el mismo par que ata `OrderUnitOfWork`
 * en `lib/composition`, y el UNICO camino de alta desde que Tm2 (QC-141, `design.md > 5.3`
 * enmendado) retiro `createOrder`, que llevaba su propio bucle de reintento y traducia el
 * choque agotado a `'duplicate_number'`.
 *
 * Por que un trigger: con el lock de aviso el choque no se puede provocar por carrera, y un error
 * fabricado a mano no dice nada de la forma que tiene de verdad. Un trigger `BEFORE INSERT`,
 * acotado a la empresa efimera del caso, reescribe `order_sequence` a un numero ya ocupado: el
 * `INSERT` del adaptador choca contra `orders_company_year_sequence_key` en los TRES intentos, y
 * el `23505` que vuelve es el que produce el motor, con el mensaje en el idioma del servidor.
 *
 * El reintento sigue siendo el mismo -tres transacciones nuevas, una por intento-, pero ya NO
 * traduce a una cadena: `withOrderTransaction` reintenta y, agotados los intentos, deja SUBIR el
 * `23505` sin traducir (`isDuplicateOrderNumber`/`CREATE_ORDER_MAX_ATTEMPTS` de `order-prisma.ts`
 * son los mismos que usaba `createOrder`). Lo que este archivo prueba sigue siendo R15 del
 * correlativo: tres intentos, ni uno mas, y ningun duplicado llega a escribirse.
 *
 * Aislamiento por COMMIT: `withOrderTransaction` abre su propia `prisma.$transaction` con el
 * cliente global. El trigger y su funcion llevan un nombre unico, solo actuan sobre la empresa
 * del caso y se borran en el `finally`, antes que el fixture.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Client, DatabaseError } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewOrder, OrderRow } from '@/lib/modules/pedidos/domain/order-view';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** QC-146: presentacion de la MISMA empresa, obligatoria en `NewOrder`. */
  readonly presentationId: string;
  readonly unitId: string;
};

let recetaId: string;

async function createFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const nombre = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizePresentationName(`Bidon ${marca}`),
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
  };
}

async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  // La receta ANTES que la empresa: es la MISMA (QC-50), y `recipes.company_id` es RESTRICT.
  // El `afterAll` de mas abajo tambien la borra por `recetaId`, pero eso corre DESPUES de este
  // `finally`, cuando la empresa ya tendria que estar libre.
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

function pedidoNuevo(presentationId: string): NewOrder {
  return { recipeId: recetaId, quantity: '3.0000', priority: 'BAJA', status: 'PENDIENTE', presentationId };
}

function altaDe(fixture: Fixture): Promise<OrderRow> {
  const now = new Date();
  return withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(
      pedidoNuevo(fixture.presentationId),
      now.getUTCFullYear(),
      fixture.actorId,
      now,
      null,
      { companyId: fixture.companyId },
    ),
  );
}

/** SQLSTATE de un error de Prisma, leido del campo ESTRUCTURADO -nunca del texto del mensaje,
 *  que en esta maquina responde en espanol-. Mismo criterio que `order-prisma.ts`. */
function sqlStateOf(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const meta: unknown = error.meta;
  if (typeof meta !== 'object' || meta === null || !('code' in meta)) return null;
  const code: unknown = (meta as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

afterAll(async () => {
  await prisma.recipe.deleteMany({ where: { id: recetaId } });
  await prisma.$disconnect();
});

describe('un 23505 real del correlativo agota los tres intentos y sube sin traducir', () => {
  it('con el correlativo ocupado en los tres intentos rechaza con el 23505 del motor, tras 3 transacciones, sin escribir un duplicado', async () => {
    const fixture = await createFixture();
    // La receta es de la MISMA empresa que la del fixture: QC-50 hizo `recipes.company_id`
    // obligatoria.
    const marca = token();
    const receta = await prisma.recipe.create({
      data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: fixture.companyId },
      select: { id: true },
    });
    recetaId = receta.id;
    const sufijo = token();
    const funcion = `test_force_order_seq_${sufijo}`;
    const trigger = `test_force_order_seq_trg_${sufijo}`;
    const admin = new Client({ connectionString: connectionString() });
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await admin.connect();
      if (!UUID.test(fixture.companyId)) throw new Error(`companyId inesperado: ${fixture.companyId}`);

      // El numero 1 queda ocupado por un alta normal.
      const primera = await altaDe(fixture);
      expect(primera.number.sequence).toBe(1);

      await admin.query(
        `CREATE FUNCTION public."${funcion}"() RETURNS trigger LANGUAGE plpgsql AS $$
           BEGIN NEW.order_sequence := 1; RETURN NEW; END $$`,
      );
      await admin.query(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT ON public.orders FOR EACH ROW
           WHEN (NEW.company_id = '${fixture.companyId}'::uuid)
           EXECUTE FUNCTION public."${funcion}"()`,
      );

      // Control: el trigger produce de verdad el 23505 del indice del correlativo, y no otro error.
      const control = await admin
        .query(
          `INSERT INTO orders (company_id, order_year, order_sequence, recipe_id, quantity, priority,
                               status, created_by, updated_by, created_at, updated_at)
           VALUES ($1::uuid, $2::int, 999, $3::uuid, 1, 'BAJA', 'PENDIENTE', $4::uuid, $4::uuid, $5, $5)`,
          [fixture.companyId, primera.number.year, recetaId, fixture.actorId, primera.createdAt],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(control).toBeInstanceOf(DatabaseError);
      expect((control as DatabaseError).code).toBe('23505');
      expect((control as DatabaseError).constraint).toBe('orders_company_year_sequence_key');

      spy = vi.spyOn(prisma, '$transaction');
      const rechazo = await altaDe(fixture).then(
        () => null,
        (error: unknown) => error,
      );

      expect(rechazo, 'el alta con el correlativo ocupado en los tres intentos tenia que rechazar').not.toBeNull();
      expect(sqlStateOf(rechazo)).toBe('23505');
      expect(spy).toHaveBeenCalledTimes(3);

      const guardados = await prisma.order.count({ where: { companyId: fixture.companyId } });
      expect(guardados).toBe(1);
    } finally {
      spy?.mockRestore();
      await admin.query(`DROP TRIGGER IF EXISTS "${trigger}" ON public.orders`).catch(() => undefined);
      await admin.query(`DROP FUNCTION IF EXISTS public."${funcion}"()`).catch(() => undefined);
      await admin.end().catch(() => undefined);
      await dropFixture(fixture);
    }
  });
});
