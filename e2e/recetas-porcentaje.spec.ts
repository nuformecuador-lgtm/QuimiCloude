/**
 * E2E de cantidades de receta en porcentaje: los cuatro escenarios de alta, edicion, pedido y
 * ejecucion, de punta a punta contra un navegador real y Postgres.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - El campo de porcentaje `type="text"` aceptando coma en un navegador de verdad, y el
 *    indicador de suma recalculandose con cada pulsacion sin llamar a ninguna accion.
 *  - El corte real de Guardar deshabilitado -tambien con cero lineas- y que Enter en
 *    un campo no lo salta, con la Server Action REAL de `recetas` contra Postgres.
 *  - El pedido REAL de `pedidos` calculando `ingredients_cost` con el porcentaje, con la
 *    tabla de ingredientes pintando el mismo dato que guarda el backend.
 *  - La pantalla del Operario mostrando el porcentaje y la cantidad calculada, con la
 *    cantidad del pedido en su propia linea.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * DATOS: `recipes`, `recipe_lines`, `products`, `presentations`, `product_batches` y `orders` son
 * tablas reales y COMPARTIDAS, y varios proyectos/worktrees pueden correr a la vez. Por eso,
 * copiando el patron de `e2e/recetas.spec.ts`, `e2e/pedidos.spec.ts` y
 * `e2e/ejecucion-receta.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc147_e2e_` y dentro el `RUN_ID` del worker;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra siempre, aunque un test reviente, **por el `companyId` EXACTO de este
 *    worker** -nunca por `FIXTURE_PREFIX`, porque `fullyParallel` reparte los tests de este
 *    archivo en workers distintos, cada uno con su propio `RUN_ID`-: casi todas las tablas de
 *    esta ficha llevan `company_id`, asi que un solo borrado por tabla basta, en el orden que
 *    imponen las FK RESTRICT: asignaciones -> pedidos -> recetas (sus lineas van en cascada) ->
 *    lotes -> productos -> presentaciones -> usuarios -> empresa.
 *
 * SEMBRADO SIN PASAR POR LA PANTALLA (`e2e/ajuste-de-inventario.spec.ts`): el producto CON unidad,
 * su presentacion y su primer lote se crean con Prisma, fijando `products.unit_id` a mano -tal
 * como lo deja el alta real-, porque `product_batches_check_unit` rechaza un lote cuyo producto no
 * tenga ya esa misma unidad. LA UNIDAD ES `litro`, del catalogo arrancador
 * (`db/migrations/20260903121404_units_catalog`): no se crea, se busca por su nombre.
 *
 * LAS DOS RECETAS SEMBRADAS DIRECTAMENTE EN `recipe_lines` (una sin ninguna linea, como deja la
 * migracion sembradora; otra con una unica linea al 10 %) NO pasan por `createRecipe`: son sembrado de
 * base de datos, y nada en el esquema exige que la suma de un `INSERT` directo llegue a 100,00 %
 * -esa suma solo la exige el SERVICIO, que aqui no se invoca-. Es el mismo criterio que usan
 * `e2e/ejecucion-receta.spec.ts` y `tests/integration/pedidos/order-ingredients-cost.int.test.ts`.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` y `Operador` los siembra
 * `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts`); si faltan, el `beforeAll` falla
 * diciendo que hay que sembrar.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  assignedOrderRoute,
  FORMULAS_ROUTE,
  NEW_RECIPE_ROUTE,
  ORDERS_ROUTE,
  recipeEditRoute,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc147_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/recetas.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez, y ademas puede haber otro worktree corriendo su propio E2E contra otra base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const companyName = `${SHARED_TOKEN}_empresa`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc147-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc147-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Los dos ingredientes sin unidad resoluble del escenario 1 (alta por la UI). */
const productAName = `${SHARED_TOKEN}_ingrediente_a`;
const productBName = `${SHARED_TOKEN}_ingrediente_b`;

/** El ingrediente CON unidad (litro) y lote de los escenarios 3-4. */
const productWithUnitName = `${SHARED_TOKEN}_hipoclorito`;
const presentationName = `${SHARED_TOKEN}_presentacion`;

