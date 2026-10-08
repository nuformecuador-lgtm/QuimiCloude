/**
 * E2E del registro de ejecucion: retomar en el paso en que se quedo y cancelar con motivo.
 *
 * Los asertos de estado se leen de la base, no de la pantalla. Cada caso usa su propio pedido.
 *
 * Aislamiento: prefijo propio + `RUN_ID` por worker, empresa efimera -`companies_name_unique` es
 * global- y limpieza de huerfanos por prefijo y por edad, porque Chromium y WebKit corren a la vez
 * sobre la misma base.
 *
 * El rol `Operador` es el real del seed: no tiene `pedidos.consultar`, asi que puede ser
 * responsable de un pedido.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import { assignedOrderCancelledNoticeText } from '@/app/(private)/asignacion/components/assigned-order-cancelled-notice';
import { normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ASSIGNED_ORDERS_ROUTE, CANCELLED_ORDER_PARAM, assignedOrderRoute } from '@/lib/shared/routes';

import { ASSIGNED_ORDER_START_CONFIRM_TESTID, clickAndConfirm } from './helpers/confirm-dialog';
import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc82_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;

const BATCH_STOCK = '100.0000';
const UNIT_COST = '10.0000';
const ORDER_QUANTITY = '3.0';
const PRESENTATION_CONTENT = '1';

type Credentials = { readonly username: string; readonly password: string };

const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc82-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Alta y aleatoria: dos workers no comparten empresa, pero asi el numero se lee unico en la lista. */
const BASE_SEQUENCE = 700_000 + Math.floor(Math.random() * 90_000);
const SEQUENCE_RESUMED = BASE_SEQUENCE;
const SEQUENCE_CANCELLED = BASE_SEQUENCE + 1;

/** Los dos primeros pasos bloquean Siguiente hasta marcar su item; asi avanzar es un gesto real. */
const RECIPE_STEPS: readonly RecipeStepDocument[] = [
  {
    blocks: [{ kind: 'checklist', items: [{ spans: [{ text: `${SHARED_TOKEN}_paso_1` }] }] }],
  },
  {
    blocks: [{ kind: 'checklist', items: [{ spans: [{ text: `${SHARED_TOKEN}_paso_2` }] }] }],
  },
  { blocks: [{ kind: 'paragraph', spans: [{ text: `${SHARED_TOKEN}_paso_3` }] }] },
  { blocks: [{ kind: 'paragraph', spans: [{ text: `${SHARED_TOKEN}_paso_4` }] }] },
];

const CANCELLATION_REASON = `Motivo ${SHARED_TOKEN}: se acabo el reactivo`;

const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ENTER_TESTID = 'assigned-order-enter';
const EXECUTION_TITLE_TESTID = 'order-execution-title';

/** Solo el paso actual esta en el DOM: el item 0-0 es siempre el del paso que se ve. */
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_NEXT_TESTID = 'step-reader-next';
const STEP_POSITION_TESTID = 'step-reader-position';

const CANCEL_ORDER_BUTTON_NAME = 'Cancelar pedido';
const CANCEL_REASON_LABEL = /motivo/i;

let companyId: string | null = null;
let recipeId: string | null = null;
let operatorUserId: string | null = null;
let resumedOrder: { id: string; numberText: string } | null = null;
let cancelledOrder: { id: string; numberText: string } | null = null;

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

function positionText(current: number): string {
  return `Paso ${current} de ${RECIPE_STEPS.length}`;
}

async function countEntries(orderId: string, action: 'RESUME' | 'ADVANCE'): Promise<number> {
  return prisma.orderExecutionEntry.count({ where: { orderId, action } });
}

/** Entra desde la lista con Entrar + Comenzar, como lo haria el Operador. */
async function openFromList(page: Page, order: { id: string; numberText: string }): Promise<void> {
  await loginAndLand(page, operatorUser);
  await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

  const row = rowByNumber(page, order.numberText);
  await expect(row).toHaveCount(1, { timeout: 60_000 });

  await clickAndConfirm(page, row.getByTestId(ENTER_TESTID), ASSIGNED_ORDER_START_CONFIRM_TESTID);
  await page.waitForURL((url) => url.pathname === assignedOrderRoute(order.id), { timeout: 60_000 });
  await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
}

