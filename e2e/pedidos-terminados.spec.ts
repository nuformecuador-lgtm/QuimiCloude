/**
 * E2E con los TRES roles reales del seed y la nueva pantalla de asignacion por vistas.
 *
 * QUE RECORRE, en cuatro `test()` independientes que comparten el MISMO fixture sembrado en
 * `beforeAll` -cada uno inicia su propia sesion, asi que no hay estado de un caso que otro
 * necesite-:
 *   A. el Operador entra y ve SOLO «Mis asignados», sin pestañas;
 *   B. el Empacador ve solo «Terminados» + «Por empacar» -con los ENTREGADO que empaco el, su
 *      fecha y sus responsables, y el sin fecha al final marcado «Sin fecha»-;
 *   C. el Administrador ve SOLO «Todos», con los cuatro estados; al filtrar exactamente por
 *      Entregado aparece la columna de fecha y el orden de terminados; sin ninguna entrada a
 *      ejecucion; y `/asignacion/<id>` de un pedido al que no esta asignado le responde
 *      "no encontrado";
 *   D. en `/pedidos`, el panel de edicion del Administrador no ofrece ningun control de estado
 *      y el selector de responsables no ofrece a otro Administrador -que tiene
 *      `pedidos.consultar`- aunque si sigue ofreciendo a quien no lo tiene.
 *
 * QUE APORTA SOBRE UNIT E INTEGRACION: la cadena entera en un navegador de verdad -cookie firmada,
 * middleware, `resolveAssignmentViews`/`resolveAssignmentView` de verdad, las CINCO Server Actions
 * nuevas y viejas contra Postgres- y los TRES roles reales del seed a la vez, cosa que ningun test
 * de unidad hace porque sus dobles de permisos son fijos. Chromium y WebKit: WebKit es el motor de
 * iOS y la regla multiplataforma pide ejercitarlo.
 *
 * POR QUE UN ADMINISTRADOR "OTRO" Y NO SOLO EL ACTOR. El selector de candidatos no excluye
 * al actor por su cuenta -`list-responsible-candidates.ts` no filtra por id, solo por
 * `canBeResponsible`-, asi que probar unicamente con el propio Administrador dejaria sin decidir
 * si la ausencia se debe al PERMISO o solo a ser quien pide la lista. Por eso el
 * fixture crea una SEGUNDA persona con `Administrador`, ajena a la sesion, y una persona con
 * `Operador` -sin `pedidos.consultar`- como control positivo de que la lista SI carga candidatos.
 *
 * LA FECHA DE TERMINADO DEL PEDIDO "CON FECHA" SE SIEMBRA DIRECTAMENTE POR LA BASE, no finalizando
 * de verdad por la ejecucion: ese camino ya se ejercita con el caso de uso real en
 * `tests/integration/asignaciones/finished-orders.int.test.ts` ("finalizar por el caso de uso real
 * -> aparece con fecha"), y repetirlo aqui alargaria el recorrido sin afirmar nada mas sobre la
 * UI. Lo que SI aporta este E2E es que un `ENTREGADO` CON fecha y uno SIN fecha -el que ya existia
 * antes de esta pantalla- conviven en la MISMA pantalla con el orden y el marcador correctos.
 *
 * DATOS Y AISLAMIENTO, mismo patron que `e2e/pedidos-asignados.spec.ts` y
 * `e2e/pedidos-responsables.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc145_e2e_` + el `RUN_ID` del worker;
 *  - una EMPRESA efimera propia: `companies_name_unique` es GLOBAL y los cuatro pedidos de
 *    `list-company-orders` se cuentan por empresa, asi que compartirla con otro E2E vivo falsearia
 *    "los cuatro estados";
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva -Chromium y WebKit corren a la vez- acaba de crear;
 *  - `afterAll` borra SIEMPRE, aunque un test reviente, por los identificadores de ESTE worker y
 *    en el orden que imponen las FK RESTRICT: asignaciones -> pedidos -> receta -> personas ->
 *    empresa.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados de los barrels de las rutas: sus
 * modulos son de CLIENTE (`'use client'`, JSX, hooks) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec sin aportar nada. Mismo criterio que
 * `e2e/pedidos-responsables.spec.ts`.
 *
 * ENMIENDA DE `e2e/pedidos.spec.ts`, `e2e/pedidos-asignados.spec.ts` y
 * `e2e/pedidos-responsables.spec.ts`: NINGUNA. Se revisaron los tres al cerrar esta pantalla y
 * ninguno usa el selector de estado de la edicion de pedidos ni asigna un `Administrador` como
 * responsable, asi que no hay nada que ajustar en ellos.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ASSIGNED_ORDERS_ROUTE, ORDERS_ROUTE, assignedOrderRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc145_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc145-Admin-${RUN_ID.slice(0, 12)}`,
};
/** Segundo Administrador, con `pedidos.consultar`, ajeno a la sesion: control de exclusion. */
const otherAdminUser: Credentials = {
  username: `${SHARED_TOKEN}_otroadmin`,
  password: `Qc145-Otro-${RUN_ID.slice(0, 12)}`,
};
const empacadorUser: Credentials = {
  username: `${SHARED_TOKEN}_empacador`,
  password: `Qc145-Empac-${RUN_ID.slice(0, 12)}`,
};
/** Sin `pedidos.consultar`: control positivo de que DEBE seguir ofreciendose. */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc145-Oper-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [adminUser.username]: 'Administra',
  [otherAdminUser.username]: 'Otroadmin',
  [empacadorUser.username]: 'Empaca',
  [operatorUser.username]: 'Opera',
};
const firstNames = `Qc145${RUN_ID.slice(0, 8)}`;

