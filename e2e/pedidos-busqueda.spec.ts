/**
 * E2E de la caja de busqueda de `/pedidos`: recorta la lista por nombre de receta, entra y sale
 * de la URL como `q`, muestra «sin coincidencias» cuando corresponde y sobrevive a la
 * paginacion, al panel lateral, a recargar y a «Atras» (R25 a, c, d; R9; R26).
 *
 * Nada del importe: esa mitad del guion original se movio a QC-151.
 *
 * DATOS: empresa, usuario y recetas efimeros de este worker, con el prefijo `qc122_e2e_` y el
 * `RUN_ID` dentro, igual que el resto de `e2e/`. La receta B nace y se da de baja aparte: un
 * pedido conserva su receta aunque la den de baja, y la busqueda tiene que seguir encontrandola.
 * La receta C recibe mas de diez pedidos para que el termino que la casa de dos paginas con el
 * tamano de pagina por defecto.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, ORDERS_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc122_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez, y otro worktree puede tener su propia ejecucion viva. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
const adminUsername = `${FIXTURE_PREFIX}admin_${RUN_ID}`;
const adminPassword = `Qc122-Admin-${RUN_ID.slice(0, 12)}`;

/** Recetas del fixture. A y B casan con el termino con acentos y mayusculas quitados; C no. */
const recipeAName = `${FIXTURE_PREFIX}Ácido Cítrico ${RUN_ID}`;
const recipeBName = `${FIXTURE_PREFIX}Acido citrico baja ${RUN_ID}`;
const recipeCName = `${FIXTURE_PREFIX}Sosa ${RUN_ID}`;

/** Cantidad de pedidos de la receta C: mas de diez para que el tamano de pagina por defecto de
 *  la lista los reparta en dos paginas. */
const RECIPE_C_ORDER_COUNT = 12;

const ORDER_QUANTITY = '5';

const SEARCH_TERM_A_AND_B = 'acido citrico';
const SEARCH_TERM_C = 'sosa';
const SEARCH_TERM_NO_MATCH = `${FIXTURE_PREFIX}sin_coincidencias`;

const ORDERS_TITLE = 'pedidos-title';
const SEARCH_BOX = 'data-table-search';
const ORDER_TABLE = 'order-table';
const NO_MATCHES = 'order-list-no-matches';
const CLEAR_SEARCH = 'order-list-clear-search';
const EMPTY_STATE = 'order-list-empty';
const ORDER_NUMBER_CELL = 'data-table-cell-orderNumber';
const NEXT_PAGE = 'data-table-next';
const EDIT_ACTION = 'order-action-edit';
const ORDER_FORM = 'order-form';

let companyId: string | null = null;
let adminUserId: string | null = null;
let recipeAId: string | null = null;
let recipeBId: string | null = null;
let recipeCId: string | null = null;

function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function ordersUrl(): string {
  return ORDERS_ROUTE;
}

/** Los correlativos que se ven en la lista, en el orden en que aparecen. */
async function visibleOrderNumbers(page: Page): Promise<string[]> {
  return page.getByTestId(ORDER_NUMBER_CELL).allTextContents();
}

async function seedOrder(sequence: number, recipeId: string) {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  return prisma.order.create({
    data: {
      companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      status: 'PENDIENTE',
      createdBy: adminUserId,
    },
    select: { id: true },
  });
}

