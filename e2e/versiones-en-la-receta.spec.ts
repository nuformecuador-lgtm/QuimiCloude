/**
 * E2E de las versiones dentro de la ficha de la receta: se crean dos versiones por pantalla, se
 * edita una, se cambia la original propagando a las dos, y se comprueba en Postgres y en pantalla
 * que solo la version que ya habia tocado sus lineas queda por revisar.
 *
 * DATOS: mismo patron que `e2e/versiones-de-receta.spec.ts` -prefijo propio con el `RUN_ID` del
 * worker, limpieza de huerfanos por prefijo y por edad, y `afterAll` que borra en el orden de las
 * FK-. Las versiones cuelgan de la original con `ON DELETE RESTRICT` y se borran antes.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { FORMULAS_ROUTE, newRecipeVersionRoute, recipeEditRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import { openRowActionsMenuItem } from './helpers/row-actions-menu';

const FIXTURE_PREFIX = 'qc174_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y puede haber otro worktree corriendo su propio E2E. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const ORIGINAL_NAME = `${SHARED_TOKEN}_original`;

const COPY_NAME = 'Copia';
const CHANGED_NAME = 'Cambiada';
const CHANGED_RENAMED = 'Cambiada 2';

const PRODUCT_KEYS = ['a', 'b', 'c'] as const;
type ProductKey = (typeof PRODUCT_KEYS)[number];

const productName = (key: ProductKey) => `${SHARED_TOKEN}_producto_${key}`;

const adminUser = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc174-Admin-${RUN_ID.slice(0, 12)}`,
} as const;

let companyId: string | null = null;
let originalId: string | null = null;
const productIds = new Map<ProductKey, string>();

/** Elige en el `ProductPicker` la opcion cuyo texto es el nombre dado. */
async function selectProductByName(page: Page, testId: string, name: string): Promise<void> {
  const campo = page.getByTestId(testId);
  await campo.click();
  await campo.fill(name);
  const option = page.getByTestId(`${testId}-option`).filter({ hasText: name });
  await expect(option).toHaveCount(1, { timeout: 60_000 });
  await option.click();
  await expect(campo).toHaveValue(name);
}

/** El orden de las lineas al releer la receta no esta garantizado: se busca por producto. */
async function lineIndexOf(page: Page, name: string): Promise<number> {
  const rows = await page.getByTestId('recipe-line-row').count();
  for (let index = 0; index < rows; index += 1) {
    if ((await page.getByTestId(`recipe-line-product-${index}`).inputValue()) === name) {
      return index;
    }
  }
  throw new Error(`no hay linea con el producto "${name}"`);
}

async function linesByProduct(recipeId: string): Promise<Map<string, string>> {
  const lines = await prisma.recipeLine.findMany({
    where: { recipeId },
    select: { productId: true, percentage: true },
  });
  return new Map(lines.map((line) => [line.productId, line.percentage.toFixed(2)]));
}

