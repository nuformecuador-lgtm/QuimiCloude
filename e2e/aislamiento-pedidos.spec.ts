/**
 * E2E del aislamiento por empresa en pedidos (QC-60, T17, R31; ejercita R19, R20, R21 y R11).
 *
 * Una sola sesion real, la de la empresa A. Los pedidos de B se siembran con Prisma porque no
 * necesitan sesion para existir. Es un unico test encadenado porque lo que este nivel aporta es que
 * los pasos encajan seguidos, y cada negativo lleva su positivo sobre el mismo dato: sin el, un
 * aislamiento roto por exceso (una lista vacia, un borrado que nunca funciona) daria verde.
 *
 * LA SERIE DE B ARRANCA ALTA A PROPOSITO. B tiene un pedido con la MISMA posicion que el de A
 * —solo cabe si el unico es `(empresa, ano, posicion)`, R11— y otro muy alto. Si el correlativo se
 * calculara sobre todas las empresas, el alta de A saltaria detras del de B y el assert lo veria.
 *
 * LOS PEDIDOS SE BORRAN A MANO en `afterAll`: el borrado de la pantalla es logico. `orders.company_id`
 * es `ON DELETE RESTRICT`, asi que el orden es asignaciones -> pedidos -> receta -> usuario ->
 * empresas.
 *
 * Ningun assert mira copy: `data-testid`, `data-code` y valores del fixture. El correlativo se
 * compone SIEMPRE con `formatOrderNumber`, la funcion del contrato.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';
import { addPackagingLine, openOrderRowMenu, orderMenuTrigger } from './helpers/order-distribution';
import { seedPackaging } from './helpers/packaging';

const FIXTURE_PREFIX = 'qc60_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Chromium, WebKit y otros worktrees comparten base: borrar huerfanos por prefijo a secas se
 * llevaria filas de una ejecucion viva. Una hora deja fuera cualquier ejecucion en curso.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es global. */
const COMPANY_A_NAME = `${SHARED_TOKEN}_ca`;
const COMPANY_B_NAME = `${SHARED_TOKEN}_cb`;

/** Las recetas no tienen empresa todavia (QC-50): una sola, compartida por los pedidos de A y B. */
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

/** Presentacion de la empresa A, para el alta por la UI: el alta la exige. */
const UNIT_NAME = `${SHARED_TOKEN}_unidad`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
/** El envase de A para el reparto del alta, con esa presentacion fija. */
const PACKAGING_NAME = `${SHARED_TOKEN}_envase`;
const PACKAGING_LOT = `${SHARED_TOKEN}_lote_envase`;
const PACKAGING_STOCK = '10';
const PACKAGING_UNIT_COST = '0.5000';

const ADMIN_USERNAME = `${SHARED_TOKEN}_admin`;
const ADMIN_PASSWORD = `Qc60-Admin-${RUN_ID.slice(0, 12)}`;

const ORDER_QUANTITY = '7.25';

/** Una linea de reparto que cabe en `ORDER_QUANTITY`: 1 envase de 1. */
const PRESENTATION_CONTENT = '1';
const ORDER_PACKAGES = '1';

/** Posicion del pedido propio de A y del gemelo de B: la misma, a proposito (R11). */
const SHARED_SEQUENCE = 1;
/** La serie alta de B. Si la numeracion fuera global, el alta de A saldria detras de esta. */
const COMPANY_B_HIGH_SEQUENCE = 500_000 + Math.floor(Math.random() * 400_000);

const LIST_PAGE_SIZE = '25';
const LIST_SORT = 'createdAt:desc';