/** Receta creada por la UI en el escenario 1. */
const recipeName = `${SHARED_TOKEN}_receta_alta`;

/** Receta nueva del escenario 2a: nunca debe llegar a existir. */
const emptyRecipeName = `${SHARED_TOKEN}_receta_vacia`;

/** Receta SEMBRADA sin ninguna linea, como deja la migracion sembradora (escenario 2b). */
const recipeSinLineasName = `${SHARED_TOKEN}_receta_sembrada_sin_lineas`;
const recipeSinLineasEditedName = `${recipeSinLineasName}_editada`;

/** Receta SEMBRADA con una unica linea al 10 % (escenarios 3 y 4). */
const recipeConLineaName = `${SHARED_TOKEN}_receta_10pct`;

/** El porcentaje unico de esa receta y la cantidad del pedido de los dos escenarios. */
const LINE_PERCENTAGE = '10.00';
const ORDER_QUANTITY_TEXT = '200';
const ORDER_QUANTITY_DB = '200.0000';

/** Lote con existencia y coste conocidos: 20 L requeridos x 2.0000 = 40.0000. */
const BATCH_STOCK = 50;
const UNIT_COST = '2.0000';

let companyId: string;
let adminUserId: string;
let operatorUserId: string;
let unitId: string;
/** Simbolo real de la unidad sembrada, para no cablear en el test lo que ya guarda la BD. */
let unitSymbol: string;
let productAId: string;
let productBId: string;
let productWithUnitId: string;
let recipeSinLineasId: string;
let recipeConLineaId: string;
/** El pedido YA asignado al Operario del escenario 4: se siembra directo, sin pasar por la UI. */
let assignedOrderId: string;

