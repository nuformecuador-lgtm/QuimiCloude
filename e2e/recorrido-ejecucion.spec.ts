/**
 * E2E del recorrido de ejecucion en el dashboard (QC-167, T15: R28, R29, R18, R23, R1, R2, R13).
 *
 * Cuatro casos, cuatro `test()`. Ninguno escribe en la base: todos leen el mismo fixture, asi que
 * el orden entre ellos no importa.
 *
 * FIXTURE (sembrado por Prisma, como `e2e/ejecucion-receta.spec.ts`):
 * - una empresa efimera con un Administrador y un Operador (roles REALES del seed: sus permisos
 *   son el dato bajo prueba de R28 y R29);
 * - pedido A, `POR_EMPACAR`, con anotaciones de las DOS personas y un retroceder del
 *   Administrador;
 * - pedido B, `EN_CURSO`, con anotaciones solo del Operador;
 * - pedido C, DADO DE BAJA, con anotaciones de las dos personas. El CHECK
 *   `orders_delivered_not_deleted` solo deja dar de baja un pedido que no este entregado,
 *   cancelado, por empacar ni en empaque: se siembra `EN_CURSO`;
 * - pedido D, de OTRA empresa efimera, con anotaciones de una persona de esa empresa (la FK
 *   compuesta de `order_execution_entries` exige que pedido y persona sean de la empresa de la
 *   fila).
 *
 * AISLAMIENTO: prefijo propio `qc167_e2e_` + `RUN_ID` por proceso de worker, empresas efimeras
 * -`companies_name_unique` es GLOBAL- y limpieza de huerfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base. La limpieza de `afterAll` borra solo por
 * los identificadores de este worker.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import { TRACE_LINK_TEXT } from '@/app/(private)/dashboard/components/execution-trace-columns';
import {
  DELETED_ORDER_MARK,
  GO_BACK_MARK,
} from '@/app/(private)/dashboard/components/execution-trace-format';
import {
  ORDER_NUMBER_PARAM,
  PERSON_PARAM,
} from '@/app/(private)/dashboard/components/execution-trace-list-params';
import { EXECUTION_TRACE_TABLE_TEXTS } from '@/app/(private)/dashboard/components/execution-trace-table';
import {
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  buildDisplayName,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, executionTraceRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc167_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const OTHER_COMPANY_NAME = `${SHARED_TOKEN}_otra`;

const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const OTHER_RECIPE_NAME = `${SHARED_TOKEN}_receta_otra`;

type Credentials = { readonly username: string; readonly password: string };

type SeedUser = Credentials & { readonly firstNames: string; readonly lastNames: string };

/** Ve el dashboard (`dashboard.consultar`) y es una de las dos personas con anotaciones. */
const adminUser: SeedUser = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc167-Admin-${RUN_ID.slice(0, 12)}`,
  firstNames: `Qc167A${RUN_ID.slice(0, 6)}`,
  lastNames: 'Administrador',
};

/** Sin `dashboard.consultar`: el actor de R29, y la otra persona con anotaciones. */
const operatorUser: SeedUser = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc167-Operador-${RUN_ID.slice(0, 12)}`,
  firstNames: `Qc167O${RUN_ID.slice(0, 6)}`,
  lastNames: 'Operador',
};

/** La persona de la otra empresa: nunca entra, solo firma las anotaciones del pedido ajeno. */
const otherCompanyUser: SeedUser = {
  username: `${SHARED_TOKEN}_ajeno`,
  password: `Qc167-Ajeno-${RUN_ID.slice(0, 12)}`,
  firstNames: `Qc167X${RUN_ID.slice(0, 6)}`,
  lastNames: 'Ajeno',
};

const ORDER_QUANTITY = '3.0';

/**
 * Posicion inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const BASE_SEQUENCE = 700_000 + Math.floor(Math.random() * 90_000);

const SEQUENCE_A = BASE_SEQUENCE;
const SEQUENCE_B = BASE_SEQUENCE + 1;
const SEQUENCE_DELETED = BASE_SEQUENCE + 2;
const SEQUENCE_OTHER = BASE_SEQUENCE + 3;

/** Anotaciones en el pasado reciente, separadas un minuto: el orden cronologico no es ambiguo. */
const ENTRY_SPACING_MS = 60 * 1000;

type EntryAction = 'START' | 'ADVANCE' | 'GO_BACK' | 'FINISH';

/** Las acciones del dominio tal como las pinta `data-action` en el detalle. */
const DOMAIN_ACTION: Readonly<Record<EntryAction, string>> = {
  START: 'start',
  ADVANCE: 'advance',
  GO_BACK: 'go_back',
  FINISH: 'finish',
};

type EntrySpec = { readonly action: EntryAction; readonly step: number; readonly who: 'admin' | 'operator' };