test.beforeAll(async () => {
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": siembra la base con \`pnpm run db:seed\` antes de ` +
        'correr `pnpm run e2e`.',
    );
  }

  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanRecipeIds = (
    await prisma.recipe.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((recipe) => recipe.id);
  if (orphanRecipeIds.length > 0) {
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
  }
  await prisma.recipe.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  adminUserId = (
    await prisma.user.create({
      data: {
        firstNames: `Qc122${RUN_ID.slice(0, 8)}`,
        lastNames: 'Busqueda',
        birthDate: new Date('1990-01-01'),
        email: `${adminUsername}@example.test`,
        phone: '+573000000000',
        documentTypeCode: 'CC',
        documentNumber: adminUsername,
        username: adminUsername,
        passwordHash: await createPasswordHash(adminPassword),
        roleId: role.id,
        companyId,
        accountStatus: 'active',
      },
      select: { id: true },
    })
  ).id;

  recipeAId = (
    await prisma.recipe.create({
      data: {
        name: recipeAName,
        nameNormalized: normalizeRecipeName(recipeAName),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  recipeBId = (
    await prisma.recipe.create({
      data: {
        name: recipeBName,
        nameNormalized: normalizeRecipeName(recipeBName),
        createdBy: adminUserId,
        companyId,
        deletedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  recipeCId = (
    await prisma.recipe.create({
      data: {
        name: recipeCName,
        nameNormalized: normalizeRecipeName(recipeCName),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  let sequence = 1;
  await seedOrder(sequence++, recipeAId);
  await seedOrder(sequence++, recipeAId);
  await seedOrder(sequence++, recipeBId);
  for (let i = 0; i < RECIPE_C_ORDER_COUNT; i++) {
    await seedOrder(sequence++, recipeCId);
  }
});

test.afterAll(async () => {
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.order.deleteMany({ where: { companyId: companyId ?? '' } }),
    () =>
      prisma.recipe.deleteMany({
        where: { name: { in: [recipeAName, recipeBName, recipeCName] } },
      }),
    () => prisma.user.deleteMany({ where: { username: adminUsername } }),
    () => prisma.company.deleteMany({ where: { name: companyName } }),
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
test.setTimeout(240_000);

test.describe('busqueda en la pantalla de pedidos', () => {
  test('escribir un termino recorta la lista a lo que devuelve la consulta, y la URL lleva `q` (R25 a)', async ({
    page,
  }) => {
    if (!companyId || !recipeAId || !recipeBId || !companyId) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }
    const year = new Date().getUTCFullYear();
    const expectedNumbers = [
      formatOrderNumber({ year, sequence: 1 }),
      formatOrderNumber({ year, sequence: 2 }),
      formatOrderNumber({ year, sequence: 3 }),
    ];

    await loginAndLand(page, { username: adminUsername, password: adminPassword });
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    const searchBox = page.getByTestId(SEARCH_BOX);
    await searchBox.fill(SEARCH_TERM_A_AND_B);
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_A_AND_B, {
      timeout: 60_000,
    });

    const numbers = await visibleOrderNumbers(page);
    expect(numbers.sort()).toEqual([...expectedNumbers].sort());
  });

  test('un termino sin coincidencias muestra el estado propio dentro de la tabla, y limpiar devuelve todo (R25 c)', async ({
    page,
  }) => {
    if (!companyId) throw new Error('el fixture no existe: fallo el beforeAll');

    await loginAndLand(page, { username: adminUsername, password: adminPassword });
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    const searchBox = page.getByTestId(SEARCH_BOX);
    await searchBox.fill(SEARCH_TERM_NO_MATCH);
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_NO_MATCH, {
      timeout: 60_000,
    });

    const orderTable = page.getByTestId(ORDER_TABLE);
    await expect(orderTable.getByTestId(NO_MATCHES)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(EMPTY_STATE)).toHaveCount(0);
    await expect(searchBox).toHaveValue(SEARCH_TERM_NO_MATCH);

    await orderTable.getByTestId(CLEAR_SEARCH).click();
    await page.waitForURL((url) => url.searchParams.get('q') === null, { timeout: 60_000 });
    await expect(searchBox).toHaveValue('');
    await expect(orderTable.getByTestId(NO_MATCHES)).toHaveCount(0, { timeout: 60_000 });
  });

  test('el termino sobrevive a cambiar de pagina, al panel lateral, a recargar y a Atras (R25 d, R9, R26)', async ({
    page,
  }) => {
    if (!companyId || !recipeCId) throw new Error('el fixture no existe: fallo el beforeAll');

    await loginAndLand(page, { username: adminUsername, password: adminPassword });
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    const searchBox = page.getByTestId(SEARCH_BOX);
    await searchBox.fill(SEARCH_TERM_C);
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_C, {
      timeout: 60_000,
    });

    const firstPageNumbers = await visibleOrderNumbers(page);
    expect(firstPageNumbers).toHaveLength(10);

    await page.getByTestId(NEXT_PAGE).click();
    await page.waitForURL(
      (url) => url.searchParams.get('q') === SEARCH_TERM_C && url.searchParams.get('page') === '2',
      { timeout: 60_000 },
    );

    const secondPageNumbers = await visibleOrderNumbers(page);
    expect(secondPageNumbers).toHaveLength(RECIPE_C_ORDER_COUNT - 10);
    expect(new Set([...firstPageNumbers, ...secondPageNumbers]).size).toBe(RECIPE_C_ORDER_COUNT);

    const rowWithFirstNumber = (numbers: readonly string[]): Locator =>
      page
        .locator('[data-testid^="data-table-row-"]')
        .filter({
          has: page.getByTestId(ORDER_NUMBER_CELL).filter({ hasText: exactText(numbers[0] ?? '') }),
        });

    // --- El panel lateral: abrir y cerrar no navega ni pierde el termino ni la pagina (R9).
    await rowWithFirstNumber(secondPageNumbers).getByTestId(EDIT_ACTION).click();
    await expect(page.getByTestId(ORDER_FORM)).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    expect(new URL(page.url()).searchParams.get('q')).toBe(SEARCH_TERM_C);

    await page.locator('[data-slot="sheet-close"]').click();
    await expect(page.getByTestId(ORDER_FORM)).toHaveCount(0, { timeout: 60_000 });
    await expect(searchBox).toHaveValue(SEARCH_TERM_C);
    expect(await visibleOrderNumbers(page)).toEqual(secondPageNumbers);

    // --- Recargar (R9): misma URL, misma caja, misma pagina.
    await page.reload();
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    await expect(searchBox).toHaveValue(SEARCH_TERM_C);
    expect(await visibleOrderNumbers(page)).toEqual(secondPageNumbers);

    // --- Ir a otra pantalla y volver con Atras (R26): el termino y la pagina vuelven con la URL.
    await page.goto(DASHBOARD_ROUTE);
    expect(new URL(page.url()).pathname).toBe(DASHBOARD_ROUTE);

    await page.goBack();
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).pathname).toBe(ORDERS_ROUTE);
    expect(new URL(page.url()).searchParams.get('q')).toBe(SEARCH_TERM_C);
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    await expect(searchBox).toHaveValue(SEARCH_TERM_C);
    expect(await visibleOrderNumbers(page)).toEqual(secondPageNumbers);
  });

  test('Atras entre dos terminos distintos deja la caja con el termino de la URL (R27)', async ({
    page,
  }) => {
    if (!companyId || !recipeAId || !recipeBId || !recipeCId) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }
    const year = new Date().getUTCFullYear();
    const expectedANumbers = [
      formatOrderNumber({ year, sequence: 1 }),
      formatOrderNumber({ year, sequence: 2 }),
      formatOrderNumber({ year, sequence: 3 }),
    ];

    await loginAndLand(page, { username: adminUsername, password: adminPassword });
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    const searchBox = page.getByTestId(SEARCH_BOX);
    await searchBox.fill(SEARCH_TERM_A_AND_B);
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_A_AND_B, {
      timeout: 60_000,
    });

    await searchBox.fill(SEARCH_TERM_C);
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_C, {
      timeout: 60_000,
    });

    await page.goBack();
    await page.waitForURL((url) => url.searchParams.get('q') === SEARCH_TERM_A_AND_B, {
      timeout: 60_000,
    });
    await expect(searchBox).toHaveValue(SEARCH_TERM_A_AND_B);

    const numbers = await visibleOrderNumbers(page);
    expect(numbers.sort()).toEqual([...expectedANumbers].sort());
  });
});