const ORDER_QUANTITY = '4.0';
const CANCELLATION_REASON = `${SHARED_TOKEN}_motivo`;

/**
 * Posicion inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const BASE_SEQUENCE = 760_000 + Math.floor(Math.random() * 80_000);

const SEQUENCE_PENDING = BASE_SEQUENCE;
const SEQUENCE_IN_PROGRESS = BASE_SEQUENCE + 1;
const SEQUENCE_DELIVERED_WITH_DATE = BASE_SEQUENCE + 2;
const SEQUENCE_DELIVERED_NO_DATE = BASE_SEQUENCE + 3;
const SEQUENCE_CANCELLED = BASE_SEQUENCE + 4;

/** `finished_at` sembrado directamente: bastante antiguo para no rozar la medianoche UTC. */
const FINISHED_AT = new Date(Date.now() - 6 * 60 * 60 * 1000);
const FINISHED_AT_TEXT = FINISHED_AT.toISOString().slice(0, 10);
const MISSING_DATE_TEXT = 'Sin fecha';

/** `data-testid` de la pantalla `/asignacion` y sus partes. Constantes locales (ver cabecera). */
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
const ASSIGNED_ORDERS_EMPTY_TESTID = 'assigned-orders-empty';
const FINISHED_ORDERS_SECTION_TESTID = 'finished-orders-list-section';
const COMPANY_ORDERS_SECTION_TESTID = 'company-orders-list-section';

const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const RESPONSIBLES_CELL_TESTID = 'data-table-cell-responsibles';
const RESPONSIBLE_AVATAR_TESTID = 'responsible-avatar';

const FINISHED_ORDER_DATE_TESTID = 'finished-order-date';
const COMPANY_ORDER_DATE_TESTID = 'company-order-date';
const COMPANY_ORDER_STATUS_TESTID = 'company-order-status';
const COMPANY_ORDER_STATUS_FILTER_TESTID = 'data-table-filter-status';
const COMPANY_ORDER_STATUS_FILTER_OPTION_ENTREGADO_TESTID = 'data-table-filter-option-status-ENTREGADO';

const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
const ORDER_ACTION_RESPONSIBLES_TESTID = 'order-action-responsibles';

const ORDER_EXECUTION_ERROR_TESTID = 'order-execution-error';

/** `/pedidos`: el formulario de edicion y su panel. */
const ORDERS_TITLE_TESTID = 'pedidos-title';
const DATA_TABLE_TESTID = 'data-table';
const ORDER_FORM_TESTID = 'order-form';
const ORDER_FORM_CANCEL_TESTID = 'order-form-cancel';
const ORDER_ACTION_EDIT_TESTID = 'order-action-edit';
/**
 * El estado ya no tiene control propio en `order-form.tsx`: la constante que el propio
 * componente exporta -`ORDER_STATUS_SELECT_TESTID`- no etiqueta a nada, y este literal es la
 * copia local de ese `data-testid`, que NUNCA debe aparecer en el DOM.
 */
