/**
 * E2E de la pantalla de ejecucion de la receta de un pedido asignado.
 *
 * Tres casos, tres `test()`: cada uno siembra o reutiliza su propio pedido, asi que no comparten
 * estado mutable entre si y un fallo en uno no delata al siguiente.
 *
 * LOS ASERTOS DE ESTADO SE LEEN DE LA BASE, nunca de la pantalla: la pantalla podria mentir en
 * cualquiera de los dos sentidos, y lo unico que demuestra la transicion real es la columna
 * `status` de `orders`.
 *
 * AISLAMIENTO: prefijo propio `qc63_e2e_` + `RUN_ID` por proceso de worker, empresa efimera
 * -`companies_name_unique` es GLOBAL- y limpieza de huerfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base.
 *
 * `recipes.company_id` es columna obligatoria: la receta del fixture la lleva, con la empresa del
 * propio fixture. La receta lleva ademas una unica linea al 100 % con un producto que tiene lote
 * y existencia de sobra: entregar consume material, y una receta sin lineas rechaza el Finalizar.
 *
 * El rol `Operador` es el REAL del seed, nunca un fixture: sus permisos son el dato bajo prueba
 * del camino feliz y de la reentrada. Para el camino negativo hace falta un actor SIN
 * `asignaciones.consultar`, y ninguno de los dos roles del seed sirve -Administrador y Operador lo
 * tienen los dos-, asi que este spec crea un rol efimero sin ningun permiso, igual que
 * `e2e/inventario.spec.ts`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';

import { normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName, type RecipeStepDocument } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ASSIGNED_ORDERS_ROUTE, DELIVERED_ORDER_PARAM, assignedOrderRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc63_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;

const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

/** El unico ingrediente de la receta del fixture: Finalizar lo consume al entregar. */
const PRODUCT_NAME = `${SHARED_TOKEN}_producto`;
const PRESENTATION_NAME = `${SHARED_TOKEN}_presentacion`;
const BATCH_LOT = `${SHARED_TOKEN}_lote`;

/** Muy por encima de `ORDER_QUANTITY`: la entrega debe alcanzar sin agotar el lote. */
const BATCH_STOCK = '100.0000';
const UNIT_COST = '10.0000';

/** Nombre del rol efimero sin ningun permiso, usado solo para el camino negativo. */
const NO_PERMISSIONS_ROLE_NAME = `${SHARED_TOKEN}_rol_sin_permisos`;

type Credentials = { readonly username: string; readonly password: string };

/** Entra, ve su pedido asignado y lo ejecuta. */
const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc63-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Sin `asignaciones.consultar`: el actor del camino negativo. */
const noAccessUser: Credentials = {
  username: `${SHARED_TOKEN}_sinacceso`,
  password: `Qc63-SinAcceso-${RUN_ID.slice(0, 12)}`,
};

const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [operatorUser.username]: 'Operador',
  [noAccessUser.username]: 'SinAcceso',
};
const firstNames = `Qc63${RUN_ID.slice(0, 8)}`;

const ORDER_QUANTITY = '3.0';

/** Divide `ORDER_QUANTITY` en envases enteros: Finalizar exige contenido para dar de alta el lote. */
const PRESENTATION_CONTENT = '1';

/**
 * Posicion inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const BASE_SEQUENCE = 800_000 + Math.floor(Math.random() * 90_000);

const SEQUENCE_PENDING = BASE_SEQUENCE;
const SEQUENCE_IN_PROGRESS = BASE_SEQUENCE + 1;

/**
 * El documento de los pasos de la receta del fixture: un primer paso con una lista de
 * verificacion -que bloquea Siguiente hasta marcarla- y un segundo y ultimo paso de solo texto,
 * para que Finalizar quede disponible sin marcar nada mas.
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
  {
    blocks: [{ kind: 'paragraph', spans: [{ text: `${SHARED_TOKEN}_mezcla_lista` }] }],
  },
];

const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ENTER_TESTID = 'assigned-order-enter';

const EXECUTION_TITLE_TESTID = 'order-execution-title';
const EXECUTION_ERROR_TESTID = 'order-execution-error';

/** El mismo `data-testid` que exporta `AssignedOrderDeliveredNotice`. */
const DELIVERED_NOTICE_TESTID = 'assigned-order-delivered-notice';