/** Pedido A: el retroceder lo firma el Administrador; el resto, el Operador. */
const ENTRIES_A: readonly EntrySpec[] = [
  { action: 'START', step: 1, who: 'operator' },
  { action: 'ADVANCE', step: 2, who: 'operator' },
  { action: 'GO_BACK', step: 1, who: 'admin' },
  { action: 'ADVANCE', step: 2, who: 'operator' },
  { action: 'FINISH', step: 2, who: 'operator' },
];

const ENTRIES_B: readonly EntrySpec[] = [
  { action: 'START', step: 1, who: 'operator' },
  { action: 'ADVANCE', step: 2, who: 'operator' },
];

const ENTRIES_DELETED: readonly EntrySpec[] = [
  { action: 'START', step: 1, who: 'operator' },
  { action: 'ADVANCE', step: 2, who: 'admin' },
];

const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const DASHBOARD_TITLE_TESTID = 'dashboard-title';
const TRACE_TITLE_TESTID = 'execution-trace-title';
const TRACE_STEP_TESTID = 'execution-trace-step';

/** Nombre visible del filtro de personas: la etiqueta de su columna (`execution-trace-columns`). */
const PERSON_FILTER_LABEL = 'Personas';
const BACK_LINK_NAME = /^Volver/;

let companyId: string | null = null;
let otherCompanyId: string | null = null;
let adminUserId: string | null = null;
let operatorUserId: string | null = null;
let otherUserId: string | null = null;

type SeededOrder = { readonly id: string; readonly numberText: string; readonly sequence: number };

let orderA: SeededOrder | null = null;
let orderB: SeededOrder | null = null;
let orderDeleted: SeededOrder | null = null;
let orderOther: SeededOrder | null = null;

