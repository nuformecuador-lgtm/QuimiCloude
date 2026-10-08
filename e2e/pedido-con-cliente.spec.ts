/**
 * E2E del cliente del pedido (QC-156, R40): alta con cliente y su columna, filtro por cliente,
 * la accion «Cliente» deshabilitada en un pedido cancelado, y el rechazo a quien solo consulta.
 *
 * DATOS: empresa, usuarios, rol, clientes, receta, presentacion, envase y pedidos son efimeros,
 * con el prefijo `qc156_e2e_` y el `RUN_ID` del worker, y se borran en `afterAll` por los ids y
 * nombres de ESTE worker: Chromium y WebKit comparten base. Cada test usa sus propios pedidos, asi
 * que el orden en que un worker los ejecute no cambia lo que afirman.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCustomerText } from '@/lib/modules/clientes';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand, type Credentials } from './helpers/landing';
import { addPackagingLine, openOrderRowMenu, orderMenuTrigger } from './helpers/order-distribution';
import { seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc156_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Una hora deja fuera cualquier ejecucion viva y dentro cualquier resto de una anterior. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const UNIT_NAME = `${SHARED_TOKEN}_unidad`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const PACKAGING_NAME = `${SHARED_TOKEN}_envase`;
const PACKAGING_LOT = `${SHARED_TOKEN}_lote_envase`;
const PACKAGING_STOCK = '10';
const PACKAGING_UNIT_COST = '0.5000';
const PRESENTATION_CONTENT = '1';
const ORDER_PACKAGES = '1';
const ORDER_QUANTITY = '3';

/** Rol con solo `pedidos.consultar`: ninguno del seed sirve, todos los que consultan modifican. */
const READ_ONLY_ROLE_NAME = `${SHARED_TOKEN}_rol_consulta`;
const READ_ONLY_PERMISSION = 'pedidos.consultar';

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc156-Admin-${RUN_ID.slice(0, 12)}`,
};
const readOnlyUser: Credentials = {
  username: `${SHARED_TOKEN}_consulta`,
  password: `Qc156-Read-${RUN_ID.slice(0, 12)}`,
};

/**
 * Los nombres llevan el `RUN_ID` para que la busqueda del selector no case con clientes de otro
 * worker. Sin ciudad en la etiqueta: «Nombres Apellidos».
 */
type CustomerFixture = { readonly firstNames: string; readonly lastNames: string };
const CUSTOMER_MAIN: CustomerFixture = { firstNames: `Ana ${RUN_ID.slice(0, 10)}`, lastNames: 'Principal' };
const CUSTOMER_FILTER: CustomerFixture = { firstNames: `Bea ${RUN_ID.slice(0, 10)}`, lastNames: 'Filtrada' };
const CUSTOMER_OTHER: CustomerFixture = { firstNames: `Ciro ${RUN_ID.slice(0, 10)}`, lastNames: 'Otro' };

function customerLabel(customer: CustomerFixture): string {
  return `${customer.firstNames} ${customer.lastNames}`;
}

const CANCELLATION_REASON = `Cancelado por el E2E ${RUN_ID}`;

const LIST_PAGE_SIZE = '25';
const LIST_SORT = 'createdAt:desc';

const ORDERS_TITLE = 'pedidos-title';
const CUSTOMER_CELL = 'data-table-cell-customer';
const CREATE_OPEN = 'order-create-open';
const ORDER_FORM = 'order-form';
const RECIPE_PICKER = 'recipe-picker';
const RECIPE_PICKER_OPTION = 'recipe-picker-option';
const RECIPE_PICKER_VALUE = 'recipe-picker-value';
const UNIT_SELECT = 'presentation-unit-select';
const UNIT_OPTION = 'presentation-unit-option';
const DISTRIBUTION_FIELD = 'order-distribution-field';
const DISTRIBUTION_AVAILABLE = 'order-distribution-available';
const QUANTITY_FIELD = 'order-field-quantity';
const FORM_SUBMIT = 'order-form-submit';
const CUSTOMER_PICKER = 'order-customer-picker';
const CUSTOMER_PICKER_OPTION = 'order-customer-picker-option';
const CUSTOMER_PICKER_VALUE = 'order-customer-picker-value';
const CUSTOMER_FILTER_TESTID = 'order-customer-filter';
const CUSTOMER_ACTION = 'order-action-customer';
const RESPONSIBLES_ACTION = 'order-action-responsibles';
const CANCEL_ACTION = 'order-action-cancel';
const CUSTOMER_DIALOG = 'order-customer-dialog';
const CANCEL_DIALOG = 'cancel-order-dialog';
const CANCEL_REASON = 'cancel-order-reason';
const CANCEL_CONFIRM = 'cancel-order-confirm';

const SET_CUSTOMER_ACTION_NAME = 'setOrderCustomerAction';
const UNAUTHORIZED_CODE = 'unauthorized';

let companyId: string | null = null;
let adminId: string | null = null;
let recipeId: string | null = null;
let unitId: string | null = null;
let presentationId: string | null = null;
let packagingId: string | null = null;
let customerMainId: string | null = null;
let customerFilterId: string | null = null;
let customerOtherId: string | null = null;

/** Pedidos sembrados: dos del cliente del filtro y uno de otro cliente para el negativo (R40(b)). */
let filterOrderIds: string[] = [];
let otherCustomerOrderId: string | null = null;
/** Pedido que (c) cancela y luego cambia de cliente. */
let cancelOrderId: string | null = null;
/** Pedido sobre el que (d) intenta el cambio sin permiso. */
let readOnlyOrderId: string | null = null;

/** Lo crea (a) por la pantalla; se excluye de los sembrados para encontrarlo. */
const seededOrderIds = (): string[] =>
  [...filterOrderIds, otherCustomerOrderId, cancelOrderId, readOnlyOrderId].filter(
    (id): id is string => id !== null,
  );

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`falta ${what}: fallo el beforeAll`);
  return value;
}

function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: LIST_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

function orderRow(page: Page, orderId: string) {
  return page.locator(`[data-testid="data-table-row-${orderId}"]`);
}

async function createUser(user: Credentials, roleId: string, company: string): Promise<string> {
  const created = await prisma.user.create({
    data: {
      firstNames: `Qc156${RUN_ID.slice(0, 8)}`,
      lastNames: 'Cliente',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId: company,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return created.id;
}

async function createCustomer(customer: CustomerFixture, company: string): Promise<string> {
  const city = 'Bogota';
  const created = await prisma.customer.create({
    data: {
      firstNames: customer.firstNames,
      lastNames: customer.lastNames,
      city,
      firstNamesNormalized: normalizeCustomerText(customer.firstNames),
      lastNamesNormalized: normalizeCustomerText(customer.lastNames),
      cityNormalized: normalizeCustomerText(city),
      companyId: company,
    },
    select: { id: true },
  });
  return created.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(sequence: number, customerId: string | null): Promise<string> {
  const created = await prisma.order.create({
    data: {
      companyId: required(companyId, 'la empresa'),
      orderYear: new Date().getUTCFullYear(),
      orderSequence: sequence,
      recipeId: required(recipeId, 'la receta'),
      quantity: ORDER_QUANTITY,
      status: 'PENDIENTE',
      createdBy: adminId,
      customerId,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Escribe en el selector de cliente dentro de `scope` y elige la opcion con `label`. Teclear un
 * texto distinto del elegido descarta la eleccion previa, asi que el campo se vacia antes.
 */
async function chooseCustomer(page: Page, scopeTestId: string, label: string): Promise<void> {
  const input = page
    .getByTestId(scopeTestId)
    .getByTestId(CUSTOMER_PICKER)
    .getByRole('combobox');
  await input.click();
  await input.fill('');
  await input.fill(label);
  const option = page.getByTestId(CUSTOMER_PICKER_OPTION).filter({ hasText: label });
  await expect(option).toHaveCount(1, { timeout: 60_000 });
  await option.click();
}

/**
 * El identificador de la Server Action en el JS que el navegador cargo. Next lo registra junto al
 * nombre exportado; se toma el ultimo identificador hexadecimal que aparece justo antes.
 */
function findActionId(scripts: readonly string[], actionName: string): string | null {
  const needle = `"${actionName}"`;
  for (const source of scripts) {
    let from = source.indexOf(needle);
    while (from !== -1) {
      const before = source.slice(Math.max(0, from - 400), from);
      // En `next dev` el modulo puede ir dentro de un `eval("...")`, con las comillas escapadas.
      const ids = [...before.matchAll(/"([0-9a-f]{40,})\\*"/g)];
      const last = ids.at(-1)?.[1];
      if (last) return last;
      from = source.indexOf(needle, from + needle.length);
    }
  }
  return null;
}

test.beforeAll(async () => {
  const adminRole = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!adminRole) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": siembra la base con \`pnpm run db:seed\` antes de ` +
        'correr `pnpm run e2e`.',
    );
  }

  // Huerfanos de una ejecucion interrumpida, por prefijo y edad. El orden lo imponen las FK.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    const inCompanies = { companyId: { in: orphanCompanyIds } };
    await prisma.reservationMovement.deleteMany({ where: inCompanies });
    await prisma.inventoryMovement.deleteMany({ where: inCompanies });
    await prisma.orderAssignment.deleteMany({ where: inCompanies });
    await prisma.orderPresentationLine.deleteMany({ where: inCompanies });
    await prisma.order.deleteMany({ where: inCompanies });
    await prisma.recipe.deleteMany({ where: inCompanies });
    await prisma.productBatch.deleteMany({ where: inCompanies });
    await prisma.product.deleteMany({ where: inCompanies });
    await prisma.presentation.deleteMany({ where: inCompanies });
    await prisma.unit.deleteMany({ where: inCompanies });
    await prisma.customer.deleteMany({ where: inCompanies });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  const orphanRoles = { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } };
  await prisma.rolePermission.deleteMany({ where: { role: orphanRoles } });
  await prisma.role.deleteMany({ where: orphanRoles });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  const readOnlyRole = await prisma.role.create({
    data: {
      name: READ_ONLY_ROLE_NAME,
      description: 'Rol efimero con solo consulta de pedidos del E2E de QC-156. Se borra en afterAll.',
      permissions: { create: [{ permissionCode: READ_ONLY_PERMISSION }] },
    },
    select: { id: true },
  });

  adminId = await createUser(adminUser, adminRole.id, companyId);
  // En la misma empresa: asi el rechazo no puede venir de mirar otra empresa.
  await createUser(readOnlyUser, readOnlyRole.id, companyId);

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: adminId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  unitId = (
    await prisma.unit.create({
      data: { name: UNIT_NAME, nameNormalized: normalizeUnitName(UNIT_NAME), companyId },
      select: { id: true },
    })
  ).id;
  presentationId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_NAME),
        unitId,
        content: PRESENTATION_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;
  packagingId = (
    await seedPackaging({
      companyId,
      name: PACKAGING_NAME,
      presentationId,
      stock: PACKAGING_STOCK,
      unitCost: PACKAGING_UNIT_COST,
      lot: PACKAGING_LOT,
      createdBy: adminId,
    })
  ).productId;

  customerMainId = await createCustomer(CUSTOMER_MAIN, companyId);
  customerFilterId = await createCustomer(CUSTOMER_FILTER, companyId);
  customerOtherId = await createCustomer(CUSTOMER_OTHER, companyId);

  filterOrderIds = [await seedOrder(1, customerFilterId), await seedOrder(2, customerFilterId)];
  otherCustomerOrderId = await seedOrder(3, customerOtherId);
  cancelOrderId = await seedOrder(4, customerOtherId);
  readOnlyOrderId = await seedOrder(5, customerMainId);
});

