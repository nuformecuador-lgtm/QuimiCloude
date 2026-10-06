/**
 * E2E del pedido repartido en varias presentaciones.
 *
 * Dos recorridos, cada uno en un solo `test()` porque cada paso es la precondicion del siguiente:
 *
 *   1. El Administrador da de alta por la pantalla un pedido con unidad y dos lineas de reparto;
 *      el formulario avisa cuando el reparto pasa del total y, si se fuerza el envio, el servidor
 *      lo rechaza sin tocar el reparto guardado. El Operador finaliza (no nace ningun lote), el
 *      Empacador comienza y termina, y nacen dos lotes -uno por linea- con su cantidad, el mismo
 *      coste unitario y la existencia subiendo en las dos combinaciones receta + presentacion.
 *   2. Un pedido llega a «Por empacar» sin unidad ni reparto: el Empacador ve el aviso, sin
 *      controles, y Comenzar se rechaza; el Administrador define unidad y reparto con la edicion
 *      acotada; el Empacador lo ve en solo lectura y comienza; despues la accion desaparece de
 *      Pedidos y un guardado desde un dialogo que quedo abierto se rechaza.
 *
 * Los asertos de estado se leen de la base; la pantalla solo se afirma en lo que es suyo (avisos,
 * controles, botones deshabilitados).
 *
 * AISLAMIENTO: prefijo `qc170_e2e_` + `RUN_ID` por worker, empresa efimera y limpieza de huerfanos
 * por prefijo Y POR EDAD, porque Chromium y WebKit pueden correr a la vez sobre la misma base.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import { errorMessage } from '@/lib/modules/errores';
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  deriveUnitCost,
  normalizePresentationName,
  normalizeProductName,
} from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  DELIVERED_ORDER_PARAM,
  ORDERS_ROUTE,
  PACKED_ORDER_PARAM,
  assignedOrderRoute,
  packingOrderRoute,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import {
  clickAndConfirm,
  ORDER_EXECUTION_FINISH_CONFIRM_TESTID,
  PACKING_ORDER_FINISH_CONFIRM_TESTID,
  PACKING_ORDER_START_CONFIRM_TESTID,
} from './helpers/confirm-dialog';
import { addPackagingLine, openOrderRowMenu } from './helpers/order-distribution';
import { batchStock, seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc170_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const INGREDIENT_NAME = `${SHARED_TOKEN}_ingrediente`;
const INGREDIENT_LOT = `${SHARED_TOKEN}_lote`;

/** Ninguno de los dos nombres es prefijo del otro: el filtro de opciones no puede confundirlos. */
const PRESENTATION_A_NAME = `${SHARED_TOKEN}_botella_litro`;
const PRESENTATION_B_NAME = `${SHARED_TOKEN}_frasco_medio`;
const PRESENTATION_A_CONTENT = '1';
const PRESENTATION_B_CONTENT = '0.5';

/** Un envase por presentacion. Tampoco aqui un nombre es prefijo del otro. */
const PACKAGING_A_NAME = `${SHARED_TOKEN}_envase_litro`;
const PACKAGING_B_NAME = `${SHARED_TOKEN}_envase_medio`;
/** Envases de sobra para los dos recorridos: aqui no se prueba la falta de envase. */
const PACKAGING_STOCK = '20';
const PACKAGING_UNIT_COST = '0.5000';

/** Muy por encima de lo que piden los dos pedidos: la reserva y el consumo no agotan el lote. */
const INGREDIENT_STOCK = '200.0000';
const INGREDIENT_UNIT_COST = '10.0000';

/** Recorrido 1: 4 x 1 + 6 x 0.5 = 7 de 10; 20 envases de B pasan del total. */
const ORDER_QUANTITY = '10';
const PACKAGES_A = '4';
const PACKAGES_B = '6';
const PACKAGES_B_EXCEEDING = '20';
const PACKAGES_A_EXCEEDING = '20';
const EXPECTED_STOCK_A = '4';
const EXPECTED_STOCK_B = '3';
const EXPECTED_TOTAL_PRODUCED = '7';

/** Recorrido 2: el pedido nace sin unidad ni reparto y se reparte en `POR_EMPACAR`. */
const BARE_ORDER_QUANTITY = '5';
const BARE_PACKAGES = '3';
const BARE_PACKAGES_LATE = '2';

/** Alta y aleatoria para no chocar con `orders_company_year_sequence_key` ni con otro worker. */
const BARE_ORDER_SEQUENCE = 900_000 + Math.floor(Math.random() * 90_000);

