/**
 * E2E del ajuste de existencia de un lote por total contado: el panel de lotes, su historial y el
 * dialogo de ajuste, de punta a punta contra un navegador real y Postgres.
 *
 * Lo que no cubren los tests unitarios ni los de integracion, que es lo unico que justifica el
 * coste de este archivo:
 *  - la cadena completa navegador -> Server Action -> caso de uso -> Prisma -> Postgres, con
 *    sesion real y el layout privado de por medio;
 *  - que un total contado mayor o menor que la existencia se asiente con su diferencia, la
 *    existencia anterior y el total contado, y que el historial los pinte;
 *  - que si la existencia cambia con el dialogo abierto el ajuste se rechace sin asiento, la
 *    pantalla muestre la existencia nueva y la diferencia recalculada, y la reconfirmacion aplique
 *    la diferencia correcta;
 *  - que el control de ajuste no exista en el DOM para quien solo tiene `inventario.consultar`.
 *
 * `init.sh` NO corre Playwright: este archivo se ejecuta a mano
 * (`pnpm exec playwright test e2e/ajuste-de-inventario.spec.ts`). El gate en verde no lo acredita.
 *
 * DATOS: Chromium y WebKit corren a la vez sobre la MISMA base, y `fullyParallel` reparte los
 * casos de este archivo entre workers. Por eso:
 *  - todo lo que crea este archivo lleva el prefijo `qc92_e2e_` y dentro el `RUN_ID` del worker;
 *  - cada caso siembra SU producto y SU lote: los asientos de un caso no se cuelan en otro aunque
 *    compartan worker;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad** (una hora);
 *  - `afterAll` borra siempre, aunque un test reviente, en orden de FK.
 *
 * SEMBRADO: el producto, el lote y su asiento de alta se crean con Prisma y NO por la pantalla -el
 * alta ya la cubre `e2e/inventario.spec.ts`-, tal como los deja `createWithFirstBatch`.
 *
 * ROLES: el `Administrador` y el `Operador` los siembra `pnpm run db:seed`; si faltan, el
 * `beforeAll` falla diciendo que hay que sembrar. El `Operador` tiene `inventario.consultar` y NO
 * tiene `inventario.modificar`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  normalizePresentationName,
  normalizeProductName,
  type MovementReason,
} from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import { loginAndLand, permissionsForUsername } from './helpers/landing';
import { openRowActionsMenuItem } from './helpers/row-actions-menu';

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
const productNamePrefix = `${SHARED_TOKEN}_pd`;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${SHARED_TOKEN}_admin`,
  password: `Qc92-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${SHARED_TOKEN}_operador`,
  password: `Qc92-Operador-${RUN_ID.slice(0, 12)}`,
};

/** Existencia inicial de cada lote sembrado, y la cantidad de su asiento de alta. */
const INITIAL_STOCK = '12';

/**
 * Etiquetas tal como las pinta el selector. Se escriben a mano y no se importan del componente:
 * si la pantalla cambia la etiqueta, este recorrido tiene que enterarse.
 */
const REASON_OPTION_LABELS: Readonly<Record<MovementReason, string>> = {
  merma: 'Merma',
  rotura: 'Rotura',
  conteo_fisico: 'Conteo fisico',
  error_de_carga: 'Error de carga',
};

let companyId: string;
let adminId: string;
let unitId: string;
let presentationId: string;

type SeededBatch = {
  readonly productName: string;
  readonly productId: string;
  readonly batchId: string;
  readonly openingMovementId: string;
};

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
      // Explicito y no por defecto: una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** Siembra un producto con un lote de `INITIAL_STOCK` y su asiento de alta, solo para un caso. */