test.afterAll(async () => {
  // Por los ids y nombres de ESTE worker. Cada paso corre aunque falle el anterior y el primer
  // fallo se relanza al final.
  const inCompany = { companyId: companyId ?? '00000000-0000-0000-0000-000000000000' };
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.reservationMovement.deleteMany({ where: inCompany }),
    () => prisma.inventoryMovement.deleteMany({ where: inCompany }),
    () => prisma.orderAssignment.deleteMany({ where: inCompany }),
    () => prisma.orderPresentationLine.deleteMany({ where: inCompany }),
    () => prisma.order.deleteMany({ where: inCompany }),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    // El envase, antes que su presentacion fija; la presentacion, antes que su unidad.
    () => prisma.productBatch.deleteMany({ where: inCompany }),
    () => prisma.product.deleteMany({ where: inCompany }),
    () => prisma.presentation.deleteMany({ where: { name: PRESENTATION_NAME } }),
    () => prisma.unit.deleteMany({ where: { name: UNIT_NAME } }),
    // Los clientes, despues de los pedidos que los apuntan.
    () => prisma.customer.deleteMany({ where: inCompany }),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, readOnlyUser.username] } },
      }),
    () => prisma.rolePermission.deleteMany({ where: { role: { name: READ_ONLY_ROLE_NAME } } }),
    () => prisma.role.deleteMany({ where: { name: READ_ONLY_ROLE_NAME } }),
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

