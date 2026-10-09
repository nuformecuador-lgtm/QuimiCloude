/**
 * E2E de la entrega del producto terminado de un pedido, desde el menu de fila de Pedidos.
 *
 * EL RECORRIDO del Administrador va en un solo `test()`: cada paso es la precondicion del
 * siguiente y partirlo obligaria a resembrar lo que dejo el anterior.
 *   1. abre «Entregar» desde el menu de la fila del pedido `TERMINADO`;
 *   2. cambia el cliente al segundo y escribe envases en dos lotes, uno de cada presentacion;
 *   3. recarga la pagina, reabre el panel y el borrador sigue ahi: cliente y envases;
 *   4. confirma; en Postgres los lotes siguen existiendo con su existencia rebajada, hay un asiento
 *      `delivery` por lote, la fila de `order_deliveries` lleva el cliente elegido y el pedido sigue
 *      `TERMINADO` con su cliente de siempre;
 *   5. una segunda entrega completa lo que falta: el pedido queda `ENTREGADO` y la fila lo pinta.
 * Un segundo `test()` entra con el Operador, que no tiene permiso de entregas, y no ve la accion.
 *
 * QUE APORTA SOBRE UNIT E INTEGRACION: el panel, el borrador en `localStorage` y las dos Server
 * Actions de verdad, contra un navegador real y Postgres. Chromium y WebKit: WebKit es el motor de
 * iOS y la regla multiplataforma pide ejercitarlo.
 *
 * DATOS, mismo patron que `e2e/producto-terminado.spec.ts`:
 *  - todo lo que este archivo crea lleva el prefijo `qc223_e2e_` y dentro el `RUN_ID` del worker;
 *  - una empresa efimera propia, asi que la busqueda de clientes y la lista de pedidos solo ven
 *    lo de este worker;
 *  - la limpieza defensiva de huerfanos borra por prefijo Y POR EDAD, para no llevarse lo que otra
 *    ejecucion viva acaba de crear;
 *  - `afterAll` borra SIEMPRE, aunque un paso reviente, por los identificadores de ESTE worker y en
 *    el orden que imponen las FK.
 *
 * SEMBRADO POR PRISMA todo lo previo a la entrega: empresa, Administrador, Operador, dos clientes,
 * una unidad del catalogo arrancador (nunca creada ni borrada aqui), dos presentaciones con
 * contenido, la receta, un producto terminado por presentacion con sus lotes y el pedido
 * `TERMINADO` repartido en las dos presentaciones.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados de los componentes: sus modulos
 * son de cliente y arrastrarian React al proceso del runner.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { normalizeCustomerText } from '@/lib/modules/clientes';
import { DOCUMENT_TYPE_CC, ROLE_ADMINISTRADOR, ROLE_OPERADOR, normalizeCompanyName } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import { openOrderRowMenu, orderMenuTrigger } from './helpers/order-distribution';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc223_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const PRESENTATION_ONE_NAME = `${SHARED_TOKEN}_botella_1`;
const PRESENTATION_TWO_NAME = `${SHARED_TOKEN}_garrafa_2`;
const FINISHED_ONE_NAME = `${SHARED_TOKEN}_terminado_1`;
const FINISHED_TWO_NAME = `${SHARED_TOKEN}_terminado_2`;
const LOT_ONE_A = `${SHARED_TOKEN}_lote_1a`;
const LOT_ONE_B = `${SHARED_TOKEN}_lote_1b`;
const LOT_TWO = `${SHARED_TOKEN}_lote_2`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc223-Admin-${RUN_ID.slice(0, 12)}`,
};
/** Sin el permiso de entregas: control negativo de la accion. */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc223-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Los nombres llevan el `RUN_ID` para que la busqueda no case con clientes de otro worker, y
 *  ninguna etiqueta es prefijo de la otra. */
