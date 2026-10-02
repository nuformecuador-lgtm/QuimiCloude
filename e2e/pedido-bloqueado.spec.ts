/**
 * E2E del pedido bloqueado por inventario insuficiente: se crea por la UI de Pedidos un pedido que
 * no alcanza, el modal ofrece guardarlo bloqueado, el Operador asignado lo ve sin poder entrar, y
 * un alta de lote por la UI de Inventario lo desbloquea apartando su material.
 *
 * Un unico `test()`: cada tramo depende del estado que deja el anterior.
 *
 * El estado final se lee de la base; la pantalla se comprueba por `data-testid` y `data-status`,
 * nunca por posicion. Los textos que se afirman salen de las constantes que pinta la propia UI, o
 * son los fijados por el spec («Guardar bloqueado», «Volver»).
 *
 * DATOS: tablas compartidas entre proyectos y worktrees. Todo lleva el prefijo `qc138_e2e_` y el
 * `RUN_ID` del worker; la limpieza de huerfanos filtra por prefijo Y por edad, y `afterAll` borra
 * en el orden que imponen las FK.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { ORDER_STATUS_LABELS } from '@/app/(private)/pedidos/components/order-status-badge';
import { assignedOrderBlockedNoticeText } from '@/app/(private)/asignacion/components/assigned-order-enter-trigger';
import { normalizeCompanyName, ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc138_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y puede haber otro worktree corriendo su propio E2E. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const LIST_PAGE_SIZE = '25';
const ORDERS_SORT = 'createdAt:desc';

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const FIRST_BATCH_LOT = `${SHARED_TOKEN}_lote`;

/** El lote inicial no cubre el pedido; el que se da de alta despues, sumado a el, si. */
const FIRST_BATCH_STOCK = '500.0000';
const ORDER_QUANTITY = '1500';
const NEW_BATCH_STOCK = '1500';
const UNIT_COST = '10.0000';
const NEW_BATCH_UNIT_COST = '10';
const QTY_ALERT = '1';

const MIN_TOUCH_TARGET_PX = 44;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc138-Admin-${RUN_ID.slice(0, 12)}`,
};

/** Sin `pedidos.consultar`: solo asi `/asignacion` muestra «Mis asignados», con columna «Entrar». */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc138-Operador-${RUN_ID.slice(0, 12)}`,
};

let companyId: string | null = null;
let productId: string | null = null;
let recipeId: string | null = null;
let presentationId: string | null = null;
let adminUserId: string | null = null;
let operatorUserId: string | null = null;

function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: ORDERS_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: un correlativo no puede casar con el prefijo de otro. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator('[data-testid^="data-table-row-"]')
    .filter({
      has: page.getByTestId('data-table-cell-orderNumber').filter({ hasText: exactText(numberText) }),
    });
}

/** Recorre las paginas de la lista hasta encontrar la fila del correlativo pedido. */
async function findOrderRow(page: Page, numberText: string): Promise<Locator> {
  const next = page.getByTestId('data-table-next');

  for (;;) {
    const row = rowByNumber(page, numberText);
    if ((await row.count()) > 0) return row.first();
    if ((await next.count()) === 0 || (await next.isDisabled())) return row.first();

    const before = new URL(page.url()).searchParams.get('page');
    await next.click();
    await page.waitForFunction(
      (previous) => new URL(window.location.href).searchParams.get('page') !== previous,
      before,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId('data-table')).toBeVisible({ timeout: 60_000 });
  }
}

/** Rellena el alta de un pedido de la receta y presentacion del fixture y lo envia. */
async function submitNewOrder(page: Page, quantity: string): Promise<void> {
  await page.goto(ordersUrl());
  await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('order-create-open').first().click();
  await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

  const recipePicker = page.getByTestId('recipe-picker');
  await recipePicker.click();
  await recipePicker.fill(RECIPE_NAME);
  const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: RECIPE_NAME });
  await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
  await recipeOption.click();
  await expect(page.getByTestId('recipe-picker-value')).toHaveValue(recipeId ?? '');

  const presentationPicker = page.getByTestId('presentation-select');
  await presentationPicker.click();
  await presentationPicker.fill(PRESENTATION_NAME);
  const presentationOption = page
    .getByTestId('presentation-option')
    .filter({ hasText: PRESENTATION_NAME });
  await expect(presentationOption).toHaveCount(1, { timeout: 60_000 });
  await presentationOption.click();
  await expect(page.getByTestId('presentation-value')).toHaveValue(presentationId ?? '');

  await page.getByTestId('order-field-quantity').fill(quantity);

  await page.getByTestId('order-form-submit').click();
}