/** Ningun assert mira copy: solo `data-testid`. */
const ORDERS_TITLE = 'pedidos-title';
const ORDER_NUMBER_CELL = 'data-table-cell-orderNumber';
const DELETE_OPEN = 'order-action-delete';
const DELETE_DIALOG = 'delete-order-dialog';
const DELETE_ID_FIELD = 'delete-order-id';
const DELETE_CONFIRM = 'delete-order-confirm';
const DELETE_ERROR = 'delete-order-error';
const CREATE_OPEN = 'order-create-open';
const ORDER_FORM = 'order-form';
const RECIPE_PICKER = 'recipe-picker';
const RECIPE_PICKER_OPTION = 'recipe-picker-option';
const RECIPE_PICKER_VALUE = 'recipe-picker-value';
const UNIT_SELECT = 'presentation-unit-select';
const UNIT_OPTION = 'presentation-unit-option';
const DISTRIBUTION_FIELD = 'order-distribution-field';
const DISTRIBUTION_AVAILABLE = 'order-distribution-available';
const QUANTITY_FIELD = 'order-field-quantity';
const FORM_SUBMIT = 'order-form-submit';

/** El codigo de «el pedido no existe» del catalogo cerrado (R20, R21): nunca `unauthorized`. */
const ORDER_NOT_FOUND_CODE = 'order_not_found';

let companyAId: string | null = null;
let companyBId: string | null = null;
let recipeId: string | null = null;
let presentationId: string | null = null;
let unitId: string | null = null;
let packagingId: string | null = null;
let orderAId: string | null = null;
let orderBId: string | null = null;
let orderBHighId: string | null = null;

function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: LIST_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

async function createCompany(name: string): Promise<string> {
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

/** El ano sale del reloj: el CHECK `orders_order_year_matches_created_at` lo ata a `created_at`. */
async function seedOrder(companyId: string, sequence: number, createdBy: string | null) {
  if (!recipeId) throw new Error('la receta del fixture no existe: fallo el beforeAll');
  return prisma.order.create({
    data: {
      companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      status: 'PENDIENTE',
      createdBy,
    },
    select: { id: true },
  });
}

/** La foto de un pedido de B que no puede moverse con nada de lo que haga A. */
async function snapshotOrder(id: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    select: {
      companyId: true,
      orderYear: true,
      orderSequence: true,
      status: true,
      quantity: true,
      deletedAt: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
}

/**
 * Sustituye por DOM el identificador del campo oculto del dialogo de borrado y confirma.
 *
 * POR QUE LA SUSTITUCION SE REPITE EN LA FASE DE CAPTURA DEL `submit`: el campo es
 * `defaultValue={order.id}`, y en un campo oculto `value` y `defaultValue` son el mismo atributo.
 * Cualquier re-render del dialogo -la apertura, el foco, el `pointerdown` del boton- hace que
 * React reescriba el atributo con el id original, y lo hace ANTES del clic (medido: el `POST`
 * salia con el id propio y borraba el pedido de A). El `submit` en captura sobre `window` corre
 * despues de todos esos eventos y antes de que React construya el `FormData` en su raiz, asi que
 * lo que viaja es lo que un usuario con las herramientas de desarrollo habria dejado escrito.
 *
 * Y se comprueba en la PETICION que el identificador llego: sin eso, un verde podria venir de
 * haber enviado el id propio.
 */
async function submitDeleteWithSubstitutedId(page: Page, id: string): Promise<void> {
  const hiddenId = page.getByTestId(DELETE_ID_FIELD);
  await hiddenId.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    window.addEventListener(
      'submit',
      () => {
        input.value = value;
      },
      { capture: true, once: true },
    );
  }, id);
  await expect(hiddenId).toHaveValue(id);

  const actionRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && (request.postData() ?? '').includes(id),
    { timeout: 60_000 },
  );
  await page.getByTestId(DELETE_CONFIRM).click();
  await actionRequest;
}

