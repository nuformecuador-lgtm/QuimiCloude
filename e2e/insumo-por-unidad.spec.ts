/**
 * E2E del alta de un insumo por unidad: el formulario pide la unidad en vez de la presentacion,
 * el lote nace sin presentacion y se lee en la unidad del producto, y un segundo alta del mismo
 * nombre en la misma unidad suma al mismo producto.
 *
 * DATOS: todo lo que crea lleva el prefijo `qc199_e2e_` y el `RUN_ID` del worker, y cuelga de una
 * empresa propia; la limpieza borra por esa empresa. Los huerfanos se barren por prefijo y edad
 * para no llevarse lo que el otro proyecto (Chromium/WebKit) acaba de crear.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeUnitName, PACKAGE_UNIT_NAME } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc199_e2e_';
const RUN_ID = randomUUID().replace(/-/g, '');
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
const LIST_PAGE_SIZE = '25';
/** El valor del selector de unidad sin el glifo de la flecha, que tambien vive en el disparador. */
const SELECT_VALUE = '[data-slot="select-value"]';
const INVENTORY_SEARCH_PARAM = 'q';

type Credentials = { readonly username: string; readonly password: string };
type SystemUnitFixture = { readonly id: string; readonly label: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc199-Admin-${RUN_ID.slice(0, 12)}`,
};
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
const productName = `${FIXTURE_PREFIX}insumo_${RUN_ID}`;

const firstStock = '8';
const secondStock = '5';
const qtyAlert = '2';
const firstUnitCost = '1.25';
const secondUnitCost = '1.40';

let companyId: string | null = null;
let kilogramUnit: SystemUnitFixture | null = null;
let piecesUnit: SystemUnitFixture | null = null;

function fixture<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} no existe: fallo el beforeAll`);
  return value;
}

async function findSystemUnit(name: string): Promise<SystemUnitFixture> {
  const row = await prisma.unit.findFirst({
    where: { companyId: null, nameNormalized: normalizeUnitName(name) },
    select: { id: true, symbol: true, name: true },
  });
  if (row === null) {
    throw new Error(
      `falta la unidad de sistema "${name}": aplica las migraciones (\`pnpm run db:migrate\`) ` +
        'antes de correr `pnpm run e2e`.',
    );
  }
  return { id: row.id, label: row.symbol ?? row.name };
}

/** La lista filtrada por el nombre del fixture: una sola pagina, sin depender del orden. */
async function abrirInventarioFiltrado(page: Page): Promise<void> {
  const query = new URLSearchParams({
    pageSize: LIST_PAGE_SIZE,
    [INVENTORY_SEARCH_PARAM]: productName,
  });
  await page.goto(`${INVENTORY_ROUTE}?${query.toString()}`);
  await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });
}

async function abrirPanelDeAlta(page: Page): Promise<void> {
  await page.getByTestId('product-create-open').first().click();
  await expect(page.getByTestId('product-sheet')).toBeVisible({ timeout: 60_000 });
}

async function guardarAlta(page: Page): Promise<void> {
  await page.getByTestId('product-form-submit').click();
  await expect(page.getByTestId('product-sheet')).toHaveCount(0, { timeout: 60_000 });
}

function filaDelProducto(page: Page): Locator {
  return page
    .getByTestId('data-table-cell-name')
    .filter({ hasText: productName })
    .locator('xpath=ancestor::tr[1]');
}

async function abrirPanelDeLotes(page: Page): Promise<Locator> {
  await filaDelProducto(page).getByTestId('product-batches-open').click();
  const sheet = page.getByTestId('product-batches-sheet');
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet.getByTestId('product-batches-panel')).toBeVisible({ timeout: 60_000 });
  return sheet;
}

async function cerrarPanelDeLotes(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('product-batches-sheet')).toHaveCount(0, { timeout: 60_000 });
}

