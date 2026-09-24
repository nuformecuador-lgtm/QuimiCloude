/**
 * E2E de la cotizacion del coste en el panel de pedidos: el recorrido de punta a punta sobre un
 * navegador real y Postgres, patron de `e2e/recetas-porcentaje.spec.ts` y `e2e/pedidos.spec.ts`.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - El debounce de la cantidad y la llamada inmediata al cambiar de receta, con la Server Action
 *    REAL de `pedidos` contra Postgres y sin dobles de por medio.
 *  - El bloque de coste pintando el mismo importe que termina guardado en `orders.ingredients_cost`,
 *    y esa misma cifra al reabrir la edicion sin teclear nada.
 *  - El guion cuando la existencia no alcanza, en un navegador de verdad.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * DATOS: `orders`, `recipes`, `products`, `presentations` y `product_batches` son tablas reales y
 * COMPARTIDAS, y varios proyectos/worktrees pueden correr a la vez. Por eso, copiando el patron ya
 * asentado:
 *  - todo lo que este spec crea lleva el prefijo `qc151_e2e_` y dentro el `RUN_ID` del worker;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, **por el `companyId` EXACTO de este
 *    worker** -nunca por el prefijo, porque `fullyParallel` reparte los tests en workers distintos,
 *    cada uno con su propio `RUN_ID`-, en el orden que imponen las FK RESTRICT: pedidos -> receta
 *    (sus lineas van en cascada) -> lote -> producto -> presentacion -> usuario -> empresa.
 *
 * SEMBRADO SIN PASAR POR LA PANTALLA (`e2e/ajuste-de-inventario.spec.ts`,
 * `e2e/recetas-porcentaje.spec.ts`): el producto CON unidad, su presentacion y su lote se crean con
 * Prisma, fijando `products.unit_id` a mano -tal como lo deja el alta real-, porque
 * `product_batches_check_unit` rechaza un lote cuyo producto no tenga ya esa misma unidad. LA
 * UNIDAD ES `litro`, del catalogo arrancador (`db/migrations/20260903121404_units_catalog`): no se
 * crea, se busca por su nombre.
 *
 * LA RECETA SE SIEMBRA DIRECTAMENTE EN `recipe_lines` con una unica linea al 10 %, sin pasar por
 * `createRecipe`: es sembrado de base de datos, y nada en el esquema exige que la suma de un
 * `INSERT` directo llegue a 100,00 % -esa suma solo la exige el SERVICIO, que aqui no se invoca-.
 * Mismo criterio que `e2e/recetas-porcentaje.spec.ts` y
 * `tests/integration/pedidos/order-cost-quote.int.test.ts`.
 *
 * LO QUE ESTE SPEC NO CREA: el rol `Administrador`. Lo siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts`); si falta, el `beforeAll` falla diciendo que hay que
 * sembrar, en vez de dar un rojo incomprensible en mitad del recorrido.
 *
 * NINGUN LITERAL de ruta: la URL se deriva SIEMPRE de `ORDERS_ROUTE`, igual que el correlativo de
 * `formatOrderNumber`. El unico texto sin derivar es el importe formateado, que este spec calcula a
 * mano con los mismos numeros del fixture -no hay funcion de dominio que exportar para eso sin
 * arrastrar un componente de UI-, y el guion (`—`), que es el marcador de ausencia de la pantalla
 * (`order-columns.tsx`) y no copy de negocio.
 *
 * UN SEGUNDO INGREDIENTE Y RECETA, propios de R59: tres lotes con disponible completo y coste
 * distinto (el ejemplo de D22), en una receta al 100 % para que la cantidad tecleada sea la
 * cantidad necesaria sin pasar por un porcentaje intermedio.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc151_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/recetas.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E contra otra base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const companyName = `${SHARED_TOKEN}_empresa`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc151-Admin-${RUN_ID.slice(0, 12)}`,
};

/** El ingrediente CON unidad (litro), su presentacion y su unico lote. */
const productName = `${SHARED_TOKEN}_ingrediente`;
const presentationName = `${SHARED_TOKEN}_presentacion`;

/** Receta SEMBRADA con una unica linea al 10 %. */
const recipeName = `${SHARED_TOKEN}_receta`;

/** Existencia y coste del lote unico: 1000 L a 25,5000 de coste unitario. */
const BATCH_STOCK = 1000;
const UNIT_COST = '25.5000';