type CustomerFixture = { readonly firstNames: string; readonly lastNames: string };
const CUSTOMER_OF_ORDER: CustomerFixture = { firstNames: `Ana ${RUN_ID.slice(0, 10)}`, lastNames: 'Pedido' };
const CUSTOMER_OF_DELIVERY: CustomerFixture = { firstNames: `Bea ${RUN_ID.slice(0, 10)}`, lastNames: 'Destino' };

function customerLabel(customer: CustomerFixture): string {
  return `${customer.firstNames} ${customer.lastNames}`;
}

/**
 * Cantidades del fixture. Presentacion 1 con contenido 1 y presentacion 2 con contenido 2: los
 * envases de cada lote salen de dividir su existencia por su contenido.
 */
const CONTENT_ONE = '1.0000';
const CONTENT_TWO = '2.0000';
const LINE_ONE_PACKAGES = 5;
const LINE_TWO_PACKAGES = 3;
/** 4 envases de 1. */
const STOCK_ONE_A = '4.0000';
/** 10 envases de 1. */
const STOCK_ONE_B = '10.0000';
/** 5 envases de 2. */
const STOCK_TWO = '10.0000';

/** Primera entrega, parcial: 3 envases del lote 1a y 1 del lote 2. */
const FIRST_ONE_A_PACKAGES = '3';
const FIRST_TWO_PACKAGES = '1';
/** Segunda entrega, la que completa: los 2 que faltan de cada linea. */
const SECOND_ONE_B_PACKAGES = '2';
const SECOND_TWO_PACKAGES = '2';

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
const ORDER_SEQUENCE = 870_000 + Math.floor(Math.random() * 80_000);
const FINISHED_AT = new Date(Date.now() - 6 * 60 * 60 * 1000);

/** `data-testid` de la pantalla de Pedidos y del panel de entrega. */
const ORDERS_TITLE_TESTID = 'pedidos-title';
const DATA_TABLE_TESTID = 'data-table';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ORDER_STATUS_TESTID = 'order-status';
const ORDER_ACTION_DELIVER_TESTID = 'order-action-deliver';
const ORDER_ROW_ACTIONS_TESTID = 'order-row-actions';
const DELIVERY_SHEET_TESTID = 'order-delivery-sheet';
const DELIVERY_BATCH_TESTID = 'order-delivery-batch';
const DELIVERY_BATCH_PACKAGES_TESTID = 'order-delivery-batch-packages';
const DELIVERY_SUBMIT_TESTID = 'order-delivery-submit';
const DELIVERY_ERROR_TESTID = 'order-delivery-error';
const CUSTOMER_PICKER_TESTID = 'order-customer-picker';
const CUSTOMER_PICKER_OPTION_TESTID = 'order-customer-picker-option';
const PRIVATE_NOT_FOUND_TESTID = 'private-not-found';

let companyId: string | null = null;
let adminUserId: string | null = null;
let recipeId: string | null = null;
let orderId: string | null = null;
let customerOfOrderId: string | null = null;
let customerOfDeliveryId: string | null = null;
let batchOneAId: string | null = null;
let batchOneBId: string | null = null;
let batchTwoId: string | null = null;

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`falta ${what}: fallo el beforeAll`);
  return value;
}

/** URL de Pedidos, SIEMPRE derivada de `ORDERS_ROUTE`. */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: '25', sort: 'createdAt:desc' });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

function orderRow(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${TABLE_ROW_TESTID_PREFIX}${id}"]`);
}

function batchPackages(sheet: Locator, batchId: string): Locator {
  return sheet
    .locator(`[data-testid="${DELIVERY_BATCH_TESTID}"][data-batch-id="${batchId}"]`)
    .getByTestId(DELIVERY_BATCH_PACKAGES_TESTID);
}

function customerInput(sheet: Locator): Locator {
  return sheet.getByTestId(CUSTOMER_PICKER_TESTID).getByRole('combobox');
}

/** En WebKit el refresco que deja una accion anterior puede interrumpir la navegacion. */
async function gotoOrders(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto(ordersUrl());
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
}

