/**
 * E2E del ajuste de existencia de un lote: el panel de lotes, su historial y el dialogo de
 * ajuste, de punta a punta contra un navegador real y Postgres.
 *
 * Lo que no cubren los tests unitarios ni los de integracion, que es lo unico que justifica el
 * coste de este archivo:
 *  - la cadena completa navegador -> Server Action -> caso de uso -> Prisma -> Postgres, con
 *    sesion real y el layout privado de por medio;
 *  - que la pantalla, tras un ajuste valido, muestre la existencia nueva y el asiento nuevo en el
 *    historial, y que un ajuste que dejaria la existencia negativa se vea rechazado en pantalla
 *    sin dejar rastro en la base;
 *  - que el control de ajuste no exista en el DOM para quien solo tiene `inventario.consultar`.
 *
 * `init.sh` NO corre Playwright: este archivo se ejecuta a mano
 * (`pnpm exec playwright test e2e/ajuste-de-inventario.spec.ts`) y su resultado se anota en
 * `progress/impl_QC-92-ajuste-de-inventario.md`. El gate en verde no lo acredita.
 *
 * DATOS: `products`, `presentations`, `units` y `inventory_movements` son tablas compartidas y
 * Chromium/WebKit corren a la vez sobre la MISMA base, igual que el resto de la suite. Por eso,
 * copiando el patron de `e2e/inventario.spec.ts` y `e2e/aislamiento-inventario.spec.ts`:
 *  - todo lo que crea este archivo lleva el prefijo `qc92_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts filtran siempre por ESE producto/lote, nunca por «la primera fila»;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad** (una hora);
 *  - `afterAll` borra siempre, aunque un test reviente, en orden de FK: `inventory_movements` ->
 *    `product_batches` -> `products`/`presentations` -> `units` -> `users` -> `companies`.
 *
 * SEMBRADO: el producto, la presentacion, la unidad y el primer lote se crean con Prisma y NO por
 * la pantalla -el alta ya la cubre `e2e/inventario.spec.ts`- y el asiento de alta se inserta a
 * mano junto al lote, tal como lo deja `createWithFirstBatch` en produccion (mismo criterio que
 * `seedCompanyInventory` en `e2e/aislamiento-inventario.spec.ts`, que tambien siembra sin pasar
 * por el navegador).
 *
 * ROLES: el `Administrador` y el `Operador` los siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts`); si faltan, el `beforeAll` falla diciendo que hay que
 * sembrar. El `Operador` tiene `inventario.consultar` y NO tiene `inventario.modificar`
 * (`lib/modules/identity/domain/permissions.ts`), asi que sirve tal cual para el caso de quien no
 * puede ajustar: no hace falta un rol efimero.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  MOVEMENT_REASONS,
  normalizePresentationName,
  normalizeProductName,
} from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import { loginAndLand, permissionsForUsername } from './helpers/landing';

const FIXTURE_PREFIX = 'qc92_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez sobre la misma base: borrar por prefijo a secas se llevaria por delante una ejecucion
 * viva del otro proyecto.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** El maximo que ofrece la lista: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';
const SEARCH_PARAM = 'q';
const PAGE_SIZE_PARAM = 'pageSize';

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

const companyName = `${SHARED_TOKEN}_ca`;
const unitName = `${SHARED_TOKEN}_un`;
const presentationName = `${SHARED_TOKEN}_pr`;
const productName = `${SHARED_TOKEN}_pd`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc92-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc92-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Existencia inicial del lote sembrado, y su asiento de alta. */
const INITIAL_STOCK = 12;

/**
 * Cantidad con signo del ajuste feliz: NEGATIVA y decimal, la columna admite hasta 4 decimales.
 * `-0.5` es exactamente el caso que un `number` binario arriesga y que la cadena decimal evita.
 */
const HAPPY_DELTA = '-0.5';

/** El motivo de ese ajuste es el primero del conjunto cerrado: es el que elige el dialogo cuando
 * se pulsa su primera opcion, en el mismo orden en que `MOVEMENT_REASONS` las declara. */
