/**
 * E2E del Empacador frente a los pedidos que aun no estan por empacar, con los roles REALES del
 * seed: sus permisos son el dato bajo prueba, asi que nunca se crea un rol aqui.
 *
 * Cada `test()` tiene sus propios pedidos: con `fullyParallel` dos casos pueden compartir worker y
 * fixture, y el caso que hace entrar al Operador mueve su pedido a `EN_CURSO`.
 *
 * Los estados se leen de la base, no de la pantalla: lo unico que demuestra que el 404 no movio el
 * pedido es la fila de `orders`.
 *
 * `packed_by` se siembra solo en `ENTREGADO` (el CHECK `orders_packed_by_matches_status` lo
 * prohibe en `PENDIENTE`/`EN_CURSO`) y con personas de la misma empresa (FK compuesta
 * `(packed_by, company_id)`). Por esa FK los pedidos se borran antes que las personas.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  DOCUMENT_TYPE_CC,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ASSIGNED_ORDERS_ROUTE, assignedOrderRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc201_e2e_';

/** Uno por proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza de huerfanos no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** `companies_name_unique` es GLOBAL: nunca la empresa de instalacion. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

type Credentials = { readonly username: string; readonly password: string };

const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc201-Empac-${RUN_ID.slice(0, 12)}`,
};
const otherEmpacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_otroempacador`,
  password: `Qc201-Otro-${RUN_ID.slice(0, 12)}`,
};
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc201-Oper-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [empacadorUser.username]: 'Empaca',
  [otherEmpacadorUser.username]: 'Otroempaca',
  [operatorUser.username]: 'Opera',
};
const firstNames = `Qc201${RUN_ID.slice(0, 8)}`;

const ORDER_QUANTITY = '2.0';

/** Alta y aleatoria: no choca con `orders_company_year_sequence_key` ni con el otro navegador. */
const BASE_SEQUENCE = 610_000 + Math.floor(Math.random() * 80_000);

const SEQUENCE_HIDDEN_PENDING = BASE_SEQUENCE;
const SEQUENCE_HIDDEN_IN_PROGRESS = BASE_SEQUENCE + 1;
const SEQUENCE_EXECUTABLE = BASE_SEQUENCE + 2;
const SEQUENCE_DELIVERED_OWN = BASE_SEQUENCE + 3;
const SEQUENCE_DELIVERED_OTHER = BASE_SEQUENCE + 4;
const SEQUENCE_DELIVERED_NO_PACKER = BASE_SEQUENCE + 5;

const FINISHED_AT = new Date(Date.now() - 6 * 60 * 60 * 1000);

/** Copias locales: los modulos que los exportan son de cliente y arrastrarian React al runner. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ASSIGNMENT_VIEW_TABS_TESTID = 'assignment-view-tabs';
const ASSIGNMENT_VIEW_TAB_TESTID: Readonly<
  Record<'asignados' | 'terminados' | 'todos' | 'por_empacar', string>
> = {
  asignados: 'assignment-view-tab-asignados',
  terminados: 'assignment-view-tab-terminados',
  todos: 'assignment-view-tab-todos',
  por_empacar: 'assignment-view-tab-por_empacar',
};
const ASSIGNED_ORDERS_TABLE_TESTID = 'assigned-orders-table';
const ASSIGNED_ORDERS_EMPTY_TESTID = 'assigned-orders-empty';
const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
const FINISHED_ORDERS_SECTION_TESTID = 'finished-orders-list-section';
const PACKING_ORDERS_SECTION_TESTID = 'packing-orders-list-section';
const PACKING_ORDER_ROW_TESTID = 'packing-order-row';
const PACKING_ORDER_LINK_TESTID = 'packing-order-link';

const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';

const EXECUTION_TITLE_TESTID = 'order-execution-title';
const EXECUTION_ERROR_TESTID = 'order-execution-error';

type SeededOrder = { readonly id: string; readonly numberText: string };

let companyId: string | null = null;
let recipeId: string | null = null;
let empacadorUserId: string | null = null;
let otherEmpacadorUserId: string | null = null;
let operatorUserId: string | null = null;

let hiddenPending: SeededOrder | null = null;
let hiddenInProgress: SeededOrder | null = null;
let executable: SeededOrder | null = null;
let deliveredOwn: SeededOrder | null = null;
let deliveredOther: SeededOrder | null = null;
let deliveredNoPacker: SeededOrder | null = null;

/** Igualdad EXACTA: un correlativo no puede casar con un prefijo suyo. */
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

