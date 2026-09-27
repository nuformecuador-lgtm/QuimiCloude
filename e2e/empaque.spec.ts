/**
 * E2E del recorrido de empaque (R48): el Operario finaliza y el pedido queda «Por empacar», el
 * propio Operario no ve la pestaña ni puede pedirla por la dirección, «Por empacar» no se puede
 * cancelar desde Pedidos, y un Empacador lo comienza, lo termina y lo ve en «Terminados».
 *
 * UN SOLO `test()`: cada paso es la precondición del siguiente sobre el MISMO pedido -partirlo
 * obligaría a resembrar el estado que ya dejó el paso anterior-, mismo criterio que
 * `e2e/producto-terminado.spec.ts` y `e2e/reserva-de-material.spec.ts`.
 *
 * LOS ASERTOS DE ESTADO SE LEEN DE LA BASE cuando lo que se comprueba es la transición en sí
 * -nunca de la pantalla, que podría mentir en cualquiera de los dos sentidos-.
 *
 * AISLAMIENTO: prefijo propio `qc168_e2e_` + `RUN_ID` por proceso de worker, empresa efímera
 * -`companies_name_unique` es GLOBAL- y limpieza de huérfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base.
 *
 * El rol `Empacador` es el REAL del seed, nunca un fixture: sus permisos -incluido
 * `empaque.modificar`- son el dato bajo prueba. El Administrador entra solo para comprobar la
 * pantalla de Pedidos, que exige el permiso de esa zona.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  DELIVERED_ORDER_PARAM,
  ORDERS_ROUTE,
  PACKED_ORDER_PARAM,
  assignedOrderRoute,
  packingOrderRoute,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de él se toca. */
const FIXTURE_PREFIX = 'qc168_e2e_';

/** Identificador único de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalación: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;

const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

/** El equipo vinculado al pedido: trae al Operario y al Empacador, pero al asignar solo se
 *  escribe la fila del Operario —el Empacador «se une despues» y su fila la crea el Finalizar. */
const WORK_GROUP_NAME = `${SHARED_TOKEN}_turno`;

/** El único ingrediente de la receta del fixture: Finalizar lo consume al dejar el pedido por
 *  empacar. */
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;

/** Muy por encima de `ORDER_QUANTITY`: el consumo debe alcanzar sin agotar el lote. */
const BATCH_STOCK = '100.0000';
const UNIT_COST = '10.0000';

type Credentials = { readonly username: string; readonly password: string };