const ORDER_STATUS_SELECT_TESTID = 'order-status-select';

/** `/pedidos`: el panel de responsables, mismo patron que `e2e/pedidos-responsables.spec.ts`. */
const SHEET_RESPONSIBLES_TESTID = 'order-sheet-responsibles';
const RESPONSIBLES_SECTION_TESTID = 'order-responsibles';
const RESPONSIBLE_CANDIDATE_TESTID = 'order-responsible-candidate';
const RESPONSIBLES_SECTION_VALUE = 'responsibles';

let companyId: string | null = null;
let recipeId: string | null = null;
let adminUserId: string | null = null;
let otherAdminUserId: string | null = null;
let operatorUserId: string | null = null;
let empacadorUserId: string | null = null;

let orderPendingId: string | null = null;
let orderDeliveredWithDateId: string | null = null;
let orderDeliveredNoDateId: string | null = null;

let orderPendingNumber: string | null = null;
let orderInProgressNumber: string | null = null;
let orderDeliveredWithDateNumber: string | null = null;
let orderDeliveredNoDateNumber: string | null = null;
let orderCancelledNumber: string | null = null;

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

/** Un elemento por `data-testid` **y** por el identificador que lleva en su atributo de datos. */
function byTestIdAndUserId(scope: Page | Locator, testId: string, userId: string): Locator {
  return scope.locator(`[data-testid="${testId}"][data-user-id="${userId}"]`);
}