/** Las cuatro cantidades del recorrido (a)-(d), calculadas a mano sobre el 10 % y el coste unitario. */
const QUANTITY_A = '5000'; // 500 L requeridos x 25.5000 = 12750.0000
const AMOUNT_A = '$ 12,750.00';
const QUANTITY_B = '5001'; // 500.1 L requeridos x 25.5000 = 12752.5500
const AMOUNT_B = '$ 12,752.55';
const QUANTITY_C = '20000'; // 2000 L requeridos > 1000 L de existencia
/** Marcador de ausencia de la pantalla, no copy de negocio (`order-columns.tsx`). */
const MISSING_VALUE_MARK = '—';

/**
 * El ingrediente del ejemplo de D22 (R59): tres lotes con disponible completo y coste distinto,
 * en una receta propia al 100 % para que la cantidad del pedido sea la cantidad necesaria tal
 * cual.
 */
const costProductName = `${SHARED_TOKEN}_r59_ingrediente`;
const costPresentationName = `${SHARED_TOKEN}_r59_presentacion`;
const costRecipeName = `${SHARED_TOKEN}_r59_receta`;

/** Los tres lotes del ejemplo de D22, con fecha de compra distinta: A la mas antigua. */
const COST_BATCH_A = { stock: '20', unitCost: '10.0000', lotSuffix: 'A' } as const;
const COST_BATCH_B = { stock: '20', unitCost: '12.0000', lotSuffix: 'B' } as const;
const COST_BATCH_C = { stock: '50', unitCost: '15.0000', lotSuffix: 'C' } as const;

/** 30 x (10 + 12 + 15) / 3 = 370,0000, sin ponderar por la cantidad de ningun lote. */
const COST_QUANTITY = '30';
const COST_AMOUNT = '$ 370.00';

let companyId: string;
let adminUserId: string;
let unitId: string;
let productId: string;
let presentationId: string;
let recipeId: string;
let costProductId: string;
let costRecipeId: string;

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
      firstNames: `Qc151${RUN_ID.slice(0, 8)}`,
      lastNames: 'Cotizacion',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // Explicito, no por defecto: la columna es `@default(pending)` y `pending` no entra por el
      // login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
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

/**
 * Igualdad EXACTA de texto: la fila de un correlativo mas corto no puede casar con uno mas largo.
 */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * La fila de la tabla compartida cuyo correlativo es EXACTAMENTE `numberText`. Nunca «la primera
 * fila»: Chromium y WebKit corren a la vez sobre la misma base.
 */
