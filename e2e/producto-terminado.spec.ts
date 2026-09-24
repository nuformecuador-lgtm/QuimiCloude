/**
 * E2E del producto terminado: dar contenido a una presentacion, crear y finalizar un pedido con
 * ella, y ver el lote nacer en Inventario, con su cambio de contenido posterior.
 *
 * EL RECORRIDO, en un solo `test()` -cada paso es la precondicion del siguiente, partirlo
 * obligaria a resembrar el estado de los anteriores-:
 *   1. el Administrador entra a Presentaciones y le pone contenido `1` a la presentacion del
 *      fixture, por la pantalla;
 *   2. crea un pedido de `50.5` con esa presentacion, DESPUES de ponerle el contenido, por la
 *      pantalla de Pedidos;
 *   3. se asigna al Operador por Prisma -la asignacion no es lo que este recorrido demuestra, mismo
 *      criterio que `e2e/reserva-de-material.spec.ts`- y el Operador lo entra y lo finaliza por el
 *      Finalizar de la planta en `/asignacion/[id]`;
 *   4. la confirmacion dice los envases enteros y el nombre del producto terminado;
 *   5. el Administrador entra a Inventario, pestana «Producto terminado», y ve el producto con su
 *      lote de 50 y «50 envases»;
 *   6. cambia el contenido de la presentacion a `2` y el lote sigue diciendo «50 envases»: los
 *      envases se calculan con el contenido GUARDADO en el lote, no con el vigente;
 *   7. el dialogo de ajuste del lote avisa que solo se admiten cantidades que restan.
 *
 * QUE APORTA SOBRE UNIT E INTEGRACION, que es lo unico que justifica su coste: la cadena entera
 * -presentaciones, pedidos, asignacion y inventario- contra un navegador real y Postgres, con las
 * Server Actions REALES de punta a punta. Cada pieza suelta ya tiene su propio E2E; este recorrido
 * es el que ata las cuatro pantallas en el orden que el producto terminado exige.
 *
 * DATOS: `products`, `presentations`, `orders` y `recipes` son tablas compartidas y Chromium/WebKit
 * corren a la vez sobre la misma base, igual que el resto de la suite. Por eso, con el mismo patron
 * ya asentado:
 *  - todo lo que este archivo crea lleva el prefijo `qc150_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts filtran siempre por ESE producto, ESA presentacion o ESE correlativo, nunca por
 *    «la primera fila»;
 *  - la limpieza defensiva de huerfanos borra por prefijo Y POR EDAD;
 *  - `afterAll` borra siempre, aunque un paso reviente, en el orden que imponen las FK.
 *
 * SEMBRADO POR PRISMA lo que no es el objeto de este recorrido: la empresa, los dos usuarios, la
 * unidad (una del catalogo arrancador, nunca creada ni borrada aqui), el producto ingrediente con
 * lote suficiente para los 50.5 del pedido, y la receta de una sola linea al cien por cien con un
 * paso con su lista de verificacion -`StepReader` sin pasos no pinta boton de Finalizar-. La
 * presentacion SI se siembra por Prisma, pero SIN contenido: dárselo es el primer paso del
 * recorrido, por la pantalla.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import { normalizeCompanyName, ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  DELIVERED_ORDER_PARAM,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  assignedOrderRoute,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc150_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y puede haber otro worktree corriendo su propio E2E. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const LIST_PAGE_SIZE = '25';
const SEARCH_PARAM = 'q';
const PAGE_SIZE_PARAM = 'pageSize';

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const PRODUCT_NAME = `${SHARED_TOKEN}_ingrediente`;
/** Lleva «Botella 1L» a proposito, para que el nombre del recorrido se lea con sentido. */
const PRESENTATION_NAME = `${SHARED_TOKEN}_Botella 1L`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;

/** Muy por encima de `ORDER_QUANTITY`: la entrega debe alcanzar sin agotar el lote del ingrediente. */
const BATCH_STOCK = '200.0000';
const UNIT_COST = '10.0000';

/** `50.5 / 1` da 50 envases enteros y 50 de cantidad: el 0.5 sobrante no entra. */
const ORDER_QUANTITY = '50.5';
const PRESENTATION_CONTENT_INITIAL = '1';
/** El contenido cambia DESPUES del Finalizar: el lote ya guarda el suyo propio. */
const PRESENTATION_CONTENT_CHANGED = '2';
const EXPECTED_PACKAGES_LABEL = '50 envases';