async function seedBatch(tag: string): Promise<SeededBatch> {
  const productName = `${productNamePrefix}_${tag}`;

  const product = await prisma.product.create({
    data: {
      name: productName,
      nameNormalized: normalizeProductName(productName),
      qtyAlert: 2,
      // Sin la unidad, `product_batches_check_unit` rechazaria el INSERT del lote.
      unitId,
      stock: INITIAL_STOCK,
      companyId,
    },
    select: { id: true },
  });

  const purchaseDate = new Date('2026-09-01T00:00:00Z');
  const batch = await prisma.productBatch.create({
    data: {
      productId: product.id,
      presentationId,
      companyId,
      stock: INITIAL_STOCK,
      unitCost: '3.5000',
      lot: `E2E-${tag}-${RUN_ID}`,
      purchaseDate,
      createdBy: adminId,
    },
    select: { id: true },
  });

  const opening = await prisma.inventoryMovement.create({
    data: {
      batchId: batch.id,
      kind: 'opening',
      quantity: INITIAL_STOCK,
      reason: null,
      companyId,
      createdBy: adminId,
      createdAt: purchaseDate,
    },
    select: { id: true },
  });

  return { productName, productId: product.id, batchId: batch.id, openingMovementId: opening.id };
}

/** Entra como `user`, abre la lista filtrada por el producto del caso y su panel de lotes. */
async function openBatchesOf(page: Page, user: Credentials, seeded: SeededBatch): Promise<void> {
  await loginAndLand(page, user);
  await page.goto(listUrl(seeded.productName));
  await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });
  await openBatchesPanel(page, seeded);
}

async function openBatchesPanel(page: Page, seeded: SeededBatch): Promise<void> {
  await (
    await openRowActionsMenuItem(page, page.getByTestId('product-row-actions'), 'product-batches-open')
  ).click();
  await expect(page.getByTestId('product-batches-sheet')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(`product-batch-${seeded.batchId}`)).toBeVisible({ timeout: 60_000 });
}

/** Cierra el panel de lotes por su boton de cierre: es lo que desmonta el historial. */
async function closeBatchesPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('product-batches-sheet')).toHaveCount(0, { timeout: 60_000 });
}

async function openBatchHistory(page: Page): Promise<void> {
  await page.getByTestId('batch-history-trigger').click();
  await expect(page.getByTestId('batch-history-list')).toBeVisible({ timeout: 60_000 });
}

async function chooseReason(page: Page, reason: MovementReason): Promise<void> {
  await page.getByTestId('adjust-batch-reason').click();
  const option = page
    .getByTestId('adjust-batch-reason-option')
    .filter({ hasText: REASON_OPTION_LABELS[reason] });
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
  await expect(page.getByTestId('adjust-batch-reason')).toContainText(REASON_OPTION_LABELS[reason]);
}

/**
 * Abre el dialogo, escribe el total contado y elige el motivo. El total va como CADENA: la
 * columna admite cuatro decimales y un `number` arriesgaria el redondeo binario.
 */
async function fillAdjustDialog(page: Page, counted: string, reason: MovementReason): Promise<void> {
  await page.getByTestId('adjust-batch-open').click();
  await expect(page.getByTestId('adjust-batch-dialog')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('adjust-batch-recorded-stock')).toHaveText(INITIAL_STOCK);
  await page.getByTestId('adjust-batch-counted').fill(counted);
  await chooseReason(page, reason);
}

async function movementsOf(batchId: string) {
  return prisma.inventoryMovement.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      quantity: true,
      reason: true,
      stockBefore: true,
      countedStock: true,
    },
  });
}

async function batchStockOf(batchId: string): Promise<string | undefined> {
  const batch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    select: { stock: true },
  });
  return batch?.stock.toFixed(4);
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

  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;

  adminId = await createUser(adminUser, ROLE_ADMINISTRADOR, companyId);
  await createUser(operatorUser, ROLE_OPERADOR, companyId);

  const unit = await prisma.unit.create({
    data: { name: unitName, nameNormalized: normalizeUnitName(unitName), companyId },
    select: { id: true },
  });
  unitId = unit.id;

  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId,
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;
});

