/**
 * E2E de la importacion de catalogo desde PDF: el recorrido completo -sube
 * un PDF de catalogo desde el detalle de un proveedor, abre su revision, ve una fila «nueva» y
 * una «cambia» con costo actual y nuevo, corrige un campo, quita una imagen, asigna la unidad de
 * una presentacion nueva, confirma, y comprueba en la base y en la pantalla del catalogo el costo
 * actualizado, la linea nueva con material, medidas e imagen, y la presentacion creada-, en
 * Chromium y en WebKit.
 *
 * SIN RED. El `webServer` de `playwright.config.ts` arranca con los dobles del modulo
 * `documentos` encendidos (almacenamiento en memoria, cola en linea e IA de guion): la IA
 * devuelve `CANNED_CATALOG_TEXT` (`ai-reader-canned.ts`) para cualquier prompt que no sea el del
 * recorte, y esta especificacion afirma contra esas MISMAS constantes en vez de repetir su texto.
 * Lo unico que sale del navegador es el `PUT` de la subida y el `GET` de las miniaturas de
 * recorte, y los dos se interceptan mas abajo.
 *
 * DATOS: mismo patron que `e2e/documentos.spec.ts` y `e2e/proveedores.spec.ts`. Todo lo que este
 * spec crea lleva el prefijo `qc158_e2e_` con el `RUN_ID` del worker dentro, los asserts filtran
 * por ESE nombre y el `afterAll` borra por los nombres EXACTOS de este worker aunque el test
 * reviente. La presentacion existente, su unidad y la linea viva que produce la fila «cambia» los
 * siembra el `beforeAll` por Prisma: la pantalla no tiene forma de dar de alta una presentacion
 * con unidad mas rapido que sembrarla directamente, y lo que este spec ejercita empieza en la
 * subida del PDF.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  CANNED_CATALOG_CHANGES_LINE_NAME,
  CANNED_CATALOG_CHANGES_NEW_COST,
  CANNED_CATALOG_CHANGES_PRESENTATION,
  CANNED_CATALOG_NEW_LINE_NAME,
  CANNED_CATALOG_NEW_PRESENTATION,
} from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-canned';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeSupplierName } from '@/lib/modules/proveedores';
import { prisma } from '@/lib/shared/db/prisma';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc158_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que el resto de specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez: borrar por prefijo a secas se llevaria lo que el otro proyecto acaba de crear.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** El origen al que los dobles de almacenamiento firman sus subidas y sus miniaturas de recorte. */
const STORAGE_ORIGIN = 'https://documentos-e2e.invalid';

/** El tipo de contenido que admite el borde del modulo; el selector no acepta otro. */
const PDF_MIME_TYPE = 'application/pdf';

/** Un PNG minimo (1x1) valido: lo que devuelve la interceptacion de una miniatura de recorte. */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc158-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
const supplierName = `${FIXTURE_PREFIX}proveedor_${RUN_ID}`;

/** El alta de un proveedor exige al menos un telefono o un correo. */
const supplierPhone = '+573000000000';

/** El nombre del PDF subido, unico por worker. */
const fileName = `${FIXTURE_PREFIX}catalogo_${RUN_ID}.pdf`;

/** Bytes que sube el navegador. El `PUT` esta interceptado: da igual que contienen. */
const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n', 'ascii');

/** Costo VIEJO de la linea viva, sembrado distinto del nuevo que trae el documento. */
const oldChangesCost = '500.0000';

/**
 * Material sembrado en la linea viva de la fila «cambia», distinto de null. El guion trae
 * `material: null` para esa fila: si la actualizacion de costo llegara a pisarlo, esta constante
 * quedaria en `null` en vez de este valor y la afirmacion lo detectaria.
 */
const existingMaterial = 'vidrio';

/** Texto exacto de las medidas de la fila «nueva», sin los ceros de relleno del guion. */
const newLineMeasurementsText = 'Ø 7.5 cm · alto 12 cm · boca 28/410';

/** El material corregido en la revision de la fila «nueva». */
const correctedMaterial = `${FIXTURE_PREFIX}material_${RUN_ID.slice(0, 8)}`;

