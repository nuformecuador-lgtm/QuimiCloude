/**
 * E2E del recorrido del Operador sobre la pantalla de pedidos asignados.
 *
 * Un solo `test`: todas las comprobaciones dependen del MISMO fixture sembrado y de la MISMA
 * sesion, asi que partirlo obligaria a recrear ambos sin afirmar nada mas.
 *
 * AISLAMIENTO: prefijo propio `qc88_e2e_` + `RUN_ID` por proceso de worker, empresa efimera
 * —`companies_name_unique` es GLOBAL— y limpieza de huerfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base. `afterAll` borra por los identificadores
 * de ESTE worker y en el orden que imponen las FK RESTRICT: asignaciones -> pedidos -> receta ->
 * personas -> empresa.
 *
 * El pedido `CANCELADO` se siembra con `cancellationReason` porque el CHECK
 * `orders_cancellation_reason_matches_status` lo exige si y solo si el pedido esta cancelado.
 *
 * El rol `Operador` es el REAL del seed, nunca un fixture: sus permisos son el dato bajo prueba.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { DOCUMENT_TYPE_CC, normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc88_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;

const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

type Credentials = { readonly username: string; readonly password: string };

const actorUser: Credentials = {
  username: `${SHARED_TOKEN}_actor`,
  password: `Qc88-Actor-${RUN_ID.slice(0, 12)}`,
};

/** La otra persona de la misma empresa: el actor NO debe ver lo que solo se le asigno a ella. */
const otherUser: Credentials = {
  username: `${SHARED_TOKEN}_otra`,
  password: `Qc88-Otra-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [actorUser.username]: 'Actor',
  [otherUser.username]: 'Otra',
};
const firstNames = `Qc88${RUN_ID.slice(0, 8)}`;

const ORDER_QUANTITY = '3.0';

/** Motivo de cancelacion del pedido `CANCELADO`: el CHECK lo exige NOT NULL solo en ese estado. */
const CANCELLATION_REASON = `${SHARED_TOKEN}_motivo`;

/**
 * Posicion inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador. Los cinco pedidos usan
 * posiciones consecutivas a partir de aqui.
 */
const BASE_SEQUENCE = 700_000 + Math.floor(Math.random() * 90_000);

const SEQUENCE_PENDING = BASE_SEQUENCE;
const SEQUENCE_IN_PROGRESS = BASE_SEQUENCE + 1;
const SEQUENCE_DELIVERED = BASE_SEQUENCE + 2;
const SEQUENCE_CANCELLED = BASE_SEQUENCE + 3;
const SEQUENCE_OTHERS_ONLY = BASE_SEQUENCE + 4;

const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';

const ENTER_TESTID = 'assigned-order-enter';
const ENTER_REASON_TESTID = 'assigned-order-enter-reason';

let companyId: string | null = null;
let recipeId: string | null = null;
let actorUserId: string | null = null;
let otherUserId: string | null = null;
let orderPendingId: string | null = null;
let orderInProgressId: string | null = null;
let orderDeliveredId: string | null = null;
let orderCancelledId: string | null = null;
let orderOthersOnlyId: string | null = null;

let orderPendingNumber: string | null = null;
let orderInProgressNumber: string | null = null;
let orderDeliveredNumber: string | null = null;
let orderCancelledNumber: string | null = null;
let orderOthersOnlyNumber: string | null = null;

/** Igualdad EXACTA de texto: un correlativo no puede casar con un prefijo suyo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`)
    .filter({
      has: page.getByTestId(ORDER_NUMBER_CELL_TESTID).filter({ hasText: exactText(numberText) }),
    });
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames,
      lastNames: LAST_NAMES_BY_USERNAME[user.username] ?? 'Fixture',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId,
      // Explicito, no por defecto: la columna es `@default(pending)` y ese estado no entra por
      // el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(params: {
  sequence: number;
  status: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO';
  cancellationReason?: string;
}): Promise<{ id: string; numberText: string }> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  if (!recipeId) throw new Error('la receta del fixture no existe: fallo el beforeAll');

  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: params.sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      status: params.status,
      cancellationReason: params.cancellationReason ?? null,
    },
    select: { id: true },
  });

  return { id: order.id, numberText: formatOrderNumber({ year, sequence: params.sequence }) };
}

