/**
 * E2E de los pasos de envasado (R32): el Administrador crea por el formulario una formula con
 * pasos del operador y dos pasos de envasado; el Operario ejecuta el pedido sin ver los de
 * envasado; el Empacador no los ve antes de Comenzar, los recorre respetando lista de
 * verificacion y espera, termina desde el ultimo paso y nunca ve los pasos del operador.
 *
 * UN SOLO `test()`: cada fase es la precondicion de la siguiente sobre el MISMO pedido.
 *
 * AISLAMIENTO: prefijo propio `qc211_e2e_` + `RUN_ID` por worker, empresa efimera y limpieza de
 * huerfanos por prefijo Y POR EDAD, porque Chromium y WebKit corren a la vez sobre la misma base.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  DELIVERED_ORDER_PARAM,
  FORMULAS_ROUTE,
  NEW_RECIPE_ROUTE,
  PACKED_ORDER_PARAM,
  assignedOrderRoute,
  packingOrderRoute,
} from '@/lib/shared/routes';

import {
  ASSIGNED_ORDER_START_CONFIRM_TESTID,
  ORDER_EXECUTION_FINISH_CONFIRM_TESTID,
  PACKING_ORDER_FINISH_CONFIRM_TESTID,
  PACKING_ORDER_START_CONFIRM_TESTID,
  clickAndConfirm,
} from './helpers/confirm-dialog';
import { loginAndLand } from './helpers/landing';
import { seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc211_e2e_';
const RUN_ID = randomUUID().replace(/-/g, '');
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;
const SHORT_ID = RUN_ID.slice(0, 8);

const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const WORK_GROUP_NAME = `${SHARED_TOKEN}_turno`;
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;
const PACKAGING_NAME = `${SHARED_TOKEN}_envase`;
const PACKAGING_LOT = `${SHARED_TOKEN}_lote_envase`;
const PACKAGING_STOCK = '10';
const PACKAGING_UNIT_COST = '0.5000';
const BATCH_STOCK = '100.0000';
const UNIT_COST = '10.0000';
const ORDER_QUANTITY = '3.0';
const PRESENTATION_CONTENT = '1';
const BASE_SEQUENCE = 900_000 + Math.floor(Math.random() * 90_000);

/** Ningun texto es subcadena de otro: cada «no aparece» mide un paso concreto. */
const OPERATOR_STEP_TEXT = `Operador mezcla en reactor ${SHORT_ID}`;
const PACKING_STEP_1_TEXT = `Envasado llenar bidones ${SHORT_ID}`;
const PACKING_STEP_1_ITEM = `Envasado comprobar sello ${SHORT_ID}`;
const PACKING_STEP_2_TEXT = `Envasado etiquetar lote ${SHORT_ID}`;
const PACKING_TEXTS = [PACKING_STEP_1_TEXT, PACKING_STEP_1_ITEM, PACKING_STEP_2_TEXT] as const;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc211-Admin-${RUN_ID.slice(0, 12)}`,
};
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc211-Operador-${RUN_ID.slice(0, 12)}`,
};
const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc211-Empacador-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [adminUser.username]: 'Administra',
  [operatorUser.username]: 'Operador',
  [empacadorUser.username]: 'Empacador',
};
const firstNames = `Qc211${SHORT_ID}`;

const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ENTER_TESTID = 'assigned-order-enter';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const STEP_READER_TESTID = 'step-reader';
const STEP_DOCUMENT_TESTID = 'step-reader-document';
const STEP_POSITION_TESTID = 'step-reader-position';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-1-0';
const STEP_BLOCKED_REASON_TESTID = 'step-reader-blocked-reason';
const STEP_WAIT_REASON_TESTID = 'step-reader-wait-reason';
const STEP_NEXT_TESTID = 'step-reader-next';
const STEP_FINISH_TESTID = 'step-reader-finish';
const PACKING_ORDERS_SECTION_TESTID = 'packing-orders-list-section';
const PACKING_ORDER_ROW_TESTID = 'packing-order-row';
const PACKING_ORDER_LINK_TESTID = 'packing-order-link';
const PACKING_ORDER_SCREEN_TESTID = 'packing-order-screen';
const PACKING_ORDER_STEPS_TESTID = 'packing-order-steps';
const PACKING_ORDER_START_BUTTON_TESTID = 'packing-order-start-button';
const PACKING_ORDER_FINISH_BUTTON_TESTID = 'packing-order-finish-button';
const PACKED_ORDER_NOTICE_TESTID = 'packed-order-notice';

