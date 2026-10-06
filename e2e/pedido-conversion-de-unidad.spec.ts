/**
 * E2E de la conversion de la necesidad de la unidad del pedido a la del insumo: el alta real de un
 * pedido, en un navegador de verdad y contra Postgres, con el costo que queda en
 * `orders.ingredients_cost` y lo que se aparta en `reservation_movements`.
 *
 * DATOS: mismo patron que `e2e/pedidos-cotizacion.spec.ts` y `e2e/reserva-de-material.spec.ts`.
 * Todo lo que se crea lleva el prefijo `qc204_e2e_` y el `RUN_ID` del worker; la limpieza de
 * huerfanos borra por prefijo y por edad, y `afterAll` borra por el `companyId` exacto del worker.
 *
 * Insumo en kilogramo con un unico lote de 1000 kg a 20,0000 por kg, y dos recetas de una sola
 * linea al 10 % (una por caso, para localizar cada pedido por su receta). Las unidades `gramo`,
 * `mililitro` y `kilogramo` son las del catalogo arrancador: se buscan, no se crean.
 *
 * Los pedidos se guardan sin reparto: `[]` es valido y deja el costo en solo ingredientes.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import { netReservedInBatch } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc204_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

// Chromium y WebKit, y otros worktrees, pueden estar usando filas con el mismo prefijo.
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

const companyName = `${SHARED_TOKEN}_empresa`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc204-Admin-${RUN_ID.slice(0, 12)}`,
};

const productName = `${SHARED_TOKEN}_ingrediente`;
const presentationName = `${SHARED_TOKEN}_presentacion`;
const gramRecipeName = `${SHARED_TOKEN}_receta_g`;
const milliliterRecipeName = `${SHARED_TOKEN}_receta_ml`;

const BATCH_STOCK = '1000';
const UNIT_COST = '20.0000';
const LINE_PERCENTAGE = '10.00';

// 1000 g x 10 % = 100 g = 0,1 kg (exacta); 0,1 kg x 20 = 2,0000. Sin convertir serian 100 kg y
// 2000,0000.
const GRAM_QUANTITY = '1000';
const GRAM_REQUIRED_KG = 0.1;
const GRAM_REQUIRED_TEXT = '0.1 kg';
const GRAM_AMOUNT = '$ 2.00';
const GRAM_SAVED_COST = '2.0000';

// 2000 ml x 10 % = 200 ml ≈ 200 g = 0,2 kg (aproximada); 0,2 kg x 20 = 4,0000. Sin convertir
// serian 200 kg y 4000,0000, asi que las cifras solo cuadran si se aplica la aproximacion.
const MILLILITER_QUANTITY = '2000';
const MILLILITER_REQUIRED_KG = 0.2;
const MILLILITER_REQUIRED_TEXT = '0.2 kg';
const MILLILITER_AMOUNT = '$ 4.00';
const MILLILITER_SAVED_COST = '4.0000';

let companyId: string;
let adminUserId: string;
let gramUnitId: string;
let milliliterUnitId: string;
let batchId: string;
let gramRecipeId: string;
let milliliterRecipeId: string;

async function systemUnitId(nameNormalized: string): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized, companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function createUserWithRole(user: Credentials, roleName: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": siembra la base con \`pnpm run db:seed\` antes de correr ` +
        '`pnpm run e2e`.',
    );
  }

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc204${RUN_ID.slice(0, 8)}`,
      lastNames: 'Conversion',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // `pending`, el valor por defecto, no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

// `::text` para no perder decimales ni confundir `NULL` con `'0.0000'`.
async function ingredientsCostText(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ingredients_cost: string | null }[]>`
    SELECT "ingredients_cost"::text AS "ingredients_cost" FROM "orders" WHERE "id" = ${orderId}::uuid`;
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`);
  return row.ingredients_cost;
}

/** Abre el alta, elige la receta, escribe la cantidad y elige la unidad del pedido. */
async function fillNewOrder(
  page: Page,
  recipe: { readonly id: string; readonly name: string },
  quantity: string,
  unitId: string,
): Promise<void> {
  await loginAndLand(page, adminUser);

  await page.goto(ORDERS_ROUTE);
  await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('order-create-open').first().click();
  await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

  const picker = page.getByTestId('recipe-picker');
  await picker.click();
  await picker.fill(recipe.name);
  const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: recipe.name });
  await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
  await recipeOption.click();
  await expect(page.getByTestId('recipe-picker-value')).toHaveValue(recipe.id);

  await page.getByTestId('order-field-quantity').fill(quantity);
  await page.getByTestId('order-form').getByTestId('presentation-unit-select').click();
  await page.locator(`[data-testid="presentation-unit-option"][data-value="${unitId}"]`).click();
}