const RECIPE_STEPS: readonly RecipeStepDocument[] = [
  {
    blocks: [
      {
        kind: 'checklist',
        items: [{ spans: [{ text: `${SHARED_TOKEN}_verificar` }] }],
      },
    ],
  },
];

/** Pedidos. */
const ORDERS_TITLE_TESTID = 'pedidos-title';
const ORDER_CREATE_OPEN_TESTID = 'order-create-open';
const ORDER_FORM_TESTID = 'order-form';
const ORDER_FORM_SUBMIT_TESTID = 'order-form-submit';
const ORDER_FORM_CANCEL_TESTID = 'order-form-cancel';
const ORDER_QUANTITY_FIELD_TESTID = 'order-field-quantity';
const ORDER_ROW_ACTIONS_TESTID = 'order-row-actions';
const ORDER_ACTION_EDIT_TESTID = 'order-action-edit';
const ORDER_ACTION_DISTRIBUTION_TESTID = 'order-action-distribution';
const RECIPE_PICKER_TESTID = 'recipe-picker';
const RECIPE_PICKER_OPTION_TESTID = 'recipe-picker-option';
const RECIPE_PICKER_VALUE_TESTID = 'recipe-picker-value';
const UNIT_SELECT_TESTID = 'presentation-unit-select';
const UNIT_OPTION_TESTID = 'presentation-unit-option';

/** El control del reparto, comun al alta, la edicion y la edicion acotada. */
const DISTRIBUTION_FIELD_TESTID = 'order-distribution-field';
const DISTRIBUTION_LINE_TESTID = 'order-distribution-line';
const DISTRIBUTION_LINE_PACKAGES_TESTID = 'order-distribution-line-packages';
const DISTRIBUTION_AVAILABLE_TESTID = 'order-distribution-available';
const DISTRIBUTION_WARNING_TESTID = 'order-distribution-warning';
const DISTRIBUTION_ERROR_TESTID = 'order-distribution-error';

const DISTRIBUTION_DIALOG_TESTID = 'order-distribution-dialog';
const DISTRIBUTION_DIALOG_SUBMIT_TESTID = 'order-distribution-dialog-submit';
const DISTRIBUTION_DIALOG_ERROR_TESTID = 'order-distribution-dialog-error';

/** Asignacion y ejecucion. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_FINISH_TESTID = 'step-reader-finish';

/** Pantalla del Empacador. */
const PACKING_SCREEN_TESTID = 'packing-order-screen';
const PACKING_DISTRIBUTION_TESTID = 'packing-order-presentation';
const PACKING_LINE_TESTID = 'packing-order-presentation-line';
const PACKING_MISSING_DISTRIBUTION_TESTID = 'packing-order-missing-distribution';
const PACKING_START_TESTID = 'packing-order-start-button';
const PACKING_START_ERROR_TESTID = 'packing-order-start-error';
const PACKING_FINISH_TESTID = 'packing-order-finish-button';
const PACKED_NOTICE_TESTID = 'packed-order-notice';

const MISSING_DISTRIBUTION_TEXT = 'Falta el reparto: lo define quien edita pedidos';
const EMPTY_DISTRIBUTION_TEXT = 'Sin presentación';

/** Cualquier control con el que se pudiera escribir algo en la pantalla del Empacador. */
const EDITING_CONTROLS =
  'input:not([type="hidden"]), select, textarea, [role="combobox"], [contenteditable="true"]';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc170-Admin-${RUN_ID.slice(0, 12)}`,
};

/** Sin `pedidos.consultar`: solo asi `/asignacion` le muestra «Mis asignados» con «Entrar». */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc170-Operador-${RUN_ID.slice(0, 12)}`,
};

/** El rol real del seed: tiene `empaque.modificar` y no `pedidos.modificar`. */
const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc170-Empacador-${RUN_ID.slice(0, 12)}`,
};

let companyId: string | null = null;
let recipeId: string | null = null;
let litroUnitId: string | null = null;
let presentationAId: string | null = null;
let presentationBId: string | null = null;
let packagingAId: string | null = null;
let packagingBId: string | null = null;
let packagingABatchId: string | null = null;
let packagingBBatchId: string | null = null;
let operatorUserId: string | null = null;
let empacadorUserId: string | null = null;

/** `/pedidos` filtrado por la receta del fixture: solo salen los pedidos de este worker. */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: '25', q: RECIPE_NAME });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

function rowActions(page: Page, orderId: string): Locator {
  return page.locator(`[data-testid="${ORDER_ROW_ACTIONS_TESTID}"][data-order-id="${orderId}"]`);
}

function distributionLine(scope: Locator, presentationId: string): Locator {
  return scope.locator(
    `[data-testid="${DISTRIBUTION_LINE_TESTID}"][data-presentation-id="${presentationId}"]`,
  );
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc170${RUN_ID.slice(0, 8)}`,
      lastNames: 'Reparto',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId,
      // `@default(pending)` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** Documento neutro antes de limpiar cookies: la pagina anterior podria navegar sola a /login. */