const RECIPE_STEPS: readonly RecipeStepDocument[] = [
  {
    blocks: [
      {
        kind: 'checklist',
        items: [{ spans: [{ text: `${SHARED_TOKEN}_verificar_lote` }] }],
      },
    ],
  },
];

const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_FINISH_TESTID = 'step-reader-finish';
const DELIVERED_NOTICE_TESTID = 'assigned-order-delivered-notice';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const NAME_CELL_TESTID = 'data-table-cell-name';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc150-Admin-${RUN_ID.slice(0, 12)}`,
};

/**
 * Sin `pedidos.consultar`: solo asi `/asignacion` muestra la vista «Mis asignados», con columna
 * «Entrar» (`assignment-views.ts`). Con `pedidos.consultar` -como el admin de arriba- la pantalla
 * fuerza «Todos», que no tiene ni «Entrar» ni Finalizar.
 */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc150-Operador-${RUN_ID.slice(0, 12)}`,
};

let companyId: string | null = null;
let productId: string | null = null;
let recipeId: string | null = null;
let presentationId: string | null = null;
let adminUserId: string | null = null;
let operatorUserId: string | null = null;

/** Igualdad EXACTA de texto: un correlativo o un nombre no puede casar con el prefijo de otro. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * Igualdad del nombre de producto EN LA CELDA de la tabla, que puede llevar la unidad anadida
 * detras (`productDisplayName`, `product-columns.tsx > nameCell`): «nombre · simbolo». Se exige
 * el nombre completo y exacto al principio -sigue sin poder casar con el prefijo de otro-, con un
 * sufijo de unidad opcional, nunca un sufijo cualquiera.
 */
function exactProductNameCellText(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}(?:\\s*·\\s*\\S.*)?\\s*$`);
}

function ordersUrl(): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

function presentationsUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${PRESENTATIONS_ROUTE}?${query.toString()}`;
}

function inventoryUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${INVENTORY_ROUTE}?${query.toString()}`;
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
      firstNames: `Qc150${RUN_ID.slice(0, 8)}`,
      lastNames: 'ProductoTerminado',
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

/** Le pone -o le cambia- el contenido a la presentacion del fixture, por la pantalla. */
async function setPresentationContent(page: Page, content: string): Promise<void> {
  await page.goto(presentationsUrl(PRESENTATION_NAME));
  await expect(page.getByTestId('presentaciones-title')).toBeVisible({ timeout: 60_000 });

  const rowActions = page.locator(`[data-presentation-id="${presentationId}"]`);
  await expect(rowActions).toBeVisible({ timeout: 60_000 });
  await rowActions.getByTestId('presentation-action-edit').click();
  await expect(page.getByTestId('presentation-sheet')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('presentation-field-content').fill(content);
  await page.getByTestId('presentation-form-submit').click();
  await expect(page.getByTestId('presentation-sheet')).toHaveCount(0, { timeout: 60_000 });
}

/** Crea un pedido de `quantity` para la receta y la presentacion del fixture, por la pantalla. */
async function createOrder(page: Page, quantity: string): Promise<void> {
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
  await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });
}

/** Abre el panel de lotes del producto terminado del fixture, ya en la pestana correcta. */
async function openFinishedGoodsBatchesPanel(page: Page, productName: string): Promise<Locator> {
  await page.goto(inventoryUrl(SHARED_TOKEN));
  await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('tab', { name: 'Producto terminado' }).click();
  await page.waitForFunction(
    () => new URL(window.location.href).searchParams.get('type') === 'FINISHED_PRODUCT',
    undefined,
    { timeout: 60_000 },
  );

  const nameCell = page
    .getByTestId(NAME_CELL_TESTID)
    .filter({ hasText: exactProductNameCellText(productName) });
  await expect(nameCell).toHaveCount(1, { timeout: 60_000 });

  const row = page
    .locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`)
    .filter({ has: nameCell });
  await row.getByTestId('product-batches-open').click();
  await expect(page.getByTestId('product-batches-sheet')).toBeVisible({ timeout: 60_000 });

  return page.getByTestId('product-batches-sheet');
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  // Una receta huerfana puede venir por su propio nombre (edad de la receta) o por colgar de
  // una empresa ya huerfana: los productos terminados de esa empresa restringen su borrado, asi
  // que ambos conjuntos se juntan ANTES de tocar `productBatch`/`product` de mas abajo.
  const orphanRecipesByName = await prisma.recipe.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRecipesByCompany =
    orphanCompanyIds.length > 0
      ? await prisma.recipe.findMany({
          where: { companyId: { in: orphanCompanyIds } },
          select: { id: true },
        })
      : [];
  const orphanRecipeIds = Array.from(
    new Set([...orphanRecipesByName, ...orphanRecipesByCompany].map((recipe) => recipe.id)),
  );

  if (orphanCompanyIds.length > 0) {
    await prisma.reservationMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // Todos los lotes de la empresa huerfana, del producto de formula y del terminado: sus
    // movimientos ya cayeron arriba, y sin lotes ningun producto queda restringido por ellos.
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  if (orphanRecipeIds.length > 0) {
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    // El producto terminado (`products.recipe_id`) RESTRINGE el borrado de la receta: se borra
    // antes que la receta. El producto de la formula (`recipe_lines.product_id`) es al reves y
    // se borra DESPUES, cuando la receta ya cayo y se llevo sus lineas por cascada.
    const orphanFinishedProducts = await prisma.product.findMany({
      where: { recipeId: { in: orphanRecipeIds } },
      select: { id: true },
    });
    const orphanFinishedProductIds = orphanFinishedProducts.map((product) => product.id);
    if (orphanFinishedProductIds.length > 0) {
      await prisma.inventoryMovement.deleteMany({
        where: { batch: { productId: { in: orphanFinishedProductIds } } },
      });
      await prisma.productBatch.deleteMany({ where: { productId: { in: orphanFinishedProductIds } } });
      await prisma.product.deleteMany({ where: { id: { in: orphanFinishedProductIds } } });
    }
    await prisma.recipe.deleteMany({ where: { id: { in: orphanRecipeIds } } });
  }
  if (orphanCompanyIds.length > 0) {
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
  if (!adminRole) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": siembra la base con \`pnpm run db:seed\` antes de ` +
        'correr `pnpm run e2e`.',
    );
  }
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!operatorRole) {
    throw new Error(
      `falta el rol "${ROLE_OPERADOR}": siembra la base con \`pnpm run db:seed\` antes de correr ` +
        '`pnpm run e2e`.',
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

  // Una de las unidades del catalogo arrancador, nunca creada ni borrada por este archivo.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // `products.unit_id` se fija a mano: el disparador que valida el lote de mas abajo exige que el
  // producto ya tenga unidad.
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

  // SIN contenido: darselo por la pantalla es el primer paso del recorrido.
  const presentation = await prisma.presentation.create({
    data: {
      name: PRESENTATION_NAME,
      nameNormalized: normalizePresentationName(PRESENTATION_NAME),
      unitId: unit.id,
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  const batch = await prisma.productBatch.create({
    data: {
      productId,
      presentationId: presentation.id,
      companyId,
      stock: BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: BATCH_LOT,
      purchaseDate,
      createdBy: adminUserId,
    },
    select: { id: true },
  });

  await prisma.inventoryMovement.create({
    data: {
      batchId: batch.id,
      kind: 'opening',
      quantity: BATCH_STOCK,
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
        lines: { create: [{ productId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  const scopedCompanyId = companyId;
  const scopedRecipeId = recipeId;
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
    // Todos los lotes primero, del producto de la receta y del terminado que Finalizar da de
    // alta: `product_batches.product_id` -> `products` RESTRINGE, y a esta altura ya no queda
    // ningun movimiento que restrinja el borrado del lote.
    () =>
      scopedCompanyId
        ? prisma.productBatch.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    // El producto terminado que Finalizar da de alta (`products.recipe_id`) RESTRINGE el borrado
    // de la receta: se borra el terminado ANTES de la receta, y el producto de la formula
    // DESPUES -`recipe_lines.product_id` lo restringe hasta que la receta cae por cascada.
    () =>
      scopedRecipeId
        ? prisma.product.deleteMany({ where: { recipeId: scopedRecipeId } })
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

test.describe('producto terminado', () => {
  test('R37 - dar contenido a la presentacion, finalizar un pedido con ella y ver el lote entrar en Inventario, sin que un cambio de contenido posterior lo altere', async ({
    page,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(presentationId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (recipeId === null || presentationId === null) return;

    await loginAndLand(page, adminUser);

    // --- 1. El contenido de la presentacion, por la pantalla.
    await setPresentationContent(page, PRESENTATION_CONTENT_INITIAL);

    // --- 2. El pedido, DESPUES de darle contenido a la presentacion: el pedido copia ese
    // contenido al crearlo.
    await createOrder(page, ORDER_QUANTITY);
    const order = await prisma.order.findFirstOrThrow({
      where: { recipeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderYear: true, orderSequence: true, presentationContent: true },
    });
    const orderNumber = formatOrderNumber({
      year: order.orderYear,
      sequence: order.orderSequence,
    });
    // Igualdad NUMERICA, no de texto: el valor vuelve de un `DECIMAL(14,4)` y como se serialicen
    // sus ceros de relleno es cosa de la libreria, no del dato.
    expect(
      order.presentationContent?.equals(PRESENTATION_CONTENT_INITIAL) ?? false,
      'el pedido deberia copiar el contenido de la presentacion al crearse (R38)',
    ).toBe(true);

    // --- 3. Se asigna al Operador por Prisma: la asignacion no es lo que este recorrido demuestra
    // (mismo criterio que `e2e/reserva-de-material.spec.ts`).
    await prisma.orderAssignment.create({
      data: { orderId: order.id, userId: operatorUserId!, companyId: companyId! },
    });

    await page.context().clearCookies();
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const assignedRow = rowByNumber(page, orderNumber);
    await expect(assignedRow).toHaveCount(1, { timeout: 60_000 });
    await assignedRow.getByTestId('assigned-order-enter').click();
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(order.id), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 4. Finalizar por el Finalizar de la planta.
    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await page.getByTestId(STEP_FINISH_TESTID).click();
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    const deliveredOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(deliveredOrder.status).toBe('ENTREGADO');

    const finishedProductName = `${RECIPE_NAME} · ${PRESENTATION_NAME}`;

    // La confirmacion dice los envases enteros y el nombre del producto terminado.
    const aviso = page.getByTestId(DELIVERED_NOTICE_TESTID);
    await expect(aviso).toBeVisible({ timeout: 60_000 });
    await expect(aviso).toContainText(orderNumber);
    await expect(aviso).toContainText(EXPECTED_PACKAGES_LABEL);
    await expect(aviso).toContainText(finishedProductName);

    // El producto terminado nacio de verdad, no solo lo dice la pantalla.
    const finishedProduct = await prisma.product.findFirstOrThrow({
      where: { companyId: companyId!, type: 'FINISHED_PRODUCT', recipeId, presentationId },
      select: { id: true, name: true },
    });
    expect(finishedProduct.name).toBe(finishedProductName);

    // --- 5. Inventario, pestana «Producto terminado»: el producto con su lote de 50 y «50
    // envases».
    await page.context().clearCookies();
    await loginAndLand(page, adminUser);

    let batchesSheet = await openFinishedGoodsBatchesPanel(page, finishedProductName);
    const batchRow = batchesSheet.locator('[data-testid^="product-batch-"]').first();
    await expect(batchRow.getByTestId('product-batch-quantity')).toContainText('50');
    await expect(batchRow.getByTestId('product-batch-packages')).toHaveText(EXPECTED_PACKAGES_LABEL);

    // --- 6. Cambiar el contenido de la presentacion a 2: el lote guarda el SUYO propio, no el
    // vigente de la presentacion.
    await setPresentationContent(page, PRESENTATION_CONTENT_CHANGED);

    batchesSheet = await openFinishedGoodsBatchesPanel(page, finishedProductName);
    const batchRowAfter = batchesSheet.locator('[data-testid^="product-batch-"]').first();
    await expect(batchRowAfter.getByTestId('product-batch-quantity')).toContainText('50');
    await expect(batchRowAfter.getByTestId('product-batch-packages')).toHaveText(
      EXPECTED_PACKAGES_LABEL,
    );

    // --- 7. El dialogo de ajuste del lote avisa que solo se admiten cantidades que restan.
    await batchRowAfter.getByTestId('adjust-batch-open').click();
    await expect(page.getByTestId('adjust-batch-dialog')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('adjust-batch-finished-product-notice')).toHaveText(
      'Solo se admiten ajustes que restan.',
    );
  });
});