async function createUserWithRole(user: Credentials, roleName: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque la regla ruta-rol compara por ` +
        'nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc147${RUN_ID.slice(0, 8)}`,
      lastNames: 'Porcentaje',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // Explicito, no por defecto: la columna es `@default(pending)` y `pending` no entra por
      // el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Elige, dentro del desplegable de producto (`ProductPicker`), la opcion cuyo nombre es
 * EXACTAMENTE `name`. Copiado de `e2e/recetas.spec.ts`.
 */
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

/** El importe de `orders.ingredients_cost`, leido con `::text` para no perder ni un decimal ni
 *  confundir `NULL` con `'0.0000'` (mismo criterio que `order-ingredients-cost.int.test.ts`). */
async function ingredientsCostText(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ingredients_cost: string | null }[]>`
    SELECT "ingredients_cost"::text AS "ingredients_cost" FROM "orders" WHERE "id" = ${orderId}::uuid`;
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`);
  return row.ingredients_cost;
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // LIMPIEZA DEFENSIVA DE HUERFANOS. Orden que imponen las FK RESTRICT: apartados -> asignaciones ->
  // reparto -> pedidos -> recetas (sus lineas van en cascada) -> lotes -> productos -> presentaciones ->
  // usuarios -> empresas.
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    // El pedido guardado aparta material: sus apartados restringen el borrado del pedido.
    await prisma.reservationMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderPresentationLine.deleteMany({
      where: { companyId: { in: orphanCompanyIds } },
    });
    await prisma.orderExecutionEntry.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.recipe.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.presentation.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  operatorUserId = await createUserWithRole(operatorUser, ROLE_OPERADOR);

  // La unidad NO se crea: es una de las cuatro del catalogo arrancador.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true, symbol: true, name: true },
  });
  unitId = unit.id;
  // Mismo fallback que `unitLabel` en la pantalla: si no hay simbolo, se pinta el nombre.
  unitSymbol = unit.symbol ?? unit.name;

  // Los dos ingredientes SIN unidad resoluble del escenario 1: no tienen lotes (guardar la linea
  // igual esta permitido), y asi el alta por la UI no depende de ningun lote de fixture.
  productAId = (
    await prisma.product.create({
      data: { name: productAName, nameNormalized: normalizeProductName(productAName), companyId },
      select: { id: true },
    })
  ).id;
  productBId = (
    await prisma.product.create({
      data: { name: productBName, nameNormalized: normalizeProductName(productBName), companyId },
      select: { id: true },
    })
  ).id;

  // El ingrediente CON unidad y lote (escenarios 3 y 4). `products.unit_id` se fija A MANO, igual
  // que en `e2e/ajuste-de-inventario.spec.ts`: sin ella, `product_batches_check_unit` rechazaria
  // el lote de mas abajo.
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId,
      companyId,
    },
    select: { id: true },
  });

  productWithUnitId = (
    await prisma.product.create({
      data: {
        name: productWithUnitName,
        nameNormalized: normalizeProductName(productWithUnitName),
        unitId,
        stock: BATCH_STOCK,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  await prisma.productBatch.create({
    data: {
      productId: productWithUnitId,
      presentationId: presentation.id,
      companyId,
      stock: BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: `E2E-QC147-${RUN_ID}`,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      createdBy: adminUserId,
    },
    select: { id: true },
  });

  // Receta SEMBRADA sin ninguna linea, tal como deja la migracion sembradora (escenario 2b).
  recipeSinLineasId = (
    await prisma.recipe.create({
      data: {
        name: recipeSinLineasName,
        nameNormalized: normalizeRecipeName(recipeSinLineasName),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  // Receta SEMBRADA con una unica linea al 10 % (escenarios 3 y 4). El `INSERT` directo no pasa
  // por el servicio, asi que la suma de 10 % no la rechaza nada: el mismo criterio que
  // `e2e/ejecucion-receta.spec.ts`.
  recipeConLineaId = (
    await prisma.recipe.create({
      data: {
        name: recipeConLineaName,
        nameNormalized: normalizeRecipeName(recipeConLineaName),
        createdBy: adminUserId,
        companyId,
        lines: { create: [{ productId: productWithUnitId, percentage: LINE_PERCENTAGE }] },
      },
      select: { id: true },
    })
  ).id;

  // El pedido del escenario 4, YA asignado al Operario: se siembra directo -la asignacion por la
  // UI es de otra pantalla y de otro E2E (`e2e/ejecucion-receta.spec.ts`)-, con el mismo criterio.
  const year = new Date().getUTCFullYear();
  assignedOrderId = (
    await prisma.order.create({
      data: {
        companyId,
        orderYear: year,
        orderSequence: 900_000 + Math.floor(Math.random() * 90_000),
        recipeId: recipeConLineaId,
        quantity: ORDER_QUANTITY_DB,
        status: 'PENDIENTE',
      },
      select: { id: true },
    })
  ).id;

  await prisma.orderAssignment.create({
    data: { orderId: assignedOrderId, userId: operatorUserId, companyId },
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque un test reviente, por el `companyId` EXACTO de este worker -nunca por
  // `FIXTURE_PREFIX`-: `fullyParallel` reparte los tests de este archivo en workers distintos,
  // cada uno con su propio `RUN_ID`. Casi todas las tablas de esta ficha llevan `company_id`.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    // El pedido guardado aparta material: sus apartados restringen el borrado del pedido.
    () => prisma.reservationMovement.deleteMany({ where: { companyId } }),
    () => prisma.inventoryMovement.deleteMany({ where: { companyId } }),
    () => prisma.orderAssignment.deleteMany({ where: { companyId } }),
    () => prisma.orderPresentationLine.deleteMany({ where: { companyId } }),
    () => prisma.orderExecutionEntry.deleteMany({ where: { companyId } }),
    () => prisma.order.deleteMany({ where: { companyId } }),
    () => prisma.recipe.deleteMany({ where: { companyId } }), // cascada sobre `recipe_lines`.
    () => prisma.productBatch.deleteMany({ where: { companyId } }),
    () => prisma.product.deleteMany({ where: { companyId } }),
    () => prisma.presentation.deleteMany({ where: { companyId } }),
    () => prisma.user.deleteMany({ where: { companyId } }),
    () => prisma.company.deleteMany({ where: { id: companyId } }),
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

// El primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda a proposito.
test.setTimeout(180_000);

test.describe('cantidades de receta en porcentaje (QC-147)', () => {
  test('escenario 1 (R25) - dos ingredientes escritos con coma: Guardar se habilita solo al 100,00 % y la receta se relee con los mismos porcentajes', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    await page.goto(NEW_RECIPE_ROUTE);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    // `pressSequentially`, no `fill`: tras una navegacion dura (`goto`), este es el primer campo
    // que el test toca, y WebKit puede tardar en engancharse a el mientras React todavia hidrata
    // -`fill` pone el valor y dispara un unico evento que, si llega antes de que ese enganche
    // exista, se pierde en silencio: el DOM ensena el valor pero el estado de React nunca se
    // entera, y un re-render posterior de cualquier OTRO campo lo deja en blanco de nuevo. Teclear
    // caracter a caracter reparte el valor en varios eventos, así que aunque los primeros se
    // pierdan, el ultimo -ya con React enganchado- llega con el valor completo.
    await page.getByTestId('recipe-field-name').pressSequentially(recipeName, { delay: 20 });

    // Linea 0: ingrediente A al 90 %.
    await selectProductByName(page, 'recipe-line-product-0', productAName);
    await page.getByTestId('recipe-line-percentage-0').fill('90');

    // Se anade la segunda linea y el ingrediente B al 7,5 %, ESCRITO CON COMA.
    await page.getByTestId('recipe-line-add-0').click();
    await selectProductByName(page, 'recipe-line-product-1', productBName);
    await page.getByTestId('recipe-line-percentage-1').fill('7,5');

    const sum = page.getByTestId('recipe-lines-sum');
    await expect(sum).toHaveAttribute('data-complete', 'false');
    await expect(sum).toContainText('97,50');
    await expect(sum).toContainText('2,50');
    await expect(page.getByTestId('recipe-form-submit')).toBeDisabled();

    // Se corrige la primera linea a 92,5 %: la suma llega a 100,00 % y Guardar se habilita.
    await page.getByTestId('recipe-line-percentage-0').fill('92,5');
    await expect(sum).toHaveAttribute('data-complete', 'true');
    await expect(sum).toContainText('100,00');
    await expect(page.getByTestId('recipe-form-submit')).toBeEnabled();

    // Guardar: la Server Action REAL de `recetas` contra Postgres.
    await page.getByTestId('recipe-form-submit').click();
    await page.waitForURL((url) => url.pathname === FORMULAS_ROUTE, { timeout: 60_000 });

    const saved = await prisma.recipe.findFirstOrThrow({
      where: { name: recipeName, companyId },
      select: { id: true, lines: { select: { productId: true, percentage: true } } },
    });
    const byProduct = new Map(
      saved.lines.map((line) => [line.productId, line.percentage.toFixed(2)]),
    );
    expect(byProduct.get(productAId)).toBe('92.50');
    expect(byProduct.get(productBId)).toBe('7.50');

    // Al reabrirla, los campos muestran «92,50» y «7,50».
    await page.goto(recipeEditRoute(saved.id));
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });
    const percentageInputs = page.locator('[data-testid^="recipe-line-percentage-"]');
    await expect(percentageInputs).toHaveCount(2, { timeout: 60_000 });
    const values = await percentageInputs.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLInputElement).value),
    );
    expect(values.slice().sort()).toEqual(['7,50', '92,50']);
  });

  test('escenario 2 (R3, R23) - una receta sin lineas no se guarda, ni de alta ni editando solo el nombre de una sembrada', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 2a. Una receta nueva, sin ninguna linea.
    await page.goto(NEW_RECIPE_ROUTE);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('recipe-field-name').fill(emptyRecipeName);

    const sumNueva = page.getByTestId('recipe-lines-sum');
    await expect(sumNueva).toHaveAttribute('data-complete', 'false');
    await expect(sumNueva).toContainText('0,00');
    await expect(sumNueva).toContainText('100,00');
    await expect(page.getByTestId('recipe-form-submit')).toBeDisabled();

    // Enter en un campo no salta la comprobacion aunque el boton este deshabilitado.
    await page.getByTestId('recipe-field-name').press('Enter');
    await expect(page.getByTestId('recipe-form')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(NEW_RECIPE_ROUTE);

    expect(await prisma.recipe.count({ where: { name: emptyRecipeName } })).toBe(0);

    // --- 2b. Una receta SEMBRADA sin ninguna linea -como deja la migracion sembradora-: editar
    // solo el nombre se rechaza igual, decision aceptada a sabiendas.
    await page.goto(recipeEditRoute(recipeSinLineasId));
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    const sumSembrada = page.getByTestId('recipe-lines-sum');
    await expect(sumSembrada).toHaveAttribute('data-complete', 'false');
    await expect(sumSembrada).toContainText('0,00');
    await expect(page.getByTestId('recipe-form-submit')).toBeDisabled();

    await page.getByTestId('recipe-field-name').fill(recipeSinLineasEditedName);
    await page.getByTestId('recipe-field-name').press('Enter');

    await expect(page.getByTestId('recipe-form')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(recipeEditRoute(recipeSinLineasId));

    const persisted = await prisma.recipe.findUniqueOrThrow({
      where: { id: recipeSinLineasId },
      select: { name: true },
    });
    expect(persisted.name).toBe(recipeSinLineasName);
  });

  test('escenario 3 (R13, R15, R25) - un pedido de 200 sobre el 10 % en litros calcula la cantidad requerida y el importe de ingredientes', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    await page.goto(ORDERS_ROUTE);
    await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('order-create-open').first().click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

    // Receta TOMADA DEL SELECTOR CON BUSQUEDA, igual que `e2e/pedidos.spec.ts`.
    const picker = page.getByTestId('recipe-picker');
    await picker.click();
    await picker.fill(recipeConLineaName);
    const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: recipeConLineaName });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(recipeConLineaId);

    await page.getByTestId('order-field-quantity').fill(ORDER_QUANTITY_TEXT);
    // El alta exige la unidad del pedido; el reparto es opcional y este escenario no lo usa.
    await page.getByTestId('order-form').getByTestId('presentation-unit-select').click();
    await page.locator(`[data-testid="presentation-unit-option"][data-value="${unitId}"]`).click();

    // La tabla de ingredientes pinta el porcentaje y la cantidad requerida ANTES de guardar:
    // 200 x 10 % = 20.
    await expect(page.getByTestId('order-ingredients-table')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('order-ingredient-percentage')).toHaveText('10,00 %');
    await expect(page.getByTestId('order-ingredient-required')).toHaveText(`20 ${unitSymbol}`);

    // Guardar: la Server Action REAL de `pedidos` contra Postgres.
    await page.getByTestId('order-form-submit').click();
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

    // El pedido nuevo, distinguido del ya sembrado y asignado del escenario 4 (misma receta).
    const created = await prisma.order.findFirstOrThrow({
      where: { recipeId: recipeConLineaId, id: { not: assignedOrderId } },
      select: { id: true },
    });

    // 20 L requeridos x 2.0000 de coste = 40.0000.
    expect(await ingredientsCostText(created.id)).toBe('40.0000');
  });

  test('escenario 4 (R18, R22, R25, R26) - el Operario ve "Pedido 200" en su propia linea y "10,00 % · 20" con el simbolo del litro en la del insumo', async ({
    page,
  }) => {
    await loginAndLand(page, operatorUser);

    await page.goto(assignedOrderRoute(assignedOrderId));
    await expect(page.getByTestId('order-execution-title')).toBeVisible({ timeout: 60_000 });

    // La cantidad del pedido va en SU PROPIA linea, fuera de la lista de la receta.
    const orderQuantity = page.getByTestId('order-execution-order-quantity');
    await expect(orderQuantity).toBeVisible();
    await expect(orderQuantity).toContainText('Pedido 200');
    await expect(
      page.locator('[data-testid="order-execution-lines"] [data-testid="order-execution-order-quantity"]'),
    ).toHaveCount(0);

    // La linea del insumo: 10,00 %, 20 y su unidad, cada dato en su propio elemento.
    await expect(page.getByTestId('order-execution-line-percentage-0')).toHaveText('10,00 %');
    await expect(page.getByTestId('order-execution-line-quantity-0')).toHaveText('20');
    await expect(page.getByTestId('order-execution-line-unit-0')).toHaveText(unitSymbol);
  });
});