/** Abre «Entregar» desde el menu de la fila y espera a que el panel pinte sus lotes. */
async function openDeliverySheet(page: Page, id: string): Promise<Locator> {
  await expect(orderRow(page, id)).toHaveCount(1, { timeout: 60_000 });
  await (await openOrderRowMenu(page, orderMenuTrigger(page, id), ORDER_ACTION_DELIVER_TESTID)).click();
  const sheet = page.getByTestId(DELIVERY_SHEET_TESTID);
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet.getByTestId(DELIVERY_SUBMIT_TESTID)).toBeVisible({ timeout: 60_000 });
  return sheet;
}

/** Vacia el selector de cliente, escribe la etiqueta y elige esa opcion. */
async function chooseCustomer(page: Page, sheet: Locator, label: string): Promise<void> {
  const input = customerInput(sheet);
  await input.click();
  await input.fill('');
  await input.fill(label);
  const option = page.getByTestId(CUSTOMER_PICKER_OPTION_TESTID).filter({ hasText: label });
  await expect(option).toHaveCount(1, { timeout: 60_000 });
  await option.click();
  await expect(input).toHaveValue(label);
}

/** Confirma y espera a que el panel se cierre. Si no se cierra, el fallo dice si hubo aviso de error. */
async function submitDelivery(sheet: Locator): Promise<void> {
  await sheet.getByTestId(DELIVERY_SUBMIT_TESTID).click();
  await expect(sheet, 'el panel deberia cerrarse al aplicar la entrega').toHaveCount(0, { timeout: 60_000 }).catch(
    async (error: unknown) => {
      const notices = await sheet.getByTestId(DELIVERY_ERROR_TESTID).allTextContents();
      throw new Error(`la entrega no se aplico; avisos: ${JSON.stringify(notices)}`, { cause: error });
    },
  );
}