/** El item unico del primer bloque (`checklist`, indice 0) del primer paso. */
const STEP_CHECKLIST_ITEM_TESTID = 'step-reader-item-0-0';
const STEP_NEXT_TESTID = 'step-reader-next';
const STEP_FINISH_TESTID = 'step-reader-finish';

let companyId: string | null = null;
let recipeId: string | null = null;
let productId: string | null = null;
let presentationId: string | null = null;
let operatorUserId: string | null = null;
let orderPendingId: string | null = null;
let orderInProgressId: string | null = null;

let orderPendingNumber: string | null = null;

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

async function orderStatus(orderId: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  return order.status;
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
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
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
  status: 'PENDIENTE' | 'EN_CURSO';
}): Promise<{ id: string; numberText: string }> {
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  if (!recipeId) throw new Error('la receta del fixture no existe: fallo el beforeAll');
  if (!presentationId) throw new Error('la presentacion del fixture no existe: fallo el beforeAll');

  const { unitId } = await prisma.presentation.findUniqueOrThrow({
    where: { id: presentationId },
    select: { unitId: true },
  });
  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: params.sequence,
      recipeId,
      quantity: ORDER_QUANTITY,
      unitId,
      presentationLines: {
        create: [
          {
            companyId,
            presentationId,
            packages: Math.floor(Number(ORDER_QUANTITY) / Number(PRESENTATION_CONTENT)),
            presentationContent: PRESENTATION_CONTENT,
          },
        ],
      },
      status: params.status,
    },
    select: { id: true },
  });

  return { id: order.id, numberText: formatOrderNumber({ year, sequence: params.sequence }) };
}

