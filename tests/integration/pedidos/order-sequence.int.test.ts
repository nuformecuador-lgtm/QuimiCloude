/**
 * El correlativo del pedido contra una base Postgres REAL.
 *
 * REESCRITO POR QC-60 (2026-09-16). Nacio en QC-34 (T17) para probar `next_order_sequence(integer)`
 * —una secuencia de Postgres POR ANO evaluada dentro del `INSERT`— y QC-60 T3 dejo caer esa funcion
 * a proposito: el eje del correlativo paso de «ano» a «(empresa, ano)», y ahora lo reparte el
 * `INSERT` de `insertAliveOrder` con un `pg_advisory_xact_lock` por `(empresa, ano)` y un `max()+1`
 * dentro de si mismo. Los requisitos que este archivo cubria siguen en pie —«el numero lo entrega
 * la base», «la primera alta del ano arranca en 1», «no se reutiliza un numero entregado»— y se
 * prueban aqui contra el mecanismo NUEVO, llamando al adaptador REAL y no a una copia de su SQL.
 *
 * `createOrder` -el alta suelta con su propio bucle de reintento- se retiro; el UNICO `INSERT` de
 * pedido que queda es `insertAliveOrder`, sobre `withOrderTransaction` + `createOrderWriteRepository`,
 * el mismo par que ata `OrderUnitOfWork` en `lib/composition`. El reintento del correlativo sigue
 * vivo, pero ahora en `withOrderTransaction`.
 *
 * DOS CAMBIOS DE COMPORTAMIENTO, deliberados y escritos en `design.md > 3.4` de QC-60:
 *   - un alta ABORTADA ya NO deja hueco: con `max()+1` el numero no se consume. Aquellas fichas
 *     aceptaron que PUDIERA haber huecos, no exigieron que los hubiera;
 *   - la primera alta de un ano ya NO crea ninguna secuencia: el estado del correlativo es derivado
 *     del dato.
 *
 * LA CONCURRENCIA NO VIVE AQUI: el caso de las dos conexiones sobre la funcion muerta lo releva
 * `order-sequence-race.int.test.ts` (QC-60 T14), con el patron medido de QC-81. Y el reparto por
 * empresa y el «78 tras 37/44/77» viven en `company-scope-queries.int.test.ts` (T13).
 *
 * AISLAMIENTO POR COMMIT: `withOrderTransaction` usa el cliente Prisma GLOBAL y abre su PROPIA
 * transaccion, asi que la transaccion con rollback que este archivo usaba antes no lo envolveria.
 * Una empresa efimera por caso, borrada en `finally`.
 *
 * ANOS DE PRUEBA MUY LEJANOS (28xx): el CHECK `orders_order_year_matches_created_at` (QC-33 R41) ata
 * `order_year` al ano UTC de `created_at`, y cada alta pasa un `now` de ese ano. Se afirma sobre el
 * SQLSTATE, nunca sobre el texto: en esta maquina Postgres responde en espanol.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewOrder, OrderRow } from '@/lib/modules/pedidos/domain/order-view';

const YEAR_PRIMERA_ALTA = 2871;
const YEAR_DOS_ALTAS = 2872;
const YEAR_ABORTADA = 2873;
const YEAR_ANTERIOR = 2874;
const YEAR_SIGUIENTE = 2875;

/** `check_violation`. Estable y ajeno al idioma del servidor. */
const CHECK_VIOLATION = '23514';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function instantIn(year: number): Date {
  return new Date(`${String(year)}-06-15T12:00:00.000Z`);
}

let recetaId: string;
let recetaCompanyId: string;
/** Unidad de SISTEMA compartida: `presentations.unit_id` es obligatoria y sirve a todos los
 *  fixtures de este archivo. */
let unitId: string;

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** QC-146: presentacion de la MISMA empresa, obligatoria en `NewOrder`. */
  readonly presentationId: string;
};

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
  // NUNCA la empresa de instalacion: `companies_name_unique` es global. `name_normalized` sale de
  // `normalizeCompanyName`, la unica definicion de «mismo nombre de empresa».
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
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizePresentationName(`Bidon ${marca}`),
      unitId,
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
  };
}

async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

function pedido(presentationId: string, overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId: recetaId,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    presentationId,
    ...overrides,
  };
}

async function alta(fixture: Fixture, year: number, overrides: Partial<NewOrder> = {}): Promise<OrderRow> {
  return withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(
      pedido(fixture.presentationId, overrides),
      year,
      fixture.actorId,
      instantIn(year),
      null,
      { companyId: fixture.companyId },
    ),
  );
}

async function correlativos(fixture: Fixture, year: number): Promise<number[]> {
  const filas = await prisma.order.findMany({
    where: { companyId: fixture.companyId, orderYear: year },
    select: { orderSequence: true },
    orderBy: { orderSequence: 'asc' },
  });
  return filas.map((fila) => fila.orderSequence);
}