let companyId: string | null = null;
let supplierId: string | null = null;
let systemUnitId: string | null = null;

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS, mismo patron y mismo orden -por FK- que
  // `e2e/documentos.spec.ts` y `e2e/proveedores.spec.ts`.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);

  if (orphanCompanyIds.length > 0) {
    await prisma.documentFile.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.documentBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.supplierCatalogLine.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.presentation.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  await prisma.supplier.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker, ANTES que su usuario. Nunca la de instalacion: el indice de
  // nombre de empresa es GLOBAL y chocaria con la que siembra `db:seed`.
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;

  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": este E2E no lo crea. Siembra la base con ` +
        'db:seed antes de correr los recorridos.',
    );
  }

  await createFixtureUser({
    data: {
      firstNames: `Qc158${RUN_ID.slice(0, 8)}`,
      lastNames: 'Catalogo',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: supplierPhone,
      documentTypeCode: 'CC',
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId: company.id,
      accountStatus: 'active',
    },
    select: { id: true },
  });

  const supplier = await prisma.supplier.create({
    data: {
      name: supplierName,
      nameNormalized: normalizeSupplierName(supplierName),
      phone: supplierPhone,
      companyId: company.id,
    },
    select: { id: true },
  });
  supplierId = supplier.id;

  // Una unidad de SISTEMA (`companyId: null`), sembrada por la migracion `units_catalog` y
  // visible para toda empresa: ninguna casa con `CANNED_CATALOG_NEW_UNIT_READ`
  // (`guion-e2e-unidad-sin-sembrar`), asi que la presentacion nueva queda sin preseleccion
  // y el revisor tiene que elegir a mano entre estas.
  const unit = await prisma.unit.findFirst({ where: { companyId: null }, select: { id: true } });
  if (!unit) {
    throw new Error(
      'no hay ninguna unidad de sistema sembrada: la migracion `units_catalog` deberia haberlas creado.',
    );
  }
  systemUnitId = unit.id;

  // La presentacion existente de la fila «cambia», con su unidad.
  const presentation = await prisma.presentation.create({
    data: {
      name: CANNED_CATALOG_CHANGES_PRESENTATION,
      nameNormalized: normalizePresentationName(CANNED_CATALOG_CHANGES_PRESENTATION),
      unitId: systemUnitId,
      companyId: company.id,
    },
    select: { id: true },
  });

  // La linea viva que el documento «cambia» de costo: el costo sembrado es DISTINTO del
  // que trae `CANNED_CATALOG_TEXT`.
  await prisma.supplierCatalogLine.create({
    data: {
      supplierId: supplier.id,
      name: CANNED_CATALOG_CHANGES_LINE_NAME,
      nameNormalized: normalizeSupplierName(CANNED_CATALOG_CHANGES_LINE_NAME),
      presentationId: presentation.id,
      unitId: systemUnitId,
      cost: oldChangesCost,
      material: existingMaterial,
      companyId: company.id,
    },
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara. El orden lo imponen
  // las FK: documentos -> lineas de catalogo -> presentaciones -> proveedor -> usuario -> empresa.
  try {
    if (companyId !== null) {
      await prisma.documentFile.deleteMany({ where: { companyId } });
      await prisma.documentBatch.deleteMany({ where: { companyId } });
    }
  } finally {
    try {
      if (companyId !== null) {
        await prisma.supplierCatalogLine.deleteMany({ where: { companyId } });
      }
    } finally {
      try {
        if (companyId !== null) {
          await prisma.presentation.deleteMany({ where: { companyId } });
        }
      } finally {
        try {
          await prisma.supplier.deleteMany({ where: { name: supplierName } });
        } finally {
          try {
            await prisma.user.deleteMany({ where: { username: adminUser.username } });
          } finally {
            try {
              await prisma.company.deleteMany({ where: { name: companyName } });
            } finally {
              await prisma.$disconnect();
            }
          }
        }
      }
    }
  }
});

/** Lo mismo que en `e2e/proveedores.spec.ts`: la fila del catalogo, por su `data-table-row-<id>`. */
async function findCatalogRow(page: Page, name: string): Promise<Locator> {
  const row = page.locator('[data-testid^="data-table-row-"]').filter({ hasText: name });
  const next = page.getByTestId('data-table-next');

  for (;;) {
    if ((await row.count()) > 0) return row;
    if ((await next.count()) === 0 || (await next.isDisabled())) return row;

    const before = new URL(page.url()).searchParams.get('page');
    await next.click();
    await page.waitForFunction(
      (previous) => new URL(window.location.href).searchParams.get('page') !== previous,
      before,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId('catalog-list')).toBeVisible({ timeout: 60_000 });
  }
}

