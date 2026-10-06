/**
 * E2E de los envases del pedido como productos.
 *
 * Recorrido principal, en un solo `test()` porque cada paso es la precondicion del siguiente:
 *   1. El Administrador da de alta por la pantalla un pedido de 30 l repartido en 40 botellas de
 *      500 ml y 10 de 1 l, elegidas en «Reparto en envases»; la cotizacion suma el costo de los
 *      envases y el alta aparta 40 y 10 envases junto con la materia prima.
 *   2. Un segundo pedido pide 6 envases de 1 l cuando solo quedan 5 libres: la cotizacion queda sin
 *      importe, el alta avisa y, confirmado, el pedido queda BLOQUEADO sin nada apartado.
 *   3. El Operador finaliza el primero: se consume la materia prima y los envases siguen apartados.
 *   4. El Empacador ve los envases en la pantalla de empaque y termina: se consumen los envases.
 *
 * Aparte, la receta: el selector de ingredientes no ofrece un envase.
 *
 * Los asertos de estado se leen de la base; la pantalla solo se afirma en lo que es suyo.
 *
 * AISLAMIENTO: prefijo `qc195_e2e_` + `RUN_ID` por worker, empresa efimera y limpieza de huerfanos
 * por prefijo Y POR EDAD, porque Chromium y WebKit pueden correr a la vez sobre la misma base.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  DELIVERED_ORDER_PARAM,
  NEW_RECIPE_ROUTE,
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
import {
  DISTRIBUTION_ADD_PACKAGES_TESTID,
  DISTRIBUTION_ADD_TESTID,
  DISTRIBUTION_AVAILABLE_TESTID,
  DISTRIBUTION_FIELD_TESTID,
  PACKAGING_OPTION_AVAILABLE_TESTID,
  addPackagingLine,
  packagingLine,
  searchPackagingOption,
} from './helpers/order-distribution';
import { batchStock, netReservedInBatch, seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc195_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const INGREDIENT_NAME = `${SHARED_TOKEN}_ingrediente`;
const INGREDIENT_LOT = `${SHARED_TOKEN}_lote`;

/** Dos presentaciones en unidades distintas de la misma familia que el pedido (l). */
const HALF_LITER_PRESENTATION_NAME = `${SHARED_TOKEN}_500ml`;
const HALF_LITER_CONTENT = '500';
const LITER_PRESENTATION_NAME = `${SHARED_TOKEN}_1l`;
const LITER_CONTENT = '1';

/** Ninguno de los dos nombres es prefijo del otro: la busqueda no puede confundirlos. */
const BOTTLE_NAME = `${SHARED_TOKEN}_botella_medio`;
const JUG_NAME = `${SHARED_TOKEN}_garrafa_litro`;

/** Existencias y costos: el de 1 l solo deja 5 libres despues del primer pedido. */
const BOTTLE_STOCK = '100';
const BOTTLE_UNIT_COST = '0.5000';
const JUG_STOCK = '15';
const JUG_UNIT_COST = '1.2000';

const INGREDIENT_STOCK = '200.0000';
const INGREDIENT_UNIT_COST = '10.0000';

/** Pedido 1: 40 x 500 ml + 10 x 1 l = 30 l. */
const ORDER_QUANTITY = '30';
const BOTTLES = '40';
const JUGS = '10';
/** 30 l x 10 de la materia prima. */
const AMOUNT_INGREDIENTS = '$ 300.00';
/** + 40 x 0,50 + 10 x 1,20. */
const AMOUNT_WITH_PACKAGING = '$ 332.00';
const SAVED_AMOUNT_WITH_PACKAGING = '332.0000';

/** Pedido 2: 6 x 1 l, con 5 libres. */
const SHORT_ORDER_QUANTITY = '6';
const SHORT_JUGS = '6';
const JUGS_LEFT_LABEL = 'Disponible: 5 envases';

/** Marcador de ausencia del importe (`order-columns.tsx`), no copy de negocio. */
const MISSING_VALUE_MARK = '—';

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
const ORDER_QUANTITY_FIELD_TESTID = 'order-field-quantity';
const ORDER_COST_QUOTE_VALUE_TESTID = 'order-cost-quote-value';
const RECIPE_PICKER_TESTID = 'recipe-picker';
const RECIPE_PICKER_OPTION_TESTID = 'recipe-picker-option';
const RECIPE_PICKER_VALUE_TESTID = 'recipe-picker-value';
const UNIT_SELECT_TESTID = 'presentation-unit-select';
const UNIT_OPTION_TESTID = 'presentation-unit-option';
const BLOCKED_ORDER_DIALOG_TESTID = 'blocked-order-dialog';
const BLOCKED_ORDER_CONFIRM_TESTID = 'blocked-order-confirm';