function rowsLocator(page: Page): Locator {
  return page.locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`);
}

function rowOf(page: Page, order: SeededOrder): Locator {
  return page.getByTestId(`${TABLE_ROW_TESTID_PREFIX}${order.id}`);
}

function traceLinkName(order: SeededOrder): string {
  return `${TRACE_LINK_TEXT} del pedido ${order.numberText}`;
}

function displayNameOf(user: SeedUser): string {
  return buildDisplayName(user.firstNames, user.lastNames, user.username);
}

async function createUser(user: SeedUser, roleId: string, ownerCompanyId: string): Promise<string> {
  const created = await prisma.user.create({
    data: {
      firstNames: user.firstNames,
      lastNames: user.lastNames,
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId: ownerCompanyId,
      // Explicito, no por defecto: la columna es `@default(pending)` y ese estado no entra por
      // el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return created.id;
}

async function createRecipe(name: string, ownerCompanyId: string, createdBy: string): Promise<string> {
  const recipe = await prisma.recipe.create({
    data: {
      name,
      nameNormalized: normalizeRecipeName(name),
      createdBy,
      companyId: ownerCompanyId,
      steps: [] as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return recipe.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(params: {
  readonly companyId: string;
  readonly recipeId: string;
  readonly unitId: string;
  readonly sequence: number;
  readonly status: 'EN_CURSO' | 'POR_EMPACAR';
  readonly deleted?: boolean;
}): Promise<SeededOrder> {
  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId: params.companyId,
      orderYear: year,
      orderSequence: params.sequence,
      recipeId: params.recipeId,
      quantity: ORDER_QUANTITY,
      unitId: params.unitId,
      status: params.status,
      deletedAt: params.deleted ? new Date() : null,
    },
    select: { id: true },
  });
  return {
    id: order.id,
    numberText: formatOrderNumber({ year, sequence: params.sequence }),
    sequence: params.sequence,
  };
}

async function seedEntries(params: {
  readonly companyId: string;
  readonly orderId: string;
  readonly entries: readonly EntrySpec[];
  readonly userIds: Readonly<Record<EntrySpec['who'], string>>;
}): Promise<void> {
  const start = Date.now() - (params.entries.length + 1) * ENTRY_SPACING_MS;
  await prisma.orderExecutionEntry.createMany({
    data: params.entries.map((entry, index) => ({
      companyId: params.companyId,
      orderId: params.orderId,
      userId: params.userIds[entry.who],
      action: entry.action,
      stepPosition: entry.step,
      occurredAt: new Date(start + index * ENTRY_SPACING_MS),
    })),
  });
}

/** Borra todo lo que cuelga de estas empresas, en el orden que imponen las FK RESTRICT. */
async function deleteCompanyData(companyIds: readonly string[]): Promise<void> {
  if (companyIds.length === 0) return;
  const ids = [...companyIds];
  await prisma.orderExecutionEntry.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.orderAssignment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.order.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.recipe.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
}

test.beforeAll(async () => {
  // Los roles nunca se crean aqui: `roles.name` es unico y sus permisos son el dato bajo prueba.
  const [adminRole, operatorRole] = await Promise.all([
    prisma.role.findUnique({ where: { name: ROLE_ADMINISTRADOR }, select: { id: true } }),
    prisma.role.findUnique({ where: { name: ROLE_OPERADOR }, select: { id: true } }),
  ]);
  if (!adminRole || !operatorRole) {
    throw new Error(
      `faltan los roles "${ROLE_ADMINISTRADOR}" / "${ROLE_OPERADOR}": este E2E no los crea porque ` +
        'sus permisos son el dato bajo prueba. Siembra la base con `pnpm run db:seed` antes.',
    );
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS: solo empresas de este prefijo con mas de una hora.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  await deleteCompanyData(orphanCompanies.map((company) => company.id));

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;
  otherCompanyId = (
    await prisma.company.create({
      data: { name: OTHER_COMPANY_NAME, nameNormalized: normalizeCompanyName(OTHER_COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUser(adminUser, adminRole.id, companyId);
  operatorUserId = await createUser(operatorUser, operatorRole.id, companyId);
  otherUserId = await createUser(otherCompanyUser, operatorRole.id, otherCompanyId);

  // La unidad NO se crea: es una de las del catalogo arrancador, igual que en
  // `e2e/ejecucion-receta.spec.ts`.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  const recipeId = await createRecipe(RECIPE_NAME, companyId, adminUserId);
  const otherRecipeId = await createRecipe(OTHER_RECIPE_NAME, otherCompanyId, otherUserId);

  const base = { companyId, recipeId, unitId: unit.id };
  orderA = await seedOrder({ ...base, sequence: SEQUENCE_A, status: 'POR_EMPACAR' });
  orderB = await seedOrder({ ...base, sequence: SEQUENCE_B, status: 'EN_CURSO' });
  orderDeleted = await seedOrder({
    ...base,
    sequence: SEQUENCE_DELETED,
    status: 'EN_CURSO',
    deleted: true,
  });
  orderOther = await seedOrder({
    companyId: otherCompanyId,
    recipeId: otherRecipeId,
    unitId: unit.id,
    sequence: SEQUENCE_OTHER,
    status: 'EN_CURSO',
  });

  const userIds = { admin: adminUserId, operator: operatorUserId };
  await seedEntries({ companyId, orderId: orderA.id, entries: ENTRIES_A, userIds });
  await seedEntries({ companyId, orderId: orderB.id, entries: ENTRIES_B, userIds });
  await seedEntries({ companyId, orderId: orderDeleted.id, entries: ENTRIES_DELETED, userIds });
  await seedEntries({
    companyId: otherCompanyId,
    orderId: orderOther.id,
    entries: ENTRIES_B,
    userIds: { admin: otherUserId, operator: otherUserId },
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto
  // (Chromium/WebKit) sigue corriendo.
  const ids = [companyId, otherCompanyId].filter((id): id is string => id !== null);
  let fallo: unknown;
  try {
    await deleteCompanyData(ids);
  } catch (error) {
    fallo = error;
  }
  await prisma.$disconnect();
  if (fallo !== undefined) throw fallo;
});

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt tarda a proposito.
test.setTimeout(180_000);

function requireFixture(): {
  a: SeededOrder;
  b: SeededOrder;
  deleted: SeededOrder;
  other: SeededOrder;
  adminId: string;
} {
  if (!orderA || !orderB || !orderDeleted || !orderOther || !adminUserId) {
    throw new Error('el fixture no existe: fallo el beforeAll');
  }
  return { a: orderA, b: orderB, deleted: orderDeleted, other: orderOther, adminId: adminUserId };
}

test.describe('el recorrido de ejecucion en el dashboard', () => {
  test('R28 - el Administrador ve los pedidos de su empresa y no el ajeno, filtra por persona y por numero, abre el recorrido con la vuelta atras marcada y al volver recupera la lista con los mismos filtros', async ({
    page,
  }) => {
    const { a, b, deleted, other, adminId } = requireFixture();

    await loginAndLand(page, adminUser);
    await page.goto(DASHBOARD_ROUTE);
    await expect(page.getByTestId(DASHBOARD_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Los tres pedidos de su empresa con anotaciones; el de la otra empresa, nunca (R23).
    await expect(rowOf(page, a)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowOf(page, b)).toHaveCount(1);
    await expect(rowOf(page, deleted)).toHaveCount(1);
    await expect(rowOf(page, other)).toHaveCount(0);
    await expect(page.getByText(other.numberText)).toHaveCount(0);

    // Filtro por persona: el Administrador solo firmo en A y en el dado de baja.
    await page.getByRole('button', { name: PERSON_FILTER_LABEL, exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: displayNameOf(adminUser) }).click();
    await page.waitForURL((url) => url.searchParams.get(PERSON_PARAM) === adminId, {
      timeout: 60_000,
    });
    await page.keyboard.press('Escape');
    await expect(rowOf(page, b)).toHaveCount(0, { timeout: 60_000 });
    await expect(rowOf(page, a)).toHaveCount(1);
    await expect(rowOf(page, deleted)).toHaveCount(1);

    // Filtro por una parte del numero que solo casa con A: su secuencia con el relleno visible.
    const numberPart = a.numberText.slice(a.numberText.indexOf('-') + 1);
    await page.getByRole('searchbox', { name: EXECUTION_TRACE_TABLE_TEXTS.search }).fill(numberPart);
    await page.waitForURL(
      (url) =>
        url.searchParams.get(ORDER_NUMBER_PARAM) === numberPart &&
        url.searchParams.get(PERSON_PARAM) === adminId,
      { timeout: 60_000 },
    );
    await expect(rowsLocator(page)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowOf(page, a)).toHaveCount(1);

    const listUrl = page.url();

    // Abre el recorrido: anotaciones en orden cronologico y la vuelta atras marcada.
    await page.getByRole('link', { name: traceLinkName(a) }).click();
    await page.waitForURL((url) => url.pathname === executionTraceRoute(a.id), { timeout: 60_000 });
    await expect(page.getByTestId(TRACE_TITLE_TESTID)).toContainText(a.numberText, {
      timeout: 60_000,
    });

    const steps = page.getByRole('list', { name: 'Anotaciones' }).getByTestId(TRACE_STEP_TESTID);
    await expect(steps).toHaveCount(ENTRIES_A.length);
    const actions = await steps.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-action')),
    );
    expect(actions).toEqual(ENTRIES_A.map((entry) => DOMAIN_ACTION[entry.action]));
    await expect(page.getByText(GO_BACK_MARK, { exact: true })).toBeVisible();

    // «Volver» devuelve a la MISMA URL de lista, con los mismos filtros.
    await page.getByRole('link', { name: BACK_LINK_NAME }).click();
    await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });
    expect(page.url()).toBe(listUrl);
    await expect(rowsLocator(page)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowOf(page, a)).toHaveCount(1);
    await expect(page.getByRole('searchbox', { name: EXECUTION_TRACE_TABLE_TEXTS.search })).toHaveValue(
      numberPart,
    );
  });

  test('R29 - el Operador recibe 404 en el dashboard y en el recorrido de un pedido de su propia empresa', async ({
    page,
  }) => {
    const { a } = requireFixture();

    await loginAndLand(page, operatorUser);

    const listResponse = await page.goto(DASHBOARD_ROUTE);
    expect(listResponse?.status(), 'sin dashboard.consultar el dashboard debe responder 404').toBe(404);
    await expect(page.getByTestId(DASHBOARD_TITLE_TESTID)).toHaveCount(0);

    const traceResponse = await page.goto(executionTraceRoute(a.id));
    expect(traceResponse?.status(), 'sin dashboard.consultar el recorrido debe responder 404').toBe(404);
    await expect(page.getByTestId(TRACE_TITLE_TESTID)).toHaveCount(0);
  });

  test('R18 R23 - el Administrador pide el recorrido del pedido de otra empresa y recibe 404', async ({
    page,
  }) => {
    const { other } = requireFixture();

    await loginAndLand(page, adminUser);

    const response = await page.goto(executionTraceRoute(other.id));
    expect(response?.status(), 'el pedido de otra empresa debe responder 404').toBe(404);
    await expect(page.getByTestId(TRACE_TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByText(other.numberText)).toHaveCount(0);
  });

  test('R1 R2 R13 R18 - el pedido dado de baja sale en la lista con la marca «Dado de baja» y su recorrido se abre con la misma marca', async ({
    page,
  }) => {
    const { deleted } = requireFixture();

    await loginAndLand(page, adminUser);
    await page.goto(DASHBOARD_ROUTE);
    await expect(page.getByTestId(DASHBOARD_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const row = rowOf(page, deleted);
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await expect(row).toContainText(deleted.numberText);
    await expect(row.getByText(DELETED_ORDER_MARK, { exact: true })).toBeVisible();

    await row.getByRole('link', { name: traceLinkName(deleted) }).click();
    await page.waitForURL((url) => url.pathname === executionTraceRoute(deleted.id), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(TRACE_TITLE_TESTID)).toContainText(deleted.numberText, {
      timeout: 60_000,
    });
    await expect(page.getByText(DELETED_ORDER_MARK, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Anotaciones' }).getByTestId(TRACE_STEP_TESTID),
    ).toHaveCount(ENTRIES_DELETED.length);

    // La misma pagina pedida directamente responde 200, no 404 (R18).
    const direct = await page.goto(executionTraceRoute(deleted.id));
    expect(direct?.status()).toBe(200);
    await expect(page.getByText(DELETED_ORDER_MARK, { exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
