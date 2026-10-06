/**
 * E2E de la importacion de inventario desde un .csv mixto: vista previa, alta de la unidad que
 * falta desde la propia vista previa, confirmacion, lotes en Inventario y archivo de errores.
 *
 * DATOS: el .csv sale de `e2e/fixtures/inventario-importar-mixto.csv` cambiando `{{RUN}}` por el
 * `RUN_ID` del worker, para que el spec se pueda repetir y Chromium/WebKit no choquen. Todo cuelga
 * de una empresa propia con prefijo `qc209_e2e_`; la limpieza borra por esa empresa y los huerfanos
 * por prefijo y edad.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import Papa from 'papaparse';

import {
  CONFIRM_BUTTON_TESTID,
  DIALOG_SUBMIT_TESTID,
  ERROR_FILE_BUTTON_TESTID,
  MISSING_CREATE_TESTID,
  MISSING_NAME_TESTID,
  MISSING_ROWS_TESTID,
  MISSING_SECTION_TESTID,
  MISSING_UNIT_TESTID,
  PREVIEW_SUMMARY_TESTID,
  PREVIEW_TABLE_TESTID,
  RESULT_TABLE_TESTID,
  RESULT_TESTID,
  REVIEW_BUTTON_TESTID,
  ROW_ISSUE_TESTID,
  ROW_STATUS_TESTID,
  SCREEN_ERROR_TESTID,
  UNIT_DIALOG_TESTID,
  UPLOAD_INPUT_TESTID,
  confirmLabel,
  dialogFieldTestId,
  missingRowsLabel,
  totalTestId,
} from '@/app/(private)/inventario/importar/components/import-texts';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_IMPORT_ROUTE, INVENTORY_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc209_e2e_';
const RUN_ID = randomUUID().replace(/-/g, '');
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
const LIST_PAGE_SIZE = '25';

const CSV_TEMPLATE_PATH = path.join(__dirname, 'fixtures', 'inventario-importar-mixto.csv');
const CSV_PLACEHOLDER = /\{\{RUN\}\}/g;
const UPLOAD_FILE_NAME = 'inventario-importar-mixto.csv';
const ERROR_FILE_NAME = 'inventario-importar-mixto-errores.csv';
const CSV_MIME_TYPE = 'text/csv';

const TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;
const COMPANY_NAME = `${TOKEN}_empresa`;
const KILOGRAM_UNIT_NAME = 'kilogramo';
const LITER_UNIT_NAME = 'litro';

// Nombres que escribe la plantilla del .csv: si cambia, cambian aqui.
const NEW_PRODUCT = `${TOKEN}_insumo_nuevo`;
const EXISTING_PRODUCT = `${TOKEN}_insumo_existente`;
const PACKAGING = `${TOKEN}_envase`;
const MACHINE = `${TOKEN}_instrumento`;
const PRESENTATION = `${TOKEN}_botella`;
const FORMULA = `${TOKEN}_formula`;
const FINISHED_PRODUCT = `${FORMULA} · ${PRESENTATION}`;
const ERROR_PRODUCT = `${TOKEN}_insumo_error`;
const MISSING_UNIT = `${TOKEN}_tambor`;
const MISSING_UNIT_PRODUCT = `${TOKEN}_insumo_tambor`;

function lot(suffix: string): string {
  return `qc209_${RUN_ID}_${suffix}`;
}

const EXISTING_LOT = lot('L00');
const EXISTING_STOCK = '10';
const PRESENTATION_CONTENT = '1';

// Fila de la hoja (1 = cabecera) -> lo que se espera de ella.
const ROW = {
  newProduct: 2,
  existingProduct: 3,
  packaging: 4,
  machine: 5,
  finished: 6,
  duplicate: 7,
  fieldError: 8,
  missingUnitFirst: 9,
  missingUnitSecond: 10,
} as const;

const FIELD_ERROR_LOT = lot('L06');

/** Lote -> existencia que deja la importacion. El terminado: 12 envases de contenido 1. */
const IMPORTED_BATCHES: Readonly<Record<string, string>> = {
  [lot('L01')]: '25',
  [lot('L02')]: '5',
  [lot('L03')]: '40',
  [lot('L04')]: '2',
  [lot('L05')]: '12',
  [lot('L07')]: '6',
  [lot('L08')]: '4',
};

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc209-Admin-${RUN_ID.slice(0, 12)}`,
};

let companyId: string | null = null;
let kilogramLabel: string | null = null;

function fixture<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} no existe: fallo el beforeAll`);
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** La celda de nombre puede llevar «· unidad» detras; el nombre tiene que ser exacto. */
function exactNameCellText(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}(?:\\s*·\\s*\\S.*)?\\s*$`);
}

/** La existencia exacta va en el `aria-label`, seguida de la unidad si la hay. */
function stockLabel(amount: string): RegExp {
  return new RegExp(`^${escapeRegExp(amount)}(?:\\s|$)`);
}

async function mixedCsv(): Promise<Buffer> {
  const template = await readFile(CSV_TEMPLATE_PATH, 'utf8');
  return Buffer.from(template.replace(CSV_PLACEHOLDER, RUN_ID), 'utf8');
}

async function findSystemUnit(name: string): Promise<{ id: string; label: string }> {
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

function previewRow(page: Page, rowNumber: number): Locator {
  return page.getByTestId(PREVIEW_TABLE_TESTID).getByTestId(`data-table-row-${rowNumber}`);
}

async function expectTotal(page: Page, key: string, value: number): Promise<void> {
  await expect(page.getByTestId(totalTestId(key)).locator('dd')).toHaveText(String(value), {
    timeout: 60_000,
  });
}

async function expectPreviewStatuses(page: Page, statuses: Readonly<Record<number, string>>): Promise<void> {
  for (const [rowNumber, status] of Object.entries(statuses)) {
    await expect(
      previewRow(page, Number(rowNumber)).getByTestId(ROW_STATUS_TESTID),
      `estado de la fila ${rowNumber}`,
    ).toHaveAttribute('data-status', status, { timeout: 60_000 });
  }
}

function inventoryRow(page: Page, nameTestId: string, name: string): Locator {
  const nameCell = page.getByTestId(nameTestId).filter({ hasText: exactNameCellText(name) });
  return page.locator('[data-testid^="data-table-row-"]').filter({ has: nameCell });
}

async function deleteCompanyData(companyIds: readonly string[]): Promise<void> {
  if (companyIds.length === 0) return;
  const where = { companyId: { in: [...companyIds] } };
  // Orden de las FK `Restrict`: el terminado retiene la receta, y producto y presentacion la unidad.
  await prisma.inventoryMovement.deleteMany({ where });
  await prisma.productBatch.deleteMany({ where });
  await prisma.product.deleteMany({ where });
  await prisma.recipe.deleteMany({ where });
  await prisma.presentation.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.inventoryImport.deleteMany({ where });
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);
  await deleteCompanyData(orphanCompanyIds);
  await prisma.user.deleteMany({
    where: {
      username: { startsWith: FIXTURE_PREFIX },
      OR: [{ createdAt: { lt: orphanCutoff } }, { companyId: { in: orphanCompanyIds } }],
    },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  const ownCompanyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;
  companyId = ownCompanyId;

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
  const adminId = (
    await prisma.user.create({
      data: {
        firstNames: `Qc209${RUN_ID.slice(0, 8)}`,
        lastNames: 'Importar',
        birthDate: new Date('1990-01-01'),
        email: `${adminUser.username}@example.test`,
        phone: '+573000000000',
        documentTypeCode: 'CC',
        documentNumber: adminUser.username,
        username: adminUser.username,
        passwordHash: await createPasswordHash(adminUser.password),
        roleId: role.id,
        companyId: ownCompanyId,
        accountStatus: 'active',
      },
      select: { id: true },
    })
  ).id;

  const kilogram = await findSystemUnit(KILOGRAM_UNIT_NAME);
  kilogramLabel = kilogram.label;
  const liter = await findSystemUnit(LITER_UNIT_NAME);

  // El homonimo: la fila 3 le suma un lote y la 7 repite este lote.
  const existingProductId = (
    await prisma.product.create({
      data: {
        name: EXISTING_PRODUCT,
        nameNormalized: normalizeProductName(EXISTING_PRODUCT),
        unitId: kilogram.id,
        stock: EXISTING_STOCK,
        qtyAlert: '1',
        companyId: ownCompanyId,
      },
      select: { id: true },
    })
  ).id;
  const purchaseDate = new Date('2026-01-01T00:00:00Z');
  const existingBatchId = (
    await prisma.productBatch.create({
      data: {
        productId: existingProductId,
        presentationId: null,
        companyId: ownCompanyId,
        stock: EXISTING_STOCK,
        unitCost: '2.0000',
        lot: EXISTING_LOT,
        purchaseDate,
        createdBy: adminId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.inventoryMovement.create({
    data: {
      batchId: existingBatchId,
      kind: 'opening',
      quantity: EXISTING_STOCK,
      reason: null,
      companyId: ownCompanyId,
      createdBy: adminId,
      createdAt: purchaseDate,
    },
  });

  // Con contenido: la usan el envase y el producto terminado.
  await prisma.presentation.create({
    data: {
      name: PRESENTATION,
      nameNormalized: normalizePresentationName(PRESENTATION),
      unitId: liter.id,
      content: PRESENTATION_CONTENT,
      companyId: ownCompanyId,
    },
    select: { id: true },
  });

  await prisma.recipe.create({
    data: {
      name: FORMULA,
      nameNormalized: normalizeRecipeName(FORMULA),
      createdBy: adminId,
      companyId: ownCompanyId,
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  const steps: ReadonlyArray<() => Promise<unknown>> = [
    () => deleteCompanyData(companyId === null ? [] : [companyId]),
    () => prisma.user.deleteMany({ where: { username: adminUser.username } }),
    () => prisma.company.deleteMany({ where: { name: COMPANY_NAME } }),
  ];

  let firstFailure: unknown;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      firstFailure ??= error;
    }
  }

  await prisma.$disconnect();

  if (firstFailure !== undefined) throw firstFailure;
});

// El primer `goto` compila la ruta bajo demanda y bcrypt es lento a proposito.
test.setTimeout(240_000);

test.describe('importar inventario desde un archivo', () => {
  test('R33 el Administrador sube un .csv mixto, crea la unidad que falta desde la vista previa, confirma, ve los lotes en Inventario y descarga solo la fila con error y su motivo', async ({
    page,
  }) => {
    const ownCompanyId = fixture(companyId, 'la empresa del fixture');
    const kg = fixture(kilogramLabel, 'la unidad kilogramo');

    await loginAndLand(page, adminUser);
    await page.goto(INVENTORY_IMPORT_ROUTE);
    await expect(page.getByTestId(REVIEW_BUTTON_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 1. Subir el .csv mixto y pedir la vista previa.
    await page
      .getByTestId(UPLOAD_INPUT_TESTID)
      .setInputFiles([{ name: UPLOAD_FILE_NAME, mimeType: CSV_MIME_TYPE, buffer: await mixedCsv() }]);
    await page.getByTestId(REVIEW_BUTTON_TESTID).click();
    await expect(page.getByTestId(PREVIEW_SUMMARY_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(SCREEN_ERROR_TESTID)).toHaveCount(0);

    await expectTotal(page, 'rows', 9);
    await expectTotal(page, 'create', 4);
    await expectTotal(page, 'addBatch', 1);
    await expectTotal(page, 'duplicate', 1);
    await expectTotal(page, 'error', 3);
    await expectPreviewStatuses(page, {
      [ROW.newProduct]: 'create',
      [ROW.existingProduct]: 'add_batch',
      [ROW.packaging]: 'create',
      [ROW.machine]: 'create',
      [ROW.finished]: 'create',
      [ROW.duplicate]: 'duplicate',
      [ROW.fieldError]: 'error',
      [ROW.missingUnitFirst]: 'error',
      [ROW.missingUnitSecond]: 'error',
    });
    await expect(
      previewRow(page, ROW.fieldError).getByTestId(ROW_ISSUE_TESTID),
    ).toHaveAttribute('data-code', 'value_required');
    await expect(
      previewRow(page, ROW.fieldError).getByTestId(ROW_ISSUE_TESTID),
    ).toHaveAttribute('data-column', 'qtyAlert');
    for (const rowNumber of [ROW.missingUnitFirst, ROW.missingUnitSecond]) {
      await expect(previewRow(page, rowNumber).getByTestId(ROW_ISSUE_TESTID)).toHaveAttribute(
        'data-code',
        'unit_not_found',
      );
    }
    const fieldErrorReason = (
      await previewRow(page, ROW.fieldError).getByTestId(ROW_ISSUE_TESTID).textContent()
    )?.trim();
    expect(fieldErrorReason, 'la fila con error de campo debe explicar el motivo').toBeTruthy();

    // La unidad que falta sale una sola vez, con sus dos filas.
    const missingSection = page.getByTestId(MISSING_SECTION_TESTID);
    const missingUnit = missingSection.getByTestId(MISSING_UNIT_TESTID);
    await expect(missingUnit).toHaveCount(1);
    await expect(missingUnit.getByTestId(MISSING_NAME_TESTID)).toHaveText(MISSING_UNIT);
    await expect(missingUnit.getByTestId(MISSING_ROWS_TESTID)).toHaveText(
      missingRowsLabel([ROW.missingUnitFirst, ROW.missingUnitSecond]),
    );

    // --- 2. Crear la unidad desde la vista previa: el dialogo trae el nombre del archivo.
    await missingUnit.getByTestId(MISSING_CREATE_TESTID).click();
    const dialog = page.getByTestId(UNIT_DIALOG_TESTID);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByTestId(dialogFieldTestId('name'))).toHaveValue(MISSING_UNIT);
    await dialog.getByTestId(DIALOG_SUBMIT_TESTID).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    // --- 3. Vista previa revalidada: las dos filas de la unidad pasan a validas.
    await expect(page.getByTestId(MISSING_SECTION_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expectTotal(page, 'rows', 9);
    await expectTotal(page, 'create', 5);
    await expectTotal(page, 'addBatch', 2);
    await expectTotal(page, 'duplicate', 1);
    await expectTotal(page, 'error', 1);
    await expectPreviewStatuses(page, {
      [ROW.missingUnitFirst]: 'create',
      [ROW.missingUnitSecond]: 'add_batch',
      [ROW.fieldError]: 'error',
      [ROW.duplicate]: 'duplicate',
    });

    const createdUnit = await prisma.unit.findFirst({
      where: { companyId: ownCompanyId, nameNormalized: normalizeUnitName(MISSING_UNIT) },
      select: { id: true },
    });
    expect(createdUnit, 'la unidad se crea en la empresa del Administrador').not.toBeNull();

    // --- 4. Confirmar las 7 filas validas.
    const confirm = page.getByTestId(CONFIRM_BUTTON_TESTID);
    await expect(confirm).toHaveText(confirmLabel(7));
    await confirm.click();
    const result = page.getByTestId(RESULT_TESTID);
    await expect(result).toBeVisible({ timeout: 120_000 });
    await expectTotal(page, 'created', 5);
    await expectTotal(page, 'batchAdded', 2);
    await expectTotal(page, 'duplicate', 1);
    await expectTotal(page, 'error', 1);
    await expect(
      result
        .getByTestId(RESULT_TABLE_TESTID)
        .getByTestId(`data-table-row-${ROW.fieldError}`)
        .getByTestId(ROW_STATUS_TESTID),
    ).toHaveAttribute('data-status', 'error');

    // --- 5. Archivo de errores: solo la fila con error, con su motivo.
    const downloadPromise = page.waitForEvent('download');
    await result.getByTestId(ERROR_FILE_BUTTON_TESTID).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(ERROR_FILE_NAME);
    const downloadedPath = await download.path();
    const errorFile = await readFile(downloadedPath, 'utf8');
    expect(errorFile.startsWith('﻿'), 'el archivo de errores lleva BOM UTF-8').toBe(true);
    const parsed = Papa.parse<string[]>(errorFile.slice(1), { delimiter: ';', skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    const [header, ...lines] = parsed.data;
    expect(header?.[0]).toBe('Fila');
    expect(header?.at(-1)).toBe('Motivo');
    expect(lines, 'el archivo de errores trae solo la fila con error').toHaveLength(1);
    const [errorLine] = lines;
    expect(errorLine?.[0]).toBe(String(ROW.fieldError));
    expect(errorLine?.[header?.indexOf('Nombre') ?? -1]).toBe(ERROR_PRODUCT);
    expect(errorLine?.[header?.indexOf('Lote') ?? -1]).toBe(FIELD_ERROR_LOT);
    expect(errorLine?.at(-1)).toBe(fieldErrorReason);

    // --- 6. Inventario: los productos con la existencia que dejaron sus lotes.
    const listQuery = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, q: TOKEN });
    await page.goto(`${INVENTORY_ROUTE}?${listQuery.toString()}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    const expectedStock: ReadonlyArray<readonly [string, RegExp]> = [
      [NEW_PRODUCT, new RegExp(`^25 ${escapeRegExp(kg)}$`)],
      [EXISTING_PRODUCT, new RegExp(`^15 ${escapeRegExp(kg)}$`)],
      [PACKAGING, stockLabel('40')],
      [MACHINE, stockLabel('2')],
      [MISSING_UNIT_PRODUCT, new RegExp(`^10 ${escapeRegExp(MISSING_UNIT)}$`)],
    ];
    for (const [name, stock] of expectedStock) {
      const row = inventoryRow(page, 'data-table-cell-name', name);
      await expect(row, `fila de ${name}`).toHaveCount(1, { timeout: 60_000 });
      await expect(row.getByTestId('product-stock')).toHaveAttribute('aria-label', stock);
    }
    await expect(inventoryRow(page, 'data-table-cell-name', ERROR_PRODUCT)).toHaveCount(0);

    const finishedQuery = new URLSearchParams({
      pageSize: LIST_PAGE_SIZE,
      q: TOKEN,
      type: 'FINISHED_PRODUCT',
    });
    await page.goto(`${INVENTORY_ROUTE}?${finishedQuery.toString()}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });
    const finishedRow = inventoryRow(page, 'finished-stock-name', FINISHED_PRODUCT);
    await expect(finishedRow, 'el terminado importado, sin pedido').toHaveCount(1, { timeout: 60_000 });
    await expect(finishedRow.getByTestId('product-stock')).toHaveAttribute('aria-label', stockLabel('12'));

    // --- 7. Contra Postgres: cada lote con su existencia y un solo asiento de esa cantidad.
    const batches = await prisma.productBatch.findMany({
      where: { companyId: ownCompanyId },
      select: { lot: true, stock: true, movements: { select: { quantity: true } } },
    });
    const byLot = new Map(batches.map((batch) => [batch.lot, batch]));
    expect(batches, 'el lote sembrado mas los siete importados').toHaveLength(
      Object.keys(IMPORTED_BATCHES).length + 1,
    );
    for (const [batchLot, stock] of Object.entries(IMPORTED_BATCHES)) {
      const batch = byLot.get(batchLot);
      expect(batch, `lote ${batchLot}`).toBeDefined();
      expect(Number(batch?.stock), `existencia del lote ${batchLot}`).toBe(Number(stock));
      expect(
        batch?.movements.map((movement) => Number(movement.quantity)),
        `asiento del lote ${batchLot}`,
      ).toEqual([Number(stock)]);
    }
    expect(Number(byLot.get(EXISTING_LOT)?.stock), 'el duplicado no toca el lote existente').toBe(
      Number(EXISTING_STOCK),
    );
    expect(byLot.has(FIELD_ERROR_LOT), 'la fila con error no deja lote').toBe(false);

    const imports = await prisma.inventoryImport.findMany({
      where: { companyId: ownCompanyId },
      select: {
        fileName: true,
        rowsTotal: true,
        createdCount: true,
        batchAddedCount: true,
        duplicateCount: true,
        errorCount: true,
      },
    });
    expect(imports).toEqual([
      {
        fileName: UPLOAD_FILE_NAME,
        rowsTotal: 9,
        createdCount: 5,
        batchAddedCount: 2,
        duplicateCount: 1,
        errorCount: 1,
      },
    ]);
  });
});