// Timeout amplio, mismo motivo que `e2e/documentos.spec.ts`: la ruta se compila bajo demanda y el
// sondeo consulta cada dos segundos.
test.setTimeout(180_000);

test.describe('catalogo-desde-pdf', () => {
  test('sube un PDF de catalogo, revisa sus filas y confirma la importacion (R38)', async ({
    page,
  }) => {
    const supplier = supplierId;
    const company = companyId;
    const unit = systemUnitId;
    if (supplier === null || company === null || unit === null) {
      throw new Error('el fixture no esta completo: fallo el beforeAll');
    }

    // --- 0. Interceptar el UNICO trafico que sale del navegador: el `PUT` de la subida del PDF y
    // el `GET` de las miniaturas de recorte, las dos bajo el mismo origen reservado que usan los
    // dobles de almacenamiento del modulo.
    let uploaded = 0;
    await page.route(`${STORAGE_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'PUT, GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (url.pathname.startsWith('/crops/')) {
        await route.fulfill({
          status: 200,
          headers: { ...headers, 'content-type': 'image/png' },
          body: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
        });
        return;
      }
      uploaded += 1;
      await route.fulfill({ status: 200, headers, body: '' });
    });

    await loginAndLand(page, adminUser);

    // --- 1. La pantalla de detalle del proveedor; la subida vive en una ventana que se abre con su botón.
    await page.goto(supplierDetailRoute(supplier));
    await expect(page.getByTestId('supplier-detail-name')).toHaveText(supplierName, {
      timeout: 60_000,
    });
    await page.getByTestId('document-upload-open').click();
    await expect(page.getByTestId('document-upload')).toBeVisible({ timeout: 60_000 });

    // --- 2. Elegir el PDF y subirlo: enlace firmado, encolado y Server Actions reales.
    await page
      .getByTestId('document-upload-input')
      .setInputFiles([{ name: fileName, mimeType: PDF_MIME_TYPE, buffer: pdfBytes }]);
    await expect(page.getByTestId('document-upload-row-name-0')).toHaveText(fileName);
    await page.getByTestId('document-upload-submit').click();

    // --- 3. Esperar «listo»: el trabajo de la cola, en linea, con la IA de guion.
    await expect(page.getByTestId('document-upload-row-status-0')).toHaveAttribute(
      'data-status',
      'done',
      { timeout: 120_000 },
    );
    await expect(page.getByTestId('document-upload-error')).toHaveCount(0);
    expect(uploaded, 'el PDF sube sus bytes desde el navegador').toBe(1);

    // --- 4. «Revisar»: solo aparece con el archivo en «listo».
    await page.getByTestId('document-upload-row-review-0').click();
    await page.waitForURL((url) => url.pathname.includes('/importar/'), { timeout: 60_000 });
    await expect(page.getByTestId('catalog-import-review')).toBeVisible({ timeout: 60_000 });

    // --- 5. Dos filas: una «nueva» y una «cambia», con su costo actual y el nuevo.
    await expect(page.getByTestId('catalog-import-row-kind-0')).toHaveText('Nueva');
    await expect(page.getByTestId('catalog-import-row-kind-1')).toHaveText('Cambia de costo');
    await expect(page.getByTestId('catalog-import-row-current-cost-1')).toContainText(
      oldChangesCost,
    );
    await expect(page.getByTestId('catalog-import-row-new-cost-1')).toContainText(
      CANNED_CATALOG_CHANGES_NEW_COST,
    );

    // --- 6. Corregir un campo de la fila «nueva».
    const materialField = page.getByTestId('catalog-import-row-material-0');
    await materialField.fill(correctedMaterial);
    await expect(materialField).toHaveValue(correctedMaterial);

    // --- 7. Quitar la imagen de la fila «cambia»: la de la fila «nueva» se conserva para
    // que la linea creada termine con imagen.
    await expect(page.getByTestId('catalog-import-row-image-1')).not.toHaveAttribute(
      'data-missing',
      'true',
    );
    await page.getByTestId('catalog-import-row-remove-image-1').click();
    await expect(page.getByTestId('catalog-import-row-image-1')).toHaveAttribute(
      'data-missing',
      'true',
    );

    // --- 8. Asignar a mano la unidad de la presentacion nueva: ninguna unidad sembrada casa con
    // la leida, asi que no viene preseleccionada y el revisor elige entre las visibles.
    const presentationKey = normalizePresentationName(CANNED_CATALOG_NEW_PRESENTATION);
    await page.getByTestId(`new-presentation-unit-select-${presentationKey}`).click();
    await page.getByTestId(`new-presentation-unit-option-${presentationKey}-${unit}`).click();

    // --- 9. Confirmar.
    await expect(page.getByTestId('catalog-import-confirm')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('catalog-import-confirm').click();

    // --- 10. El resumen: una linea creada, una actualizada, ninguna sin cambios y una
    // presentacion nueva.
    await expect(page.getByTestId('catalog-import-summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('catalog-import-summary-created')).toHaveText('1');
    await expect(page.getByTestId('catalog-import-summary-updated')).toHaveText('1');
    await expect(page.getByTestId('catalog-import-summary-unchanged')).toHaveText('0');
    await expect(page.getByTestId('catalog-import-summary-presentations-created')).toHaveText('1');

    // --- 11. Vuelta al detalle del proveedor, donde el catalogo ya se ve actualizado.
    await page.getByTestId('catalog-import-summary-back-link').click();
    await page.waitForURL((url) => url.pathname === supplierDetailRoute(supplier), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('catalog-list')).toBeVisible({ timeout: 60_000 });

    const newRow = await findCatalogRow(page, CANNED_CATALOG_NEW_LINE_NAME);
    await expect(newRow.first()).toBeVisible({ timeout: 60_000 });
    await expect(newRow.first().getByTestId('data-table-cell-cost')).toHaveText('120.5');
    await expect(newRow.first().getByTestId('data-table-cell-material')).toHaveText(
      correctedMaterial,
    );
    await expect(newRow.first().getByTestId('data-table-cell-measurements')).toHaveText(
      newLineMeasurementsText,
    );
    await expect(newRow.first().getByTestId('data-table-cell-presentationId')).toHaveText(
      CANNED_CATALOG_NEW_PRESENTATION,
    );

    const changedRow = await findCatalogRow(page, CANNED_CATALOG_CHANGES_LINE_NAME);
    await expect(changedRow.first()).toBeVisible({ timeout: 60_000 });
    await expect(changedRow.first().getByTestId('data-table-cell-cost')).toHaveText('999');
    await expect(changedRow.first().getByTestId('data-table-cell-material')).toHaveText(
      existingMaterial,
    );

    // --- 12. Y en la base, de verdad: el costo actualizado de la linea viva (solo el costo)...
    const changedLine = await prisma.supplierCatalogLine.findFirst({
      where: { companyId: company, name: CANNED_CATALOG_CHANGES_LINE_NAME, deletedAt: null },
    });
    expect(changedLine, 'la linea viva deberia seguir existiendo, actualizada').not.toBeNull();
    expect(changedLine?.cost.toFixed(4)).toBe(CANNED_CATALOG_CHANGES_NEW_COST);
    expect(changedLine?.presentationId, 'R15: la presentacion no cambia').not.toBeNull();
    expect(changedLine?.material, 'R15: el material no lo toca la actualizacion de costo').toBe(
      existingMaterial,
    );

    // ...la linea nueva con material, medidas e imagen...
    const newLine = await prisma.supplierCatalogLine.findFirst({
      where: { companyId: company, name: CANNED_CATALOG_NEW_LINE_NAME, deletedAt: null },
    });
    expect(newLine, 'la linea nueva deberia haberse creado').not.toBeNull();
    expect(newLine?.material).toBe(correctedMaterial);
    expect(newLine?.measurements).toMatchObject({
      diameter: { value: '7.5000', unit: 'cm' },
      height: { value: '12.0000', unit: 'cm' },
      mouth: '28/410',
    });
    expect(newLine?.imagePath, 'R16, R24: la linea nueva conserva su imagen').not.toBeNull();
    expect(newLine?.imagePath).toMatch(new RegExp(`^${company}/`));

    // ...y la presentacion creada, con la unidad elegida a mano.
    const newPresentation = await prisma.presentation.findFirst({
      where: { companyId: company, name: CANNED_CATALOG_NEW_PRESENTATION },
    });
    expect(newPresentation, 'R17: la presentacion nueva deberia haberse creado').not.toBeNull();
    expect(newPresentation?.unitId, 'la unidad elegida a mano es la sembrada, no cualquiera').toBe(
      unit,
    );
    expect(newLine?.presentationId).toBe(newPresentation?.id);
    expect(newLine?.unitId).toBe(newPresentation?.unitId);
  });
});