test.beforeAll(async () => {
  // El rol nunca se crea aqui: `roles.name` es unico y es un dato compartido con produccion/seed.
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!operatorRole) {
    throw new Error(
      `falta el rol "${ROLE_OPERADOR}": este E2E no lo crea porque sus permisos son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS. El orden lo imponen las FK RESTRICT: asignaciones -> pedidos
  // -> receta/usuario -> empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  const orphanRecipes = await prisma.recipe.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);
  if (orphanRecipeIds.length > 0) {
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: orphanRecipeIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, la UNICA
  // definicion de «mismo nombre de empresa».
  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  actorUserId = await createUser(actorUser, operatorRole.id);
  otherUserId = await createUser(otherUser, operatorRole.id);

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: actorUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const [pending, inProgress, delivered, cancelled, othersOnly] = await Promise.all([
    seedOrder({ sequence: SEQUENCE_PENDING, status: 'PENDIENTE' }),
    seedOrder({ sequence: SEQUENCE_IN_PROGRESS, status: 'EN_CURSO' }),
    seedOrder({ sequence: SEQUENCE_DELIVERED, status: 'ENTREGADO' }),
    seedOrder({
      sequence: SEQUENCE_CANCELLED,
      status: 'CANCELADO',
      cancellationReason: CANCELLATION_REASON,
    }),
    seedOrder({ sequence: SEQUENCE_OTHERS_ONLY, status: 'PENDIENTE' }),
  ]);

  orderPendingId = pending.id;
  orderPendingNumber = pending.numberText;
  orderInProgressId = inProgress.id;
  orderInProgressNumber = inProgress.numberText;
  orderDeliveredId = delivered.id;
  orderDeliveredNumber = delivered.numberText;
  orderCancelledId = cancelled.id;
  orderCancelledNumber = cancelled.numberText;
  orderOthersOnlyId = othersOnly.id;
  orderOthersOnlyNumber = othersOnly.numberText;

  // Asignacion DIRECTA: sin grupo.
  await prisma.orderAssignment.createMany({
    data: [orderPendingId, orderInProgressId, orderDeliveredId, orderCancelledId].map((orderId) => ({
      orderId,
      userId: actorUserId!,
      companyId: companyId!,
    })),
  });

  await prisma.orderAssignment.create({
    data: { orderId: orderOthersOnlyId, userId: otherUserId, companyId },
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto
  // (Chromium/WebKit) sigue corriendo. Cada paso corre aunque falle el anterior.
  const scopedCompanyId = companyId;
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () =>
      scopedCompanyId
        ? prisma.orderAssignment.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.order.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [actorUser.username, otherUser.username] } },
      }),
    () => prisma.company.deleteMany({ where: { name: COMPANY_NAME } }),
  ];

  let primerFallo: unknown;
  for (const paso of pasos) {
    try {
      await paso();
    } catch (error) {
      primerFallo ??= error;
    }
  }

  await prisma.$disconnect();

  if (primerFallo !== undefined) throw primerFallo;
});

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt tarda a proposito.
test.setTimeout(180_000);

test.describe('la lista de pedidos asignados del Operador (R38)', () => {
  test('el Operador aterriza en asignacion, ve solo sus pedidos ejecutables, no ve los finales ni los de otra persona, y el en curso llega bloqueado', async ({
    page,
  }) => {
    expect(orderPendingNumber, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      orderPendingId === null ||
      orderInProgressId === null ||
      orderDeliveredId === null ||
      orderCancelledId === null ||
      orderOthersOnlyId === null ||
      orderPendingNumber === null ||
      orderInProgressNumber === null ||
      orderDeliveredNumber === null ||
      orderCancelledNumber === null ||
      orderOthersOnlyNumber === null
    ) {
      return;
    }

    // Nunca una ruta escrita a mano: `loginAndLand` deriva el destino de los permisos reales del
    // actor, que es justo lo que se esta midiendo.
    await loginAndLand(page, actorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const pendingRow = rowByNumber(page, orderPendingNumber);
    const inProgressRow = rowByNumber(page, orderInProgressNumber);
    await expect(pendingRow).toHaveCount(1, { timeout: 60_000 });
    await expect(inProgressRow).toHaveCount(1, { timeout: 60_000 });

    // El ENTREGADO y el CANCELADO estan asignados al actor y aun asi no deben aparecer.
    await expect(rowByNumber(page, orderDeliveredNumber)).toHaveCount(0);
    await expect(rowByNumber(page, orderCancelledNumber)).toHaveCount(0);

    await expect(rowByNumber(page, orderOthersOnlyNumber)).toHaveCount(0);

    const enterInProgress = inProgressRow.getByTestId(ENTER_TESTID);
    await expect(enterInProgress).toBeDisabled();
    await expect(inProgressRow.getByTestId(ENTER_REASON_TESTID)).toBeVisible();

    const enterPending = pendingRow.getByTestId(ENTER_TESTID);
    await expect(enterPending).toBeEnabled();
  });
});