test.afterAll(async () => {
  const productFilter = { name: { startsWith: productNamePrefix } };
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.inventoryMovement.deleteMany({ where: { batch: { product: productFilter } } }),
    () => prisma.productBatch.deleteMany({ where: { product: productFilter } }),
    () => prisma.product.deleteMany({ where: productFilter }),
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

test.describe('ajuste de existencia de un lote por total contado', () => {
  test('R29 — un total contado mayor que la existencia asienta el aumento con existencia anterior y total contado, en Postgres y en el historial', async ({
    page,
  }) => {
    const seeded = await seedBatch('aumento');
    await openBatchesOf(page, adminUser, seeded);
    await expect(page.getByTestId('product-batch-quantity')).toContainText(INITIAL_STOCK);

    await fillAdjustDialog(page, '15.5', 'conteo_fisico');
    const difference = page.getByTestId('adjust-batch-difference');
    await expect(difference).toHaveAttribute('data-direction', 'increase');
    await expect(difference).toHaveText('Aumento de 3.5');

    await page.getByTestId('adjust-batch-confirm').click();
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('product-batch-quantity')).toContainText('15.5');

    expect(await batchStockOf(seeded.batchId), 'el lote queda en el total contado').toBe('15.5000');

    const movements = await movementsOf(seeded.batchId);
    expect(movements, 'el asiento de alta y el del ajuste, nada mas').toHaveLength(2);
    expect(movements[0]!.id).toBe(seeded.openingMovementId);
    const adjustment = movements[1]!;
    expect(adjustment.kind).toBe('adjustment');
    expect(adjustment.reason).toBe('conteo_fisico');
    expect(adjustment.quantity.toFixed(4)).toBe('3.5000');
    expect(adjustment.stockBefore?.toFixed(4)).toBe('12.0000');
    expect(adjustment.countedStock?.toFixed(4)).toBe('15.5000');

    // Reabrir el panel remonta el historial y lo pide de nuevo, con el asiento recien escrito.
    await closeBatchesPanel(page);
    await openBatchesPanel(page, seeded);
    await openBatchHistory(page);
    const entry = page.getByTestId(`batch-history-entry-${adjustment.id}`);
    await expect(entry).toBeVisible({ timeout: 60_000 });
    await expect(entry.getByTestId('batch-history-entry-quantity')).toHaveText('3.5');
    await expect(entry.getByTestId('batch-history-entry-previous-stock')).toHaveText('12');
    await expect(entry.getByTestId('batch-history-entry-counted-stock')).toHaveText('15.5');
    await expect(entry.getByTestId('batch-history-entry-reason')).toHaveText(
      REASON_OPTION_LABELS.conteo_fisico,
    );
    // El asiento de alta no tiene existencia anterior ni total contado: se pinta como siempre.
    const opening = page.getByTestId(`batch-history-entry-${seeded.openingMovementId}`);
    await expect(opening).toBeVisible();
    await expect(opening.getByTestId('batch-history-entry-previous-stock')).toHaveCount(0);
    await expect(opening.getByTestId('batch-history-entry-counted-stock')).toHaveCount(0);
  });

  test('R29 — un total contado menor que la existencia asienta la disminucion con motivo merma, en Postgres y en la lista', async ({
    page,
  }) => {
    const seeded = await seedBatch('disminucion');
    await openBatchesOf(page, adminUser, seeded);

    await fillAdjustDialog(page, '9.25', 'merma');
    const difference = page.getByTestId('adjust-batch-difference');
    await expect(difference).toHaveAttribute('data-direction', 'decrease');
    await expect(difference).toHaveText('Disminución de 2.75');

    await page.getByTestId('adjust-batch-confirm').click();
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('product-batch-quantity')).toContainText('9.25');

    expect(await batchStockOf(seeded.batchId)).toBe('9.2500');

    const movements = await movementsOf(seeded.batchId);
    expect(movements).toHaveLength(2);
    const adjustment = movements[1]!;
    expect(adjustment.kind).toBe('adjustment');
    expect(adjustment.reason).toBe('merma');
    expect(adjustment.quantity.toFixed(4)).toBe('-2.7500');
    expect(adjustment.stockBefore?.toFixed(4)).toBe('12.0000');
    expect(adjustment.countedStock?.toFixed(4)).toBe('9.2500');

    // La lista de detras se refresca sola al confirmar, sin recargar la pagina.
    await closeBatchesPanel(page);
    await expect(page.getByTestId('product-stock')).toHaveText(`9.25 ${unitName}`, {
      timeout: 60_000,
    });
    const product = await prisma.product.findUnique({
      where: { id: seeded.productId },
      select: { stock: true },
    });
    expect(product?.stock.toFixed(4), 'products.stock acompana al lote').toBe('9.2500');
  });

  test('R29 — si la existencia cambia con el dialogo abierto, el ajuste se rechaza sin asiento y al reconfirmar se aplica la diferencia recalculada', async ({
    page,
  }) => {
    const seeded = await seedBatch('cambiada');
    await openBatchesOf(page, adminUser, seeded);

    await fillAdjustDialog(page, '10', 'merma');
    await expect(page.getByTestId('adjust-batch-difference')).toHaveText('Disminución de 2');

    // Otro movimiento llega mientras el dialogo esta abierto: el lote pasa de 12 a 15.
    await prisma.$transaction([
      prisma.productBatch.update({ where: { id: seeded.batchId }, data: { stock: '15' } }),
      prisma.product.update({ where: { id: seeded.productId }, data: { stock: '15' } }),
    ]);
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { batchId: seeded.batchId },
    });

    await page.getByTestId('adjust-batch-confirm').click();

    const stockChanged = page.getByTestId('adjust-batch-stock-changed');
    await expect(stockChanged).toBeVisible({ timeout: 60_000 });
    await expect(stockChanged).toHaveAttribute('data-code', 'batch_stock_changed');
    await expect(page.getByTestId('adjust-batch-dialog')).toBeVisible();
    await expect(page.getByTestId('adjust-batch-recorded-stock')).toHaveText('15');
    const difference = page.getByTestId('adjust-batch-difference');
    await expect(difference).toHaveAttribute('data-direction', 'decrease');
    await expect(difference).toHaveText('Disminución de 5');
    await expect(page.getByTestId('adjust-batch-counted')).toHaveValue('10');

    expect(await batchStockOf(seeded.batchId), 'el rechazo no toca el lote').toBe('15.0000');
    expect(
      await prisma.inventoryMovement.count({ where: { batchId: seeded.batchId } }),
      'el rechazo no escribe asiento',
    ).toBe(movementsBefore);

    // El motivo sigue valiendo para una disminucion: se reconfirma sin volver a elegirlo.
    await expect(page.getByTestId('adjust-batch-reason')).toContainText(REASON_OPTION_LABELS.merma);
    await page.getByTestId('adjust-batch-confirm').click();
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('product-batch-quantity')).toContainText('10');

    expect(await batchStockOf(seeded.batchId)).toBe('10.0000');
    const movements = await movementsOf(seeded.batchId);
    expect(movements, 'un solo asiento de ajuste, el de la reconfirmacion').toHaveLength(2);
    const adjustment = movements[1]!;
    expect(adjustment.kind).toBe('adjustment');
    expect(adjustment.reason).toBe('merma');
    expect(adjustment.quantity.toFixed(4)).toBe('-5.0000');
    expect(adjustment.stockBefore?.toFixed(4)).toBe('15.0000');
    expect(adjustment.countedStock?.toFixed(4)).toBe('10.0000');
  });

  test('R21 — quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM', async ({
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

    const seeded = await seedBatch('operador');
    await openBatchesOf(page, operatorUser, seeded);
    await expect(page.getByTestId('product-batch-quantity')).toBeVisible();

    await openBatchHistory(page);
    await expect(page.getByTestId(`batch-history-entry-${seeded.openingMovementId}`)).toBeVisible({
      timeout: 60_000,
    });

    // Ni visible ni deshabilitado: el control no esta en el DOM.
    await expect(page.getByTestId('adjust-batch-open')).toHaveCount(0);
    await expect(page.getByTestId('adjust-batch-dialog')).toHaveCount(0);
  });
});