async function sequenceExists(year: number): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c
    WHERE c.relkind = 'S' AND c.relname = ${`orders_sequence_${String(year)}`}`;
  return filas.length === 1;
}

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

beforeAll(async () => {
  const marca = token();
  unitId = (
    await prisma.unit.create({
      data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
      select: { id: true },
    })
  ).id;
  // La receta es compartida por todos los fixtures de este archivo —cada caso siembra su propia
  // empresa efimera para el pedido—, asi que se ancla a una empresa efimera propia: QC-50 hizo
  // `recipes.company_id` obligatoria.
  const nombre = `Empresa receta ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  recetaCompanyId = company.id;
  const receta = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });
  recetaId = receta.id;
});

afterAll(async () => {
  await prisma.recipe.deleteMany({ where: { id: recetaId } });
  await prisma.company.deleteMany({ where: { id: recetaCompanyId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.$disconnect();
});

describe('el correlativo por (empresa, ano) (QC-34 R11, R12, R13 sobre el mecanismo de QC-60)', () => {
  it('next_order_sequence(integer) ya no existe: el correlativo no tiene una segunda definicion', async () => {
    // Si la funcion siguiera viva, cualquiera podria volver a numerar con el contador GLOBAL y la
    // serie de una empresa delataria cuantos pedidos hace otra (QC-60 decision 2).
    const funciones = await prisma.$queryRaw<{ proname: string }[]>`
      SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'next_order_sequence'`;
    expect(funciones).toEqual([]);
  });

  it('la primera alta de un ano arranca en 1 y NO crea ninguna secuencia', async () => {
    const fixture = await createFixture();
    try {
      expect(await sequenceExists(YEAR_PRIMERA_ALTA)).toBe(false);

      const creado = await alta(fixture, YEAR_PRIMERA_ALTA);

      expect(creado.number).toEqual({ year: YEAR_PRIMERA_ALTA, sequence: 1 });
      expect(await correlativos(fixture, YEAR_PRIMERA_ALTA)).toEqual([1]);
      // Estado derivado del dato: ningun objeto aparte que pueda desincronizarse.
      expect(await sequenceExists(YEAR_PRIMERA_ALTA)).toBe(false);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('dos altas seguidas del mismo ano obtienen posiciones distintas y consecutivas', async () => {
    const fixture = await createFixture();
    try {
      const primera = await alta(fixture, YEAR_DOS_ALTAS);
      const segunda = await alta(fixture, YEAR_DOS_ALTAS);

      expect(primera.number.sequence).toBe(1);
      expect(segunda.number.sequence).toBe(2);
      expect(await correlativos(fixture, YEAR_DOS_ALTAS)).toEqual([1, 2]);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('un alta abortada NO consume su numero: la siguiente recibe el que le tocaba', async () => {
    // Derogacion consciente de QC-60 `design.md > 3.4`: con `nextval` el numero se perdia; con
    // `max()+1` dentro de la transaccion del alta, el `ROLLBACK` se lo lleva con la fila. Lo que NO
    // cambia es R13 de QC-34: ningun numero ENTREGADO se reutiliza (eso lo prueba T13 con el pedido
    // borrado y el cancelado).
    const fixture = await createFixture();
    try {
      expect((await alta(fixture, YEAR_ABORTADA)).number.sequence).toBe(1);

      // `quantity = 0` viola `orders_quantity_positive` (QC-33 R7) DENTRO de la transaccion del alta.
      let rechazo: unknown = null;
      try {
        await alta(fixture, YEAR_ABORTADA, { quantity: '0' });
      } catch (error) {
        rechazo = error;
      }
      expect(rechazo, 'el alta con cantidad cero tenia que fallar').not.toBeNull();
      expect(sqlStateOf(rechazo)).toBe(CHECK_VIOLATION);

      expect((await alta(fixture, YEAR_ABORTADA)).number.sequence).toBe(2);
      expect(await correlativos(fixture, YEAR_ABORTADA)).toEqual([1, 2]);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('un ano nuevo vuelve a arrancar en 1, y el anterior sigue donde estaba', async () => {
    const fixture = await createFixture();
    try {
      expect((await alta(fixture, YEAR_ANTERIOR)).number.sequence).toBe(1);
      expect((await alta(fixture, YEAR_ANTERIOR)).number.sequence).toBe(2);

      expect((await alta(fixture, YEAR_SIGUIENTE)).number.sequence).toBe(1);

      // La serie del ano anterior no se reinicio ni se contamino con la del nuevo.
      expect((await alta(fixture, YEAR_ANTERIOR)).number.sequence).toBe(3);
      expect(await correlativos(fixture, YEAR_ANTERIOR)).toEqual([1, 2, 3]);
      expect(await correlativos(fixture, YEAR_SIGUIENTE)).toEqual([1]);
    } finally {
      await dropFixture(fixture);
    }
  });
});