async function switchUser(page: Page, user: Credentials): Promise<void> {
  await page.goto('about:blank');
  await page.context().clearCookies();
  await loginAndLand(page, user);
}

async function openOrders(page: Page): Promise<void> {
  // En WebKit el `router.refresh()` de un guardado anterior puede interrumpir la navegacion.
  await expect(async () => {
    await page.goto(ordersUrl());
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
}

async function chooseLitro(page: Page, scope: Locator): Promise<void> {
  await scope.getByTestId(UNIT_SELECT_TESTID).click();
  await page
    .locator(`[data-testid="${UNIT_OPTION_TESTID}"][data-value="${litroUnitId}"]`)
    .click();
  await expect(scope.getByTestId(DISTRIBUTION_AVAILABLE_TESTID)).toBeVisible({ timeout: 60_000 });
}

/** Una linea del reparto: el envase que se elige y la presentacion fija que la linea copia. */
type DistributionChoice = {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
};

/** Elige el envase en el selector del reparto, escribe los envases y anade la linea. */
async function addDistributionLine(
  page: Page,
  scope: Locator,
  choice: DistributionChoice,
  packages: string,
): Promise<void> {
  await addPackagingLine(page, scope, { productId: choice.productId, name: choice.name }, packages);
  const field = scope.getByTestId(DISTRIBUTION_FIELD_TESTID);
  await expect(
    distributionLine(field, choice.id).getByTestId(DISTRIBUTION_LINE_PACKAGES_TESTID),
  ).toHaveValue(packages);
}

/** Espera a que el disponible se recalcule en el servidor y diga si pasa del total. */
async function expectAvailability(scope: Locator, exceeds: boolean): Promise<void> {
  const available = scope.getByTestId(DISTRIBUTION_AVAILABLE_TESTID);
  await expect(available).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  if (exceeds) {
    await expect(available).toHaveAttribute('data-negative', 'true', { timeout: 60_000 });
    await expect(scope.getByTestId(DISTRIBUTION_WARNING_TESTID)).toHaveAttribute(
      'data-kind',
      'exceeds_quantity',
    );
  } else {
    await expect(available).not.toHaveAttribute('data-negative', 'true', { timeout: 60_000 });
    await expect(scope.getByTestId(DISTRIBUTION_WARNING_TESTID)).toHaveCount(0);
  }
}

/** El Operador entra al pedido asignado y lo finaliza; queda `POR_EMPACAR`. */
async function finishProduction(page: Page, orderId: string, numberText: string): Promise<void> {
  await switchUser(page, operatorUser);
  await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

  await page.goto(assignedOrderRoute(orderId));
  await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toHaveText(
    `${numberText} - ${RECIPE_NAME}`,
  );

  // Un clic antes de hidratar se pierde sin error: se repite hasta que la casilla quede marcada.
  const checklistItem = page.getByTestId(STEP_CHECKLIST_ITEM_TESTID);
  await expect(async () => {
    if (!(await checklistItem.isChecked())) await checklistItem.click();
    await expect(checklistItem).toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const finish = page.getByTestId(STEP_FINISH_TESTID);
  await expect(finish).toBeEnabled({ timeout: 60_000 });
  await clickAndConfirm(page, finish, ORDER_EXECUTION_FINISH_CONFIRM_TESTID);
  await page.waitForURL(
    (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
    { timeout: 60_000 },
  );
}

async function openPackingScreen(page: Page, orderId: string): Promise<Locator> {
  await page.goto(packingOrderRoute(orderId));
  const screen = page.getByTestId(PACKING_SCREEN_TESTID);
  await expect(screen).toBeVisible({ timeout: 60_000 });
  return screen;
}

async function linesByPresentation(orderId: string): Promise<Map<string, number>> {
  const lines = await prisma.orderPresentationLine.findMany({
    where: { orderId },
    select: { presentationId: true, packages: true },
  });
  return new Map(lines.map((line) => [line.presentationId, line.packages]));
}

async function finishedBatchCount(): Promise<number> {
  return prisma.productBatch.count({
    where: { companyId: companyId!, product: { recipeId: recipeId!, type: 'FINISHED_PRODUCT' } },
  });
}

test.beforeAll(async () => {
  const roles = new Map<string, string>();
  for (const roleName of [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(
        `falta el rol "${roleName}": sus permisos son el dato bajo prueba. Siembra la base con ` +
          '`pnpm run db:seed` antes de correr `pnpm run e2e`.',
      );
    }
    roles.set(roleName, role.id);
  }

  // Limpieza defensiva de huerfanos, en el orden que imponen las FK RESTRICT.
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
    await prisma.order.deleteMany({ where: inOrphans });
    await prisma.productBatch.deleteMany({ where: inOrphans });
    // El producto terminado restringe el borrado de la receta; el ingrediente, al reves.
    await prisma.product.deleteMany({ where: { ...inOrphans, type: 'FINISHED_PRODUCT' } });
    await prisma.recipe.deleteMany({ where: inOrphans });
    await prisma.product.deleteMany({ where: inOrphans });
    await prisma.presentation.deleteMany({ where: inOrphans });
    await prisma.user.deleteMany({ where: inOrphans });
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  const adminUserId = await createUser(adminUser, roles.get(ROLE_ADMINISTRADOR)!);
  operatorUserId = await createUser(operatorUser, roles.get(ROLE_OPERADOR)!);
  empacadorUserId = await createUser(empacadorUser, roles.get(ROLE_EMPACADOR)!);

  // Del catalogo arrancador: este archivo nunca la crea ni la borra.
  litroUnitId = (
    await prisma.unit.findFirstOrThrow({
      where: { nameNormalized: 'litro', companyId: null },
      select: { id: true },
    })
  ).id;

  // `products.unit_id` a mano: el disparador del lote exige que el producto ya tenga unidad.
  const ingredientId = (
    await prisma.product.create({
      data: {
        name: INGREDIENT_NAME,
        nameNormalized: normalizeProductName(INGREDIENT_NAME),
        unitId: litroUnitId,
        stock: INGREDIENT_STOCK,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  // Las dos en litros: el coste unitario se divide entre la suma de cantidades de las lineas.
  presentationAId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_A_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_A_NAME),
        unitId: litroUnitId,
        content: PRESENTATION_A_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;
  presentationBId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_B_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_B_NAME),
        unitId: litroUnitId,
        content: PRESENTATION_B_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const packagingA = await seedPackaging({
    companyId,
    name: PACKAGING_A_NAME,
    presentationId: presentationAId,
    stock: PACKAGING_STOCK,
    unitCost: PACKAGING_UNIT_COST,
    lot: `${SHARED_TOKEN}_lote_envase_a`,
    createdBy: adminUserId,
  });
  packagingAId = packagingA.productId;
  packagingABatchId = packagingA.batchId;
  const packagingB = await seedPackaging({
    companyId,
    name: PACKAGING_B_NAME,
    presentationId: presentationBId,
    stock: PACKAGING_STOCK,
    unitCost: PACKAGING_UNIT_COST,
    lot: `${SHARED_TOKEN}_lote_envase_b`,
    createdBy: adminUserId,
  });
  packagingBId = packagingB.productId;
  packagingBBatchId = packagingB.batchId;

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  const batch = await prisma.productBatch.create({
    data: {
      productId: ingredientId,
      presentationId: presentationAId,
      companyId,
      stock: INGREDIENT_STOCK,
      unitCost: INGREDIENT_UNIT_COST,
      lot: INGREDIENT_LOT,
      purchaseDate,
      createdBy: adminUserId,
    },
    select: { id: true },
  });
  await prisma.inventoryMovement.create({
    data: {
      batchId: batch.id,
      kind: 'opening',
      quantity: INGREDIENT_STOCK,
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
        steps: RECIPE_STEPS as unknown as Prisma.InputJsonValue,
        lines: { create: [{ productId: ingredientId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por prefijo: el otro navegador sigue corriendo.
  // Cada paso corre aunque falle el anterior.
  const scopedCompanyId = companyId;
  const byCompany = scopedCompanyId === null ? null : { companyId: scopedCompanyId };
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => (byCompany ? prisma.reservationMovement.deleteMany({ where: byCompany }) : Promise.resolve()),
    () => (byCompany ? prisma.inventoryMovement.deleteMany({ where: byCompany }) : Promise.resolve()),
    () => (byCompany ? prisma.orderAssignment.deleteMany({ where: byCompany }) : Promise.resolve()),
    () =>
      byCompany ? prisma.orderPresentationLine.deleteMany({ where: byCompany }) : Promise.resolve(),
    () => (byCompany ? prisma.order.deleteMany({ where: byCompany }) : Promise.resolve()),
    () => (byCompany ? prisma.productBatch.deleteMany({ where: byCompany }) : Promise.resolve()),
    () =>
      byCompany
        ? prisma.product.deleteMany({ where: { ...byCompany, type: 'FINISHED_PRODUCT' } })
        : Promise.resolve(),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    () => (byCompany ? prisma.product.deleteMany({ where: byCompany }) : Promise.resolve()),
    () => (byCompany ? prisma.presentation.deleteMany({ where: byCompany }) : Promise.resolve()),
    () =>
      prisma.user.deleteMany({
        where: {
          username: { in: [adminUser.username, operatorUser.username, empacadorUser.username] },
        },
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

// El primer `goto` de cada ruta compila bajo demanda en `next dev`, y bcrypt tarda a proposito.
test.setTimeout(300_000);

test.describe('pedido en varias presentaciones', () => {
  test('R33, R36, R39 - alta con unidad y dos lineas de reparto, aviso y rechazo del reparto que pasa del total, produccion, empaque y un lote por linea con el mismo coste unitario', async ({
    page,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      recipeId === null ||
      companyId === null ||
      presentationAId === null ||
      presentationBId === null ||
      packagingAId === null ||
      packagingBId === null ||
      operatorUserId === null
    ) {
      return;
    }
    const presentationA = { id: presentationAId, productId: packagingAId, name: PACKAGING_A_NAME };
    const presentationB = { id: presentationBId, productId: packagingBId, name: PACKAGING_B_NAME };

    // --- 1. Alta por la pantalla: receta, cantidad, unidad y dos lineas de reparto.
    await loginAndLand(page, adminUser);
    await openOrders(page);
    await page.getByTestId(ORDER_CREATE_OPEN_TESTID).first().click();
    const createForm = page.getByTestId(ORDER_FORM_TESTID);
    await expect(createForm).toBeVisible({ timeout: 60_000 });

    const recipePicker = createForm.getByTestId(RECIPE_PICKER_TESTID);
    await recipePicker.click();
    await recipePicker.fill(RECIPE_NAME);
    const recipeOption = page.getByTestId(RECIPE_PICKER_OPTION_TESTID).filter({ hasText: RECIPE_NAME });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(createForm.getByTestId(RECIPE_PICKER_VALUE_TESTID)).toHaveValue(recipeId);

    await createForm.getByTestId(ORDER_QUANTITY_FIELD_TESTID).fill(ORDER_QUANTITY);
    await chooseLitro(page, createForm);
    await addDistributionLine(page, createForm, presentationA, PACKAGES_A);
    await addDistributionLine(page, createForm, presentationB, PACKAGES_B);
    await expectAvailability(createForm, false);

    // --- 2. R39: un reparto que pasa del total avisa y no ofrece Guardar; al volver, si.
    const createLineB = distributionLine(createForm, presentationB.id).getByTestId(
      DISTRIBUTION_LINE_PACKAGES_TESTID,
    );
    await createLineB.fill(PACKAGES_B_EXCEEDING);
    await expectAvailability(createForm, true);
    await expect(createForm.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled();

    await createLineB.fill(PACKAGES_B);
    await expectAvailability(createForm, false);
    await expect(createForm.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();

    await createForm.getByTestId(ORDER_FORM_SUBMIT_TESTID).click();
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toHaveCount(0, { timeout: 60_000 });

    const created = await prisma.order.findFirstOrThrow({
      where: { recipeId, companyId, deletedAt: null, orderSequence: { lt: BARE_ORDER_SEQUENCE } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderYear: true, orderSequence: true, unitId: true, status: true },
    });
    const orderId = created.id;
    const numberText = formatOrderNumber({ year: created.orderYear, sequence: created.orderSequence });
    expect(created.unitId, 'el pedido guarda la unidad elegida').toBe(litroUnitId);

    const savedLines = await prisma.orderPresentationLine.findMany({
      where: { orderId },
      select: { id: true, presentationId: true, packages: true, presentationContent: true },
    });
    expect(savedLines, 'una linea por presentacion').toHaveLength(2);
    const savedA = savedLines.find((line) => line.presentationId === presentationA.id);
    const savedB = savedLines.find((line) => line.presentationId === presentationB.id);
    expect(savedA?.packages).toBe(Number(PACKAGES_A));
    expect(savedB?.packages).toBe(Number(PACKAGES_B));
    expect(savedA?.presentationContent?.equals(PRESENTATION_A_CONTENT) ?? false).toBe(true);
    expect(savedB?.presentationContent?.equals(PRESENTATION_B_CONTENT) ?? false).toBe(true);

    // --- 3. R36: en la edicion, el reparto que pasa del total avisa y, forzado el envio, el
    // servidor lo rechaza sin tocar el reparto guardado.
    await openOrders(page);
    const actions = rowActions(page, orderId);
    await expect(actions).toBeVisible({ timeout: 60_000 });
    await (await openOrderRowMenu(page, actions, ORDER_ACTION_EDIT_TESTID)).click();
    const editForm = page.getByTestId(ORDER_FORM_TESTID);
    await expect(editForm).toBeVisible({ timeout: 60_000 });

    const editLineA = distributionLine(editForm, presentationA.id).getByTestId(
      DISTRIBUTION_LINE_PACKAGES_TESTID,
    );
    await expect(editLineA).toHaveValue(PACKAGES_A, { timeout: 60_000 });
    await editLineA.fill(PACKAGES_A_EXCEEDING);
    await expectAvailability(editForm, true);
    await expect(editForm.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled();

    // El boton deshabilitado no es la defensa: se envia el formulario igual.
    await editForm.evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(editForm.getByTestId(DISTRIBUTION_ERROR_TESTID)).toHaveText(
      errorMessage('order_distribution_exceeds_quantity'),
      { timeout: 60_000 },
    );
    await expect(editLineA, 'lo escrito no se pierde con el rechazo').toHaveValue(
      PACKAGES_A_EXCEEDING,
    );

    const afterRejection = await linesByPresentation(orderId);
    expect(afterRejection.get(presentationA.id)).toBe(Number(PACKAGES_A));
    expect(afterRejection.get(presentationB.id)).toBe(Number(PACKAGES_B));
    expect(afterRejection.size).toBe(2);

    await editForm.getByTestId(ORDER_FORM_CANCEL_TESTID).click();
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toHaveCount(0, { timeout: 60_000 });

    // --- 4. Produccion: el Operador finaliza y todavia no nace ningun lote.
    await prisma.orderAssignment.create({ data: { orderId, userId: operatorUserId, companyId } });
    await finishProduction(page, orderId, numberText);

    const produced = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(produced.status).toBe('POR_EMPACAR');
    expect(await finishedBatchCount(), 'Finalizar no da de alta producto terminado').toBe(0);

    // --- 5. Empaque: el Empacador ve las dos lineas, comienza y termina.
    await switchUser(page, empacadorUser);
    const packingScreen = await openPackingScreen(page, orderId);
    const packingLines = packingScreen.getByTestId(PACKING_LINE_TESTID);
    await expect(packingLines).toHaveCount(2);
    await expect(packingLines.filter({ hasText: PACKAGING_A_NAME })).toHaveText(
      `${PACKAGES_A} × ${PACKAGING_A_NAME}`,
    );
    await expect(packingLines.filter({ hasText: PACKAGING_B_NAME })).toHaveText(
      `${PACKAGES_B} × ${PACKAGING_B_NAME}`,
    );

    await clickAndConfirm(page, page.getByTestId(PACKING_START_TESTID), PACKING_ORDER_START_CONFIRM_TESTID);
    await expect(page.getByTestId(PACKING_FINISH_TESTID)).toBeVisible({ timeout: 60_000 });
    await clickAndConfirm(page, page.getByTestId(PACKING_FINISH_TESTID), PACKING_ORDER_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(PACKED_ORDER_PARAM),
      { timeout: 60_000 },
    );
    await expect(page.getByTestId(PACKED_NOTICE_TESTID)).toContainText(numberText, {
      timeout: 60_000,
    });

    // --- 6. Un lote por linea, con su cantidad, el mismo coste unitario y la existencia arriba.
    const delivered = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, ingredientsCost: true },
    });
    expect(delivered.status).toBe('ENTREGADO');
    expect(delivered.ingredientsCost, 'el pedido guardo el coste de sus ingredientes').not.toBeNull();
    expect(await batchStock(packagingABatchId!), 'Terminar consume los envases de A').toBe(
      Number(PACKAGING_STOCK) - Number(PACKAGES_A),
    );
    expect(await batchStock(packagingBBatchId!), 'Terminar consume los envases de B').toBe(
      Number(PACKAGING_STOCK) - Number(PACKAGES_B),
    );
    const expectedUnitCost = deriveUnitCost(
      delivered.ingredientsCost!.toFixed(4),
      EXPECTED_TOTAL_PRODUCED,
    );
    expect(expectedUnitCost, 'el coste del pedido no puede ser cero').not.toBeNull();

    const batches = await prisma.productBatch.findMany({
      where: { companyId, product: { recipeId, type: 'FINISHED_PRODUCT' } },
      select: {
        presentationId: true,
        stock: true,
        unitCost: true,
        packageContent: true,
        product: { select: { stock: true, presentationId: true } },
        movements: {
          select: { kind: true, quantity: true, orderId: true, orderPresentationLineId: true },
        },
      },
    });
    expect(batches, 'un lote por linea del reparto').toHaveLength(2);

    const expectations = [
      { line: savedA!, stock: EXPECTED_STOCK_A, content: PRESENTATION_A_CONTENT },
      { line: savedB!, stock: EXPECTED_STOCK_B, content: PRESENTATION_B_CONTENT },
    ];
    for (const { line, stock, content } of expectations) {
      const batch = batches.find((candidate) => candidate.presentationId === line.presentationId);
      expect(batch, `falta el lote de la presentacion ${line.presentationId}`).toBeDefined();
      if (batch === undefined) continue;

      expect(batch.stock.equals(stock), `cantidad del lote ${line.presentationId}`).toBe(true);
      expect(batch.packageContent?.equals(content) ?? false).toBe(true);
      expect(batch.unitCost?.equals(expectedUnitCost!) ?? false, 'coste unitario unico').toBe(true);
      expect(batch.product.presentationId).toBe(line.presentationId);
      expect(batch.product.stock.equals(stock), 'la existencia del producto sube').toBe(true);

      expect(batch.movements).toHaveLength(1);
      const [movement] = batch.movements;
      expect(movement?.kind).toBe('production');
      expect(movement?.quantity.equals(stock) ?? false).toBe(true);
      expect(movement?.orderId).toBe(orderId);
      expect(movement?.orderPresentationLineId).toBe(line.id);
    }
  });

  test('R47, R10, R46, R13, R14 - sin reparto en Por empacar el Empacador lo ve sin controles y no puede comenzar, el administrador reparte con la edicion acotada y, tras Comenzar, el reparto queda fijado', async ({
    page,
    browser,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      recipeId === null ||
      companyId === null ||
      presentationAId === null ||
      packagingAId === null ||
      operatorUserId === null ||
      empacadorUserId === null
    ) {
      return;
    }
    const presentationA = { id: presentationAId, productId: packagingAId, name: PACKAGING_A_NAME };

    // Sin unidad ni reparto: el caso de un pedido anterior a la unidad obligatoria.
    const year = new Date().getUTCFullYear();
    const orderId = (
      await prisma.order.create({
        data: {
          companyId,
          orderYear: year,
          orderSequence: BARE_ORDER_SEQUENCE,
          recipeId,
          quantity: BARE_ORDER_QUANTITY,
          status: 'EN_CURSO',
        },
        select: { id: true },
      })
    ).id;
    const numberText = formatOrderNumber({ year, sequence: BARE_ORDER_SEQUENCE });
    await prisma.orderAssignment.create({ data: { orderId, userId: operatorUserId, companyId } });

    // --- 1. Llega a «Por empacar» sin reparto.
    await finishProduction(page, orderId, numberText);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } }))
        .status,
    ).toBe('POR_EMPACAR');
    expect((await linesByPresentation(orderId)).size).toBe(0);

    // --- 2. R47: el Empacador ve que falta el reparto, sin ningun control para definirlo.
    await switchUser(page, empacadorUser);
    let packingScreen = await openPackingScreen(page, orderId);
    await expect(packingScreen.getByTestId(PACKING_MISSING_DISTRIBUTION_TESTID)).toHaveText(
      MISSING_DISTRIBUTION_TEXT,
    );
    await expect(packingScreen.getByTestId(PACKING_DISTRIBUTION_TESTID)).toContainText(
      EMPTY_DISTRIBUTION_TEXT,
    );
    await expect(packingScreen.locator(EDITING_CONTROLS)).toHaveCount(0);
    await expect(page.getByTestId(DISTRIBUTION_FIELD_TESTID)).toHaveCount(0);

    // --- 3. R10: Comenzar se rechaza y el pedido sigue «Por empacar».
    await clickAndConfirm(page, page.getByTestId(PACKING_START_TESTID), PACKING_ORDER_START_CONFIRM_TESTID);
    await expect(page.getByTestId(PACKING_START_ERROR_TESTID)).toHaveText(
      errorMessage('order_without_distribution'),
      { timeout: 60_000 },
    );
    const notStarted = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, packedBy: true },
    });
    expect(notStarted.status).toBe('POR_EMPACAR');
    expect(notStarted.packedBy).toBeNull();

    // --- 4. R46: el Administrador, en su propio navegador, define unidad y reparto con la edicion
    // acotada.
    const adminContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await loginAndLand(adminPage, adminUser);
      await openOrders(adminPage);

      const actions = rowActions(adminPage, orderId);
      await expect(actions).toBeVisible({ timeout: 60_000 });
      await (await openOrderRowMenu(adminPage, actions, ORDER_ACTION_DISTRIBUTION_TESTID)).click();
      let dialog = adminPage.getByTestId(DISTRIBUTION_DIALOG_TESTID);
      await expect(dialog).toBeVisible({ timeout: 60_000 });

      await chooseLitro(adminPage, dialog);
      await addDistributionLine(adminPage, dialog, presentationA, BARE_PACKAGES);
      await expectAvailability(dialog, false);
      await dialog.getByTestId(DISTRIBUTION_DIALOG_SUBMIT_TESTID).click();
      await expect(adminPage.getByTestId(DISTRIBUTION_DIALOG_TESTID)).toHaveCount(0, {
        timeout: 60_000,
      });

      const distributed = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, unitId: true, quantity: true },
      });
      expect(distributed.status).toBe('POR_EMPACAR');
      expect(distributed.unitId).toBe(litroUnitId);
      expect(distributed.quantity.equals(BARE_ORDER_QUANTITY), 'la cantidad no cambia').toBe(true);
      const distributedLines = await linesByPresentation(orderId);
      expect(distributedLines.size).toBe(1);
      expect(distributedLines.get(presentationA.id)).toBe(Number(BARE_PACKAGES));

      // Se recarga para que la fila traiga el reparto guardado, y se deja abierto el dialogo: lo
      // que se guarde desde aqui llegara despues de Comenzar.
      await openOrders(adminPage);
      await expect(actions).toBeVisible({ timeout: 60_000 });
      await (await openOrderRowMenu(adminPage, actions, ORDER_ACTION_DISTRIBUTION_TESTID)).click();
      dialog = adminPage.getByTestId(DISTRIBUTION_DIALOG_TESTID);
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      const staleLine = distributionLine(dialog, presentationA.id).getByTestId(
        DISTRIBUTION_LINE_PACKAGES_TESTID,
      );
      await expect(staleLine).toHaveValue(BARE_PACKAGES);

      // --- 5. R47: el Empacador ve el reparto en solo lectura y comienza.
      packingScreen = await openPackingScreen(page, orderId);
      await expect(packingScreen.getByTestId(PACKING_LINE_TESTID)).toHaveText([
        `${BARE_PACKAGES} × ${PACKAGING_A_NAME}`,
      ]);
      await expect(packingScreen.getByTestId(PACKING_MISSING_DISTRIBUTION_TESTID)).toHaveCount(0);
      await expect(packingScreen.locator(EDITING_CONTROLS)).toHaveCount(0);

      await clickAndConfirm(page, page.getByTestId(PACKING_START_TESTID), PACKING_ORDER_START_CONFIRM_TESTID);
      await expect(page.getByTestId(PACKING_FINISH_TESTID)).toBeVisible({ timeout: 60_000 });
      const started = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, packedBy: true },
      });
      expect(started.status).toBe('EN_EMPAQUE');
      expect(started.packedBy).toBe(empacadorUserId);

      // --- 6. R13, R14: el guardado que llega despues de Comenzar se rechaza y el reparto queda
      // como estaba al comenzar.
      await staleLine.fill(BARE_PACKAGES_LATE);
      await expectAvailability(dialog, false);
      await dialog.getByTestId(DISTRIBUTION_DIALOG_SUBMIT_TESTID).click();
      await expect(dialog.getByTestId(DISTRIBUTION_DIALOG_ERROR_TESTID)).toHaveAttribute(
        'data-code',
        'order_presentation_line_not_editable',
        { timeout: 60_000 },
      );

      const frozen = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, unitId: true },
      });
      expect(frozen.status).toBe('EN_EMPAQUE');
      expect(frozen.unitId).toBe(litroUnitId);
      const frozenLines = await linesByPresentation(orderId);
      expect(frozenLines.size).toBe(1);
      expect(frozenLines.get(presentationA.id)).toBe(Number(BARE_PACKAGES));

      // --- 7. R13: en `/pedidos` la accion ya no se ofrece.
      await openOrders(adminPage);
      const frozenActions = rowActions(adminPage, orderId);
      await expect(frozenActions).toBeVisible({ timeout: 60_000 });
      // El menu se abre por una accion que sigue en el; la del reparto ya no esta.
      await openOrderRowMenu(adminPage, frozenActions, ORDER_ACTION_EDIT_TESTID);
      await expect(
        adminPage.getByRole('menu').getByTestId(ORDER_ACTION_DISTRIBUTION_TESTID),
      ).toHaveCount(0);
    } finally {
      await adminContext.close();
    }
  });
});