const HAPPY_REASON = MOVEMENT_REASONS[0];

let companyId: string;
let productId: string;
let batchId: string;
let openingMovementId: string;

function listUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${INVENTORY_ROUTE}?${query.toString()}`;
}

async function createUser(user: Credentials, roleName: string, forCompanyId: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque la regla ruta-rol compara por ` +
        'nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc92${RUN_ID.slice(0, 8)}`,
      lastNames: 'Ajuste',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId: forCompanyId,
      // QC-78 R1: explicito y no por defecto. Una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** Abre el panel lateral de lotes del producto del fixture y espera a que cargue. */
async function openBatchesPanel(page: Page): Promise<void> {
  await page.getByTestId('product-batches-open').click();
  await expect(page.getByTestId('product-batches-sheet')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(`product-batch-${batchId}`)).toBeVisible({ timeout: 60_000 });
}

/** Cierra el panel de lotes por su boton de cierre: es lo que desmonta el historial (R23). */
async function closeBatchesPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('product-batches-sheet')).toHaveCount(0, { timeout: 60_000 });
}

/** Despliega el historial del lote del fixture y espera a que cargue la lista de asientos. */
async function openBatchHistory(page: Page): Promise<void> {
  await page.getByTestId('batch-history-trigger').click();
  await expect(page.getByTestId('batch-history-list')).toBeVisible({ timeout: 60_000 });
}

/** Elige la PRIMERA opcion del motivo, la que corresponde a `HAPPY_REASON`. */
async function chooseFirstReason(page: Page): Promise<void> {
  await page.getByTestId('adjust-batch-reason').click();
  const options = page.getByTestId('adjust-batch-reason-option');
  await expect(options.first()).toBeVisible({ timeout: 60_000 });
  await options.first().click();
}

/**
 * Abre el dialogo de ajuste, escribe la cantidad con signo y elige el primer motivo.
 *
 * `delta` es CADENA -y no `number`-: la columna admite hasta 4 decimales (`-0.5`, por ejemplo),
 * y un `number` de JavaScript es justo lo que el dominio evita para no arriesgar el redondeo
 * binario. `String(delta)` habria sido el mismo riesgo un paso antes.
 */