// El primer `goto` compila la ruta bajo demanda en `next dev` y bcrypt tarda a proposito.
test.setTimeout(240_000);

test.describe('pedido con cliente', () => {
  test('R40(a) — crea un pedido con cliente y ve su nombre en la columna «Cliente» (R30)', async ({
    page,
  }) => {
    const mainId = required(customerMainId, 'el cliente principal');
    await loginAndLand(page, adminUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(CREATE_OPEN).first().click();
    const form = page.getByTestId(ORDER_FORM);
    await expect(form).toBeVisible({ timeout: 60_000 });

    const recipePicker = page.getByTestId(RECIPE_PICKER);
    await recipePicker.click();
    await recipePicker.fill(RECIPE_NAME);
    const recipeOption = page.getByTestId(RECIPE_PICKER_OPTION).filter({ hasText: RECIPE_NAME });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(page.getByTestId(RECIPE_PICKER_VALUE)).toHaveValue(required(recipeId, 'la receta'));

    await page.getByTestId(QUANTITY_FIELD).fill(ORDER_QUANTITY);
    await form.getByTestId(UNIT_SELECT).click();
    await page.locator(`[data-testid="${UNIT_OPTION}"][data-value="${unitId}"]`).click();

    await addPackagingLine(
      page,
      form,
      { productId: required(packagingId, 'el envase'), name: PACKAGING_NAME },
      ORDER_PACKAGES,
    );
    await expect(
      page.getByTestId(DISTRIBUTION_FIELD).getByTestId(DISTRIBUTION_AVAILABLE),
    ).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });

    await chooseCustomer(page, ORDER_FORM, customerLabel(CUSTOMER_MAIN));
    await expect(form.getByTestId(CUSTOMER_PICKER_VALUE)).toHaveValue(mainId);

    await page.getByTestId(FORM_SUBMIT).click();
    await expect(form).toHaveCount(0, { timeout: 60_000 });

    const created = await prisma.order.findMany({
      where: { companyId: required(companyId, 'la empresa'), id: { notIn: seededOrderIds() } },
      select: { id: true, customerId: true },
    });
    expect(created, 'el alta deja exactamente un pedido nuevo').toHaveLength(1);
    const createdOrder = created[0]!;
    expect(createdOrder.customerId, 'el alta guarda el cliente elegido').toBe(mainId);

    await expect(orderRow(page, createdOrder.id).getByTestId(CUSTOMER_CELL)).toHaveText(
      customerLabel(CUSTOMER_MAIN),
      { timeout: 60_000 },
    );
  });

  test('R40(b) — filtra la lista por el cliente y ve solo sus pedidos (R23, R34)', async ({
    page,
  }) => {
    const filterId = required(customerFilterId, 'el cliente del filtro');
    const otherOrderId = required(otherCustomerOrderId, 'el pedido de otro cliente');
    await loginAndLand(page, adminUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    // Positivo previo: sin filtro, el pedido de otro cliente esta en la lista.
    await expect(orderRow(page, otherOrderId)).toHaveCount(1, { timeout: 60_000 });

    await chooseCustomer(page, CUSTOMER_FILTER_TESTID, customerLabel(CUSTOMER_FILTER));
    await expect(page).toHaveURL(new RegExp(`[?&]customer=${filterId}(?:&|$)`), {
      timeout: 60_000,
    });

    for (const id of filterOrderIds) {
      await expect(orderRow(page, id)).toHaveCount(1, { timeout: 60_000 });
    }
    await expect(orderRow(page, otherOrderId)).toHaveCount(0);

    const expected = await prisma.order.count({
      where: { companyId: required(companyId, 'la empresa'), customerId: filterId, deletedAt: null },
    });
    const cells = page.getByTestId(CUSTOMER_CELL);
    await expect(cells).toHaveCount(expected, { timeout: 60_000 });
    for (const text of await cells.allTextContents()) {
      expect(text.trim()).toBe(customerLabel(CUSTOMER_FILTER));
    }
  });

  test('R40(c) — en un pedido CANCELADO la accion «Cliente» esta deshabilitada y el cliente no cambia (R39)', async ({
    page,
  }) => {
    const orderId = required(cancelOrderId, 'el pedido a cancelar');
    const otherId = required(customerOtherId, 'el otro cliente');
    await loginAndLand(page, adminUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    await (await openOrderRowMenu(page, orderMenuTrigger(page, orderId), CANCEL_ACTION)).click();
    await expect(page.getByTestId(CANCEL_DIALOG)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(CANCEL_REASON).fill(CANCELLATION_REASON);
    await page.getByTestId(CANCEL_CONFIRM).click();
    await expect(page.getByTestId(CANCEL_DIALOG)).toHaveCount(0, { timeout: 60_000 });

    await expect
      .poll(
        async () =>
          (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } }))
            .status,
        { timeout: 60_000 },
      )
      .toBe('CANCELADO');
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        customerId: true,
        status: true,
        cancellationReason: true,
        quantity: true,
        deletedAt: true,
      },
    });
    expect(before.customerId, 'el pedido conserva su cliente al cancelarse').toBe(otherId);

    // Se espera a que la fila pinte el estado nuevo: el menu de antes de refrescar aun la tendria habilitada.
    await expect(async () => {
      const item = await openOrderRowMenu(page, orderMenuTrigger(page, orderId), CUSTOMER_ACTION);
      await expect(item).toHaveAttribute('aria-disabled', 'true', { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    // `force` salta la comprobacion de accionabilidad: lo que se prueba es que el item no abre nada.
    await page.getByRole('menu').getByTestId(CUSTOMER_ACTION).click({ force: true });
    await expect(page.getByTestId(CUSTOMER_DIALOG)).toHaveCount(0);
    await expect(orderRow(page, orderId).getByTestId(CUSTOMER_CELL)).toHaveText(customerLabel(CUSTOMER_OTHER));

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        customerId: true,
        status: true,
        cancellationReason: true,
        quantity: true,
        deletedAt: true,
      },
    });
    expect(after, 'ni el cliente ni el resto del pedido cambian').toEqual(before);
  });

  test('R40(d) — con solo pedidos.consultar no ve «Cliente» y el servidor rechaza el cambio con unauthorized (R6, R32)', async ({
    page,
  }) => {
    const orderId = required(readOnlyOrderId, 'el pedido de solo consulta');
    const mainId = required(customerMainId, 'el cliente principal');
    const otherId = required(customerOtherId, 'el otro cliente');

    const scriptBodies: Promise<string>[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') {
        scriptBodies.push(response.text().catch(() => ''));
      }
    });

    await loginAndLand(page, readOnlyUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });
    await expect(orderRow(page, orderId)).toHaveCount(1, { timeout: 60_000 });

    // El menu se abre por una accion que si tiene, y en el no esta «Cliente».
    await openOrderRowMenu(page, orderMenuTrigger(page, orderId), RESPONSIBLES_ACTION);
    await expect(page.getByRole('menu').getByTestId(CUSTOMER_ACTION)).toHaveCount(0);
    await page.keyboard.press('Escape');

    // El servidor no se fia de la pantalla: la action, invocada a mano con la sesion de este
    // usuario, responde `unauthorized` y no toca el pedido.
    const actionId = findActionId(await Promise.all(scriptBodies), SET_CUSTOMER_ACTION_NAME);
    expect(actionId, `el JS de la pantalla deberia referenciar ${SET_CUSTOMER_ACTION_NAME}`).not.toBeNull();

    const origin = new URL(page.url()).origin;
    const response = await page.request.post(`${origin}${ORDERS_ROUTE}`, {
      headers: {
        'Next-Action': actionId!,
        'Content-Type': 'text/plain;charset=UTF-8',
        Accept: 'text/x-component',
        Origin: origin,
      },
      data: JSON.stringify([orderId, { customerId: otherId }]),
    });
    const body = await response.text();
    expect(body, 'la action responde con el codigo de autorizacion').toMatch(
      new RegExp(`"code":"${UNAUTHORIZED_CODE}"`),
    );

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { customerId: true },
    });
    expect(persisted.customerId, 'el rechazo no cambia el cliente').toBe(mainId);
  });
});