function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator('[data-testid^="data-table-row-"]')
    .filter({
      has: page.getByTestId('data-table-cell-orderNumber').filter({ hasText: exactText(numberText) }),
    });
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // LIMPIEZA DEFENSIVA DE HUERFANOS. Orden que imponen las FK RESTRICT: pedidos -> recetas (sus
  // lineas van en cascada) -> lotes -> productos -> presentaciones -> usuarios -> empresas.
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
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

  // La unidad NO se crea: es una de las cuatro del catalogo arrancador.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });
  unitId = unit.id;

  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId,
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;

  // `products.unit_id` se fija A MANO, igual que en `e2e/ajuste-de-inventario.spec.ts`: sin ella,
  // `product_batches_check_unit` rechazaria el lote de mas abajo.
  productId = (
    await prisma.product.create({
      data: {
        name: productName,
        nameNormalized: normalizeProductName(productName),
        unitId,
        stock: BATCH_STOCK,
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
      lot: `E2E-QC151-${RUN_ID}`,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      createdBy: adminUserId,
    },
    select: { id: true },
  });

  // Receta SEMBRADA con una unica linea al 10 %. El `INSERT` directo no pasa por el servicio, asi
  // que la suma de 10 % no la rechaza nada: mismo criterio que `e2e/recetas-porcentaje.spec.ts`.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: recipeName,
        nameNormalized: normalizeRecipeName(recipeName),
        createdBy: adminUserId,
        companyId,
        lines: { create: [{ productId, percentage: '10.00' }] },
      },
      select: { id: true },
    })
  ).id;

  const costPresentation = await prisma.presentation.create({
    data: {
      name: costPresentationName,
      nameNormalized: normalizePresentationName(costPresentationName),
      unitId,
      companyId,
    },
    select: { id: true },
  });

  costProductId = (
    await prisma.product.create({
      data: {
        name: costProductName,
        nameNormalized: normalizeProductName(costProductName),
        unitId,
        stock: '90', // 20 + 20 + 50: la suma de los tres lotes de abajo.
        companyId,
      },
      select: { id: true },
    })
  ).id;

  // Fechas de compra distintas -R59 promedia TODOS los disponibles, sin importar el orden en que
  // el apartado los recorra-.
  await prisma.productBatch.createMany({
    data: [COST_BATCH_A, COST_BATCH_B, COST_BATCH_C].map((batch, index) => ({
      productId: costProductId,
      presentationId: costPresentation.id,
      companyId,
      stock: batch.stock,
      unitCost: batch.unitCost,
      lot: `E2E-QC151-R59-${batch.lotSuffix}-${RUN_ID}`,
      purchaseDate: new Date(Date.UTC(2026, 0, index + 1)),
      createdBy: adminUserId,
    })),
  });

  costRecipeId = (
    await prisma.recipe.create({
      data: {
        name: costRecipeName,
        nameNormalized: normalizeRecipeName(costRecipeName),
        createdBy: adminUserId,
        companyId,
        lines: { create: [{ productId: costProductId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque un test reviente, por el `companyId` EXACTO de este worker -nunca por
  // `FIXTURE_PREFIX`-: `fullyParallel` reparte los tests de este archivo en workers distintos, cada
  // uno con su propio `RUN_ID`. Casi todas las tablas de esta ficha llevan `company_id`.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
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

test.describe('cotizacion del coste en el pedido (QC-151)', () => {
  test('el bloque de coste cotiza con cada cantidad, guarda el mismo importe y lo reabre sin teclear nada', async ({
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
    await picker.fill(recipeName);
    const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: recipeName });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(recipeId);

    const quantity = page.getByTestId('order-field-quantity');
    const quoteValue = page.getByTestId('order-cost-quote-value');

    // (a) 5000 -> 500 L requeridos x 25,5000 = 12.750,00.
    await quantity.fill(QUANTITY_A);
    await expect(quoteValue).toHaveText(AMOUNT_A, { timeout: 60_000 });

    // (b) 5001 -> 500,1 L requeridos x 25,5000 = 12.752,55.
    await quantity.fill(QUANTITY_B);
    await expect(quoteValue).toHaveText(AMOUNT_B, { timeout: 60_000 });

    // (c) 20000 -> 2000 L requeridos, por encima de los 1000 L de existencia: guion.
    await quantity.fill(QUANTITY_C);
    await expect(quoteValue).toHaveText(MISSING_VALUE_MARK, { timeout: 60_000 });

    // (d) vuelta a 5001, se elige la presentacion y se guarda: la Server Action REAL de `pedidos`
    // contra Postgres.
    await quantity.fill(QUANTITY_B);
    await expect(quoteValue).toHaveText(AMOUNT_B, { timeout: 60_000 });

    const presentationPicker = page.getByTestId('presentation-select');
    await presentationPicker.click();
    await presentationPicker.fill(presentationName);
    const presentationOption = page
      .getByTestId('presentation-option')
      .filter({ hasText: presentationName });
    await expect(presentationOption).toHaveCount(1, { timeout: 60_000 });
    await presentationOption.click();
    await expect(page.getByTestId('presentation-value')).toHaveValue(presentationId);

    await page.getByTestId('order-form-submit').click();
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

    const created = await prisma.order.findFirstOrThrow({
      where: { recipeId, companyId, deletedAt: null },
      select: { id: true, orderYear: true, orderSequence: true },
    });
    expect(await ingredientsCostText(created.id)).toBe('12752.5500');

    // El pedido en la lista, localizado POR SU CORRELATIVO -nunca por «la primera fila»-, y su
    // edicion reabierta desde la fila muestra el mismo importe SIN teclear nada (R11).
    const numberText = formatOrderNumber({ year: created.orderYear, sequence: created.orderSequence });
    const row = rowByNumber(page, numberText);
    await expect(row, `el pedido ${numberText} deberia verse en la lista`).toBeVisible({
      timeout: 60_000,
    });

    await row.getByTestId('order-action-edit').click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('order-cost-quote-value')).toHaveText(AMOUNT_B, {
      timeout: 60_000,
    });
  });

  test('R59: el promedio simple de todos los lotes con disponible cotiza el ejemplo de D22', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    await page.goto(ORDERS_ROUTE);
    await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('order-create-open').first().click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

    const picker = page.getByTestId('recipe-picker');
    await picker.click();
    await picker.fill(costRecipeName);
    const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: costRecipeName });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(costRecipeId);

    // Receta al 100 %: la cantidad tecleada ES la cantidad necesaria. Los tres lotes A (20 a 10),
    // B (20 a 12) y C (50 a 15) entran ENTEROS en el promedio, se necesiten o no para cubrir los
    // 30 pedidos: (10 + 12 + 15) / 3 x 30 = 370,0000.
    await page.getByTestId('order-field-quantity').fill(COST_QUANTITY);
    await expect(page.getByTestId('order-cost-quote-value')).toHaveText(COST_AMOUNT, {
      timeout: 60_000,
    });
  });
});