function executionLinks(page: Page, orderId: string): Locator {
  return page.locator(`a[href="${assignedOrderRoute(orderId)}"]`);
}

function assignmentViewUrl(view: 'asignados' | 'terminados' | 'por_empacar'): string {
  return `${ASSIGNED_ORDERS_ROUTE}?${new URLSearchParams({ vista: view }).toString()}`;
}

async function orderState(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, packedBy: true, updatedAt: true, updatedBy: true },
  });
}

async function roleIdByName(roleName: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque sus permisos son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }
  return role.id;
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
      // La columna es `@default(pending)` y una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(params: {
  sequence: number;
  status: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO';
  finishedAt?: Date | null;
  packedBy?: string | null;
}): Promise<SeededOrder> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  if (!recipeId) throw new Error('la receta del fixture no existe: fallo el beforeAll');

  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: params.sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      status: params.status,
      finishedAt: params.finishedAt ?? null,
      packedBy: params.packedBy ?? null,
    },
    select: { id: true },
  });

  return { id: order.id, numberText: formatOrderNumber({ year, sequence: params.sequence }) };
}

test.beforeAll(async () => {
  const empacadorRoleId = await roleIdByName(ROLE_EMPACADOR);
  const operatorRoleId = await roleIdByName(ROLE_OPERADOR);

  // Orden de las FK RESTRICT: asignaciones -> pedidos -> receta/personas -> empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.recipe.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
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

  empacadorUserId = await createUser(empacadorUser, empacadorRoleId);
  otherEmpacadorUserId = await createUser(otherEmpacadorUser, empacadorRoleId);
  operatorUserId = await createUser(operatorUser, operatorRoleId);

  // Sin pasos ni lineas: abrir la ejecucion de un pedido asi basta para dejarlo `EN_CURSO`.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: operatorUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  [hiddenPending, hiddenInProgress, executable, deliveredOwn, deliveredOther, deliveredNoPacker] =
    await Promise.all([
      seedOrder({ sequence: SEQUENCE_HIDDEN_PENDING, status: 'PENDIENTE' }),
      seedOrder({ sequence: SEQUENCE_HIDDEN_IN_PROGRESS, status: 'EN_CURSO' }),
      seedOrder({ sequence: SEQUENCE_EXECUTABLE, status: 'PENDIENTE' }),
      seedOrder({
        sequence: SEQUENCE_DELIVERED_OWN,
        status: 'ENTREGADO',
        finishedAt: FINISHED_AT,
        packedBy: empacadorUserId,
      }),
      seedOrder({
        sequence: SEQUENCE_DELIVERED_OTHER,
        status: 'ENTREGADO',
        finishedAt: FINISHED_AT,
        packedBy: otherEmpacadorUserId,
      }),
      // Entregado anterior al empaque: sin empacador registrado.
      seedOrder({
        sequence: SEQUENCE_DELIVERED_NO_PACKER,
        status: 'ENTREGADO',
        finishedAt: FINISHED_AT,
      }),
    ]);

  // Asignacion directa, sin grupo. El Empacador es responsable de los tres pedidos previos al
  // empaque, y el Operador lo es tambien del que debe poder abrir.
  await prisma.orderAssignment.createMany({
    data: [
      { orderId: hiddenPending.id, userId: empacadorUserId, companyId },
      { orderId: hiddenInProgress.id, userId: empacadorUserId, companyId },
      { orderId: executable.id, userId: empacadorUserId, companyId },
      { orderId: executable.id, userId: operatorUserId, companyId },
    ],
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por prefijo: el otro navegador sigue corriendo.
  // Cada paso corre aunque falle el anterior.
  const scopedCompanyId = companyId;
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () =>
      scopedCompanyId
        ? prisma.orderAssignment.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.order.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    () =>
      prisma.user.deleteMany({
        where: {
          username: {
            in: [empacadorUser.username, otherEmpacadorUser.username, operatorUser.username],
          },
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

// El primer `goto` compila la ruta bajo demanda en `next dev`, y bcrypt tarda a proposito.
test.setTimeout(180_000);

test.describe('el Empacador no ejecuta pedidos ni los ve antes del empaque', () => {
  test('R18, R19a, R10 - el Empacador responsable de pedidos PENDIENTE y EN_CURSO no los ve en ninguna vista, no tiene «Mis asignados» y ?vista=asignados aterriza en «Terminados» sin enlaces a ejecucion', async ({
    page,
  }) => {
    expect(hiddenPending, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (hiddenPending === null || hiddenInProgress === null || executable === null) return;
    const hiddenOrders = [hiddenPending, hiddenInProgress, executable];

    await loginAndLand(page, empacadorUser);

    await page.goto(assignmentViewUrl('asignados'));
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.terminados)).toBeVisible();
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.por_empacar)).toBeVisible();
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.asignados)).toHaveCount(0);
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.todos)).toHaveCount(0);

    // Pedir «Mis asignados» pinta «Terminados» y nada de la vista pedida.
    await expect(page.getByTestId(FINISHED_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(ASSIGNED_ORDERS_TABLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(ASSIGNED_ORDERS_EMPTY_TESTID)).toHaveCount(0);

    for (const order of hiddenOrders) {
      await expect(rowByNumber(page, order.numberText)).toHaveCount(0);
      await expect(executionLinks(page, order.id)).toHaveCount(0);
    }
    await expect(page.getByTestId(ASSIGNED_ORDER_ENTER_TESTID)).toHaveCount(0);

    await page.goto(assignmentViewUrl('por_empacar'));
    await expect(page.getByTestId(PACKING_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });
    for (const order of hiddenOrders) {
      await expect(packingRowByNumber(page, order.numberText)).toHaveCount(0);
      await expect(rowByNumber(page, order.numberText)).toHaveCount(0);
      await expect(executionLinks(page, order.id)).toHaveCount(0);
    }
    await expect(page.getByTestId(ASSIGNED_ORDER_ENTER_TESTID)).toHaveCount(0);
  });

  test('R8 - /asignacion/<id> responde 404 al Empacador responsable sin mover el pedido, y el Operador responsable del mismo pedido si entra', async ({
    page,
  }) => {
    expect(executable, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (executable === null) return;

    const before = await orderState(executable.id);
    expect(before.status, 'el pedido debe nacer PENDIENTE para que el 404 demuestre algo').toBe(
      'PENDIENTE',
    );

    await loginAndLand(page, empacadorUser);
    const response = await page.goto(assignedOrderRoute(executable.id));
    expect(response?.status(), 'sin asignaciones.ejecutar la pantalla debe responder 404').toBe(404);
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(EXECUTION_ERROR_TESTID)).toHaveCount(0);

    const after = await orderState(executable.id);
    expect(after.status).toBe('PENDIENTE');
    expect(after.packedBy).toBeNull();
    expect(after.updatedBy).toBe(before.updatedBy);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    // Control positivo: el mismo pedido, la misma ruta, otro responsable con el permiso.
    await page.context().clearCookies();
    await loginAndLand(page, operatorUser);
    await page.goto(ASSIGNED_ORDERS_ROUTE);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const row = rowByNumber(page, executable.numberText);
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    const enter = row.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    await expect(enter).toHaveAttribute('href', assignedOrderRoute(executable.id));
    await enter.click();
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(executable!.id), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    expect((await orderState(executable.id)).status).toBe('EN_CURSO');
  });

  test('R20 - en «Terminados» el Empacador ve el ENTREGADO que empaco el y no el empacado por otro ni el que no tiene empacador', async ({
    page,
  }) => {
    expect(deliveredOwn, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (deliveredOwn === null || deliveredOther === null || deliveredNoPacker === null) return;

    await loginAndLand(page, empacadorUser);
    await page.goto(assignmentViewUrl('terminados'));
    await expect(page.getByTestId(FINISHED_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    await expect(rowByNumber(page, deliveredOwn.numberText)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowByNumber(page, deliveredOther.numberText)).toHaveCount(0);
    await expect(rowByNumber(page, deliveredNoPacker.numberText)).toHaveCount(0);
    await expect(executionLinks(page, deliveredOwn.id)).toHaveCount(0);
  });
});