async function createUser(user: Credentials, roleName: string): Promise<string> {
  const company = required(companyId, 'la empresa');
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": sus permisos son el dato bajo prueba. Siembra la base con ` +
        '`pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }
  const created = await prisma.user.create({
    data: {
      firstNames: `Qc223${RUN_ID.slice(0, 8)}`,
      lastNames: 'Entrega',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId: company,
      // Explicito: la columna es `@default(pending)` y ese estado no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return created.id;
}

async function createCustomer(customer: CustomerFixture): Promise<string> {
  const city = 'Bogota';
  const created = await prisma.customer.create({
    data: {
      firstNames: customer.firstNames,
      lastNames: customer.lastNames,
      city,
      firstNamesNormalized: normalizeCustomerText(customer.firstNames),
      lastNamesNormalized: normalizeCustomerText(customer.lastNames),
      cityNormalized: normalizeCustomerText(city),
      companyId: required(companyId, 'la empresa'),
      createdBy: adminUserId,
    },
    select: { id: true },
  });
  return created.id;
}

async function createFinishedProduct(params: {
  name: string;
  unitId: string;
  presentationId: string;
  stock: string;
}): Promise<string> {
  const created = await prisma.product.create({
    data: {
      name: params.name,
      nameNormalized: normalizeProductName(params.name),
      type: 'FINISHED_PRODUCT',
      unitId: params.unitId,
      stock: params.stock,
      recipeId: required(recipeId, 'la receta'),
      presentationId: params.presentationId,
      companyId: required(companyId, 'la empresa'),
    },
    select: { id: true },
  });
  return created.id;
}

async function createFinishedBatch(params: {
  productId: string;
  presentationId: string;
  lot: string;
  stock: string;
  packageContent: string;
  purchaseDate: string;
}): Promise<string> {
  const created = await prisma.productBatch.create({
    data: {
      productId: params.productId,
      presentationId: params.presentationId,
      stock: params.stock,
      unitCost: '1.0000',
      packageContent: params.packageContent,
      lot: params.lot,
      purchaseDate: new Date(`${params.purchaseDate}T00:00:00Z`),
      companyId: required(companyId, 'la empresa'),
      createdBy: adminUserId,
    },
    select: { id: true },
  });
  return created.id;
}

/** Borra en el orden de las FK todo lo que cuelga de esas empresas. */
async function deleteCompanyRows(companyIds: readonly string[]): Promise<void> {
  const inCompanies = { companyId: { in: [...companyIds] } };
  await prisma.reservationMovement.deleteMany({ where: inCompanies });
  await prisma.inventoryMovement.deleteMany({ where: inCompanies });
  await prisma.orderDeliveryLine.deleteMany({ where: inCompanies });
  await prisma.orderDelivery.deleteMany({ where: inCompanies });
  await prisma.orderAssignment.deleteMany({ where: inCompanies });
  await prisma.orderPresentationLine.deleteMany({ where: inCompanies });
  await prisma.orderExecutionEntry.deleteMany({ where: inCompanies });
  await prisma.order.deleteMany({ where: inCompanies });
  await prisma.productBatch.deleteMany({ where: inCompanies });
  // El producto terminado (`products.recipe_id`) restringe el borrado de la receta.
  await prisma.product.deleteMany({ where: inCompanies });
  await prisma.recipe.deleteMany({ where: inCompanies });
  await prisma.presentation.deleteMany({ where: inCompanies });
  await prisma.customer.deleteMany({ where: inCompanies });
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS, por prefijo y por edad.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) await deleteCompanyRows(orphanCompanyIds);
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

  adminUserId = await createUser(adminUser, ROLE_ADMINISTRADOR);
  await createUser(operatorUser, ROLE_OPERADOR);

  customerOfOrderId = await createCustomer(CUSTOMER_OF_ORDER);
  customerOfDeliveryId = await createCustomer(CUSTOMER_OF_DELIVERY);

  // Una de las unidades del catalogo arrancador, nunca creada ni borrada por este archivo.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  const [presentationOne, presentationTwo] = await Promise.all(
    [
      { name: PRESENTATION_ONE_NAME, content: CONTENT_ONE },
      { name: PRESENTATION_TWO_NAME, content: CONTENT_TWO },
    ].map((presentation) =>
      prisma.presentation.create({
        data: {
          name: presentation.name,
          nameNormalized: normalizePresentationName(presentation.name),
          unitId: unit.id,
          content: presentation.content,
          companyId: required(companyId, 'la empresa'),
        },
        select: { id: true },
      }),
    ),
  );

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  // El producto guarda la suma de sus lotes, igual que la recalcula la salida.
  const finishedOne = await createFinishedProduct({
    name: FINISHED_ONE_NAME,
    unitId: unit.id,
    presentationId: presentationOne.id,
    stock: '14.0000',
  });
  const finishedTwo = await createFinishedProduct({
    name: FINISHED_TWO_NAME,
    unitId: unit.id,
    presentationId: presentationTwo.id,
    stock: STOCK_TWO,
  });

  batchOneAId = await createFinishedBatch({
    productId: finishedOne,
    presentationId: presentationOne.id,
    lot: LOT_ONE_A,
    stock: STOCK_ONE_A,
    packageContent: CONTENT_ONE,
    purchaseDate: '2026-09-01',
  });
  batchOneBId = await createFinishedBatch({
    productId: finishedOne,
    presentationId: presentationOne.id,
    lot: LOT_ONE_B,
    stock: STOCK_ONE_B,
    packageContent: CONTENT_ONE,
    purchaseDate: '2026-09-02',
  });
  batchTwoId = await createFinishedBatch({
    productId: finishedTwo,
    presentationId: presentationTwo.id,
    lot: LOT_TWO,
    stock: STOCK_TWO,
    packageContent: CONTENT_TWO,
    purchaseDate: '2026-09-01',
  });

  // `TERMINADO` exige fecha de terminado, quien empaco y quien acondiciono.
  orderId = (
    await prisma.order.create({
      data: {
        companyId,
        orderYear: new Date().getUTCFullYear(),
        orderSequence: ORDER_SEQUENCE,
        recipeId,
        quantity: '11.0000',
        status: 'TERMINADO',
        finishedAt: FINISHED_AT,
        packedBy: adminUserId,
        conditionedBy: adminUserId,
        unitId: unit.id,
        customerId: customerOfOrderId,
        createdBy: adminUserId,
        presentationLines: {
          create: [
            {
              companyId,
              presentationId: presentationOne.id,
              packages: LINE_ONE_PACKAGES,
              presentationContent: CONTENT_ONE,
            },
            {
              companyId,
              presentationId: presentationTwo.id,
              packages: LINE_TWO_PACKAGES,
              presentationContent: CONTENT_TWO,
            },
          ],
        },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por el prefijo a secas: el otro proyecto
  // (Chromium/WebKit) sigue corriendo. Cada paso corre aunque falle el anterior.
  const scopedCompanyId = companyId;
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => (scopedCompanyId ? deleteCompanyRows([scopedCompanyId]) : Promise.resolve()),
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

test.describe('entregar el producto terminado de un pedido', () => {
  test('entrega parcial a otro cliente con el borrador tras recargar, y entrega que completa el pedido (R35, R39)', async ({
    page,
  }) => {
    const id = required(orderId, 'el pedido');
    const oneA = required(batchOneAId, 'el lote 1a');
    const oneB = required(batchOneBId, 'el lote 1b');
    const two = required(batchTwoId, 'el lote 2');
    const originalCustomer = required(customerOfOrderId, 'el cliente del pedido');
    const deliveryCustomer = required(customerOfDeliveryId, 'el cliente de la entrega');
    const deliveryLabel = customerLabel(CUSTOMER_OF_DELIVERY);

    await loginAndLand(page, adminUser);
    await gotoOrders(page);

    // 1. «Entregar» desde la fila. El panel parte del cliente del pedido.
    let sheet = await openDeliverySheet(page, id);
    await expect(customerInput(sheet)).toHaveValue(customerLabel(CUSTOMER_OF_ORDER));

    // 2. Otro cliente y envases en dos lotes, uno por presentacion.
    await chooseCustomer(page, sheet, deliveryLabel);
    await batchPackages(sheet, oneA).fill(FIRST_ONE_A_PACKAGES);
    await batchPackages(sheet, two).fill(FIRST_TWO_PACKAGES);

    // 3. Recargar y reabrir restaura el borrador: cliente y envases.
    await page.reload();
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
    sheet = await openDeliverySheet(page, id);
    await expect(customerInput(sheet)).toHaveValue(deliveryLabel);
    await expect(batchPackages(sheet, oneA)).toHaveValue(FIRST_ONE_A_PACKAGES);
    await expect(batchPackages(sheet, two)).toHaveValue(FIRST_TWO_PACKAGES);
    await expect(batchPackages(sheet, oneB)).toHaveValue('');

    // 4. Confirmar y comprobar en Postgres.
    await submitDelivery(sheet);

    await expect
      .poll(() => prisma.orderDelivery.count({ where: { orderId: id } }), { timeout: 30_000 })
      .toBe(1);
    const firstDelivery = await prisma.orderDelivery.findFirstOrThrow({
      where: { orderId: id },
      select: { id: true, customerId: true, lines: { select: { batchId: true, packages: true } } },
    });
    expect(firstDelivery.customerId, 'la entrega lleva el cliente elegido').toBe(deliveryCustomer);
    expect(
      [...firstDelivery.lines].sort((a, b) => a.batchId.localeCompare(b.batchId)),
    ).toEqual(
      [
        { batchId: oneA, packages: Number(FIRST_ONE_A_PACKAGES) },
        { batchId: two, packages: Number(FIRST_TWO_PACKAGES) },
      ].sort((a, b) => a.batchId.localeCompare(b.batchId)),
    );

    const firstMovements = await prisma.inventoryMovement.findMany({
      where: { orderDeliveryId: firstDelivery.id },
      select: { batchId: true, kind: true, quantity: true, orderId: true },
    });
    const firstByBatch = new Map(firstMovements.map((m) => [m.batchId, m]));
    expect(firstMovements).toHaveLength(2);
    // 3 envases de 1 y 1 envase de 2, en negativo.
    expect(firstByBatch.get(oneA)?.kind).toBe('delivery');
    expect(firstByBatch.get(oneA)?.quantity.toFixed(4)).toBe('-3.0000');
    expect(firstByBatch.get(oneA)?.orderId).toBe(id);
    expect(firstByBatch.get(two)?.kind).toBe('delivery');
    expect(firstByBatch.get(two)?.quantity.toFixed(4)).toBe('-2.0000');
    expect(firstByBatch.get(two)?.orderId).toBe(id);

    const batchesAfterFirst = await prisma.productBatch.findMany({
      where: { id: { in: [oneA, oneB, two] } },
      select: { id: true, stock: true },
    });
    const stockAfterFirst = new Map(batchesAfterFirst.map((b) => [b.id, b.stock.toFixed(4)]));
    expect(stockAfterFirst.get(oneA), 'el lote 1a sigue existiendo con lo que le queda').toBe('1.0000');
    expect(stockAfterFirst.get(oneB), 'el lote 1b no se toco').toBe(STOCK_ONE_B);
    expect(stockAfterFirst.get(two), 'el lote 2 sigue existiendo con lo que le queda').toBe('8.0000');

    const orderAfterFirst = await prisma.order.findUniqueOrThrow({
      where: { id },
      select: { status: true, customerId: true },
    });
    expect(orderAfterFirst.status, 'una entrega parcial no cambia el estado').toBe('TERMINADO');
    expect(orderAfterFirst.customerId, 'el pedido conserva su cliente').toBe(originalCustomer);

    // 5. Segunda entrega, la que completa: el panel vuelve a partir del cliente del pedido.
    await gotoOrders(page);
    sheet = await openDeliverySheet(page, id);
    await expect(customerInput(sheet)).toHaveValue(customerLabel(CUSTOMER_OF_ORDER));
    await batchPackages(sheet, oneB).fill(SECOND_ONE_B_PACKAGES);
    await batchPackages(sheet, two).fill(SECOND_TWO_PACKAGES);
    await submitDelivery(sheet);

    await expect
      .poll(
        async () =>
          (await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status,
        { timeout: 30_000 },
      )
      .toBe('ENTREGADO');
    const deliveries = await prisma.orderDelivery.findMany({
      where: { orderId: id },
      select: { customerId: true },
    });
    expect(deliveries).toHaveLength(2);
    expect(new Set(deliveries.map((d) => d.customerId))).toEqual(new Set([deliveryCustomer, originalCustomer]));

    await expect(orderRow(page, id).getByTestId(ORDER_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'ENTREGADO',
      { timeout: 60_000 },
    );
  });

  test('el Operador, sin permiso de entregas, no ve la accion «Entregar» (R4)', async ({ page }) => {
    const id = required(orderId, 'el pedido');

    await loginAndLand(page, operatorUser);
    // Sin permiso de pedidos la pantalla responde «no encontrado»: ni la fila ni su menu existen.
    // El ancla positiva evita afirmar la ausencia sobre una pagina que aun no pinto.
    await page.goto(ordersUrl());
    await expect(page.getByTestId(PRIVATE_NOT_FOUND_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toHaveCount(0);
    await expect(page.locator(`[data-testid="${ORDER_ROW_ACTIONS_TESTID}"][data-order-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId(ORDER_ACTION_DELIVER_TESTID)).toHaveCount(0);
  });
});
