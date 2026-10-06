/**
 * E2E de la version de receta en el formulario de pedido: se elige la original y una de sus
 * versiones, se guarda el pedido, y lo que queda apartado sale de las lineas de la version y no de
 * las de la original.
 *
 * La formula esta elegida para que la diferencia se vea en la base: la original pide A y B, la
 * version pide A y C. Si el pedido reservara con la original, B tendria reserva y C no.
 *
 * LOS ASERTOS DE ESTADO FINAL SE LEEN DE LA BASE: el pedido guardado y sus asientos de reserva.
 *
 * DATOS: mismo patron que `e2e/reserva-de-material.spec.ts` -prefijo propio con el `RUN_ID` del
 * worker, limpieza de huerfanos por prefijo y por edad, y `afterAll` que borra siempre en el orden
 * de las FK-. La version cuelga de la original con `ON DELETE RESTRICT`, asi que las versiones se
 * borran antes que las originales.
 *
 * SEMBRADO POR PRISMA: productos, lotes, presentacion y recetas no se dan de alta por la pantalla
 * -cada catalogo tiene su propio E2E-. El PEDIDO si se crea por la UI de Pedidos.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import { addPackagingLine } from './helpers/order-distribution';
import { seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc172_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y puede haber otro worktree corriendo su propio E2E. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const ORIGINAL_NAME = `${SHARED_TOKEN}_original`;
const VERSION_NAME = `${SHARED_TOKEN}_version`;
const PLAIN_RECIPE_NAME = `${SHARED_TOKEN}_sinversiones`;
const PACKAGING_NAME = `${SHARED_TOKEN}_envase`;
const PACKAGING_LOT = `${SHARED_TOKEN}_lote_envase`;
const PACKAGING_STOCK = '2000';
const PACKAGING_UNIT_COST = '0.1000';

const PRODUCT_KEYS = ['a', 'b', 'c'] as const;
type ProductKey = (typeof PRODUCT_KEYS)[number];

/** Cada lote cubre de sobra la parte que le toca al pedido, para que la reserva sea completa. */
const BATCH_STOCK = '2000.0000';
const UNIT_COST = '10.0000';

const ORDER_QUANTITY = '1000';
/** `ORDER_QUANTITY` por el porcentaje de la version: 50 % de A y 50 % de C. */
const EXPECTED_RESERVED_A = '500';
const EXPECTED_RESERVED_C = '500';