/** La espera minima por paso de la pantalla de empaque. */
const PACKING_WAIT_MS = 5_000;

let companyId: string | null = null;
let productId: string | null = null;
let presentationId: string | null = null;
let packagingProductId: string | null = null;
let operatorUserId: string | null = null;
let empacadorUserId: string | null = null;
let workGroupId: string | null = null;

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

function packingRowByNumber(page: Page, numberText: string): Locator {
  return page
    .getByTestId(PACKING_ORDER_ROW_TESTID)
    .filter({
      has: page.getByTestId(PACKING_ORDER_LINK_TESTID).filter({ hasText: exactText(numberText) }),
    });
}

async function orderStatus(id: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  return order.status;
}

async function expectNoneOf(page: Page, texts: readonly string[]): Promise<void> {
  for (const text of texts) {
    await expect(page.getByText(text)).toHaveCount(0);
  }
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
      // La columna es `@default(pending)` y ese estado no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** El selector de producto busca en el servidor y pagina al llegar al final del scroll. */
async function selectProductByName(page: Page, testId: string, name: string): Promise<void> {
  const campo = page.getByTestId(testId);
  await campo.click();

  const option = page.getByTestId(`${testId}-option`).filter({ hasText: name });
  const popup = page.getByTestId(`${testId}-popup`);

  if ((await option.count()) === 0) {
    await campo.fill(name);
  }

  try {
    await option.first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    for (let intento = 0; intento < 10 && (await option.count()) === 0; intento += 1) {
      await popup.evaluate((lista) => {
        lista.scrollTop = lista.scrollHeight;
      });
      await page.waitForTimeout(500);
    }
    if ((await option.count()) === 0) {
      throw new Error(`producto "${name}" no aparecio en el selector`);
    }
  }

  await option.first().click();
}

/** WebKit hidrata tarde y la hidratacion repinta el campo vacio: se reintenta hasta que el valor queda. */
async function fillControlled(locator: Locator, value: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await locator.fill(value);
        return locator.inputValue();
      },
      { timeout: 60_000 },
    )
    .toBe(value);
}

/** TipTap devuelve el foco al editor en un `requestAnimationFrame`: teclear antes lo recibe el boton. */
async function pressToolbarAndAwaitFocus(button: Locator, editable: Locator): Promise<void> {
  await button.click();
  await expect(editable).toBeFocused({ timeout: 60_000 });
}

async function typeInEditor(page: Page, editable: Locator, text: string): Promise<void> {
  await expect(editable).toBeVisible({ timeout: 60_000 });
  await editable.click();
  await expect(editable).toBeFocused({ timeout: 60_000 });
  await page.keyboard.type(text);
}

