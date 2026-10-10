/**
 * E2E del recorrido completo de la reserva de material: dos pedidos compiten por el mismo lote,
 * cancelar libera, reeditar vuelve a apartar y entregar consume, todo por la UI de Pedidos y de
 * Inventario contra Postgres.
 *
 * Un unico `test()`: los pasos son secuenciales -el segundo pedido depende del primero, cancelar
 * depende de los dos, reeditar depende de cancelar, y entregar depende de reeditar- y partirlos en
 * varios casos obligaria a repetir el sembrado o a que cada caso adivine el estado que dejo el
 * anterior.
 *
 * LOS ASERTOS DE ESTADO FINAL SE LEEN DE LA BASE: la pantalla podria mostrar algo que ya no es
 * cierto. Los aserctos de cantidades se leen de la PANTALLA, porque es justo lo que el recorrido
 * tiene que demostrar -que la pantalla pinta lo que la base guarda-, siempre por `data-testid` y
 * nunca por posicion.
 *
 * EL PASO FINAL ENTREGA B POR EL FINALIZAR DE LA PLANTA (asignar, iniciar y finalizar), no por la
 * edicion en Pedidos: la edicion ya no mueve el estado del pedido. El patron -y sus
 * selectores/`data-testid`- es el mismo que
 * `e2e/ejecucion-receta.spec.ts`: quien entra a `/asignacion` y finaliza necesita
 * `asignaciones.consultar` SIN `pedidos.consultar` -con `pedidos.consultar` la pantalla muestra
 * «Todos», que no tiene columna «Entrar»-, asi que este recorrido crea tambien un Operador real
 * del seed y cambia de actor solo para ese tramo. La receta del fixture lleva ademas un paso, con
 * su lista de verificacion, porque `StepReader` sin pasos no pinta boton de Finalizar.
 *
 * DATOS: `products`, `orders`, `recipes` y `units` son tablas compartidas y varios
 * proyectos/worktrees pueden correr a la vez sobre la misma base. Por eso, con el mismo patron ya
 * asentado en el resto de la suite:
 *  - todo lo que este archivo crea lleva el prefijo `qc141_e2e_` y dentro el `RUN_ID` del worker;
 *  - los aserctos filtran siempre por el producto, el correlativo o el lote de ESTE worker, nunca
 *    por «la primera fila»;
 *  - la limpieza defensiva de huerfanos borra por prefijo Y POR EDAD, para no llevarse por delante
 *    una ejecucion viva de otro proyecto o de otro worktree;
 *  - `afterAll` borra siempre, aunque un paso reviente, en el orden que imponen las FK: los dos
 *    libros de movimientos antes que los pedidos y los lotes, y estos antes que el producto y la
 *    presentacion.
 *
 * SEMBRADO POR PRISMA: el producto, su unidad, su presentacion, su lote y la receta de una sola
 * linea al cien por cien no se dan de alta por la pantalla -cada catalogo tiene su propio E2E-, tal
 * como ya hacen los recorridos vecinos de esta misma suite. Los PEDIDOS si se crean, editan,
 * cancelan y entregan por la UI de Pedidos: es lo que este recorrido demuestra.
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
  assignedOrderRoute,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import {
  clickAndConfirm,
  ASSIGNED_ORDER_START_CONFIRM_TESTID,
  ORDER_EXECUTION_FINISH_CONFIRM_TESTID,
} from './helpers/confirm-dialog';
import { addPackagingLine, openOrderRowMenu, rowMenuTrigger } from './helpers/order-distribution';
import { seedPackaging } from './helpers/packaging';
import { openRowActionsMenuItem } from './helpers/row-actions-menu';

const FIXTURE_PREFIX = 'qc141_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y puede haber otro worktree corriendo su propio E2E. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const LIST_PAGE_SIZE = '25';
const ORDERS_SORT = 'createdAt:desc';
/** Mismos nombres de parametro que declara la pantalla de inventario. */
const INVENTORY_PAGE_SIZE_PARAM = 'pageSize';
const INVENTORY_SEARCH_PARAM = 'q';

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;
/** El envase del reparto. Su nombre no contiene `PRODUCT_NAME`: la busqueda de Inventario no lo trae. */
const PACKAGING_NAME = `${SHARED_TOKEN}_envase`;
const PACKAGING_LOT = `${SHARED_TOKEN}_lote_envase`;
/** Envases de sobra para los dos pedidos a la vez: lo que compite es la materia prima. */
const PACKAGING_STOCK = '5000';
const PACKAGING_UNIT_COST = '0.1000';