const adminUser = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc172-Admin-${RUN_ID.slice(0, 12)}`,
} as const;

let companyId: string | null = null;
let unitId: string | null = null;
let originalId: string | null = null;
let versionId: string | null = null;
let plainRecipeId: string | null = null;
let packagingId: string | null = null;
let packagingBatchId: string | null = null;
const productIds = new Map<ProductKey, string>();
const batchIds = new Map<ProductKey, string>();

function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: '25', sort: 'createdAt:desc' });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

test.beforeAll(async () => {
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
    await prisma.order.deleteMany({ where: scope });
    await prisma.productBatch.deleteMany({ where: scope });
    await prisma.product.deleteMany({ where: { ...scope, recipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: { ...scope, parentRecipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: scope });
    await prisma.product.deleteMany({ where: scope });
    await prisma.presentation.deleteMany({ where: scope });
    await prisma.user.deleteMany({ where: scope });
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

  const company = await prisma.company.create({
    data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
    select: { id: true },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: {
      firstNames: `Qc172${RUN_ID.slice(0, 8)}`,
      lastNames: 'Versiones',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: adminRole.id,
      companyId: company.id,
      accountStatus: 'active',
    },
    select: { id: true },
  });

  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });
  unitId = unit.id;

  const presentation = await prisma.presentation.create({
    data: {
      name: PRESENTATION_NAME,
      nameNormalized: normalizePresentationName(PRESENTATION_NAME),
      unitId: unit.id,
      content: '1',
      companyId: company.id,
    },
    select: { id: true },
  });

  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  for (const key of PRODUCT_KEYS) {
    const productName = `${SHARED_TOKEN}_producto_${key}`;
    // El disparador que valida el lote exige que el producto ya tenga unidad.
    const product = await prisma.product.create({
      data: {
        name: productName,
        nameNormalized: normalizeProductName(productName),
        unitId: unit.id,
        stock: BATCH_STOCK,
        companyId: company.id,
      },
      select: { id: true },
    });
    productIds.set(key, product.id);

    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        presentationId: presentation.id,
        companyId: company.id,
        stock: BATCH_STOCK,
        unitCost: UNIT_COST,
        lot: `${SHARED_TOKEN}_lote_${key}`,
        purchaseDate,
        createdBy: admin.id,
      },
      select: { id: true },
    });
    batchIds.set(key, batch.id);

    await prisma.inventoryMovement.create({
      data: {
        batchId: batch.id,
        kind: 'opening',
        quantity: BATCH_STOCK,
        reason: null,
        companyId: company.id,
        createdBy: admin.id,
        createdAt: purchaseDate,
      },
    });
  }

  const packaging = await seedPackaging({
    companyId: company.id,
    name: PACKAGING_NAME,
    presentationId: presentation.id,
    stock: PACKAGING_STOCK,
    unitCost: PACKAGING_UNIT_COST,
    lot: PACKAGING_LOT,
    createdBy: admin.id,
  });
  packagingId = packaging.productId;
  packagingBatchId = packaging.batchId;

  const productA = productIds.get('a')!;
  const productB = productIds.get('b')!;
  const productC = productIds.get('c')!;

  originalId = (
    await prisma.recipe.create({
      data: {
        name: ORIGINAL_NAME,
        nameNormalized: normalizeRecipeName(ORIGINAL_NAME),
        createdBy: admin.id,
        companyId: company.id,
        lines: {
          create: [
            { productId: productA, percentage: '70.00' },
            { productId: productB, percentage: '30.00' },
          ],
        },
      },
      select: { id: true },
    })
  ).id;

  versionId = (
    await prisma.recipe.create({
      data: {
        name: VERSION_NAME,
        nameNormalized: normalizeRecipeName(VERSION_NAME),
        createdBy: admin.id,
        companyId: company.id,
        parentRecipeId: originalId,
        lines: {
          create: [
            { productId: productA, percentage: '50.00' },
            { productId: productC, percentage: '50.00' },
          ],
        },
      },
      select: { id: true },
    })
  ).id;

  plainRecipeId = (
    await prisma.recipe.create({
      data: {
        name: PLAIN_RECIPE_NAME,
        nameNormalized: normalizeRecipeName(PLAIN_RECIPE_NAME),
        createdBy: admin.id,
        companyId: company.id,
        lines: { create: [{ productId: productA, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  const scopedCompanyId = companyId;
  const byCompany = <T>(run: (id: string) => Promise<T>) => () =>
    scopedCompanyId ? run(scopedCompanyId) : Promise.resolve();

  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    byCompany((id) => prisma.reservationMovement.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.inventoryMovement.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.orderAssignment.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.orderPresentationLine.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.order.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.productBatch.deleteMany({ where: { companyId: id } })),
    byCompany((id) =>
      prisma.product.deleteMany({ where: { companyId: id, recipeId: { not: null } } }),
    ),
    byCompany((id) =>
      prisma.recipe.deleteMany({ where: { companyId: id, parentRecipeId: { not: null } } }),
    ),
    byCompany((id) => prisma.recipe.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.product.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.presentation.deleteMany({ where: { companyId: id } })),
    () => prisma.user.deleteMany({ where: { username: adminUser.username } }),
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

test.describe('version de receta en el pedido', () => {
  test('R44, R30 - el pedido con una version guarda la version y reserva sus lineas, no las de la original', async ({
    page,
  }) => {
    expect(originalId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(versionId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(plainRecipeId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (originalId === null || versionId === null || plainRecipeId === null) return;

    await loginAndLand(page, adminUser);

    await page.goto(ordersUrl());
    await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('order-create-open').first().click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

    const recipePicker = page.getByTestId('recipe-picker');
    const versionTrigger = page.getByTestId('recipe-version-select');
    const versionValue = page.getByTestId('recipe-version-select-value');

    // --- 1. Receta sin versiones: el selector se queda en «Original» y deshabilitado.
    await recipePicker.click();
    await recipePicker.fill(PLAIN_RECIPE_NAME);
    const plainOption = page
      .getByTestId('recipe-picker-option')
      .filter({ hasText: PLAIN_RECIPE_NAME });
    await expect(plainOption).toHaveCount(1, { timeout: 60_000 });
    await plainOption.click();
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(plainRecipeId);
    await expect(versionTrigger).toBeDisabled();
    await expect(versionValue).toHaveValue('');

    // --- 2. La original, que si tiene version: el selector se habilita al llegar el listado.
    await recipePicker.click();
    await recipePicker.fill(ORIGINAL_NAME);
    const originalOption = page
      .getByTestId('recipe-picker-option')
      .filter({ hasText: ORIGINAL_NAME });
    await expect(originalOption).toHaveCount(1, { timeout: 60_000 });
    await originalOption.click();
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(originalId);
    await expect(versionTrigger).toBeEnabled({ timeout: 60_000 });

    await versionTrigger.click();
    await page.locator(`[data-testid="recipe-version-select-option"][data-value="${versionId}"]`).click();
    await expect(versionValue).toHaveValue(versionId);

    // QC-170: unidad del pedido y reparto en lugar de la presentacion unica. Toda la cantidad en
    // una sola linea: con contenido 1, un envase por unidad del pedido.
    await page.getByTestId('order-field-quantity').fill(ORDER_QUANTITY);
    await page.getByTestId('order-form').getByTestId('presentation-unit-select').click();
    await page.locator(`[data-testid="presentation-unit-option"][data-value="${unitId}"]`).click();

    const distribution = page.getByTestId('order-distribution-field');
    await addPackagingLine(
      page,
      page.getByTestId('order-form'),
      { productId: packagingId ?? '', name: PACKAGING_NAME },
      ORDER_QUANTITY,
    );
    await expect(distribution.getByTestId('order-distribution-available')).toHaveAttribute(
      'data-state',
      'ready',
      { timeout: 60_000 },
    );

    await page.getByTestId('order-form-submit').click();
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });

    // --- 3. En la base: el pedido guarda la version y lo apartado sale de sus lineas.
    const orders = await prisma.order.findMany({
      where: { companyId: companyId!, deletedAt: null },
      select: { id: true, recipeId: true },
    });
    expect(orders).toHaveLength(1);
    const [order] = orders;
    expect(order.recipeId).toBe(versionId);

    const movements = await prisma.reservationMovement.findMany({
      where: { orderId: order.id },
      select: { batchId: true, kind: true, quantity: true },
    });
    // El envase tambien queda apartado; aqui solo cuentan las lineas de la receta.
    const reservedByBatch = new Map<string, number>();
    for (const movement of movements) {
      if (movement.batchId === packagingBatchId) continue;
      const sign = movement.kind === 'reserve' ? 1 : -1;
      reservedByBatch.set(
        movement.batchId,
        (reservedByBatch.get(movement.batchId) ?? 0) + sign * Number(movement.quantity),
      );
    }

    expect(reservedByBatch.get(batchIds.get('a')!)).toBe(Number(EXPECTED_RESERVED_A));
    expect(reservedByBatch.get(batchIds.get('c')!)).toBe(Number(EXPECTED_RESERVED_C));
    expect(reservedByBatch.get(batchIds.get('b')!) ?? 0).toBe(0);
    expect([...reservedByBatch.keys()].sort()).toEqual(
      [batchIds.get('a')!, batchIds.get('c')!].sort(),
    );
  });
});