/** Entra, ve su pedido asignado y lo finaliza. */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc168-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Comienza y termina el empaque: el actor cuyos permisos son el dato bajo prueba. */
const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc168-Empacador-${RUN_ID.slice(0, 12)}`,
};

/** Solo entra a comprobar que Pedidos cierra editar/cancelar/borrar. */
const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc168-Admin-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [operatorUser.username]: 'Operador',
  [empacadorUser.username]: 'Empacador',
  [adminUser.username]: 'Administra',
};
const firstNames = `Qc168${RUN_ID.slice(0, 8)}`;

const ORDER_QUANTITY = '3.0';

/** Divide `ORDER_QUANTITY` en envases enteros: Finalizar exige contenido para dar de alta el lote. */
const PRESENTATION_CONTENT = '1';

/**
 * Posición inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const BASE_SEQUENCE = 900_000 + Math.floor(Math.random() * 90_000);

/**
 * El documento de los pasos de la receta del fixture: un único paso con una lista de
 * verificación -que bloquea Finalizar hasta marcarla-.
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

/** `/asignacion` y la ejecución del pedido. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ENTER_TESTID = 'assigned-order-enter';
const EXECUTION_TITLE_TESTID = 'order-execution-title';
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_FINISH_TESTID = 'step-reader-finish';
const DELIVERED_NOTICE_TESTID = 'assigned-order-delivered-notice';
const ASSIGNMENT_VIEW_TABS_TESTID = 'assignment-view-tabs';
const ASSIGNED_ORDERS_EMPTY_TESTID = 'assigned-orders-empty';
const PACKING_ORDERS_SECTION_TESTID = 'packing-orders-list-section';

/** «Por empacar»: la fila y el enlace de `packing-orders-columns.tsx`. */
const PACKING_ORDER_ROW_TESTID = 'packing-order-row';
const PACKING_ORDER_LINK_TESTID = 'packing-order-link';
const ASSIGNMENT_VIEW_TAB_TERMINADOS_TESTID = 'assignment-view-tab-terminados';

/** La pantalla de un pedido de empaque, `packing-order-screen.tsx`. */
const PACKING_ORDER_SCREEN_TESTID = 'packing-order-screen';
const PACKING_ORDER_START_BUTTON_TESTID = 'packing-order-start-button';
const PACKING_ORDER_FINISH_BUTTON_TESTID = 'packing-order-finish-button';
const PACKED_ORDER_NOTICE_TESTID = 'packed-order-notice';
const FINISHED_ORDERS_SECTION_TESTID = 'finished-orders-list-section';

/** `/pedidos`: la fila y sus acciones. */
const ORDERS_TITLE_TESTID = 'pedidos-title';
const DATA_TABLE_TESTID = 'data-table';
const DATA_TABLE_NEXT_TESTID = 'data-table-next';
const ORDER_STATUS_TESTID = 'order-status';
const ORDER_ACTION_CANCEL_TESTID = 'order-action-cancel';
const ORDER_ROW_ACTIONS_REASON_TESTID = 'order-row-actions-reason';

const LIST_PAGE_SIZE = '25';
const LIST_SORT = 'createdAt:desc';

let companyId: string | null = null;
let recipeId: string | null = null;
let productId: string | null = null;
let presentationId: string | null = null;
let operatorUserId: string | null = null;
let empacadorUserId: string | null = null;
let workGroupId: string | null = null;
let orderId: string | null = null;
let orderNumber: string | null = null;

/** Igualdad EXACTA de texto: un correlativo no puede casar con un prefijo suyo. */
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

/** URL de `/pedidos`, SIEMPRE derivada de `ORDERS_ROUTE`. Ningún literal de ruta en este spec. */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: LIST_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

/**
 * Recorre las páginas de `/pedidos` hasta encontrar la fila del correlativo pedido: la lista es
 * compartida y otro worker puede haber empujado la fila a otra página. Mismo patrón que
 * `e2e/pedidos.spec.ts`.
 */
async function findOrdersRow(page: Page, numberText: string): Promise<Locator> {
  const next = page.getByTestId(DATA_TABLE_NEXT_TESTID);

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
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
  }
}

async function orderStatus(id: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  return order.status;
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: falló el beforeAll');

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
      // Explícito, no por defecto: la columna es `@default(pending)` y ese estado no entra por
      // el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

test.beforeAll(async () => {
  // Los roles nunca se crean aquí: `roles.name` es único y es un dato compartido con
  // producción/seed. Sus permisos -incluido `empaque.modificar` del Empacador- son el dato bajo
  // prueba.
  const roles = new Map<string, string>();
  for (const roleName of [ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_ADMINISTRADOR]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(
        `falta el rol "${roleName}": este E2E no lo crea porque sus permisos son el dato bajo ` +
          'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
      );
    }
    roles.set(roleName, role.id);
  }

  // LIMPIEZA DEFENSIVA DE HUÉRFANOS. El orden lo imponen las FK RESTRICT: asignaciones -> pedidos
  // -> receta/usuario -> empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

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
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  if (orphanRecipeIds.length > 0) {
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
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
  await prisma.workGroupMember.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  await prisma.workGroup.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efímera de este worker. `nameNormalized` sale de `normalizeCompanyName`, la ÚNICA
  // definición de «mismo nombre de empresa».
  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  operatorUserId = await createUser(operatorUser, roles.get(ROLE_OPERADOR)!);
  empacadorUserId = await createUser(empacadorUser, roles.get(ROLE_EMPACADOR)!);
  await createUser(adminUser, roles.get(ROLE_ADMINISTRADOR)!);

  // La unidad NO se crea: es una de las cuatro del catálogo arrancador (misma referencia que
  // `e2e/ejecucion-receta.spec.ts`).
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // El único ingrediente de la receta: `products.unit_id` se fija A MANO, porque
  // `product_batches_check_unit` rechaza el lote de más abajo si el producto no tiene ya unidad.
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
      content: PRESENTATION_CONTENT,
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;

  await prisma.productBatch.create({
    data: {
      productId,
      presentationId: presentation.id,
      companyId,
      stock: BATCH_STOCK,
      unitCost: UNIT_COST,
      lot: BATCH_LOT,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      createdBy: operatorUserId,
    },
    select: { id: true },
  });

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: operatorUserId,
        companyId,
        steps: RECIPE_STEPS as unknown as Prisma.InputJsonValue,
        lines: { create: [{ productId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;

  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: BASE_SEQUENCE,
      recipeId,
      quantity: ORDER_QUANTITY,
      presentationId,
      presentationContent: PRESENTATION_CONTENT,
      status: 'EN_CURSO',
    },
    select: { id: true },
  });
  orderId = order.id;
  orderNumber = formatOrderNumber({ year, sequence: BASE_SEQUENCE });

  // El equipo vinculado, con el Operario y el Empacador dentro. Al pedido solo se le escribe la
  // fila del Operario con el origen del grupo: el grupo queda vinculado y el Empacador sin fila,
  // que es la precondicion del auto-asignado del Finalizar.
  workGroupId = (
    await prisma.workGroup.create({
      data: {
        name: WORK_GROUP_NAME,
        nameNormalized: normalizeWorkGroupName(WORK_GROUP_NAME),
        companyId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.workGroupMember.createMany({
    data: [
      { workGroupId, userId: operatorUserId, companyId },
      { workGroupId, userId: empacadorUserId, companyId },
    ],
  });

  await prisma.orderAssignment.create({
    data: { orderId, userId: operatorUserId, companyId, workGroupId, workGroupName: WORK_GROUP_NAME },
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto
  // (Chromium/WebKit) sigue corriendo. Cada paso corre aunque falle el anterior.
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
        ? prisma.order.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.productBatch.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedRecipeId
        ? prisma.product.deleteMany({ where: { recipeId: scopedRecipeId } })
        : Promise.resolve(),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    () =>
      scopedCompanyId
        ? prisma.product.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.presentation.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.workGroupMember.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.workGroup.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [operatorUser.username, empacadorUser.username, adminUser.username] } },
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

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt tarda a propósito.
test.setTimeout(180_000);

test.describe('el recorrido de empaque (R48)', () => {
  test('el Operario finaliza y queda Por empacar, no ve la pestaña, Pedidos no lo deja cancelar, y el Empacador lo comienza, lo termina y lo ve en Terminados', async ({
    page,
  }) => {
    expect(orderId, 'el fixture no existe: falló el beforeAll').not.toBeNull();
    expect(orderNumber, 'el fixture no existe: falló el beforeAll').not.toBeNull();
    if (orderId === null || orderNumber === null || empacadorUserId === null) return;

    expect(
      await orderStatus(orderId),
      'el pedido del fixture debe nacer EN_CURSO para que este caso demuestre la transición',
    ).toBe('EN_CURSO');

    // --- 1. El Operario finaliza y el pedido queda «Por empacar», no «Entregado» (R5, R9).
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const assignedRow = rowByNumber(page, orderNumber);
    await expect(assignedRow).toHaveCount(1, { timeout: 60_000 });
    await assignedRow.getByTestId(ENTER_TESTID).click();
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(orderId!), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await page.getByTestId(STEP_FINISH_TESTID).click();
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    expect(await orderStatus(orderId)).toBe('POR_EMPACAR');

    // El Finalizar asigno al Empacador del equipo vinculado, con el origen del grupo.
    const empacadorAssignment = await prisma.orderAssignment.findUniqueOrThrow({
      where: { orderId_userId: { orderId, userId: empacadorUserId } },
    });
    expect(empacadorAssignment.workGroupId).toBe(workGroupId);
    expect(empacadorAssignment.workGroupName).toBe(WORK_GROUP_NAME);

    const deliveredNotice = page.getByTestId(DELIVERED_NOTICE_TESTID);
    await expect(deliveredNotice).toBeVisible({ timeout: 60_000 });
    await expect(deliveredNotice).toContainText(orderNumber);
    await expect(deliveredNotice).toContainText('por empacar');

    // --- 2. El propio Operario no ve la pestaña «Por empacar»: solo tiene una vista, así que ni
    // siquiera se monta el conjunto de pestañas (R39).
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)).toHaveCount(0);

    // Pedirla por la dirección cae en su vista por defecto, sin revelar que existe (R39): «Mis
    // asignados», vacía porque el único pedido del fixture ya no está EN_CURSO.
    await page.goto(`${ASSIGNED_ORDERS_ROUTE}?vista=por_empacar`);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(PACKING_ORDERS_SECTION_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(ASSIGNED_ORDERS_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 3. «Por empacar» no se puede cancelar desde Pedidos: la acción va deshabilitada con el
    // motivo visible (R29, R42).
    await page.context().clearCookies();
    await loginAndLand(page, adminUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const ordersRow = await findOrdersRow(page, orderNumber);
    await expect(ordersRow).toHaveCount(1);
    await expect(ordersRow.getByTestId(ORDER_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'POR_EMPACAR',
    );
    await expect(ordersRow.getByTestId(ORDER_ACTION_CANCEL_TESTID)).toBeDisabled();
    await expect(ordersRow.getByTestId(ORDER_ROW_ACTIONS_REASON_TESTID)).toBeVisible();

    // --- 4. Un Empacador lo comienza y lo termina (R18, R21).
    await page.context().clearCookies();
    await loginAndLand(page, empacadorUser);
    await page.goto(`${ASSIGNED_ORDERS_ROUTE}?vista=por_empacar`);
    await expect(page.getByTestId(PACKING_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    const packingRow = packingRowByNumber(page, orderNumber);
    await expect(packingRow).toHaveCount(1, { timeout: 60_000 });
    await packingRow.getByTestId(PACKING_ORDER_LINK_TESTID).click();
    await page.waitForURL((url) => url.pathname === packingOrderRoute(orderId!), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(PACKING_ORDER_SCREEN_TESTID)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(PACKING_ORDER_START_BUTTON_TESTID).click();
    await expect(page.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID)).toBeVisible({
      timeout: 60_000,
    });

    const startedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, packedBy: true },
    });
    expect(startedOrder.status).toBe('EN_EMPAQUE');
    expect(startedOrder.packedBy).toBe(empacadorUserId);

    await page.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID).click();
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(PACKED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    expect(await orderStatus(orderId)).toBe('ENTREGADO');

    const packedNotice = page.getByTestId(PACKED_ORDER_NOTICE_TESTID);
    await expect(packedNotice).toBeVisible({ timeout: 60_000 });
    await expect(packedNotice).toContainText(orderNumber);

    // --- 5. El pedido aparece en «Terminados» (R27).
    await page.getByTestId(ASSIGNMENT_VIEW_TAB_TERMINADOS_TESTID).click();
    await expect(page.getByTestId(FINISHED_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(rowByNumber(page, orderNumber)).toHaveCount(1, { timeout: 60_000 });
  });
});