async function seedOrder(sequence: number): Promise<{ id: string; numberText: string }> {
  if (!companyId || !recipeId) throw new Error('el fixture no existe: fallo el beforeAll');

  const presentation = await prisma.presentation.findFirstOrThrow({
    where: { companyId, name: PRESENTATION_NAME },
    select: { id: true, unitId: true },
  });
  // El CHECK `orders_order_year_matches_created_at` ata el ano a `created_at`.
  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      unitId: presentation.unitId,
      presentationLines: {
        create: [
          {
            companyId,
            presentationId: presentation.id,
            packages: Math.floor(Number(ORDER_QUANTITY) / Number(PRESENTATION_CONTENT)),
            presentationContent: PRESENTATION_CONTENT,
          },
        ],
      },
      status: 'PENDIENTE',
    },
    select: { id: true },
  });

  return { id: order.id, numberText: formatOrderNumber({ year, sequence }) };
}

test.beforeAll(async () => {
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!operatorRole) {
    throw new Error(
      `falta el rol "${ROLE_OPERADOR}": siembra la base con \`pnpm run db:seed\` antes de correr \`pnpm run e2e\`.`,
    );
  }

  // Huerfanos: el orden lo imponen las FK RESTRICT.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);

  if (orphanCompanyIds.length > 0) {
    const inOrphans = { companyId: { in: orphanCompanyIds } };
    await prisma.reservationMovement.deleteMany({ where: inOrphans });
    await prisma.inventoryMovement.deleteMany({ where: inOrphans });
    await prisma.orderAssignment.deleteMany({ where: inOrphans });
    await prisma.orderPresentationLine.deleteMany({ where: inOrphans });
    await prisma.orderExecutionEntry.deleteMany({ where: inOrphans });
    await prisma.order.deleteMany({ where: inOrphans });
    await prisma.productBatch.deleteMany({ where: inOrphans });
    await prisma.recipe.deleteMany({ where: inOrphans });
    await prisma.product.deleteMany({ where: inOrphans });
    await prisma.presentation.deleteMany({ where: inOrphans });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  operatorUserId = (
    await prisma.user.create({
      data: {
        firstNames: `Qc82${RUN_ID.slice(0, 8)}`,
        lastNames: 'Operador',
        birthDate: new Date('1990-01-01'),
        email: `${operatorUser.username}@example.test`,
        phone: '+573000000000',
        documentTypeCode: 'CC',
        documentNumber: operatorUser.username,
        username: operatorUser.username,
        passwordHash: await createPasswordHash(operatorUser.password),
        roleId: operatorRole.id,
        companyId,
        // La columna nace `pending`, y ese estado no entra por el login.
        accountStatus: 'active',
      },
      select: { id: true },
    })
  ).id;

  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // `product_batches_check_unit` exige que el producto ya tenga unidad.
  const productId = (
    await prisma.product.create({
      data: {
        name: PRODUCT_NAME,
        nameNormalized: normalizeProductName(PRODUCT_NAME),
        unitId: unit.id,
        stock: BATCH_STOCK,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const presentation = await prisma.presentation.create({
    data: {
      name: PRESENTATION_NAME,
      nameNormalized: normalizePresentationName(PRESENTATION_NAME),
      unitId: unit.id,
      content: PRESENTATION_CONTENT,
      companyId,
    },
    select: { id: true },
  });

  await prisma.productBatch.create({
    data: {
      productId,
      presentationId: presentation.id,
      companyId,
      stock: BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: BATCH_LOT,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      createdBy: operatorUserId,
    },
    select: { id: true },
  });

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: operatorUserId,
        companyId,
        steps: RECIPE_STEPS as unknown as Prisma.InputJsonValue,
        lines: { create: [{ productId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;

  [resumedOrder, cancelledOrder] = await Promise.all([
    seedOrder(SEQUENCE_RESUMED),
    seedOrder(SEQUENCE_CANCELLED),
  ]);

  await prisma.orderAssignment.createMany({
    data: [resumedOrder.id, cancelledOrder.id].map((orderId) => ({
      orderId,
      userId: operatorUserId!,
      companyId: companyId!,
    })),
  });
});

test.afterAll(async () => {
  // Por los identificadores de este worker: el otro navegador sigue corriendo.
  const scopedCompanyId = companyId;
  const byCompany = <T>(run: (id: string) => Promise<T>) => () =>
    scopedCompanyId ? run(scopedCompanyId) : Promise.resolve();
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    byCompany((id) => prisma.reservationMovement.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.inventoryMovement.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.orderAssignment.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.orderPresentationLine.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.orderExecutionEntry.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.order.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.productBatch.deleteMany({ where: { companyId: id } })),
    // La receta antes que el producto: `recipe_lines.product_id` lo restringe hasta su cascada.
    byCompany((id) => prisma.recipe.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.product.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.presentation.deleteMany({ where: { companyId: id } })),
    () => prisma.user.deleteMany({ where: { username: operatorUser.username } }),
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

// El primer `goto` compila la ruta bajo demanda, bcrypt tarda y cada paso espera su minimo.
test.setTimeout(180_000);

test.describe('el registro de ejecucion de un pedido asignado', () => {
  test('R39 - el Operador avanza dos pasos, recarga, vuelve al paso 3 y la recarga deja una sola fila RESUME', async ({
    page,
  }) => {
    expect(resumedOrder, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (resumedOrder === null) return;
    const order = resumedOrder;

    await openFromList(page, order);
    const position = page.getByTestId(STEP_POSITION_TESTID);
    await expect(position).toHaveText(positionText(1));

    // Siguiente queda deshabilitado mientras corre el minimo por paso: el clic de Playwright
    // espera a que se habilite.
    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await page.getByTestId(STEP_NEXT_TESTID).click();
    // Sin esta espera, el item 0-0 todavia seria el del paso 1 y el clic lo desmarcaria.
    await expect(position).toHaveText(positionText(2));

    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await page.getByTestId(STEP_NEXT_TESTID).click();
    await expect(position).toHaveText(positionText(3));

    // Las anotaciones de avanzar no se esperan en la pantalla: recargar antes de que lleguen
    // retomaria en un paso anterior.
    await expect
      .poll(() => countEntries(order.id, 'ADVANCE'), { timeout: 30_000 })
      .toBe(2);
    expect(await countEntries(order.id, 'RESUME'), 'abrir desde PENDIENTE no es retomar').toBe(0);

    await page.reload();
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(STEP_POSITION_TESTID)).toHaveText(positionText(3), {
      timeout: 60_000,
    });

    expect(await countEntries(order.id, 'RESUME')).toBe(1);
  });

  test('R40 - el Operador cancela el pedido con un motivo, vuelve a la lista con la confirmacion y el pedido queda CANCELADO con ese motivo', async ({
    page,
  }) => {
    expect(cancelledOrder, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (cancelledOrder === null) return;
    const order = cancelledOrder;

    await openFromList(page, order);

    // En WebKit un clic antes de hidratar se pierde sin error: se repite hasta ver el dialogo.
    const trigger = page.getByRole('button', { name: CANCEL_ORDER_BUTTON_NAME, exact: true });
    const dialog = page.getByRole('alertdialog');
    await expect(async () => {
      if ((await dialog.count()) === 0) await trigger.click();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    await dialog.getByRole('textbox', { name: CANCEL_REASON_LABEL }).fill(CANCELLATION_REASON);
    await dialog.getByRole('button', { name: CANCEL_ORDER_BUTTON_NAME, exact: true }).click();

    await page.waitForURL(
      (url) =>
        url.pathname === ASSIGNED_ORDERS_ROUTE &&
        url.searchParams.get(CANCELLED_ORDER_PARAM) === order.numberText,
      { timeout: 60_000 },
    );
    await expect(
      page.getByRole('status').filter({ hasText: assignedOrderCancelledNoticeText(order.numberText) }),
    ).toBeVisible({ timeout: 60_000 });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, cancellationReason: true },
    });
    expect(stored.status).toBe('CANCELADO');
    expect(stored.cancellationReason).toBe(CANCELLATION_REASON);
  });
});