test.beforeAll(async () => {
  const roles = new Map<string, string>();
  for (const roleName of [ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_ADMINISTRADOR]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(
        `falta el rol "${roleName}": este E2E no lo crea porque sus permisos son el dato bajo ` +
          'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
      );
    }
    roles.set(roleName, role.id);
  }

  // Huerfanos: el orden lo imponen las FK RESTRICT.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  if (orphanCompanyIds.length > 0) {
    const scope = { companyId: { in: orphanCompanyIds } };
    await prisma.reservationMovement.deleteMany({ where: scope });
    await prisma.inventoryMovement.deleteMany({ where: scope });
    await prisma.orderAssignment.deleteMany({ where: scope });
    await prisma.orderPresentationLine.deleteMany({ where: scope });
    await prisma.orderExecutionEntry.deleteMany({ where: scope });
    await prisma.order.deleteMany({ where: scope });
    await prisma.productBatch.deleteMany({ where: scope });
    const orphanRecipes = await prisma.recipe.findMany({ where: scope, select: { id: true } });
    const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);
    if (orphanRecipeIds.length > 0) {
      await prisma.product.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    }
    await prisma.recipe.deleteMany({ where: scope });
    await prisma.product.deleteMany({ where: scope });
    await prisma.presentation.deleteMany({ where: scope });
    await prisma.workGroupMember.deleteMany({ where: scope });
    await prisma.workGroup.deleteMany({ where: scope });
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

  await createUser(adminUser, roles.get(ROLE_ADMINISTRADOR)!);
  operatorUserId = await createUser(operatorUser, roles.get(ROLE_OPERADOR)!);
  empacadorUserId = await createUser(empacadorUser, roles.get(ROLE_EMPACADOR)!);

  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // `product_batches_check_unit` rechaza el lote si el producto no tiene ya unidad.
  productId = (
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

  presentationId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_NAME),
        unitId: unit.id,
        content: PRESENTATION_CONTENT,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      companyId,
      stock: BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: BATCH_LOT,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      createdBy: operatorUserId,
    },
    select: { id: true },
  });

  const packaging = await seedPackaging({
    companyId,
    name: PACKAGING_NAME,
    presentationId,
    stock: PACKAGING_STOCK,
    unitCost: PACKAGING_UNIT_COST,
    lot: PACKAGING_LOT,
    createdBy: operatorUserId,
  });
  packagingProductId = packaging.productId;

  workGroupId = (
    await prisma.workGroup.create({
      data: {
        name: WORK_GROUP_NAME,
        nameNormalized: normalizeWorkGroupName(WORK_GROUP_NAME),
        companyId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.workGroupMember.createMany({
    data: [
      { workGroupId, userId: operatorUserId, companyId },
      { workGroupId, userId: empacadorUserId, companyId },
    ],
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker: el otro navegador sigue corriendo.
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
    async () => {
      const recipes = await prisma.recipe.findMany({
        where: { name: RECIPE_NAME },
        select: { id: true },
      });
      const recipeIds = recipes.map((recipe) => recipe.id);
      if (recipeIds.length === 0) return;
      await prisma.product.deleteMany({ where: { recipeId: { in: recipeIds } } });
    },
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    byCompany((id) => prisma.product.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.presentation.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.workGroupMember.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.workGroup.deleteMany({ where: { companyId: id } })),
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

// `next dev` compila cada ruta en el primer `goto`, bcrypt tarda a proposito y hay esperas de 5 s.
test.setTimeout(300_000);

test.describe('pasos de envasado de punta a punta (R32)', () => {
  test('R32: el Administrador crea la formula con pasos de envasado, el operador no los ve, y el empacador los recorre tras Comenzar y termina sin ver los del operador', async ({
    page,
  }) => {
    expect(companyId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      companyId === null ||
      productId === null ||
      presentationId === null ||
      packagingProductId === null ||
      operatorUserId === null ||
      empacadorUserId === null ||
      workGroupId === null
    ) {
      return;
    }

    // --- 1. El Administrador crea la formula por el formulario.
    await loginAndLand(page, adminUser);
    await page.goto(NEW_RECIPE_ROUTE);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('recipe-packing-steps-field')).toBeVisible({ timeout: 60_000 });

    // Que aparezca la fila del paso acredita que React ya hidrato: antes, lo escrito se pierde.
    await page.getByTestId('recipe-step-add').click();
    const operatorEditable = page.getByTestId('recipe-step-text-0');
    await expect(operatorEditable).toBeVisible({ timeout: 60_000 });

    await fillControlled(page.getByTestId('recipe-field-name'), RECIPE_NAME);
    await selectProductByName(page, 'recipe-line-product-0', PRODUCT_NAME);
    await fillControlled(page.getByTestId('recipe-line-percentage-0'), '100');

    await typeInEditor(page, operatorEditable, OPERATOR_STEP_TEXT);

    // Primer paso de envasado: un parrafo y una lista de verificacion de un elemento.
    await page.getByTestId('recipe-packing-step-add').click();
    const packingEditable1 = page.getByTestId('recipe-packing-step-text-0');
    await typeInEditor(page, packingEditable1, PACKING_STEP_1_TEXT);
    await page.keyboard.press('Enter');
    const packingChecklistButton = page.getByTestId('recipe-packing-step-text-0-checklist');
    await pressToolbarAndAwaitFocus(packingChecklistButton, packingEditable1);
    await expect(packingChecklistButton).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type(PACKING_STEP_1_ITEM);
    await expect(packingEditable1.locator('li[data-type="taskItem"]')).toHaveCount(1);

    // Segundo paso de envasado: solo texto.
    await page.getByTestId('recipe-packing-step-add').click();
    await typeInEditor(page, page.getByTestId('recipe-packing-step-text-1'), PACKING_STEP_2_TEXT);

    await page.getByTestId('recipe-form-submit').click();
    await page.waitForURL((url) => url.pathname === FORMULAS_ROUTE, { timeout: 60_000 });

    const saved = await prisma.recipe.findFirst({
      where: { name: RECIPE_NAME, deletedAt: null },
      select: { id: true, steps: true, packingSteps: true },
    });
    expect(saved, 'la receta deberia existir en la base tras guardar').not.toBeNull();
    if (!saved) return;
    expect(Array.isArray(saved.steps) ? saved.steps.length : -1).toBe(1);
    expect(Array.isArray(saved.packingSteps) ? saved.packingSteps.length : -1).toBe(2);

    // --- 2. El pedido de esa formula, asignado al Operario por el equipo que tambien trae al
    // Empacador: Finalizar asigna al Empacador.
    const year = new Date().getUTCFullYear();
    const order = await prisma.order.create({
      data: {
        companyId,
        orderYear: year,
        orderSequence: BASE_SEQUENCE,
        recipeId: saved.id,
        quantity: ORDER_QUANTITY,
        unitId: (
          await prisma.unit.findFirstOrThrow({
            where: { nameNormalized: 'litro', companyId: null },
            select: { id: true },
          })
        ).id,
        presentationLines: {
          create: [
            {
              companyId,
              presentationId,
              packages: Math.floor(Number(ORDER_QUANTITY) / Number(PRESENTATION_CONTENT)),
              presentationContent: PRESENTATION_CONTENT,
              packagingProductId,
            },
          ],
        },
        // PENDIENTE: solo asi Entrar pide la confirmacion de comenzar.
        status: 'PENDIENTE',
      },
      select: { id: true },
    });
    const orderId = order.id;
    const orderNumber = formatOrderNumber({ year, sequence: BASE_SEQUENCE });
    await prisma.orderAssignment.create({
      data: {
        orderId,
        userId: operatorUserId,
        companyId,
        workGroupId,
        workGroupName: WORK_GROUP_NAME,
      },
    });

    // --- 3. El Operario ejecuta el pedido: ve su paso y ninguno de envasado.
    await page.context().clearCookies();
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const assignedRow = rowByNumber(page, orderNumber);
    await expect(assignedRow).toHaveCount(1, { timeout: 60_000 });
    expect(await orderStatus(orderId)).toBe('PENDIENTE');
    await clickAndConfirm(page, assignedRow.getByTestId(ENTER_TESTID), ASSIGNED_ORDER_START_CONFIRM_TESTID);
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(orderId), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(await orderStatus(orderId)).toBe('EN_CURSO');

    await expect(page.getByTestId(STEP_DOCUMENT_TESTID)).toContainText(OPERATOR_STEP_TEXT, {
      timeout: 60_000,
    });
    await expect(page.getByTestId(STEP_POSITION_TESTID)).toHaveText('Paso 1 de 1');
    await expectNoneOf(page, PACKING_TEXTS);

    await clickAndConfirm(page, page.getByTestId(STEP_FINISH_TESTID), ORDER_EXECUTION_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );
    expect(await orderStatus(orderId)).toBe('POR_EMPACAR');

    // --- 4. El Empacador abre el pedido POR_EMPACAR: sin pasos de envasado antes de Comenzar.
    await page.context().clearCookies();
    await loginAndLand(page, empacadorUser);
    await page.goto(`${ASSIGNED_ORDERS_ROUTE}?vista=por_empacar`);
    await expect(page.getByTestId(PACKING_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    const packingRow = packingRowByNumber(page, orderNumber);
    await expect(packingRow).toHaveCount(1, { timeout: 60_000 });
    await packingRow.getByTestId(PACKING_ORDER_LINK_TESTID).click();
    await page.waitForURL((url) => url.pathname === packingOrderRoute(orderId), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(PACKING_ORDER_SCREEN_TESTID)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId(PACKING_ORDER_START_BUTTON_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(PACKING_ORDER_STEPS_TESTID)).toHaveCount(0);
    await expectNoneOf(page, PACKING_TEXTS);
    await expectNoneOf(page, [OPERATOR_STEP_TEXT]);

    // --- 5. Comenzar (con su confirmacion) muestra el primer paso de envasado.
    await clickAndConfirm(page, page.getByTestId(PACKING_ORDER_START_BUTTON_TESTID), PACKING_ORDER_START_CONFIRM_TESTID);
    const steps = page.getByTestId(PACKING_ORDER_STEPS_TESTID);
    await expect(steps).toBeVisible({ timeout: 60_000 });
    expect(await orderStatus(orderId)).toBe('EN_EMPAQUE');

    // Con pasos de envasado, Terminar vive en el ultimo paso y no como boton suelto.
    await expect(page.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID)).toHaveCount(0);
    await expect(steps.getByTestId(STEP_READER_TESTID)).toHaveCount(1);
    await expect(steps.getByTestId(STEP_POSITION_TESTID)).toHaveText('Paso 1 de 2');
    await expect(steps.getByTestId(STEP_DOCUMENT_TESTID)).toContainText(PACKING_STEP_1_TEXT);
    await expect(steps.getByTestId(STEP_DOCUMENT_TESTID)).toContainText(PACKING_STEP_1_ITEM);
    await expect(page.getByText(PACKING_STEP_2_TEXT)).toHaveCount(0);
    await expectNoneOf(page, [OPERATOR_STEP_TEXT]);

    const next = steps.getByTestId(STEP_NEXT_TESTID);
    await expect(next).toBeDisabled();

    // Pasada la espera, el check sin marcar sigue bloqueando y su motivo se ve.
    await expect(steps.getByTestId(STEP_WAIT_REASON_TESTID)).toHaveCount(0, {
      timeout: PACKING_WAIT_MS + 30_000,
    });
    await expect(steps.getByTestId(STEP_BLOCKED_REASON_TESTID)).toBeVisible();
    await expect(next).toBeDisabled();

    const item = steps.getByTestId(STEP_CHECKLIST_ITEM_TESTID);
    await item.click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await expect(next).toBeEnabled();
    await next.click();

    // --- 6. El ultimo paso: Terminar bloqueado mientras corre la espera.
    await expect(steps.getByTestId(STEP_POSITION_TESTID)).toHaveText('Paso 2 de 2');

    // La espera dura 5 s desde que se muestra el paso: se comprueba antes que nada mas.
    const finish = steps.getByTestId(STEP_FINISH_TESTID);
    await expect(finish).toBeDisabled();
    await expect(steps.getByTestId(STEP_WAIT_REASON_TESTID)).toBeVisible();
    await expect(finish).toHaveText('Terminar');
    await expect(steps.getByTestId(STEP_NEXT_TESTID)).toHaveCount(0);

    await expect(steps.getByTestId(STEP_DOCUMENT_TESTID)).toContainText(PACKING_STEP_2_TEXT);
    await expect(page.getByText(PACKING_STEP_1_TEXT)).toHaveCount(0);
    await expectNoneOf(page, [OPERATOR_STEP_TEXT]);

    await expect(finish).toBeEnabled({ timeout: PACKING_WAIT_MS + 30_000 });

    // --- 7. Terminar desde el ultimo paso, con su confirmacion.
    await clickAndConfirm(page, finish, PACKING_ORDER_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(PACKED_ORDER_PARAM),
      { timeout: 60_000 },
    );
    expect(await orderStatus(orderId)).toBe('ENTREGADO');
    await expect(page.getByTestId(PACKED_ORDER_NOTICE_TESTID)).toContainText(orderNumber, {
      timeout: 60_000,
    });
  });
});