async function fillAdjustDialog(page: Page, delta: string): Promise<void> {
  await page.getByTestId('adjust-batch-open').click();
  await expect(page.getByTestId('adjust-batch-dialog')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('adjust-batch-delta').fill(delta);
  await chooseFirstReason(page);
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // Movimientos primero: `inventory_movements.batch_id` es `Restrict`.
  await prisma.inventoryMovement.deleteMany({
    where: {
      batch: { product: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } } },
    },
  });
  await prisma.productBatch.deleteMany({
    where: {
      product: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    },
  });
  await prisma.product.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.presentation.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.unit.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas, al final: las FK que apuntan a `companies` son `Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

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

  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;

  const adminId = await createUser(adminUser, ROLE_ADMINISTRADOR, companyId);
  await createUser(operatorUser, ROLE_OPERADOR, companyId);

  const unit = await prisma.unit.create({
    data: { name: unitName, nameNormalized: normalizeUnitName(unitName), companyId },
    select: { id: true },
  });

  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId: unit.id,
      companyId,
    },
    select: { id: true },
  });

  const product = await prisma.product.create({
    data: {
      name: productName,
      nameNormalized: normalizeProductName(productName),
      qtyAlert: 2,
      // La unidad de la presentacion de su lote, y su existencia guardada: sin la unidad,
      // `product_batches_check_unit` rechazaria el INSERT del lote de mas abajo. En la
      // aplicacion el alta las escribe; aqui la siembra las fija a mano.
      unitId: unit.id,
      stock: INITIAL_STOCK,
      companyId,
    },
    select: { id: true },
  });
  productId = product.id;

  const purchaseDate = new Date('2026-09-01T00:00:00Z');
  const batch = await prisma.productBatch.create({
    data: {
      productId,
      presentationId: presentation.id,
      companyId,
      stock: INITIAL_STOCK,
      unitCost: '3.5000',
      lot: `E2E-QC92-${RUN_ID}`,
      purchaseDate,
      createdBy: adminId,
    },
    select: { id: true },
  });
  batchId = batch.id;

  // El asiento de alta, tal como lo escribe `createWithFirstBatch` en produccion (R12): misma
  // cantidad que la existencia inicial, sin motivo.
  const opening = await prisma.inventoryMovement.create({
    data: {
      batchId,
      kind: 'opening',
      quantity: INITIAL_STOCK,
      reason: null,
      companyId,
      createdBy: adminId,
      createdAt: purchaseDate,
    },
    select: { id: true },
  });
  openingMovementId = opening.id;
});

test.afterAll(async () => {
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.inventoryMovement.deleteMany({ where: { batch: { product: { name: productName } } } }),
    () => prisma.productBatch.deleteMany({ where: { product: { name: productName } } }),
    () => prisma.product.deleteMany({ where: { name: productName } }),
    () => prisma.presentation.deleteMany({ where: { name: presentationName } }),
    () => prisma.unit.deleteMany({ where: { name: unitName } }),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, operatorUser.username] } },
      }),
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

// El primer `goto` compila la ruta bajo demanda en `next dev` y bcrypt tarda a proposito: un
// timeout corto da rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('ajuste de existencia de un lote', () => {
  test('un ajuste con motivo cambia la cantidad del lote y queda su asiento junto al de alta, en Postgres', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    await page.goto(listUrl(productName));
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    await openBatchesPanel(page);
    await expect(page.getByTestId('product-batch-quantity')).toContainText(String(INITIAL_STOCK));

    // El asiento de alta ya esta en el historial, antes de tocar nada.
    await openBatchHistory(page);
    await expect(page.getByTestId(`batch-history-entry-${openingMovementId}`)).toBeVisible({
      timeout: 60_000,
    });

    // El ajuste: cantidad con signo y un motivo del conjunto cerrado.
    await fillAdjustDialog(page, HAPPY_DELTA);
    await page.getByTestId('adjust-batch-confirm').click();
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0, { timeout: 60_000 });

    const expectedStock = INITIAL_STOCK + Number(HAPPY_DELTA);
    await expect(page.getByTestId('product-batch-quantity')).toContainText(String(expectedStock));

    // Contra Postgres: el lote quedo en el valor esperado y hay exactamente dos asientos, el
    // segundo de ajuste, con su cantidad con signo y su motivo.
    const batchAfter = await prisma.productBatch.findUnique({
      where: { id: batchId },
      select: { stock: true },
    });
    expect(
      batchAfter?.stock.toNumber(),
      'el stock del lote debe reflejar el ajuste',
    ).toBe(expectedStock);

    const movements = await prisma.inventoryMovement.findMany({
      where: { batchId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, kind: true, quantity: true, reason: true },
    });
    expect(movements, 'debe haber exactamente el asiento de alta y el del ajuste').toHaveLength(2);
    expect(movements[0]!.id).toBe(openingMovementId);
    expect(movements[0]!.kind).toBe('opening');
    expect(movements[0]!.quantity.toNumber()).toBe(INITIAL_STOCK);
    expect(movements[0]!.reason).toBeNull();
    expect(movements[1]!.kind).toBe('adjustment');
    expect(movements[1]!.quantity.toNumber()).toBe(Number(HAPPY_DELTA));
    expect(movements[1]!.reason).toBe(HAPPY_REASON);

    const adjustmentMovementId = movements[1]!.id;

    // El panel se cierra: la lista de detras ya se refresco -`AdjustBatchDialog` llama a
    // `router.refresh()` al confirmar-, sin que este recorrido recargue la pagina a mano. La
    // busqueda de `listUrl` deja un unico producto en la tabla, asi que la celda es unica.
    await closeBatchesPanel(page);
    await expect(page.getByTestId('product-stock')).toHaveText(`${expectedStock} ${unitName}`, {
      timeout: 60_000,
    });

    // Y en Postgres: `products.stock` del producto vale lo mismo que pinta la fila.
    const productAfterAdjustment = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });
    expect(
      productAfterAdjustment?.stock.toString(),
      'products.stock debe reflejar el ajuste sin recargar la pagina',
    ).toBe(String(expectedStock));

    // El panel se vuelve a abrir: es lo que desmonta y remonta el historial, para pedirlo de
    // nuevo y ver el asiento que se acaba de escribir.
    await openBatchesPanel(page);
    await expect(page.getByTestId('product-batch-quantity')).toContainText(String(expectedStock));

    await openBatchHistory(page);
    await expect(page.getByTestId(`batch-history-entry-${openingMovementId}`)).toBeVisible({
      timeout: 60_000,
    });
    const nuevaFila = page.getByTestId(`batch-history-entry-${adjustmentMovementId}`);
    await expect(nuevaFila).toBeVisible({ timeout: 60_000 });
    await expect(nuevaFila.getByTestId('batch-history-entry-reason')).not.toHaveText('');
    await expect(nuevaFila.getByTestId('batch-history-entry-author')).not.toHaveText('');
    await expect(nuevaFila.getByTestId('batch-history-entry-date')).not.toHaveText('');
  });

  test('un ajuste que dejaria la existencia bajo cero se rechaza y no deja rastro', async ({ page }) => {
    await loginAndLand(page, adminUser);

    await page.goto(listUrl(productName));
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    const before = await prisma.productBatch.findUnique({
      where: { id: batchId },
      select: { stock: true },
    });
    const stockBefore = before?.stock;
    if (stockBefore === undefined) {
      throw new Error('el lote del fixture no existe: fallo el beforeAll');
    }
    const movementsBefore = await prisma.inventoryMovement.count({ where: { batchId } });

    await openBatchesPanel(page);

    const overshoot = -(stockBefore.toNumber() + 1);
    await fillAdjustDialog(page, String(overshoot));
    await page.getByTestId('adjust-batch-confirm').click();

    const error = page.getByTestId('adjust-batch-error');
    await expect(error).toBeVisible({ timeout: 60_000 });
    expect(await error.getAttribute('data-code')).toBe('batch_stock_negative');
    // El dialogo sigue abierto: cerrarlo haria creer que el ajuste se aplico.
    await expect(page.getByTestId('adjust-batch-dialog')).toBeVisible();

    const after = await prisma.productBatch.findUnique({
      where: { id: batchId },
      select: { stock: true },
    });
    expect(after?.stock.toString(), 'un ajuste rechazado no puede tocar el stock').toBe(
      stockBefore.toString(),
    );

    const movementsAfter = await prisma.inventoryMovement.count({ where: { batchId } });
    expect(
      movementsAfter,
      'un ajuste rechazado no puede escribir ningun asiento',
    ).toBe(movementsBefore);
  });

  test('quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM', async ({
    page,
  }) => {
    const operatorPermissions = await permissionsForUsername(operatorUser.username);
    expect(
      operatorPermissions,
      'la premisa del caso: sin inventario.consultar este recorrido no probaria nada',
    ).toContain('inventario.consultar');
    expect(
      operatorPermissions,
      'la premisa del caso: con inventario.modificar el control existiria y el caso no probaria nada',
    ).not.toContain('inventario.modificar');

    await loginAndLand(page, operatorUser);

    await page.goto(listUrl(productName));
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    await openBatchesPanel(page);
    await expect(page.getByTestId('product-batch-quantity')).toBeVisible();

    await openBatchHistory(page);
    await expect(page.getByTestId(`batch-history-entry-${openingMovementId}`)).toBeVisible({
      timeout: 60_000,
    });

    // Ni visible ni deshabilitado: el control no esta en el DOM (R21).
    await expect(page.getByTestId('adjust-batch-open')).toHaveCount(0);
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0);
  });
});