function sumOf(lines: Map<string, string>): number {
  return [...lines.values()].reduce((total, value) => total + Math.round(Number(value) * 100), 0);
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
    await prisma.recipe.deleteMany({ where: { ...scope, parentRecipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: scope });
    await prisma.product.deleteMany({ where: scope });
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
      firstNames: `Qc174${RUN_ID.slice(0, 8)}`,
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

  for (const key of PRODUCT_KEYS) {
    const name = productName(key);
    const product = await prisma.product.create({
      data: {
        name,
        nameNormalized: normalizeProductName(name),
        unitId: unit.id,
        companyId: company.id,
      },
      select: { id: true },
    });
    productIds.set(key, product.id);
  }

  originalId = (
    await prisma.recipe.create({
      data: {
        name: ORIGINAL_NAME,
        nameNormalized: normalizeRecipeName(ORIGINAL_NAME),
        createdBy: admin.id,
        companyId: company.id,
        lines: {
          create: [
            { productId: productIds.get('a')!, percentage: '60.00' },
            { productId: productIds.get('b')!, percentage: '40.00' },
          ],
        },
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
    byCompany((id) =>
      prisma.recipe.deleteMany({ where: { companyId: id, parentRecipeId: { not: null } } }),
    ),
    byCompany((id) => prisma.recipe.deleteMany({ where: { companyId: id } })),
    byCompany((id) => prisma.product.deleteMany({ where: { companyId: id } })),
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

test.describe('versiones en la ficha de la receta', () => {
  test('R38, R6 - crear y editar versiones desde la ficha, no salen en la lista, y propagar deja por revisar solo la que cambio sus lineas', async ({
    page,
  }) => {
    expect(originalId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (originalId === null || companyId === null) return;

    const nameA = productName('a');
    const nameB = productName('b');
    const nameC = productName('c');
    const idA = productIds.get('a')!;
    const idB = productIds.get('b')!;
    const idC = productIds.get('c')!;
    const originalRoute = recipeEditRoute(originalId);
    const versions = page.getByTestId('recipe-versions');
    const versionLink = (name: string) =>
      versions.getByRole('link', { name, exact: true });

    await loginAndLand(page, adminUser);

    // --- 1. «Copia»: nueva version sin tocar las lineas.
    await page.goto(originalRoute);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('recipe-versions-empty')).toBeVisible();

    await page.getByTestId('recipe-version-new').click();
    await page.waitForURL((url) => url.pathname === newRecipeVersionRoute(originalId!), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('recipe-version-form')).toBeVisible({ timeout: 60_000 });
    // Teclear y no `fill`: WebKit puede perder un unico evento si React aun no ha hidratado.
    await page.getByTestId('recipe-version-field-name').pressSequentially(COPY_NAME, { delay: 20 });
    await expect(page.getByTestId('recipe-version-field-name')).toHaveValue(COPY_NAME);
    await expect(page.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
    await page.getByTestId('recipe-version-form-submit').click();

    await page.waitForURL((url) => url.pathname === originalRoute, { timeout: 60_000 });
    await expect(versionLink(COPY_NAME)).toBeVisible({ timeout: 60_000 });

    // --- 2. «Cambiada»: B al 30 % y C al 10 %.
    await page.getByTestId('recipe-version-new').click();
    await page.waitForURL((url) => url.pathname === newRecipeVersionRoute(originalId!), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('recipe-version-form')).toBeVisible({ timeout: 60_000 });
    await page
      .getByTestId('recipe-version-field-name')
      .pressSequentially(CHANGED_NAME, { delay: 20 });
    await expect(page.getByTestId('recipe-version-field-name')).toHaveValue(CHANGED_NAME);

    const indexB = await lineIndexOf(page, nameB);
    await page.getByTestId(`recipe-line-percentage-${indexB}`).fill('30');
    await expect(page.getByTestId(`recipe-line-percentage-${indexB}`)).toHaveValue('30');
    // La suma sale del estado, no del DOM: confirma que el 30 se asento antes de seguir editando.
    await expect(page.getByTestId('recipe-lines-sum')).toContainText('Suma: 90,00 %');
    await page.getByTestId(`recipe-line-add-${indexB}`).click();
    await selectProductByName(page, `recipe-line-product-${indexB + 1}`, nameC);
    await page.getByTestId(`recipe-line-percentage-${indexB + 1}`).fill('10');
    await expect(page.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
    await page.getByTestId('recipe-version-form-submit').click();

    await page.waitForURL((url) => url.pathname === originalRoute, { timeout: 60_000 });
    await expect(versionLink(CHANGED_NAME)).toBeVisible({ timeout: 60_000 });

    // Edicion: se renombra «Cambiada» a «Cambiada 2».
    await versionLink(CHANGED_NAME).click();
    await expect(page.getByTestId('recipe-version-form')).toBeVisible({ timeout: 60_000 });
    const nameField = page.getByTestId('recipe-version-field-name');
    await expect(nameField).toHaveValue(CHANGED_NAME);
    await nameField.click();
    await nameField.press('End');
    await nameField.pressSequentially(' 2', { delay: 20 });
    await expect(nameField).toHaveValue(CHANGED_RENAMED);
    await page.getByTestId('recipe-version-form-submit').click();

    await page.waitForURL((url) => url.pathname === originalRoute, { timeout: 60_000 });
    await expect(versionLink(CHANGED_RENAMED)).toBeVisible({ timeout: 60_000 });
    await expect(versionLink(CHANGED_NAME)).toHaveCount(0);

    const saved = await prisma.recipe.findMany({
      where: { parentRecipeId: originalId, deletedAt: null },
      select: { id: true, name: true },
    });
    expect(saved.map((version) => version.name).sort()).toEqual([CHANGED_RENAMED, COPY_NAME]);
    const copyId = saved.find((version) => version.name === COPY_NAME)!.id;
    const changedId = saved.find((version) => version.name === CHANGED_RENAMED)!.id;

    const copyBefore = await linesByProduct(copyId);
    expect(Object.fromEntries(copyBefore)).toEqual({ [idA]: '60.00', [idB]: '40.00' });
    const changedBefore = await linesByProduct(changedId);
    expect(Object.fromEntries(changedBefore)).toEqual({
      [idA]: '60.00',
      [idB]: '30.00',
      [idC]: '10.00',
    });

    // --- 3. La lista de formulas solo ensena la original.
    await page.goto(`${FORMULAS_ROUTE}?pageSize=25`);
    await expect(page.getByTestId('recipes-title')).toBeVisible({ timeout: 60_000 });
    const table = page.getByTestId('recipe-table');
    await expect(table).toBeVisible({ timeout: 60_000 });
    const rowActions = page.getByTestId('recipe-row-actions');
    await expect(rowActions).toHaveCount(1);
    await expect(rowActions).toHaveAttribute('aria-label', `Acciones de ${ORIGINAL_NAME}`);
    await expect(await openRowActionsMenuItem(page, rowActions, 'recipe-edit-open')).toHaveAttribute(
      'href',
      originalRoute,
    );
    await expect(table).not.toContainText(COPY_NAME);
    await expect(table).not.toContainText(CHANGED_NAME);

    // --- 4. La original pasa a A 70 / B 30 y propaga a las dos versiones.
    await page.goto(originalRoute);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });
    await expect(versionLink(CHANGED_RENAMED)).toBeVisible({ timeout: 60_000 });

    // B baja primero: el campo recorta al restante y A no podria subir con la suma ya en 100.
    const originalIndexB = await lineIndexOf(page, nameB);
    const originalIndexA = await lineIndexOf(page, nameA);
    // Se reintenta porque lo escrito antes de hidratar no llega al estado, y WebKit hidrata tarde.
    // La suma sale del estado: sin ella, en WebKit el recorte de A se calcula aun con B en 40.
    const originalPercentageB = page.getByTestId(`recipe-line-percentage-${originalIndexB}`);
    await expect(async () => {
      await originalPercentageB.fill('');
      await originalPercentageB.fill('30');
      await expect(page.getByTestId('recipe-lines-sum')).toContainText('Suma: 90,00 %', {
        timeout: 15_000,
      });
    }).toPass({ timeout: 120_000 });
    await expect(originalPercentageB).toHaveValue('30');
    await expect(page.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'false');
    await page.getByTestId(`recipe-line-percentage-${originalIndexA}`).fill('70');
    await expect(page.getByTestId(`recipe-line-percentage-${originalIndexA}`)).toHaveValue('70');
    await expect(page.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
    await page.getByTestId('recipe-form-submit').click();

    const dialog = page.getByTestId('propagate-versions-dialog');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const checkboxes = dialog.getByTestId('propagate-version-checkbox');
    await expect(checkboxes).toHaveCount(2);
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    await dialog.getByTestId('propagate-versions-confirm').click();

    // --- 6 (pantalla). Se queda en la ficha con el aviso, que nombra solo «Cambiada 2».
    const underReview = page.getByTestId('recipe-form-under-review');
    await expect(underReview).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).pathname).toBe(originalRoute);
    const underReviewLinks = underReview.getByTestId('recipe-form-under-review-link');
    await expect(underReviewLinks).toHaveCount(1);
    await expect(underReviewLinks).toHaveText(CHANGED_RENAMED);

    // --- 5. Postgres: «Copia» sigue sumando 100; «Cambiada 2» conserva B y C y suma 110.
    await expect
      .poll(async () => Object.fromEntries(await linesByProduct(copyId)), { timeout: 30_000 })
      .toEqual({ [idA]: '70.00', [idB]: '30.00' });
    const copyAfter = await linesByProduct(copyId);
    expect(sumOf(copyAfter)).toBe(10_000);

    const changedAfter = await linesByProduct(changedId);
    expect(Object.fromEntries(changedAfter)).toEqual({
      [idA]: '70.00',
      [idB]: '30.00',
      [idC]: '10.00',
    });
    expect(sumOf(changedAfter)).toBe(11_000);

    // --- 6 (seccion «Versiones»). «Por revisar» solo en «Cambiada 2», ya refrescada.
    const rowOf = (name: string) =>
      versions
        .getByTestId('recipe-version-row')
        .filter({ has: page.getByRole('link', { name, exact: true }) });
    await expect(rowOf(CHANGED_RENAMED).getByTestId('recipe-version-under-review')).toBeVisible({
      timeout: 60_000,
    });
    await expect(rowOf(COPY_NAME).getByTestId('recipe-version-under-review')).toHaveCount(0);
    await expect(versions.getByTestId('recipe-version-under-review')).toHaveCount(1);
  });
});