test.beforeAll(async () => {
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": este E2E no lo crea porque la regla ruta-rol compara ` +
        'por nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // Limpieza defensiva de huerfanos de una ejecucion interrumpida. El orden lo imponen las FK
  // `RESTRICT`: asignaciones y pedidos antes que la empresa (`orders.company_id`) y la receta.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);
  const orphanRecipeIds = (
    await prisma.recipe.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((recipe) => recipe.id);
  if (orphanCompanyIds.length > 0) {
    await prisma.reservationMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.orderPresentationLine.deleteMany({
      where: { companyId: { in: orphanCompanyIds } },
    });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // El envase, ANTES que su presentacion fija.
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // La presentacion, ANTES que su unidad: su FK hacia `units` la rechaza si no.
    await prisma.presentation.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.unit.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  if (orphanRecipeIds.length > 0) {
    await prisma.orderPresentationLine.deleteMany({
      where: { order: { recipeId: { in: orphanRecipeIds } } },
    });
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: orphanRecipeIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyAId = await createCompany(COMPANY_A_NAME);
  companyBId = await createCompany(COMPANY_B_NAME);

  // Hash real: el login tiene que pasar por bcrypt, el adaptador Prisma y la Server Action de verdad.
  const admin = await createFixtureUser({
    data: {
      firstNames: `Qc60${RUN_ID.slice(0, 8)}`,
      lastNames: 'Aislamiento',
      birthDate: new Date('1990-01-01'),
      email: `${ADMIN_USERNAME}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: ADMIN_USERNAME,
      username: ADMIN_USERNAME,
      passwordHash: await createPasswordHash(ADMIN_PASSWORD),
      roleId: role.id,
      companyId: companyAId,
      // Explicito y no por defecto: una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  // De la empresa A -la del Administrador que abre sesion (QC-50)-: los pedidos de B se siembran
  // directo por Prisma y no por el servicio de `pedidos`, que es el unico que valida la empresa
  // de la receta (R26); la empresa de la receta no bloquea a la base cruda.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: admin.id,
        companyId: companyAId,
      },
      select: { id: true },
    })
  ).id;

  // Presentacion de la empresa A, para que el alta por la UI la pueda elegir.
  const unit = await prisma.unit.create({
    data: { name: UNIT_NAME, nameNormalized: normalizeUnitName(UNIT_NAME), companyId: companyAId },
    select: { id: true },
  });
  unitId = unit.id;
  presentationId = (
    await prisma.presentation.create({
      data: {
        name: PRESENTATION_NAME,
        nameNormalized: normalizePresentationName(PRESENTATION_NAME),
        unitId: unit.id,
        // Sin contenido el selector del reparto no deja anadirla.
        content: PRESENTATION_CONTENT,
        companyId: companyAId,
      },
      select: { id: true },
    })
  ).id;

  packagingId = (
    await seedPackaging({
      companyId: companyAId,
      name: PACKAGING_NAME,
      presentationId,
      stock: PACKAGING_STOCK,
      unitCost: PACKAGING_UNIT_COST,
      lot: PACKAGING_LOT,
      createdBy: admin.id,
    })
  ).productId;

  orderAId = (await seedOrder(companyAId, SHARED_SEQUENCE, admin.id)).id;
  // B no tiene usuarios: sus pedidos nacen sin autor, que la columna admite.
  orderBId = (await seedOrder(companyBId, SHARED_SEQUENCE, null)).id;
  orderBHighId = (await seedOrder(companyBId, COMPANY_B_HIGH_SEQUENCE, null)).id;
});

test.afterAll(async () => {
  // Por los ids y nombres de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto sigue
  // corriendo. Cada paso corre aunque falle el anterior, y el primer fallo se relanza al final.
  const companyIds = [companyAId, companyBId].filter((id): id is string => id !== null);
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.reservationMovement.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.inventoryMovement.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.orderAssignment.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.orderPresentationLine.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.order.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.recipe.deleteMany({ where: { name: RECIPE_NAME } }),
    // El envase, ANTES que su presentacion fija.
    () => prisma.productBatch.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.product.deleteMany({ where: { companyId: { in: companyIds } } }),
    // La presentacion, ANTES que su unidad: su FK hacia `units` la rechaza si no.
    () => prisma.presentation.deleteMany({ where: { name: PRESENTATION_NAME } }),
    () => prisma.unit.deleteMany({ where: { name: UNIT_NAME } }),
    () => prisma.user.deleteMany({ where: { username: ADMIN_USERNAME } }),
    () => prisma.company.deleteMany({ where: { name: { in: [COMPANY_A_NAME, COMPANY_B_NAME] } } }),
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

test.describe('aislamiento por empresa de pedidos', () => {
  test('con sesion en la empresa A: la lista no trae pedidos de B, borrar uno de B conociendo su identificador se rechaza como inexistente y lo deja intacto, y el alta de A numera en su propia serie (R31)', async ({
    page,
  }) => {
    if (
      !companyAId ||
      !companyBId ||
      !recipeId ||
      !presentationId ||
      !orderAId ||
      !orderBId ||
      !orderBHighId
    ) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }
    const year = new Date().getUTCFullYear();
    const orderANumber = formatOrderNumber({ year, sequence: SHARED_SEQUENCE });
    const orderBHighNumber = formatOrderNumber({ year, sequence: COMPANY_B_HIGH_SEQUENCE });

    const orderBBefore = await snapshotOrder(orderBId);
    const orderBHighBefore = await snapshotOrder(orderBHighId);

    // --- 1. Una sola sesion, la de la empresa A.
    await loginAndLand(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    // --- 2. La lista (R19), contra el cuerpo de la respuesta y no solo el DOM: una fila ocultada
    // con CSS o filtrada en el navegador pasaria mirando el DOM. El positivo va sobre el mismo
    // documento para que la ausencia de B no sea una pantalla vacia.
    const listResponse = await page.goto(ordersUrl());
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });
    const listHtml = (await listResponse?.text()) ?? '';
    expect(
      listHtml.includes(orderAId),
      'el pedido de la propia empresa debe viajar en el HTML servido',
    ).toBe(true);
    expect(
      listHtml.includes(orderBId),
      'el pedido de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);
    expect(
      listHtml.includes(orderBHighId),
      'el pedido alto de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);
    expect(
      listHtml.includes(orderBHighNumber),
      'el correlativo de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);

    // Y en lo visible: A tiene exactamente su pedido y ninguna fila de B, aunque B tenga uno con
    // el mismo correlativo.
    await expect(page.locator(`[data-testid="data-table-row-${orderAId}"]`)).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(page.locator(`[data-testid="data-table-row-${orderBId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="data-table-row-${orderBHighId}"]`)).toHaveCount(0);
    await expect(
      page.getByTestId(ORDER_NUMBER_CELL).filter({ hasText: exactText(orderANumber) }),
    ).toHaveCount(1);

    // --- 3. Borrado cruzado conociendo el identificador (R20, R21). El id de B se mete por DOM en
    // el campo oculto del dialogo del pedido propio: es el gesto de quien abre las herramientas de
    // desarrollo, y ejercita la Server Action real sin fabricar ninguna peticion.
    await (await openOrderRowMenu(page, orderMenuTrigger(page, orderAId), DELETE_OPEN)).click();
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible({ timeout: 60_000 });

    const hiddenId = page.getByTestId(DELETE_ID_FIELD);
    // Si el campo no trajera de serie el identificador propio, sustituirlo no demostraria nada.
    await expect(hiddenId).toHaveValue(orderAId);

    await submitDeleteWithSubstitutedId(page, orderBId);

    // Error a la vista y el dialogo sigue abierto. Con el codigo de «no existe», no de
    // autorizacion: la respuesta no confirma que el pedido de B exista.
    const deleteError = page.getByTestId(DELETE_ERROR);
    await expect(deleteError).toBeVisible({ timeout: 60_000 });
    await expect(deleteError).toHaveAttribute('data-code', ORDER_NOT_FOUND_CODE);
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible();

    // En base, porque la pantalla podria mentir en cualquiera de los dos sentidos.
    expect(orderBBefore.deletedAt).toBeNull();
    expect(
      await snapshotOrder(orderBId),
      'el pedido de B tiene que seguir intacto: ni borrado ni tocado',
    ).toEqual(orderBBefore);
    const orderAAfterAttempt = await prisma.order.findUniqueOrThrow({
      where: { id: orderAId },
      select: { deletedAt: true },
    });
    expect(
      orderAAfterAttempt.deletedAt,
      'el intento cruzado tampoco puede borrar el pedido propio que abrio el dialogo',
    ).toBeNull();

    // --- 4. Control positivo: el MISMO dialogo y el MISMO camino de sustitucion, con el
    // identificador propio, SI borra. Sin esto, un borrado siempre roto -o una sustitucion que no
    // llegara al servidor- daria el mismo verde que un aislamiento correcto.
    await submitDeleteWithSubstitutedId(page, orderAId);
    await expect(page.getByTestId(DELETE_DIALOG)).toHaveCount(0, { timeout: 60_000 });

    const orderAAfterDelete = await prisma.order.findUniqueOrThrow({
      where: { id: orderAId },
      select: { deletedAt: true },
    });
    expect(
      orderAAfterDelete.deletedAt,
      'el pedido propio SI se tiene que poder borrar: es el control positivo del mismo dialogo',
    ).not.toBeNull();

    // --- 5. Alta en A (R11): numera en su propia serie. El maximo de A es su pedido 1 —borrado
    // logico, sigue ocupando la posicion—, asi que toca el 2; con una serie global saldria detras
    // del pedido alto de B.
    //
    // Sin `page.goto`: el borrado con exito dispara `router.refresh()`, y en WebKit una navegacion
    // propia pisaba esa y abortaba el test. Se espera a que el refresco quite la fila borrada.
    await expect(page.locator(`[data-testid="data-table-row-${orderAId}"]`)).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(page.getByTestId(ORDERS_TITLE)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(CREATE_OPEN).first().click();
    await expect(page.getByTestId(ORDER_FORM)).toBeVisible({ timeout: 60_000 });

    const picker = page.getByTestId(RECIPE_PICKER);
    await picker.click();
    await picker.fill(RECIPE_NAME);
    const recipeOption = page.getByTestId(RECIPE_PICKER_OPTION).filter({ hasText: RECIPE_NAME });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    await expect(page.getByTestId(RECIPE_PICKER_VALUE)).toHaveValue(recipeId);

    await page.getByTestId(QUANTITY_FIELD).fill(ORDER_QUANTITY);
    await page.getByTestId(ORDER_FORM).getByTestId(UNIT_SELECT).click();
    await page.locator(`[data-testid="${UNIT_OPTION}"][data-value="${unitId}"]`).click();

    const distribution = page.getByTestId(DISTRIBUTION_FIELD);
    await addPackagingLine(
      page,
      page.getByTestId(ORDER_FORM),
      { productId: packagingId!, name: PACKAGING_NAME },
      ORDER_PACKAGES,
    );
    await expect(distribution.getByTestId(DISTRIBUTION_AVAILABLE)).toHaveAttribute(
      'data-state',
      'ready',
      { timeout: 60_000 },
    );

    await page.getByTestId(FORM_SUBMIT).click();
    await expect(page.getByTestId(ORDER_FORM)).toHaveCount(0, { timeout: 60_000 });

    const createdInA = await prisma.order.findMany({
      where: { companyId: companyAId, deletedAt: null },
      select: { id: true, orderYear: true, orderSequence: true },
    });
    expect(createdInA, 'el alta de A debe dejar exactamente un pedido vivo en A').toHaveLength(1);
    const created = createdInA[0]!;
    expect(created.orderYear).toBe(year);
    expect(
      created.orderSequence,
      'el correlativo del alta de A sale de la serie de A, no de la de B',
    ).toBe(SHARED_SEQUENCE + 1);

    const createdNumber = formatOrderNumber({ year, sequence: created.orderSequence });
    await expect(
      page.getByTestId(ORDER_NUMBER_CELL).filter({ hasText: exactText(createdNumber) }),
      `el pedido ${createdNumber} deberia verse en la lista de A`,
    ).toHaveCount(1, { timeout: 60_000 });

    // Y B no se entera de nada de lo que hizo A: sus dos pedidos, tal cual y sin companeros nuevos.
    expect(await snapshotOrder(orderBId)).toEqual(orderBBefore);
    expect(await snapshotOrder(orderBHighId)).toEqual(orderBHighBefore);
    expect(await prisma.order.count({ where: { companyId: companyBId } })).toBe(2);
  });
});