test.beforeAll(async () => {
  // El rol nunca se crea aqui: `roles.name` es unico y es un dato compartido con produccion/seed.
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!operatorRole) {
    throw new Error(
      `falta el rol "${ROLE_OPERADOR}": este E2E no lo crea porque sus permisos son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS. El orden lo imponen las FK RESTRICT: asignaciones -> pedidos
  // -> receta/usuario/rol -> empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  // Una receta huerfana puede venir por su propio nombre (edad de la receta) o por colgar de
  // una empresa ya huerfana: los productos terminados de esa empresa restringen su borrado, asi
  // que ambos conjuntos se juntan ANTES de tocar `productBatch`/`product` de mas abajo.
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
    await prisma.orderPresentationLine.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.order.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    // Todos los lotes de la empresa huerfana, del producto de formula y del terminado: sus
    // movimientos ya cayeron arriba, y sin lotes ningun producto queda restringido por ellos.
    await prisma.productBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  if (orphanRecipeIds.length > 0) {
    await prisma.orderPresentationLine.deleteMany({
      where: { order: { recipeId: { in: orphanRecipeIds } } },
    });
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    // El producto terminado (`products.recipe_id`) RESTRINGE el borrado de la receta: se borra
    // antes que la receta. El producto de la formula (`recipe_lines.product_id`) es al reves y
    // se borra DESPUES, cuando la receta ya cayo y se llevo sus lineas por cascada.
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
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.role.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, la UNICA
  // definicion de «mismo nombre de empresa».
  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  // Rol efimero SIN ningun permiso: ni Administrador ni Operador sirven para el camino negativo,
  // los dos tienen `asignaciones.consultar`.
  const noPermissionsRole = await prisma.role.create({
    data: {
      name: NO_PERMISSIONS_ROLE_NAME,
      description: 'Rol efimero sin permisos del E2E de ejecucion de receta. Se borra en afterAll.',
    },
    select: { id: true },
  });

  operatorUserId = await createUser(operatorUser, operatorRole.id);
  await createUser(noAccessUser, noPermissionsRole.id);

  // La unidad NO se crea: es una de las cuatro del catalogo arrancador (misma referencia que
  // `e2e/recetas-porcentaje.spec.ts` y `e2e/ajuste-de-inventario.spec.ts`).
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  // El unico ingrediente de la receta: `products.unit_id` se fija A MANO, porque
  // `product_batches_check_unit` rechaza el lote de mas abajo si el producto no tiene ya unidad.
  productId = (
    await prisma.product.create({
      data: {
        name: PRODUCT_NAME,
        nameNormalized: normalizeProductName(PRODUCT_NAME),
        unitId: unit.id,
        // `products.stock` la mantiene la aplicacion, nunca un disparador: se fija a mano para
        // que case con el lote de mas abajo, igual que `e2e/recetas-porcentaje.spec.ts`.
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
      // Sin contenido, Finalizar rechaza con `presentation_without_content`.
      content: PRESENTATION_CONTENT,
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;

  // Existencia de sobra: la entrega consume del lote mas antiguo, y este es el unico.
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
        // Una unica linea al 100 %: sin ella la receta esta vacia y Finalizar la rechaza con
        // `recipe_without_lines`. El `INSERT` directo no pasa por el servicio, asi que la suma
        // de 100 % no la valida nadie: mismo criterio que `e2e/recetas-porcentaje.spec.ts`.
        lines: { create: [{ productId, percentage: '100.00' }] },
      },
      select: { id: true },
    })
  ).id;

  const [pending, inProgress] = await Promise.all([
    seedOrder({ sequence: SEQUENCE_PENDING, status: 'PENDIENTE' }),
    seedOrder({ sequence: SEQUENCE_IN_PROGRESS, status: 'EN_CURSO' }),
  ]);

  orderPendingId = pending.id;
  orderPendingNumber = pending.numberText;
  orderInProgressId = inProgress.id;

  await prisma.orderAssignment.createMany({
    data: [orderPendingId, orderInProgressId].map((orderId) => ({
      orderId,
      userId: operatorUserId!,
      companyId: companyId!,
    })),
  });
});

test.afterAll(async () => {
  // Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto
  // (Chromium/WebKit) sigue corriendo. Cada paso corre aunque falle el anterior.
  const scopedCompanyId = companyId;
  const scopedRecipeId = recipeId;
  // Uno de los casos entrega el pedido, y entregar consume: deja filas en `reservation_movements` e
  // `inventory_movements` que hay que borrar antes que el pedido y el lote (FK RESTRICT).
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
        ? prisma.orderPresentationLine.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    () =>
      scopedCompanyId
        ? prisma.order.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    // Todos los lotes primero, del producto de la receta y del terminado que Finalizar da de
    // alta: `product_batches.product_id` -> `products` RESTRINGE, y a esta altura ya no queda
    // ningun movimiento que restrinja el borrado del lote.
    () =>
      scopedCompanyId
        ? prisma.productBatch.deleteMany({ where: { companyId: scopedCompanyId } })
        : Promise.resolve(),
    // El producto terminado que Finalizar da de alta (`products.recipe_id`) RESTRINGE el borrado
    // de la receta: se borra el terminado ANTES de la receta, y el producto de la formula
    // DESPUES -`recipe_lines.product_id` lo restringe hasta que la receta cae por cascada.
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
      prisma.user.deleteMany({
        where: { username: { in: [operatorUser.username, noAccessUser.username] } },
      }),
    () => prisma.role.deleteMany({ where: { name: NO_PERMISSIONS_ROLE_NAME } }),
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

test.describe('la ejecucion de la receta de un pedido asignado', () => {
  test('R29 - el Operador entra, ve su pedido asignado, lo abre, el pedido queda EN_CURSO en base, recorre los pasos hasta Finalizar y el pedido queda POR_EMPACAR en base', async ({
    page,
  }) => {
    expect(orderPendingId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(orderPendingNumber, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (orderPendingId === null || orderPendingNumber === null) return;

    expect(
      await orderStatus(orderPendingId),
      'el pedido del fixture debe nacer PENDIENTE para que este caso demuestre la transicion',
    ).toBe('PENDIENTE');

    // Nunca una ruta escrita a mano: `loginAndLand` deriva el destino de los permisos reales del
    // actor.
    await loginAndLand(page, operatorUser);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const pendingRow = rowByNumber(page, orderPendingNumber);
    await expect(pendingRow).toHaveCount(1, { timeout: 60_000 });

    await pendingRow.getByTestId(ENTER_TESTID).click();
    await page.waitForURL((url) => url.pathname === assignedOrderRoute(orderPendingId!), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Abrir la pantalla ya deja el pedido EN_CURSO, y eso se lee EN BASE, no en la pantalla.
    expect(await orderStatus(orderPendingId)).toBe('EN_CURSO');

    // Paso 1 de 2: bloqueado hasta marcar el unico item de su lista de verificacion.
    await page.getByTestId(STEP_CHECKLIST_ITEM_TESTID).click();
    await page.getByTestId(STEP_NEXT_TESTID).click();

    // Paso 2 de 2, el ultimo: Finalizar envia el formulario que llama a
    // `finishAssignedOrderAction`, que termina en el servidor con un `redirect` a la lista que
    // lleva `DELIVERED_ORDER_PARAM` con el numero del pedido.
    await page.getByTestId(STEP_FINISH_TESTID).click();
    await page.waitForURL(
      (url) => url.pathname === ASSIGNED_ORDERS_ROUTE && url.searchParams.has(DELIVERED_ORDER_PARAM),
      { timeout: 60_000 },
    );

    // Finalizar deja el pedido «por empacar», no «entregado»: el empaque lo termina un Empacador
    // en otra pantalla.
    expect(await orderStatus(orderPendingId)).toBe('POR_EMPACAR');

    // La confirmacion se pinta EN LA LISTA al volver, nunca en la pantalla de ejecucion.
    const aviso = page.getByTestId(DELIVERED_NOTICE_TESTID);
    await expect(aviso).toBeVisible({ timeout: 60_000 });
    await expect(aviso).toContainText(orderPendingNumber);
    await expect(aviso).toContainText('por empacar');
  });

  test('R30 - quien no tiene asignaciones.consultar pide la direccion del pedido y recibe 404', async ({
    page,
  }) => {
    await loginAndLand(page, noAccessUser);

    // La direccion sale de `assignedOrderRoute`, nunca de un literal: un UUID cualquiera basta,
    // porque el corte por permiso ocurre ANTES de resolver ningun pedido.
    const response = await page.goto(assignedOrderRoute(randomUUID()));

    expect(
      response?.status(),
      'sin asignaciones.consultar la pantalla debe responder 404, indistinguible de una ruta que no existe',
    ).toBe(404);

    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(EXECUTION_ERROR_TESTID)).toHaveCount(0);
  });

  test('R9 - recargar la pantalla de un pedido ya EN_CURSO la vuelve a mostrar sin error y sin mover el estado', async ({
    page,
  }) => {
    expect(orderInProgressId, 'el fixture no existe: fallo el beforeAll').not.toBeNull();
    if (orderInProgressId === null) return;

    expect(
      await orderStatus(orderInProgressId),
      'el pedido del fixture debe nacer EN_CURSO para que este caso demuestre la reentrada',
    ).toBe('EN_CURSO');

    await loginAndLand(page, operatorUser);

    await page.goto(assignedOrderRoute(orderInProgressId));
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(EXECUTION_ERROR_TESTID)).toHaveCount(0);
    expect(await orderStatus(orderInProgressId)).toBe('EN_CURSO');

    // La recarga es la SEGUNDA entrada, y no tiene por que ser el mismo responsable: aqui lo es
    // porque un unico actor basta para demostrar que el estado no se mueve.
    await page.reload();
    await expect(page.getByTestId(EXECUTION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(EXECUTION_ERROR_TESTID)).toHaveCount(0);
    expect(await orderStatus(orderInProgressId)).toBe('EN_CURSO');
  });
});