async function submitAndFindOrder(page: Page, recipeId: string) {
  await page.getByTestId('order-form-submit').click();
  await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

  return prisma.order.findFirstOrThrow({
    where: { recipeId, companyId, deletedAt: null },
    select: { id: true, status: true, unitId: true },
  });
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
    await prisma.orderPresentationLine.deleteMany({
      where: { companyId: { in: orphanCompanyIds } },
    });
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

  const kilogramUnitId = await systemUnitId('kilogramo');
  gramUnitId = await systemUnitId('gramo');
  milliliterUnitId = await systemUnitId('mililitro');

  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId: kilogramUnitId,
      companyId,
    },
    select: { id: true },
  });

  // La unidad del producto va antes que el lote: `product_batches_check_unit` la exige.
  const productId = (
    await prisma.product.create({
      data: {
        name: productName,
        nameNormalized: normalizeProductName(productName),
        unitId: kilogramUnitId,
        stock: BATCH_STOCK,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  batchId = (
    await prisma.productBatch.create({
      data: {
        productId,
        presentationId: presentation.id,
        companyId,
        stock: BATCH_STOCK,
        unitCost: UNIT_COST,
        lot: `E2E-QC204-${RUN_ID}`,
        purchaseDate,
        createdBy: adminUserId,
      },
      select: { id: true },
    })
  ).id;

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

  // Sembrada directamente: la suma del 100 % solo la exige el servicio de recetas.
  const seedRecipe = async (name: string): Promise<string> =>
    (
      await prisma.recipe.create({
        data: {
          name,
          nameNormalized: normalizeRecipeName(name),
          createdBy: adminUserId,
          companyId,
          lines: { create: [{ productId, percentage: LINE_PERCENTAGE }] },
        },
        select: { id: true },
      })
    ).id;

  gramRecipeId = await seedRecipe(gramRecipeName);
  milliliterRecipeId = await seedRecipe(milliliterRecipeName);
});

test.afterAll(async () => {
  // Por el `companyId` exacto y nunca por prefijo: cada worker tiene su propio `RUN_ID`.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.reservationMovement.deleteMany({ where: { companyId } }),
    () => prisma.inventoryMovement.deleteMany({ where: { companyId } }),
    () => prisma.orderPresentationLine.deleteMany({ where: { companyId } }),
    () => prisma.order.deleteMany({ where: { companyId } }),
    () => prisma.recipe.deleteMany({ where: { companyId } }),
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

// El primer `goto` compila la ruta bajo demanda en `next dev` y bcrypt tarda a proposito.
test.setTimeout(180_000);

test.describe('conversion de la unidad del pedido a la del insumo (QC-204)', () => {
  test('R24 pedido en g sobre insumo en kg: costo y cantidad apartada exactos', async ({ page }) => {
    await fillNewOrder(page, { id: gramRecipeId, name: gramRecipeName }, GRAM_QUANTITY, gramUnitId);

    const form = page.getByTestId('order-form');
    const line = form.getByTestId('order-ingredient-0');
    await expect(line.getByTestId('order-ingredient-required')).toHaveText(GRAM_REQUIRED_TEXT, {
      timeout: 60_000,
    });
    await expect(line.getByTestId('order-ingredient-approximate')).toHaveCount(0);

    await expect(form.getByTestId('order-cost-quote-value')).toHaveText(GRAM_AMOUNT, {
      timeout: 60_000,
    });
    await expect(form.getByTestId('order-cost-quote-approximate')).toHaveCount(0);

    const order = await submitAndFindOrder(page, gramRecipeId);
    expect(order.unitId).toBe(gramUnitId);
    expect(order.status).toBe('PENDIENTE');
    expect(await ingredientsCostText(order.id)).toBe(GRAM_SAVED_COST);
    expect(await netReservedInBatch(order.id, batchId)).toBe(GRAM_REQUIRED_KG);
  });

  test('R25 pedido en ml sobre insumo en kg: costo y cantidad apartada aproximados, con la marca en la linea y en el costo', async ({
    page,
  }) => {
    await fillNewOrder(
      page,
      { id: milliliterRecipeId, name: milliliterRecipeName },
      MILLILITER_QUANTITY,
      milliliterUnitId,
    );

    const form = page.getByTestId('order-form');
    const line = form.getByTestId('order-ingredient-0');
    await expect(line.getByTestId('order-ingredient-required')).toContainText(
      MILLILITER_REQUIRED_TEXT,
      { timeout: 60_000 },
    );
    await expect(line.getByTestId('order-ingredient-approximate')).toBeVisible();

    await expect(form.getByTestId('order-cost-quote-value')).toHaveText(MILLILITER_AMOUNT, {
      timeout: 60_000,
    });
    await expect(form.getByTestId('order-cost-quote-approximate')).toBeVisible();

    const order = await submitAndFindOrder(page, milliliterRecipeId);
    expect(order.unitId).toBe(milliliterUnitId);
    expect(order.status).toBe('PENDIENTE');
    expect(await ingredientsCostText(order.id)).toBe(MILLILITER_SAVED_COST);
    expect(await netReservedInBatch(order.id, batchId)).toBe(MILLILITER_REQUIRED_KG);
  });
});