async function borrarDatosDeEmpresas(companyIds: readonly string[]): Promise<void> {
  if (companyIds.length === 0) return;
  const where = { companyId: { in: [...companyIds] } };
  // Orden de las FK `Restrict`: asientos -> lotes -> productos.
  await prisma.inventoryMovement.deleteMany({ where });
  await prisma.productBatch.deleteMany({ where });
  await prisma.product.deleteMany({ where });
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);
  await borrarDatosDeEmpresas(orphanCompanyIds);
  await prisma.user.deleteMany({
    where: {
      username: { startsWith: FIXTURE_PREFIX },
      OR: [{ createdAt: { lt: orphanCutoff } }, { companyId: { in: orphanCompanyIds } }],
    },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (role === null) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": siembra la base con \`pnpm run db:seed\` antes de ` +
        'correr `pnpm run e2e`.',
    );
  }
  await prisma.user.create({
    data: {
      firstNames: `Qc199${RUN_ID.slice(0, 8)}`,
      lastNames: 'Insumo',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId,
      // `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  kilogramUnit = await findSystemUnit('kilogramo');
  piecesUnit = await findSystemUnit(PACKAGE_UNIT_NAME);
});

test.afterAll(async () => {
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => borrarDatosDeEmpresas(companyId === null ? [] : [companyId]),
    () => prisma.user.deleteMany({ where: { username: adminUser.username } }),
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

// El primer `goto` compila la ruta bajo demanda y bcrypt es lento a proposito.
test.setTimeout(240_000);

test.describe('alta de insumo por unidad', () => {
  test('R19 el Administrador da de alta un insumo eligiendo kg, lo ve en el listado y en el panel de lotes en kg, y un segundo alta del mismo nombre en kg suma a ese producto', async ({
    page,
  }) => {
    const kg = fixture(kilogramUnit, 'la unidad kilogramo');
    const pieces = fixture(piecesUnit, 'la unidad «unidad»');
    const ownCompanyId = fixture(companyId, 'la empresa del fixture');

    await loginAndLand(page, adminUser);
    await page.goto(`${INVENTORY_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 1. Primer alta: el insumo pide «Unidad» y no «Presentacion».
    await abrirPanelDeAlta(page);
    await page.getByTestId('product-field-name').fill(productName);
    await page.getByTestId('product-field-stock').fill(firstStock);
    await page.getByTestId('product-field-qtyAlert').fill(qtyAlert);
    await expect(page.getByTestId('presentation-select')).toHaveCount(0);

    const unitSelect = page.getByTestId('presentation-unit-select');
    await unitSelect.click();

    // R2: la unidad de sistema «unidad» (u) esta entre las opciones, y no hay opcion «sin unidad».
    const piecesOption = page.locator(
      `[data-testid="presentation-unit-option"][data-value="${pieces.id}"]`,
    );
    await expect(piecesOption, 'el selector debe ofrecer la unidad «unidad»').toBeVisible({
      timeout: 60_000,
    });
    await expect(piecesOption).toHaveText(pieces.label);
    await expect(
      page.locator('[data-testid="presentation-unit-option"][data-value=""]'),
      'el selector no puede ofrecer «sin unidad»',
    ).toHaveCount(0);

    await page.locator(`[data-testid="presentation-unit-option"][data-value="${kg.id}"]`).click();
    await expect(unitSelect.locator(SELECT_VALUE)).toHaveText(kg.label, { timeout: 60_000 });

    await page.getByTestId('product-field-unitCost').fill(firstUnitCost);
    await guardarAlta(page);

    // --- 2. Listado y panel de lotes, en kg.
    await abrirInventarioFiltrado(page);
    await expect(filaDelProducto(page)).toHaveCount(1, { timeout: 60_000 });
    await expect(filaDelProducto(page).getByTestId('product-stock')).toHaveText(
      `${firstStock} ${kg.label}`,
      { timeout: 60_000 },
    );

    let sheet = await abrirPanelDeLotes(page);
    await expect(sheet.getByTestId('product-batch-quantity')).toHaveText(
      `${firstStock} ${kg.label}`,
      { timeout: 60_000 },
    );
    await cerrarPanelDeLotes(page);

    // --- 3. Segundo alta del mismo nombre: elegido del desplegable, con kg preseleccionado.
    await abrirPanelDeAlta(page);
    const nameField = page.getByTestId('product-field-name');
    await nameField.click();
    await nameField.fill(productName);
    const nameOption = page.getByTestId('product-name-option').filter({ hasText: productName });
    await expect(nameOption.first()).toBeVisible({ timeout: 60_000 });
    await nameOption.first().click();
    await expect(page.getByTestId('product-name-value')).toHaveValue(productName, {
      timeout: 60_000,
    });
    await expect(
      page.getByTestId('presentation-unit-select').locator(SELECT_VALUE),
    ).toHaveText(kg.label, {
      timeout: 60_000,
    });

    await page.getByTestId('product-field-stock').fill(secondStock);
    await page.getByTestId('product-field-qtyAlert').fill(qtyAlert);
    await page.getByTestId('product-field-unitCost').fill(secondUnitCost);
    await guardarAlta(page);

    // --- 4. La existencia del MISMO producto sube, y los dos lotes se ven en kg.
    const summedStock = Number(firstStock) + Number(secondStock);
    await expect(filaDelProducto(page).getByTestId('product-stock')).toHaveText(
      `${summedStock} ${kg.label}`,
      { timeout: 60_000 },
    );
    await expect(filaDelProducto(page)).toHaveCount(1);

    sheet = await abrirPanelDeLotes(page);
    const quantities = sheet.getByTestId('product-batch-quantity');
    await expect(quantities).toHaveCount(2, { timeout: 60_000 });
    expect([...(await quantities.allTextContents())].map((text) => text.trim()).sort()).toEqual(
      [`${firstStock} ${kg.label}`, `${secondStock} ${kg.label}`].sort(),
    );
    await cerrarPanelDeLotes(page);

    // --- 5. Contra Postgres: un solo producto vivo con ese nombre, en kg, y sus dos lotes sin
    // presentacion.
    const products = await prisma.$queryRaw<Array<{ id: string; unit_id: string | null }>>`
      SELECT p.id AS id, p.unit_id AS unit_id
      FROM products p
      WHERE p.name = ${productName} AND p.company_id = ${ownCompanyId}::uuid AND p.deleted_at IS NULL
    `;
    expect(products, 'el segundo alta no puede crear otro producto').toHaveLength(1);
    expect(products[0]?.unit_id, 'el producto se guarda con la unidad elegida').toBe(kg.id);

    const batches = await prisma.$queryRaw<Array<{ presentation_id: string | null }>>`
      SELECT b.presentation_id AS presentation_id
      FROM product_batches b
      WHERE b.product_id = ${products[0]?.id}::uuid
    `;
    expect(batches, 'los dos altas dejan dos lotes en el mismo producto').toHaveLength(2);
    expect(
      batches.map((batch) => batch.presentation_id),
      'el lote de insumo se guarda sin presentacion',
    ).toEqual([null, null]);
  });
});