/** Asignacion, ejecucion y empaque. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const EXECUTION_DISTRIBUTION_TESTID = 'order-execution-presentation';
const ORDER_DISTRIBUTION_LABEL_TESTID = 'order-distribution';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_FINISH_TESTID = 'step-reader-finish';
const PACKING_SCREEN_TESTID = 'packing-order-screen';
const PACKING_LINE_TESTID = 'packing-order-presentation-line';
const PACKING_START_TESTID = 'packing-order-start-button';
const PACKING_FINISH_TESTID = 'packing-order-finish-button';
const PACKED_NOTICE_TESTID = 'packed-order-notice';

/** Recetas. */
const RECIPE_FORM_TESTID = 'recipe-form';
const RECIPE_LINE_PRODUCT_TESTID = 'recipe-line-product-0';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc195-Admin-${RUN_ID.slice(0, 12)}`,
};

/** Sin `pedidos.consultar`: solo asi `/asignacion` le muestra «Mis asignados». */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc195-Operador-${RUN_ID.slice(0, 12)}`,
};

/** El rol real del seed: comienza y termina el empaque. */
const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc195-Empacador-${RUN_ID.slice(0, 12)}`,
};

type SeededPackagingRef = { readonly productId: string; readonly batchId: string; readonly name: string };

let companyId: string | null = null;
let recipeId: string | null = null;
let litroUnitId: string | null = null;
let ingredientBatchId: string | null = null;
let halfLiterPresentationId: string | null = null;
let literPresentationId: string | null = null;
let bottle: SeededPackagingRef | null = null;
let jug: SeededPackagingRef | null = null;
let operatorUserId: string | null = null;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc195${RUN_ID.slice(0, 8)}`,
      lastNames: 'Envases',
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

/** Abre el alta con la receta, la cantidad y la unidad (l) ya elegidas. */
async function openNewOrder(page: Page, quantity: string): Promise<Locator> {
  // En WebKit el `router.refresh()` de un guardado anterior puede interrumpir la navegacion.
  await expect(async () => {
    await page.goto(ORDERS_ROUTE);
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

  await page.getByTestId(ORDER_CREATE_OPEN_TESTID).first().click();
  const form = page.getByTestId(ORDER_FORM_TESTID);
  await expect(form).toBeVisible({ timeout: 60_000 });

  const recipePicker = form.getByTestId(RECIPE_PICKER_TESTID);
  await recipePicker.click();
  await recipePicker.fill(RECIPE_NAME);
  const recipeOption = page.getByTestId(RECIPE_PICKER_OPTION_TESTID).filter({ hasText: RECIPE_NAME });
  await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
  await recipeOption.click();
  await expect(form.getByTestId(RECIPE_PICKER_VALUE_TESTID)).toHaveValue(recipeId ?? '');

  await form.getByTestId(ORDER_QUANTITY_FIELD_TESTID).fill(quantity);
  await form.getByTestId(UNIT_SELECT_TESTID).click();
  await page.locator(`[data-testid="${UNIT_OPTION_TESTID}"][data-value="${litroUnitId}"]`).click();
  await expect(form.getByTestId(DISTRIBUTION_AVAILABLE_TESTID)).toBeVisible({ timeout: 60_000 });
  return form;
}

async function expectDistributionReady(form: Locator): Promise<void> {
  await expect(form.getByTestId(DISTRIBUTION_AVAILABLE_TESTID)).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 60_000 },
  );
}

async function latestOrder() {
  return prisma.order.findFirstOrThrow({
    where: { companyId: companyId!, recipeId: recipeId!, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderYear: true, orderSequence: true, status: true },
  });
}