/** Indice, en el orden del DOM, de la fila cuyo `id` es `rowId`. `-1` si no esta. */
async function rowDomIndex(page: Page, rowId: string): Promise<number> {
  const ids = await page
    .locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`)
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')));
  return ids.indexOf(`${TABLE_ROW_TESTID_PREFIX}${rowId}`);
}

async function createUserWithRole(user: Credentials, roleName: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque SUS PERMISOS son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

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
      roleId: role.id,
      companyId,
      // Explicito, no por defecto: la columna es `@default(pending)` y ese estado no entra por
      // el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(params: {
  sequence: number;
  status: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO';
  finishedAt?: Date | null;
  packedBy?: string | null;
  cancellationReason?: string;
}): Promise<{ id: string; numberText: string }> {
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
      cancellationReason: params.cancellationReason ?? null,
    },
    select: { id: true },
  });

  return { id: order.id, numberText: formatOrderNumber({ year, sequence: params.sequence }) };
}

/** URL de `/pedidos`, SIEMPRE derivada de `ORDERS_ROUTE`. Ningun literal de ruta en este spec. */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: '25', sort: 'createdAt:desc' });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

test.beforeAll(async () => {
  // El rol nunca se crea aqui: `roles.name` es unico y es un dato compartido con produccion/seed.
  for (const roleName of [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(
        `falta el rol "${roleName}": este E2E no lo crea porque sus permisos son el dato bajo ` +
          'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
      );
    }
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS. El orden lo imponen las FK RESTRICT: asignaciones -> pedidos
  // -> receta/usuario -> empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  const orphanRecipes = await prisma.recipe.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);
  if (orphanRecipeIds.length > 0) {
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: orphanRecipeIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, la UNICA
  // definicion de «mismo nombre de empresa». PROPIA (ver cabecera): "los cuatro estados" de
  // «Todos» se cuentan por empresa.
  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  otherAdminUserId = await createUserWithRole(otherAdminUser, ROLE_ADMINISTRADOR);
  empacadorUserId = await createUserWithRole(empacadorUser, ROLE_EMPACADOR);
  operatorUserId = await createUserWithRole(operatorUser, ROLE_OPERADOR);

  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const [pending, inProgress, deliveredWithDate, deliveredNoDate, cancelled] = await Promise.all([
    seedOrder({ sequence: SEQUENCE_PENDING, status: 'PENDIENTE' }),
    seedOrder({ sequence: SEQUENCE_IN_PROGRESS, status: 'EN_CURSO' }),
    // Empacados por el Empacador: sin `asignaciones.ejecutar` solo ve en «Terminados» lo suyo.
    seedOrder({
      sequence: SEQUENCE_DELIVERED_WITH_DATE,
      status: 'ENTREGADO',
      finishedAt: FINISHED_AT,
      packedBy: empacadorUserId,
    }),
    seedOrder({
      sequence: SEQUENCE_DELIVERED_NO_DATE,
      status: 'ENTREGADO',
      finishedAt: null,
      packedBy: empacadorUserId,
    }),
    seedOrder({
      sequence: SEQUENCE_CANCELLED,
      status: 'CANCELADO',
      cancellationReason: CANCELLATION_REASON,
    }),
  ]);

  orderPendingId = pending.id;
  orderPendingNumber = pending.numberText;
  orderInProgressNumber = inProgress.numberText;
  orderDeliveredWithDateId = deliveredWithDate.id;
  orderDeliveredWithDateNumber = deliveredWithDate.numberText;
  orderDeliveredNoDateId = deliveredNoDate.id;
  orderDeliveredNoDateNumber = deliveredNoDate.numberText;
  orderCancelledNumber = cancelled.numberText;

  // El Operador es responsable del ENTREGADO CON fecha: «Terminados» del Empacador pinta los
  // responsables de cualquiera, no solo los del actor.
  await prisma.orderAssignment.create({
    data: { orderId: orderDeliveredWithDateId, userId: operatorUserId, companyId },
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto
  // (Chromium/WebKit) sigue corriendo. Cada paso corre aunque falle el anterior.
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
            in: [adminUser.username, otherAdminUser.username, empacadorUser.username, operatorUser.username],
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

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt tarda a proposito.
test.setTimeout(180_000);

test.describe('QC-145 — los tres roles en /asignacion y el cierre de /pedidos', () => {
  test('el Operador aterriza en «Mis asignados» y no ve ninguna pestaña ni las otras vistas (R28)', async ({
    page,
  }) => {
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Sin pestañas: es la UNICA vista que este rol tiene.
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)).toHaveCount(0);

    // «Mis asignados» se monta -vacio, porque el fixture no le asigna ningun pedido vivo- y
    // «Terminados»/«Todos» no existen en absoluto en esta pantalla, no solo estan ocultas.
    await expect(page.getByTestId(ASSIGNED_ORDERS_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(FINISHED_ORDERS_SECTION_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toHaveCount(0);
  });

  test('el Empacador ve «Terminados» con el pedido que empaco, su fecha y sus responsables, el «sin fecha» al final, ve «Por empacar» y no ve «Mis asignados» ni «Todos» (R28, R30)', async ({
    page,
  }) => {
    const withDateNumber = orderDeliveredWithDateNumber;
    const withDateId = orderDeliveredWithDateId;
    const noDateNumber = orderDeliveredNoDateNumber;
    const noDateId = orderDeliveredNoDateId;
    const pendingNumber = orderPendingNumber;
    const cancelledNumber = orderCancelledNumber;
    const respUserId = operatorUserId;
    expect(withDateNumber, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      withDateNumber === null ||
      withDateId === null ||
      noDateNumber === null ||
      noDateId === null ||
      pendingNumber === null ||
      cancelledNumber === null ||
      respUserId === null
    ) {
      return;
    }

    await loginAndLand(page, empacadorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Sin `asignaciones.ejecutar` no hay «Mis asignados»: «Terminados» y «Por empacar», nunca «Todos».
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.asignados)).toHaveCount(0);
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.terminados)).toBeVisible();
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.por_empacar)).toBeVisible();
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.todos)).toHaveCount(0);

    await page.getByTestId(ASSIGNMENT_VIEW_TAB_TESTID.terminados).click();
    await expect(page.getByTestId(FINISHED_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    // No esta asignado al Empacador pero lo empaco el: aparece, con su fecha y su responsable,
    // que es otra persona.
    const withDateRow = rowByNumber(page, withDateNumber);
    await expect(withDateRow).toHaveCount(1, { timeout: 60_000 });
    const withDateDate = withDateRow.getByTestId(FINISHED_ORDER_DATE_TESTID);
    await expect(withDateDate).toHaveText(FINISHED_AT_TEXT);
    await expect(withDateDate).not.toHaveAttribute('data-missing', 'true');
    await expect(
      byTestIdAndUserId(withDateRow.getByTestId(RESPONSIBLES_CELL_TESTID), RESPONSIBLE_AVATAR_TESTID, respUserId),
    ).toBeVisible();

    // El entregado sin fecha registrada, marcado y AL FINAL del listado.
    const noDateRow = rowByNumber(page, noDateNumber);
    await expect(noDateRow).toHaveCount(1);
    const noDateDate = noDateRow.getByTestId(FINISHED_ORDER_DATE_TESTID);
    await expect(noDateDate).toHaveText(MISSING_DATE_TEXT);
    await expect(noDateDate).toHaveAttribute('data-missing', 'true');

    const withDateIndex = await rowDomIndex(page, withDateId);
    const noDateIndex = await rowDomIndex(page, noDateId);
    expect(withDateIndex, 'la fila con fecha deberia estar en la tabla').toBeGreaterThanOrEqual(0);
    expect(noDateIndex, 'la fila sin fecha deberia estar en la tabla').toBeGreaterThanOrEqual(0);
    expect(noDateIndex, 'el "sin fecha" va DESPUES del que si tiene fecha').toBeGreaterThan(
      withDateIndex,
    );

    // Ni el pendiente ni el cancelado son «Terminados».
    await expect(rowByNumber(page, pendingNumber)).toHaveCount(0);
    await expect(rowByNumber(page, cancelledNumber)).toHaveCount(0);
  });

  test('el Administrador ve solo «Todos» con los cuatro estados; filtrar por Entregado trae la fecha y el orden de terminados; sin entrada a ejecucion; `/asignacion/<id>` de un pedido no asignado dice "no encontrado" (R28, R35)', async ({
    page,
  }) => {
    const pendingNumber = orderPendingNumber;
    const pendingId = orderPendingId;
    const inProgressNumber = orderInProgressNumber;
    const withDateNumber = orderDeliveredWithDateNumber;
    const withDateId = orderDeliveredWithDateId;
    const noDateNumber = orderDeliveredNoDateNumber;
    const noDateId = orderDeliveredNoDateId;
    const cancelledNumber = orderCancelledNumber;
    expect(pendingNumber, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (
      pendingNumber === null ||
      pendingId === null ||
      inProgressNumber === null ||
      withDateNumber === null ||
      withDateId === null ||
      noDateNumber === null ||
      noDateId === null ||
      cancelledNumber === null
    ) {
      return;
    }

    // El Administrador tiene `dashboard.consultar`: aterriza en el panel, no en `/asignacion`.
    await loginAndLand(page, adminUser);
    await page.goto(ASSIGNED_ORDERS_ROUTE);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Solo «Todos»: sin pestañas, aunque tenga tambien `terminados.consultar`.
    await expect(page.getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    // Los CUATRO estados, sin filtro.
    for (const numberText of [pendingNumber, inProgressNumber, withDateNumber, noDateNumber, cancelledNumber]) {
      await expect(rowByNumber(page, numberText), `deberia verse el pedido ${numberText}`).toHaveCount(
        1,
        { timeout: 60_000 },
      );
    }
    const statusesShown = await page
      .getByTestId(COMPANY_ORDER_STATUS_TESTID)
      .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-status')));
    expect(new Set(statusesShown)).toEqual(new Set(['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO']));

    // Sin filtro, sin columna de fecha.
    await expect(page.getByTestId(COMPANY_ORDER_DATE_TESTID)).toHaveCount(0);

    // Sin ninguna entrada a ejecucion ni a responsables, tampoco para lo asignado al propio actor:
    // esta pantalla no tiene ningun pedido asignado al Administrador, y aun asi la
    // ausencia de estos controles es estructural, no circunstancial.
    await expect(page.getByTestId(ASSIGNED_ORDER_ENTER_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(ORDER_ACTION_RESPONSIBLES_TESTID)).toHaveCount(0);

    // Filtrar EXACTAMENTE por Entregado.
    await page.getByTestId(COMPANY_ORDER_STATUS_FILTER_TESTID).click();
    await page.getByTestId(COMPANY_ORDER_STATUS_FILTER_OPTION_ENTREGADO_TESTID).click();
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get('status') === 'ENTREGADO',
      undefined,
      { timeout: 60_000 },
    );
    // El menu del filtro tapa la tabla mientras esta abierto: cerrarlo con Escape.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    // Solo los dos ENTREGADO quedan; la columna de fecha aparece y el orden es el de
    // terminados: el que tiene fecha antes que el que no.
    await expect(rowByNumber(page, withDateNumber)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowByNumber(page, noDateNumber)).toHaveCount(1);
    await expect(rowByNumber(page, pendingNumber)).toHaveCount(0);
    await expect(rowByNumber(page, inProgressNumber)).toHaveCount(0);
    await expect(rowByNumber(page, cancelledNumber)).toHaveCount(0);

    const dateCells = page.getByTestId(COMPANY_ORDER_DATE_TESTID);
    await expect(dateCells).toHaveCount(2);
    await expect(rowByNumber(page, withDateNumber).getByTestId(COMPANY_ORDER_DATE_TESTID)).toHaveText(
      FINISHED_AT_TEXT,
    );
    await expect(rowByNumber(page, noDateNumber).getByTestId(COMPANY_ORDER_DATE_TESTID)).toHaveText(
      MISSING_DATE_TEXT,
    );

    const withDateIndex = await rowDomIndex(page, withDateId);
    const noDateIndex = await rowDomIndex(page, noDateId);
    expect(noDateIndex, 'con el filtro exacto Entregado tambien manda el orden de terminados').toBeGreaterThan(
      withDateIndex,
    );

    // `/asignacion/<id>` de un pedido al que el Administrador NUNCA fue asignado: "no encontrado",
    // sin que haya escrito nada -no hay boton para intentarlo desde aqui-.
    await page.goto(assignedOrderRoute(pendingId));
    await expect(page.getByTestId(ORDER_EXECUTION_ERROR_TESTID)).toBeVisible({ timeout: 60_000 });
  });

  test('en «Pedidos», el panel de edicion del Administrador no ofrece estado y el selector de responsables no ofrece a otro Administrador (R7, R32)', async ({
    page,
  }) => {
    const pendingNumber = orderPendingNumber;
    const otherAdminId = otherAdminUserId;
    const operatorId = operatorUserId;
    expect(pendingNumber, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (pendingNumber === null || otherAdminId === null || operatorId === null) return;

    await loginAndLand(page, adminUser);
    await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const row = rowByNumber(page, pendingNumber);
    await expect(row).toHaveCount(1, { timeout: 60_000 });

    // --- El panel de edicion no ofrece NINGUN control de estado.
    await row.getByTestId(ORDER_ACTION_EDIT_TESTID).click();
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(ORDER_STATUS_SELECT_TESTID)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /estado/i })).toHaveCount(0);
    await page.getByTestId(ORDER_FORM_CANCEL_TESTID).click();
    await expect(page.getByTestId(ORDER_FORM_TESTID)).toHaveCount(0, { timeout: 60_000 });

    // --- El selector de responsables no ofrece a quien tiene `pedidos.consultar` -el OTRO
    // Administrador-, y SI sigue ofreciendo a quien no lo tiene -el Operador-, control positivo de
    // que la lista de candidatos cargo de verdad.
    const urlBeforeOpen = page.url();
    await row.getByTestId(ORDER_ACTION_RESPONSIBLES_TESTID).click();
    const anchor = page.getByTestId(SHEET_RESPONSIBLES_TESTID);
    await expect(anchor).toBeVisible({ timeout: 60_000 });
    await expect(anchor).toHaveAttribute('data-section', RESPONSIBLES_SECTION_VALUE);
    expect(page.url(), 'abrir el panel de responsables no debe navegar').toBe(urlBeforeOpen);

    const section = page.getByTestId(RESPONSIBLES_SECTION_TESTID);
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(
      byTestIdAndUserId(section, RESPONSIBLE_CANDIDATE_TESTID, operatorId),
      'el Operador, sin `pedidos.consultar`, deberia seguir ofreciendose',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      byTestIdAndUserId(section, RESPONSIBLE_CANDIDATE_TESTID, otherAdminId),
      'el otro Administrador, con `pedidos.consultar`, NO deberia ofrecerse (R32)',
    ).toHaveCount(0);
  });
});