/** La existencia del unico lote: suficiente para uno de los dos pedidos, no para los dos juntos. */
const BATCH_STOCK = '2000.0000';
const UNIT_COST = '10.0000';

/** La cantidad de cada pedido: exactamente lo que una receta al cien por cien necesita del lote. */
const ORDER_QUANTITY = '1500';

/** Divide `ORDER_QUANTITY` en envases enteros: Finalizar exige contenido para dar de alta el lote. */
const PRESENTATION_CONTENT = '1';

const CANCELLATION_REASON = `Cancelado por el E2E ${RUN_ID}`;

/**
 * El unico paso de la receta del fixture, con una lista de verificacion: `StepReader` sin pasos
 * no pinta boton de Finalizar (`step-reader.tsx`), y el Finalizar de la planta es justo lo que
 * este tramo demuestra.
 */
const RECIPE_STEPS: readonly RecipeStepDocument[] = [
  {
    blocks: [
      {
        kind: 'checklist',
        items: [{ spans: [{ text: `${SHARED_TOKEN}_verificar_reactor` }] }],
      },
    ],
  },
];

/** Testids del tramo de Finalizar, mismo patron que `e2e/ejecucion-receta.spec.ts`. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_FINISH_TESTID = 'step-reader-finish';
const DELIVERED_NOTICE_TESTID = 'assigned-order-delivered-notice';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc141-Admin-${RUN_ID.slice(0, 12)}`,
};

/**
 * Sin `pedidos.consultar`: solo asi `/asignacion` muestra la vista «Mis asignados», con columna
 * «Entrar» (`assignment-views.ts`). Con `pedidos.consultar` -como el admin de arriba- la pantalla
 * fuerza «Todos», que no tiene ni «Entrar» ni Finalizar.
 */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc141-Operador-${RUN_ID.slice(0, 12)}`,
};

let companyId: string | null = null;
let productId: string | null = null;
let batchId: string | null = null;
let recipeId: string | null = null;
let presentationId: string | null = null;
let unitId: string | null = null;
let packagingId: string | null = null;
let adminUserId: string | null = null;
let operatorUserId: string | null = null;

function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: ORDERS_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

function inventoryUrl(search: string): string {
  const query = new URLSearchParams({
    [INVENTORY_PAGE_SIZE_PARAM]: LIST_PAGE_SIZE,
    [INVENTORY_SEARCH_PARAM]: search,
  });
  return `${INVENTORY_ROUTE}?${query.toString()}`;
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

/** Rellena y envia el alta de un pedido de `quantity` para la receta y la presentacion del fixture. */
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

  await page.getByTestId('order-field-quantity').fill(quantity);
  await page.getByTestId('order-form').getByTestId('presentation-unit-select').click();
  await page.locator(`[data-testid="presentation-unit-option"][data-value="${unitId}"]`).click();

  // Toda la cantidad en una sola linea: con contenido 1, un envase por unidad del pedido.
  const distribution = page.getByTestId('order-distribution-field');
  await addPackagingLine(
    page,
    page.getByTestId('order-form'),
    { productId: packagingId ?? '', name: PACKAGING_NAME },
    quantity,
  );
  await expect(distribution.getByTestId('order-distribution-available')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 60_000 },
  );

  await page.getByTestId('order-form-submit').click();
}

/** Crea un pedido que alcanza: se guarda sin aviso y el formulario se cierra. */
async function createOrder(page: Page, quantity: string): Promise<void> {
  await submitNewOrder(page, quantity);
  await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });
}

/** Crea un pedido que no alcanza: el alta pide confirmacion y se guarda bloqueado. */
async function createBlockedOrder(page: Page, quantity: string): Promise<void> {
  await submitNewOrder(page, quantity);
  const dialog = page.getByTestId('blocked-order-dialog');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId('blocked-order-confirm').click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });
}

/** Abre la edicion de un pedido, ya localizado por su correlativo. */
async function openEdit(page: Page, numberText: string): Promise<void> {
  await page.goto(ordersUrl());
  const row = await findOrderRow(page, numberText);
  // La fila llega pintada por el servidor: en WebKit un clic antes de hidratar se pierde sin
  // abrir el formulario, asi que se reintenta hasta que aparece.
  await expect(async () => {
    await (await openOrderRowMenu(page, rowMenuTrigger(row), 'order-action-edit')).click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

/** La cobertura de un pedido, leida de su fila («Apartado», «Sin apartar»). */
async function coverageOf(page: Page, numberText: string): Promise<string | null> {
  await page.goto(ordersUrl());
  const row = await findOrderRow(page, numberText);
  return row.getByTestId('order-coverage').getAttribute('data-coverage');
}

/** El total, lo reservado y lo disponible del producto del fixture, leidos de su fila. */
async function inventoryRow(page: Page): Promise<Locator> {
  await page.goto(inventoryUrl(PRODUCT_NAME));
  await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });
  const row = page.locator('[data-testid^="data-table-row-"]').filter({
    has: page.getByTestId('product-stock'),
  });
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  return row;
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc141${RUN_ID.slice(0, 8)}`,
      lastNames: 'Reserva',
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
    await prisma.orderPresentationLine.deleteMany({
      where: { companyId: { in: orphanCompanyIds } },
    });
    await prisma.orderExecutionEntry.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // Todos los lotes de la empresa huerfana, del producto de formula y del terminado: sus
    // movimientos ya cayeron arriba, y sin lotes ningun producto queda restringido por ellos.
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  if (orphanRecipeIds.length > 0) {
    await prisma.orderPresentationLine.deleteMany({
      where: { order: { recipeId: { in: orphanRecipeIds } } },
    });
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

  // El rol REAL del seed, nunca un fixture: es el unico que ve la columna «Entrar» de
  // `/asignacion` (mismo motivo que `e2e/ejecucion-receta.spec.ts`).
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
  unitId = unit.id;

  // `products.unit_id` se fija a mano: el disparador que valida el lote de mas abajo exige que el
  // producto ya tenga unidad antes de insertarlo.
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

  const presentation = await prisma.presentation.create({
    data: {
      name: PRESENTATION_NAME,
      nameNormalized: normalizePresentationName(PRESENTATION_NAME),
      unitId: unit.id,
      // Sin contenido, Finalizar rechaza con `presentation_without_content`.
      content: PRESENTATION_CONTENT,
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
  batchId = batch.id;

  await prisma.inventoryMovement.create({
    data: {
      batchId,
      kind: 'opening',
      quantity: BATCH_STOCK,
      reason: null,
      companyId,
      createdBy: adminUserId,
      createdAt: purchaseDate,
    },
  });

  packagingId = (
    await seedPackaging({
      companyId,
      name: PACKAGING_NAME,
      presentationId: presentation.id,
      stock: PACKAGING_STOCK,
      unitCost: PACKAGING_UNIT_COST,
      lot: PACKAGING_LOT,
      createdBy: adminUserId,
    })
  ).productId;

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
      scopedCompanyId
        ? prisma.orderPresentationLine.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId ? prisma.orderExecutionEntry.deleteMany({ where: { companyId: scopedCompanyId } }) : Promise.resolve(),
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

test.describe('reserva de material del pedido', () => {
  test('R48 - dos pedidos compiten por el mismo lote, cancelar libera, reeditar vuelve a apartar y entregar consume', async ({
    page,
  }) => {
    expect(recipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(presentationId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(batchId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (recipeId === null || presentationId === null || batchId === null) return;

    await loginAndLand(page, adminUser);

    // --- 1. Pedido A, de 1.500: el lote tiene 2.000 y le sobra para cubrirlo entero.
    await createOrder(page, ORDER_QUANTITY);
    const orderA = await prisma.order.findFirstOrThrow({
      where: { recipeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderYear: true, orderSequence: true },
    });
    const orderANumber = formatOrderNumber({
      year: orderA.orderYear,
      sequence: orderA.orderSequence,
    });

    // `OrderSheet.handleSaved` llama a `router.refresh()` al cerrar el formulario: si el `goto`
    // de mas abajo sale antes de que ese refresco termine, WebKit lo interrumpe («another
    // navigation to /pedidos»). Esperar a que la fila de A aparezca en la lista -todavia en esta
    // misma pagina, sin navegar- es la senal de que el refresco ya se aplico.
    await expect(rowByNumber(page, orderANumber)).toBeVisible({ timeout: 60_000 });

    // --- 2. Inventario refleja el apartado de A: 1.500 reservado, 500 disponible del total de 2.000.
    let productRow = await inventoryRow(page);
    await expect(productRow.getByTestId('product-stock')).toContainText('2000');
    await expect(productRow.getByTestId('product-reserved')).toContainText('1500');
    await expect(productRow.getByTestId('product-available')).toContainText('500');

    expect(await coverageOf(page, orderANumber)).toBe('full');

    // --- 3. Pedido B, de 1.500 tambien: solo quedan 500 disponibles, asi que no alcanza y no
    // aparta nada -ni siquiera parcialmente-, y lo de A sigue intacto. Un alta que no alcanza ya
    // no se guarda sin mas: pide confirmacion y queda BLOQUEADO.
    await createBlockedOrder(page, ORDER_QUANTITY);
    const orderB = await prisma.order.findFirstOrThrow({
      where: { recipeId, deletedAt: null, id: { not: orderA.id } },
      select: { id: true, orderYear: true, orderSequence: true, status: true },
    });
    expect(orderB.status).toBe('BLOQUEADO');
    expect(await prisma.reservationMovement.count({ where: { orderId: orderB.id } })).toBe(0);
    const orderBNumber = formatOrderNumber({
      year: orderB.orderYear,
      sequence: orderB.orderSequence,
    });

    // Mismo motivo que con A: la fila de B recien creada es la senal de que el refresco del
    // formulario ya se aplico, antes de navegar a Inventario.
    await expect(rowByNumber(page, orderBNumber)).toBeVisible({ timeout: 60_000 });

    productRow = await inventoryRow(page);
    await expect(productRow.getByTestId('product-reserved')).toContainText('1500');
    await expect(productRow.getByTestId('product-available')).toContainText('500');

    expect(await coverageOf(page, orderBNumber)).toBe('none');

    // --- 4. Cancelar A libera todo lo que tenia apartado: el lote vuelve a estar libre entero.
    await page.goto(ordersUrl());
    const rowA = await findOrderRow(page, orderANumber);
    await (await openOrderRowMenu(page, rowMenuTrigger(rowA), 'order-action-cancel')).click();
    await expect(page.getByTestId('cancel-order-dialog')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('cancel-order-reason').fill(CANCELLATION_REASON);
    await page.getByTestId('cancel-order-confirm').click();
    await expect(page.getByTestId('cancel-order-dialog')).toHaveCount(0, { timeout: 60_000 });

    // `CancelOrderDialog` tambien cierra y LUEGO llama a `router.refresh()`: la misma fila de A,
    // sin navegar, es la senal de que el estado nuevo ya llego antes del `goto` de Inventario.
    await expect(rowA.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELADO', {
      timeout: 60_000,
    });

    productRow = await inventoryRow(page);
    await expect(productRow.getByTestId('product-reserved')).toContainText('0');
    await expect(productRow.getByTestId('product-available')).toContainText('2000');

    // --- 5. Reeditar B, sin tocar ningun campo, recalcula lo apartado desde cero: con el lote
    // libre entero, ahora si alcanza, asi que se guarda sin aviso y sale de BLOQUEADO.
    await openEdit(page, orderBNumber);
    await page.getByTestId('order-form-submit').click();
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

    const reeditedOrderB = await prisma.order.findUniqueOrThrow({
      where: { id: orderB.id },
      select: { status: true },
    });
    expect(reeditedOrderB.status).toBe('PENDIENTE');

    // Reeditar tambien cierra el formulario y despues llama a `router.refresh()`
    // (`OrderSheet.handleSaved`): la cobertura nueva en la fila de B -sin navegar, `openEdit` ya
    // nos dejo en `ordersUrl()`- es la senal de que el refresco termino antes del `goto` que hace
    // `coverageOf`.
    await expect(rowByNumber(page, orderBNumber).getByTestId('order-coverage')).toHaveAttribute(
      'data-coverage',
      'full',
      { timeout: 60_000 },
    );

    expect(await coverageOf(page, orderBNumber)).toBe('full');

    productRow = await inventoryRow(page);
    await expect(productRow.getByTestId('product-reserved')).toContainText('1500');
    await expect(productRow.getByTestId('product-available')).toContainText('500');

    // --- 6. Finalizar B por el Finalizar de la planta -consume el material apartado y lo deja
    // «por empacar»-: la edicion en Pedidos ya no mueve el estado. Se asigna B al Operador por
    // Prisma -mismo patron que
    // `e2e/ejecucion-receta.spec.ts`, la asignacion no es lo que este recorrido demuestra-, y de
    // ahi en mas el actor cambia al Operador: con `pedidos.consultar` -como el admin de arriba-
    // `/asignacion` fuerza la vista «Todos», sin columna «Entrar» ni Finalizar.
    await prisma.orderAssignment.create({
      data: { orderId: orderB.id, userId: operatorUserId!, companyId: companyId! },
    });

    // Con la sesion del admin viva, `/login` redirige fuera y el formulario no aparece: se
    // vacia el frasco de cookies antes de entrar como Operador.
    await page.context().clearCookies();
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const assignedRowB = rowByNumber(page, orderBNumber);
    await expect(assignedRowB).toHaveCount(1, { timeout: 60_000 });
    await clickAndConfirm(page, assignedRowB.getByTestId(ASSIGNED_ORDER_ENTER_TESTID), ASSIGNED_ORDER_START_CONFIRM_TESTID);
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(orderB.id), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Entrar ya deja el pedido EN_CURSO, y eso se lee EN BASE, no en la pantalla.
    const startedOrderB = await prisma.order.findUniqueOrThrow({
      where: { id: orderB.id },
      select: { status: true },
    });
    expect(startedOrderB.status).toBe('EN_CURSO');

    // El unico paso de la receta del fixture: bloqueado hasta marcar su lista de verificacion.
    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await clickAndConfirm(page, page.getByTestId(STEP_FINISH_TESTID), ORDER_EXECUTION_FINISH_CONFIRM_TESTID);
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    // Finalizar deja el pedido «por empacar», no «entregado»: el consumo de material -que este
    // recorrido demuestra- ya ocurrio en esa misma operacion.
    const deliveredOrderB = await prisma.order.findUniqueOrThrow({
      where: { id: orderB.id },
      select: { status: true },
    });
    expect(deliveredOrderB.status).toBe('POR_EMPACAR');

    const aviso = page.getByTestId(DELIVERED_NOTICE_TESTID);
    await expect(aviso).toBeVisible({ timeout: 60_000 });
    await expect(aviso).toContainText(orderBNumber);
    await expect(aviso).toContainText('por empacar');

    // El Operador tiene `inventario.consultar`: no hace falta volver a entrar como admin para
    // leer Inventario ni el historial del lote.
    productRow = await inventoryRow(page);
    await expect(productRow.getByTestId('product-stock')).toContainText('500');
    await expect(productRow.getByTestId('product-reserved')).toContainText('0');
    await expect(productRow.getByTestId('product-available')).toContainText('500');

    // --- 7. El historial del lote guarda tanto el consumo de la reserva como la salida real.
    await (
      await openRowActionsMenuItem(
        page,
        productRow.getByTestId('product-row-actions'),
        'product-batches-open',
      )
    ).click();
    await expect(page.getByTestId('product-batches-sheet')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`product-batch-${batchId}`)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('batch-history-trigger').click();
    await expect(page.getByTestId('batch-history-list')).toBeVisible({ timeout: 60_000 });

    const historyList = page.getByTestId('batch-history-list');
    const consumeEntry = historyList.locator('li').filter({ hasText: 'Consumo' });
    await expect(consumeEntry).toHaveCount(1, { timeout: 60_000 });
    await expect(consumeEntry.getByTestId('batch-history-entry-quantity')).toHaveText('1500');

    const consumptionEntry = historyList.locator('li').filter({ hasText: 'Salida por entrega' });
    await expect(consumptionEntry).toHaveCount(1, { timeout: 60_000 });
    await expect(consumptionEntry.getByTestId('batch-history-entry-quantity')).toHaveText('-1500');
  });
});