/** El importe guardado, como texto: `NULL` no se confunde con `'0.0000'`. */
async function savedAmountText(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ingredients_cost: string | null }[]>`
    SELECT "ingredients_cost"::text AS "ingredients_cost" FROM "orders" WHERE "id" = ${orderId}::uuid`;
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`);
  return row.ingredients_cost;
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
  await createUser(empacadorUser, roles.get(ROLE_EMPACADOR)!);

  // Del catalogo arrancador: este archivo nunca las crea ni las borra. El litro deriva del
  // mililitro, asi que el pedido en litros admite envases en las dos.
  const units = await prisma.unit.findMany({
    where: { nameNormalized: { in: ['litro', 'mililitro'] }, companyId: null },
    select: { id: true, nameNormalized: true },
  });
  litroUnitId = units.find((unit) => unit.nameNormalized === 'litro')?.id ?? null;
  const mililitroUnitId = units.find((unit) => unit.nameNormalized === 'mililitro')?.id ?? null;
  if (litroUnitId === null || mililitroUnitId === null) {
    throw new Error('faltan las unidades arrancadoras litro y mililitro');
  }

  halfLiterPresentationId = (
    await prisma.presentation.create({
      data: {
        name: HALF_LITER_PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(HALF_LITER_PRESENTATION_NAME),
        unitId: mililitroUnitId,
        content: HALF_LITER_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;
  literPresentationId = (
    await prisma.presentation.create({
      data: {
        name: LITER_PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(LITER_PRESENTATION_NAME),
        unitId: litroUnitId,
        content: LITER_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const seededBottle = await seedPackaging({
    companyId,
    name: BOTTLE_NAME,
    presentationId: halfLiterPresentationId,
    stock: BOTTLE_STOCK,
    unitCost: BOTTLE_UNIT_COST,
    lot: `${SHARED_TOKEN}_lote_botella`,
    createdBy: adminUserId,
  });
  bottle = { ...seededBottle, name: BOTTLE_NAME };
  const seededJug = await seedPackaging({
    companyId,
    name: JUG_NAME,
    presentationId: literPresentationId,
    stock: JUG_STOCK,
    unitCost: JUG_UNIT_COST,
    lot: `${SHARED_TOKEN}_lote_garrafa`,
    createdBy: adminUserId,
  });
  jug = { ...seededJug, name: JUG_NAME };

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

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  ingredientBatchId = (
    await prisma.productBatch.create({
      data: {
        productId: ingredientId,
        presentationId: literPresentationId,
        companyId,
        stock: INGREDIENT_STOCK,
        unitCost: INGREDIENT_UNIT_COST,
        lot: INGREDIENT_LOT,
        purchaseDate,
        createdBy: adminUserId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.inventoryMovement.create({
    data: {
      batchId: ingredientBatchId,
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
    () => (byCompany ? prisma.recipe.deleteMany({ where: byCompany }) : Promise.resolve()),
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

test.describe('envases del pedido como productos', () => {
  test('R8, R10, R14, R15, R16, R17, R25, R26, R27, R28, R29, R44 - pedido en litros con envases de 500 ml y de 1 l, falta de envase bloqueada, cotizacion con envases y Terminar que los consume', async ({
    page,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      recipeId === null ||
      companyId === null ||
      bottle === null ||
      jug === null ||
      ingredientBatchId === null ||
      operatorUserId === null
    ) {
      return;
    }

    // --- 1. Alta del pedido de 30 l en 40 botellas de 500 ml y 10 garrafas de 1 l.
    await loginAndLand(page, adminUser);
    const form = await openNewOrder(page, ORDER_QUANTITY);
    const quote = page.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID);
    await expect(quote, 'sin reparto solo cuesta la materia prima').toHaveText(AMOUNT_INGREDIENTS, {
      timeout: 60_000,
    });

    // R8, R10: el selector del pedido en litros ofrece el envase de 500 ml con su disponible.
    const field = form.getByTestId(DISTRIBUTION_FIELD_TESTID);
    await addPackagingLine(page, form, bottle, BOTTLES);
    await expect(packagingLine(field, bottle.productId)).toHaveAttribute(
      'data-presentation-id',
      halfLiterPresentationId!,
    );
    await addPackagingLine(page, form, jug, JUGS);
    await expectDistributionReady(form);

    // R27, R29: la cotizacion se recalcula con el reparto y suma los envases.
    await expect(quote).toHaveText(AMOUNT_WITH_PACKAGING, { timeout: 60_000 });

    await form.getByTestId(ORDER_FORM_SUBMIT_TESTID).click();
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toHaveCount(0, { timeout: 60_000 });

    const first = await latestOrder();
    expect(first.status).toBe('PENDIENTE');
    const firstNumber = formatOrderNumber({ year: first.orderYear, sequence: first.orderSequence });

    // R14: cada linea guarda su envase y copia la presentacion y el contenido de ese envase.
    const lines = await prisma.orderPresentationLine.findMany({
      where: { orderId: first.id },
      select: { packagingProductId: true, presentationId: true, packages: true, presentationContent: true },
    });
    expect(lines).toHaveLength(2);
    const bottleLine = lines.find((line) => line.packagingProductId === bottle!.productId);
    const jugLine = lines.find((line) => line.packagingProductId === jug!.productId);
    expect(bottleLine?.presentationId).toBe(halfLiterPresentationId);
    expect(bottleLine?.packages).toBe(Number(BOTTLES));
    expect(bottleLine?.presentationContent?.equals(HALF_LITER_CONTENT) ?? false).toBe(true);
    expect(jugLine?.presentationId).toBe(literPresentationId);
    expect(jugLine?.packages).toBe(Number(JUGS));

    // R15: se apartan 40 botellas y 10 garrafas junto con la materia prima.
    expect(await netReservedInBatch(first.id, bottle.batchId)).toBe(Number(BOTTLES));
    expect(await netReservedInBatch(first.id, jug.batchId)).toBe(Number(JUGS));
    expect(await netReservedInBatch(first.id, ingredientBatchId)).toBe(Number(ORDER_QUANTITY));

    // R27: el importe guardado es el mismo que mostro la cotizacion.
    expect(await savedAmountText(first.id)).toBe(SAVED_AMOUNT_WITH_PACKAGING);

    // --- 2. Un segundo pedido pide 6 garrafas y solo quedan 5 libres.
    const shortForm = await openNewOrder(page, SHORT_ORDER_QUANTITY);

    // R10: el disponible que ofrece el selector descuenta lo apartado por el primer pedido.
    const shortField = shortForm.getByTestId(DISTRIBUTION_FIELD_TESTID);
    const jugOption = await searchPackagingOption(page, shortField, jug);
    await expect(jugOption.getByTestId(PACKAGING_OPTION_AVAILABLE_TESTID)).toHaveText(
      JUGS_LEFT_LABEL,
    );
    // R10: con menos disponible que lo pedido se puede elegir igual; el aviso llega al guardar.
    await jugOption.click();
    await shortField.getByTestId(DISTRIBUTION_ADD_PACKAGES_TESTID).fill(SHORT_JUGS);
    const add = shortField.getByTestId(DISTRIBUTION_ADD_TESTID);
    await expect(add).toBeEnabled({ timeout: 60_000 });
    await add.click();
    await expect(packagingLine(shortField, jug.productId)).toHaveCount(1);
    await expectDistributionReady(shortForm);

    // R28: con menos envases libres que los del reparto no hay importe.
    await expect(page.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).toHaveText(
      MISSING_VALUE_MARK,
      { timeout: 60_000 },
    );

    // R16, R17: el alta avisa con la misma confirmacion que la falta de materia prima.
    await shortForm.getByTestId(ORDER_FORM_SUBMIT_TESTID).click();
    const blockedDialog = page.getByTestId(BLOCKED_ORDER_DIALOG_TESTID);
    await expect(blockedDialog).toBeVisible({ timeout: 60_000 });
    expect(
      await prisma.order.count({ where: { companyId, recipeId } }),
      'sin confirmar no se escribe el pedido',
    ).toBe(1);

    await blockedDialog.getByTestId(BLOCKED_ORDER_CONFIRM_TESTID).click();
    await expect(blockedDialog).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toHaveCount(0, { timeout: 60_000 });

    const second = await latestOrder();
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('BLOQUEADO');
    expect(
      await prisma.reservationMovement.count({ where: { orderId: second.id } }),
      'un pedido bloqueado no aparta nada, ni la materia prima que si alcanzaba',
    ).toBe(0);
    expect(await savedAmountText(second.id)).toBeNull();
    // Y lo del primero sigue igual.
    expect(await netReservedInBatch(first.id, jug.batchId)).toBe(Number(JUGS));

    // --- 3. El Operador finaliza el primero: consume la materia prima, no los envases.
    await prisma.orderAssignment.create({
      data: { orderId: first.id, userId: operatorUserId, companyId },
    });
    await switchUser(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await page.goto(assignedOrderRoute(first.id));
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toHaveText(
      `${firstNumber} - ${RECIPE_NAME}`,
      { timeout: 60_000 },
    );

    // R44: la ejecucion nombra los envases.
    const executionLabel = page
      .getByTestId(EXECUTION_DISTRIBUTION_TESTID)
      .getByTestId(ORDER_DISTRIBUTION_LABEL_TESTID);
    await expect(executionLabel).toHaveAttribute(
      'title',
      new RegExp(escapeRegExp(`${BOTTLES} × ${BOTTLE_NAME}`)),
    );
    await expect(executionLabel).toHaveAttribute(
      'title',
      new RegExp(escapeRegExp(`${JUGS} × ${JUG_NAME}`)),
    );

    // Un clic antes de hidratar se pierde sin error: se repite hasta que la casilla quede marcada.
    const checklistItem = page.getByTestId(STEP_CHECKLIST_ITEM_TESTID);
    await expect(async () => {
      if (!(await checklistItem.isChecked())) await checklistItem.click();
      await expect(checklistItem).toBeChecked({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    const finishStep = page.getByTestId(STEP_FINISH_TESTID);
    await expect(finishStep).toBeEnabled({ timeout: 60_000 });
    await clickAndConfirm(page, finishStep, ORDER_EXECUTION_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    const produced = await prisma.order.findUniqueOrThrow({
      where: { id: first.id },
      select: { status: true },
    });
    expect(produced.status).toBe('POR_EMPACAR');
    // R26: la materia prima se consume aqui; los envases siguen enteros y apartados.
    expect(await batchStock(ingredientBatchId)).toBe(
      Number(INGREDIENT_STOCK) - Number(ORDER_QUANTITY),
    );
    expect(await batchStock(bottle.batchId)).toBe(Number(BOTTLE_STOCK));
    expect(await batchStock(jug.batchId)).toBe(Number(JUG_STOCK));
    expect(await netReservedInBatch(first.id, bottle.batchId)).toBe(Number(BOTTLES));
    expect(await netReservedInBatch(first.id, jug.batchId)).toBe(Number(JUGS));

    // --- 4. El Empacador ve los envases, comienza y termina.
    await switchUser(page, empacadorUser);
    await page.goto(packingOrderRoute(first.id));
    const packingScreen = page.getByTestId(PACKING_SCREEN_TESTID);
    await expect(packingScreen).toBeVisible({ timeout: 60_000 });

    // R44: cada linea con su envase.
    const packingLines = packingScreen.getByTestId(PACKING_LINE_TESTID);
    await expect(packingLines).toHaveCount(2);
    await expect(packingLines.filter({ hasText: BOTTLE_NAME })).toHaveText(
      `${BOTTLES} × ${BOTTLE_NAME}`,
    );
    await expect(packingLines.filter({ hasText: JUG_NAME })).toHaveText(`${JUGS} × ${JUG_NAME}`);

    await clickAndConfirm(page, page.getByTestId(PACKING_START_TESTID), PACKING_ORDER_START_CONFIRM_TESTID);
    await expect(page.getByTestId(PACKING_FINISH_TESTID)).toBeVisible({ timeout: 60_000 });
    await clickAndConfirm(page, page.getByTestId(PACKING_FINISH_TESTID), PACKING_ORDER_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(PACKED_ORDER_PARAM),
      { timeout: 60_000 },
    );
    await expect(page.getByTestId(PACKED_NOTICE_TESTID)).toContainText(firstNumber, {
      timeout: 60_000,
    });

    const delivered = await prisma.order.findUniqueOrThrow({
      where: { id: first.id },
      select: { status: true },
    });
    expect(delivered.status).toBe('ENTREGADO');

    // R25: Terminar consume los envases apartados y no deja nada apartado.
    expect(await batchStock(bottle.batchId)).toBe(Number(BOTTLE_STOCK) - Number(BOTTLES));
    expect(await batchStock(jug.batchId)).toBe(Number(JUG_STOCK) - Number(JUGS));
    expect(await netReservedInBatch(first.id, bottle.batchId)).toBe(0);
    expect(await netReservedInBatch(first.id, jug.batchId)).toBe(0);

    // Y da de alta el producto terminado, un lote por linea.
    expect(
      await prisma.productBatch.count({
        where: { companyId, product: { recipeId, type: 'FINISHED_PRODUCT' } },
      }),
    ).toBe(2);
  });

  test('R39 - el selector de ingredientes de la receta no ofrece un envase y si la materia prima', async ({
    page,
  }) => {
    expect(bottle, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (bottle === null) return;

    await loginAndLand(page, adminUser);
    await page.goto(NEW_RECIPE_ROUTE);
    await expect(page.getByTestId(RECIPE_FORM_TESTID)).toBeVisible({ timeout: 60_000 });

    // La busqueda viaja al servidor: el envase no vuelve aunque su nombre coincida.
    const picker = page.getByTestId(RECIPE_LINE_PRODUCT_TESTID);
    await picker.click();
    await picker.fill(BOTTLE_NAME);
    await expect(page.getByTestId(`${RECIPE_LINE_PRODUCT_TESTID}-empty`)).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByTestId(`${RECIPE_LINE_PRODUCT_TESTID}-option`).filter({ hasText: BOTTLE_NAME }),
    ).toHaveCount(0);

    // Control positivo: el mismo selector si ofrece la materia prima.
    await picker.fill(INGREDIENT_NAME);
    await expect(
      page.getByTestId(`${RECIPE_LINE_PRODUCT_TESTID}-option`).filter({ hasText: INGREDIENT_NAME }),
    ).toHaveCount(1, { timeout: 60_000 });
  });
});