/** Da de alta por Inventario un lote nuevo del producto y la presentacion del fixture. */
async function addBatchThroughInventory(page: Page): Promise<void> {
  await page.goto(`${INVENTORY_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
  await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('product-create-open').first().click();
  await expect(page.getByTestId('product-sheet')).toBeVisible({ timeout: 60_000 });

  const productField = page.getByTestId('product-field-name');
  await productField.click();
  await productField.fill(PRODUCT_NAME);
  const productOption = page.getByTestId('product-name-option').filter({ hasText: PRODUCT_NAME });
  await expect(productOption.first()).toBeVisible({ timeout: 60_000 });
  await productOption.first().click();
  await expect(page.getByTestId('product-name-value')).toHaveValue(PRODUCT_NAME, {
    timeout: 60_000,
  });

  const presentationField = page.getByTestId('presentation-select');
  await presentationField.click();
  await presentationField.fill(PRESENTATION_NAME);
  const presentationOption = page
    .getByTestId('presentation-option')
    .filter({ hasText: PRESENTATION_NAME });
  await expect(presentationOption.first()).toBeVisible({ timeout: 60_000 });
  await presentationOption.first().click();
  await expect(presentationField).toHaveValue(PRESENTATION_NAME, { timeout: 60_000 });

  await page.getByTestId('product-field-stock').fill(NEW_BATCH_STOCK);
  await page.getByTestId('product-field-qtyAlert').fill(QTY_ALERT);
  await page.getByTestId('product-field-unitCost').fill(NEW_BATCH_UNIT_COST);

  await page.getByTestId('product-form-submit').click();
  await expect(page.getByTestId('product-sheet')).toHaveCount(0, { timeout: 60_000 });
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc138${RUN_ID.slice(0, 8)}`,
      lastNames: 'Bloqueado',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  if (orphanCompanyIds.length > 0) {
    await prisma.reservationMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // La receta cae antes que el producto: `recipe_lines.product_id` lo restringe.
    await prisma.recipe.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.presentation.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!adminRole || !operatorRole) {
    throw new Error(
      `faltan los roles "${ROLE_ADMINISTRADOR}" u "${ROLE_OPERADOR}": siembra la base con ` +
        '`pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUser(adminUser, adminRole.id);
  operatorUserId = await createUser(operatorUser, operatorRole.id);

  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // `products.unit_id` se fija a mano: el disparador que valida el lote exige que el producto ya
  // tenga unidad antes de insertarlo.
  productId = (
    await prisma.product.create({
      data: {
        name: PRODUCT_NAME,
        nameNormalized: normalizeProductName(PRODUCT_NAME),
        unitId: unit.id,
        stock: FIRST_BATCH_STOCK,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  presentationId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_NAME),
        unitId: unit.id,
        content: '1',
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  const batch = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      companyId,
      stock: FIRST_BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: FIRST_BATCH_LOT,
      purchaseDate,
      createdBy: adminUserId,
    },
    select: { id: true },
  });

  await prisma.inventoryMovement.create({
    data: {
      batchId: batch.id,
      kind: 'opening',
      quantity: FIRST_BATCH_STOCK,
      reason: null,
      companyId,
      createdBy: adminUserId,
      createdAt: purchaseDate,
    },
  });

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: adminUserId,
        companyId,
        lines: { create: [{ productId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  const scopedCompanyId = companyId;
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () =>
      scopedCompanyId
        ? prisma.reservationMovement.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.inventoryMovement.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.orderAssignment.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId ? prisma.order.deleteMany({ where: { companyId: scopedCompanyId } }) : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.productBatch.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    () =>
      scopedCompanyId ? prisma.product.deleteMany({ where: { companyId: scopedCompanyId } }) : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.presentation.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, operatorUser.username] } },
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
test.setTimeout(240_000);

test.describe('pedido bloqueado por inventario insuficiente', () => {
  test('R40, R7, R13, R14, R31 - un pedido sin material se guarda bloqueado, el Operador no puede entrar y un alta de lote lo deja pendiente con material apartado', async ({
    page,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(presentationId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (recipeId === null || presentationId === null) return;

    await loginAndLand(page, adminUser);

    // --- 1. El pedido pide 1.500 y el unico lote tiene 500: aparece el modal y todavia no se
    // ha escrito nada.
    await submitNewOrder(page, ORDER_QUANTITY);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('button')).toHaveCount(2);
    const saveBlocked = dialog.getByRole('button', { name: 'Guardar bloqueado', exact: true });
    await expect(saveBlocked).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Volver', exact: true })).toBeVisible();

    expect(
      await prisma.order.count({ where: { recipeId } }),
      'sin confirmar no se escribe el pedido',
    ).toBe(0);

    // --- 2. «Guardar bloqueado» lo guarda BLOQUEADO, sin nada apartado.
    await saveBlocked.click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

    const order = await prisma.order.findFirstOrThrow({
      where: { recipeId, deletedAt: null },
      select: { id: true, orderYear: true, orderSequence: true, status: true },
    });
    expect(order.status).toBe('BLOQUEADO');
    expect(await prisma.reservationMovement.count({ where: { orderId: order.id } })).toBe(0);

    const orderNumber = formatOrderNumber({ year: order.orderYear, sequence: order.orderSequence });

    // La fila en la propia pagina, sin navegar, es la senal de que el `router.refresh()` del
    // formulario termino: navegar antes lo interrumpe en WebKit.
    const listedRow = rowByNumber(page, orderNumber);
    await expect(listedRow).toBeVisible({ timeout: 60_000 });
    const listedStatus = listedRow.getByTestId('order-status');
    await expect(listedStatus).toHaveAttribute('data-status', 'BLOQUEADO', { timeout: 60_000 });
    await expect(listedStatus).toHaveText(ORDER_STATUS_LABELS.BLOQUEADO);

    // --- 3. El Operador asignado lo ve bloqueado y sin poder entrar, con el motivo visible. La
    // asignacion va por Prisma: no es lo que este recorrido demuestra.
    await prisma.orderAssignment.create({
      data: { orderId: order.id, userId: operatorUserId!, companyId: companyId! },
    });

    // Con la sesion del admin viva, `/login` redirige fuera y el formulario no aparece.
    await page.context().clearCookies();
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId('asignacion-title')).toBeVisible({ timeout: 60_000 });

    const assignedRow = rowByNumber(page, orderNumber);
    await expect(assignedRow).toHaveCount(1, { timeout: 60_000 });

    const assignedStatus = assignedRow.getByTestId('assigned-order-status');
    await expect(assignedStatus).toHaveAttribute('data-status', 'BLOQUEADO');
    await expect(assignedStatus).toHaveText(ORDER_STATUS_LABELS.BLOQUEADO);

    const enter = assignedRow.getByTestId('assigned-order-enter');
    await expect(enter).toBeDisabled();
    await expect(enter).not.toHaveAttribute('href', /.*/);

    const reason = assignedRow.getByTestId('assigned-order-enter-reason');
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText(assignedOrderBlockedNoticeText());
    const reasonId = await reason.getAttribute('id');
    expect(reasonId).not.toBeNull();
    await expect(enter).toHaveAttribute('aria-describedby', reasonId!);

    const enterBox = await enter.boundingBox();
    expect(enterBox, 'el boton de entrar debe estar pintado').not.toBeNull();
    expect(enterBox!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(enterBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    const stillBlocked = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stillBlocked.status).toBe('BLOQUEADO');

    // --- 4. Un alta de lote de 1.500 lo cubre: en la misma peticion el pedido pasa a PENDIENTE
    // con su material apartado.
    await page.context().clearCookies();
    await loginAndLand(page, adminUser);
    await addBatchThroughInventory(page);

    const unblocked = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, reservedAt: true },
    });
    expect(unblocked.status).toBe('PENDIENTE');
    expect(unblocked.reservedAt).not.toBeNull();

    const reserved = await prisma.reservationMovement.findMany({
      where: { orderId: order.id },
      select: { kind: true, quantity: true },
    });
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved.every((movement) => movement.kind === 'reserve')).toBe(true);
    const reservedTotal = reserved.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    expect(reservedTotal).toBe(Number(ORDER_QUANTITY));

    await page.goto(ordersUrl());
    const unblockedRow = await findOrderRow(page, orderNumber);
    await expect(unblockedRow.getByTestId('order-status')).toHaveAttribute(
      'data-status',
      'PENDIENTE',
      { timeout: 60_000 },
    );
    await expect(unblockedRow.getByTestId('order-coverage')).toHaveAttribute(
      'data-coverage',
      'full',
      { timeout: 60_000 },
    );
  });
});
