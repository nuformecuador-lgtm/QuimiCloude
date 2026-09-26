/**
 * E2E de la importacion de formula desde PDF: sube un PDF de formula desde el listado de
 * formulas, abre su revision, ve un ingrediente preseleccionado, crea otro como materia prima,
 * rellena un porcentaje que llego vacio hasta sumar 100,00 %, edita los pasos, ve el aviso de
 * choque con una receta sembrada del mismo nombre, elige reemplazar y confirma; luego reabre la
 * MISMA revision, cambia el nombre y confirma para crear una receta nueva sin tocar la
 * reemplazada. En Chromium y en WebKit (R39).
 *
 * SIN RED. El `webServer` de `playwright.config.ts` arranca con los dobles del modulo
 * `documentos` encendidos: la IA de guion devuelve `CANNED_FORMULA_TEXT`
 * (`ai-reader-canned.ts`) para cualquier lectura por texto (sin recortar), y esta
 * especificacion afirma contra esas MISMAS constantes en vez de repetir su texto. Lo unico que
 * sale del navegador es el `PUT` de la subida, interceptado mas abajo.
 *
 * DATOS: mismo patron que `e2e/catalogo-desde-pdf.spec.ts` y `e2e/documentos.spec.ts`. Todo lo
 * que este spec crea lleva el prefijo `qc159_e2e_` con el `RUN_ID` del worker dentro; los
 * asserts filtran por ESE nombre y el `afterAll` borra por los nombres EXACTOS de este worker
 * aunque el test reviente. El producto preseleccionable y el segundo producto los siembra el
 * `beforeAll` por Prisma, igual que la receta viva que produce el choque de nombre: la pantalla
 * no tiene forma de dar de alta ese estado mas rapido que sembrarlo directamente, y lo que este
 * spec ejercita empieza en la subida del PDF.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import {
  CANNED_FORMULA_EXISTING_PRODUCT_NAME,
  CANNED_FORMULA_MISSING_PERCENTAGE,
  CANNED_FORMULA_NEW_INGREDIENT_NAME,
  CANNED_FORMULA_PREFIX,
  CANNED_FORMULA_RECIPE_NAME,
} from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-canned';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeProductName, PRODUCT_TYPES } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { formulaImportRoute, FORMULAS_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc159_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que el resto de specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez: borrar por prefijo a secas se llevaria lo que el otro proyecto acaba de crear.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** El origen al que los dobles de almacenamiento firman sus subidas. */
const STORAGE_ORIGIN = 'https://documentos-e2e.invalid';

/** El tipo de contenido que admite el borde del modulo; el selector no acepta otro. */
const PDF_MIME_TYPE = 'application/pdf';

/** Bytes que sube el navegador. El `PUT` esta interceptado: da igual que contienen. */
const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n', 'ascii');

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc159-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

/** El nombre del PDF subido, unico por worker. */
const fileName = `${FIXTURE_PREFIX}formula_${RUN_ID}.pdf`;

/** El segundo producto vivo, para la fila sin nombre leido (R11: elegir uno existente). */
const secondProductName = `${FIXTURE_PREFIX}segundo_producto_${RUN_ID}`;

/** El nombre nuevo de la receta del caso «renombrar» (R17, R19). */
const renamedRecipeName = `${FIXTURE_PREFIX}renombrada_${RUN_ID}`;

/** El texto del paso anadido a mano en el caso «reemplazar» (R14). */
const addedStepText = `${FIXTURE_PREFIX}paso_nuevo_${RUN_ID}`;

let companyId: string | null = null;
let existingProductId: string | null = null;
let secondProductId: string | null = null;
let seededRecipeId: string | null = null;

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS, mismo patron y mismo orden -por FK- que
  // `e2e/catalogo-desde-pdf.spec.ts`: recetas (sus lineas van en cascada) -> productos ->
  // documentos -> empresa.
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
    await prisma.recipe.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker, ANTES que su usuario. Nunca la de instalacion: el indice
  // de nombre de empresa es GLOBAL y chocaria con la que siembra `db:seed`.
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

  await prisma.user.create({
    data: {
      firstNames: `Qc159${RUN_ID.slice(0, 8)}`,
      lastNames: 'Formulas',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
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

  // El producto que la fila 0 preselecciona: su nombre normalizado coincide EXACTO con el que
  // trae `CANNED_FORMULA_TEXT` (R11).
  const existingProduct = await prisma.product.create({
    data: {
      name: CANNED_FORMULA_EXISTING_PRODUCT_NAME,
      nameNormalized: normalizeProductName(CANNED_FORMULA_EXISTING_PRODUCT_NAME),
      type: PRODUCT_TYPES.PRODUCT,
      companyId: company.id,
    },
    select: { id: true },
  });
  existingProductId = existingProduct.id;

  // El segundo producto, para la fila sin nombre leido: el revisor lo elige a mano (R11, R12).
  const secondProduct = await prisma.product.create({
    data: {
      name: secondProductName,
      nameNormalized: normalizeProductName(secondProductName),
      type: PRODUCT_TYPES.PRODUCT,
      companyId: company.id,
    },
    select: { id: true },
  });
  secondProductId = secondProduct.id;

  // La receta viva con el MISMO nombre normalizado que trae el guion: produce el choque de
  // nombre del primer caso (R17).
  const seededRecipe = await prisma.recipe.create({
    data: {
      name: CANNED_FORMULA_RECIPE_NAME,
      nameNormalized: normalizeRecipeName(CANNED_FORMULA_RECIPE_NAME),
      description: `${FIXTURE_PREFIX}descripcion_sembrada_${RUN_ID}`,
      steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: `${FIXTURE_PREFIX}paso_sembrado_${RUN_ID}` }] }] }],
      companyId: company.id,
      lines: { create: [{ productId: existingProduct.id, percentage: '100.00' }] },
    },
    select: { id: true },
  });
  seededRecipeId = seededRecipe.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara. El orden lo
  // imponen las FK: documentos -> recetas (sus lineas caen en cascada) -> productos -> usuario ->
  // empresa. Las recetas van ANTES que los productos: `recipe_lines_product_id_fkey` es RESTRICT.
  try {
    if (companyId !== null) {
      await prisma.documentFile.deleteMany({ where: { companyId } });
      await prisma.documentBatch.deleteMany({ where: { companyId } });
    }
  } finally {
    try {
      if (companyId !== null) {
        await prisma.recipe.deleteMany({ where: { companyId } });
      }
    } finally {
      try {
        if (companyId !== null) {
          await prisma.product.deleteMany({ where: { companyId } });
        }
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
});

// Timeout amplio, mismo motivo que el resto: la ruta se compila bajo demanda y el sondeo
// consulta cada dos segundos.
test.setTimeout(180_000);

/** Instala la intercepcion del `PUT` al enlace firmado y devuelve el contador vivo. */
async function interceptSignedUploads(page: Page): Promise<{ count(): number }> {
  let intercepted = 0;
  await page.route(`${STORAGE_ORIGIN}/**`, async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    intercepted += 1;
    await route.fulfill({ status: 200, headers, body: '' });
  });
  return { count: () => intercepted };
}

/**
 * Elige un producto en un `ProductPicker` por su nombre: si vino en la pagina precargada lo
 * toma tal cual, si no lo busca. Mismo patron que `e2e/recetas.spec.ts`.
 */
async function selectProductByName(page: Page, testId: string, name: string): Promise<void> {
  const field = page.getByTestId(testId);
  await field.click();

  const option = page.getByTestId(`${testId}-option`).filter({ hasText: name });
  if ((await option.count()) === 0) {
    await field.fill(name);
  }
  await option.first().waitFor({ state: 'visible', timeout: 30_000 });
  await option.first().click();
}

/** Los textos de los parrafos de UN paso, sea cual sea el resto de su forma (marcas, etc). */
function stepParagraphTexts(document: unknown): readonly string[] {
  const blocks = (document as { readonly blocks?: readonly unknown[] }).blocks ?? [];
  return blocks.map((block) => {
    const spans = (block as { readonly spans?: readonly { readonly text: string }[] }).spans ?? [];
    return spans.map((span) => span.text).join('');
  });
}

test.describe('formula-desde-pdf', () => {
  test('sube un PDF de fórmula, reemplaza una receta con el mismo nombre y luego renombra para crear una nueva (R1, R11, R12, R14, R17, R18, R19, R25, R39)', async ({
    page,
  }) => {
    const company = companyId;
    const seedRecipeId = seededRecipeId;
    const secondProduct = secondProductId;
    if (company === null || seedRecipeId === null || secondProduct === null) {
      throw new Error('el fixture no esta completo: fallo el beforeAll');
    }

    const uploads = await interceptSignedUploads(page);

    await loginAndLand(page, adminUser);

    // --- 1. El listado de formulas: abrir la ventana, elegir el PDF y subirlo hasta «listo».
    await page.goto(FORMULAS_ROUTE);
    await expect(page.getByTestId('document-upload-open')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('document-upload-open').click();
    await expect(page.getByTestId('document-upload-dialog')).toBeVisible({ timeout: 60_000 });

    await page
      .getByTestId('document-upload-input')
      .setInputFiles([{ name: fileName, mimeType: PDF_MIME_TYPE, buffer: pdfBytes }]);
    await expect(page.getByTestId('document-upload-row-name-0')).toHaveText(fileName);
    await page.getByTestId('document-upload-submit').click();

    await expect(page.getByTestId('document-upload-row-status-0')).toHaveAttribute(
      'data-status',
      'done',
      { timeout: 120_000 },
    );
    await expect(page.getByTestId('document-upload-error')).toHaveCount(0);
    expect(uploads.count(), 'el PDF sube sus bytes desde el navegador').toBe(1);

    // --- 2. «Revisar»: solo aparece con el archivo en «listo» (R1).
    await page.getByTestId('document-upload-row-review-0').click();
    await page.waitForURL((url) => url.pathname.includes('/importar/'), { timeout: 60_000 });
    await expect(page.getByTestId('formula-import-review')).toBeVisible({ timeout: 60_000 });

    const importedUrl = new URL(page.url());
    const documentFileMatch = importedUrl.pathname.match(/\/importar\/([^/]+)$/);
    if (documentFileMatch === null) throw new Error('la URL de revision no trae el id del documento');
    const documentFileId = documentFileMatch[1] as string;
    expect(formulaImportRoute(documentFileId)).toBe(importedUrl.pathname);

    // --- 3. Fila 0: preseleccionada (R11).
    await expect(page.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'preselected');
    await expect(page.getByTestId('formula-import-row-preselected-product-0')).toHaveText(
      CANNED_FORMULA_EXISTING_PRODUCT_NAME,
    );

    // --- 4. Fila 1: sin match, se ofrece crear la materia prima con el nombre leido (R12, R25).
    await expect(page.getByTestId('formula-import-row-mode-1')).toHaveAttribute('data-mode', 'create');
    await expect(page.getByTestId('formula-import-row-new-name-1')).toHaveValue(
      CANNED_FORMULA_NEW_INGREDIENT_NAME,
    );

    // --- 5. Fila 2: sin nombre leido, el revisor elige el segundo producto sembrado y teclea el
    // porcentaje que la IA no trajo, hasta sumar 100,00 % (R7, R11, R12).
    await page.getByTestId('formula-import-row-choose-button-2').click();
    await selectProductByName(page, 'formula-import-row-product-picker-2', secondProductName);
    await page.getByTestId('formula-import-row-percentage-2').fill(CANNED_FORMULA_MISSING_PERCENTAGE);
    await expect(page.getByTestId('formula-import-sum')).toContainText('100,00');

    // --- 6. Pasos: borra el tercero y anade uno propio (R14).
    await expect(page.getByTestId('recipe-step-row')).toHaveCount(3);
    await page.getByTestId('recipe-step-remove-2').click();
    await expect(page.getByTestId('recipe-step-row')).toHaveCount(2);
    await page.getByTestId('recipe-step-add').click();
    await page.getByTestId('recipe-step-text-2').fill(addedStepText);

    // --- 7. El choque de nombre: la receta sembrada tiene el mismo nombre leido (R17).
    await expect(page.getByTestId('formula-import-clash')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('formula-import-clash-replace').click();

    // --- 8. Confirmar (R18).
    await expect(page.getByTestId('formula-import-confirm')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('formula-import-confirm').click();

    await expect(page.getByTestId('formula-import-summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('formula-import-summary-outcome')).toHaveText(
      'Se reemplazó la fórmula existente.',
    );
    await expect(page.getByTestId('formula-import-summary-raw-materials-created')).toHaveText('1');
    await expect(page.getByTestId('formula-import-summary-raw-materials-reused')).toHaveText('0');

    // --- 9. La base, de verdad: MISMO id, MISMO nombre, lineas y pasos nuevos (R18).
    const replacedRecipe = await prisma.recipe.findUnique({
      where: { id: seedRecipeId },
      include: { lines: true },
    });
    expect(replacedRecipe, 'la receta sembrada deberia seguir viva, con el MISMO id').not.toBeNull();
    expect(replacedRecipe?.id).toBe(seedRecipeId);
    expect(replacedRecipe?.name).toBe(CANNED_FORMULA_RECIPE_NAME);
    expect(replacedRecipe?.deletedAt).toBeNull();
    expect(replacedRecipe?.lines).toHaveLength(3);

    const newIngredient = await prisma.product.findFirst({
      where: { companyId: company, name: CANNED_FORMULA_NEW_INGREDIENT_NAME, deletedAt: null },
    });
    expect(newIngredient, 'la materia prima nueva deberia haberse creado (R25)').not.toBeNull();
    expect(newIngredient?.type).toBe(PRODUCT_TYPES.PRODUCT);
    expect(newIngredient?.unitId).toBeNull();
    expect(newIngredient?.stock.toString()).toBe('0');

    const lineByProduct = new Map(replacedRecipe?.lines.map((line) => [line.productId, line]));
    expect(Number(lineByProduct.get(existingProductId as string)?.percentage)).toBe(25);
    expect(Number(lineByProduct.get(newIngredient?.id as string)?.percentage)).toBe(60);
    expect(Number(lineByProduct.get(secondProduct)?.percentage)).toBe(15);

    expect(
      (newIngredient !== null
        ? await prisma.productBatch.count({ where: { productId: newIngredient.id } })
        : -1),
      'la materia prima nace SIN lotes (R25, P1)',
    ).toBe(0);

    const replacedStepTexts = (replacedRecipe?.steps as unknown[]).map(stepParagraphTexts);
    expect(replacedStepTexts).toEqual([
      [`${CANNED_FORMULA_PREFIX}-paso-1`],
      [`${CANNED_FORMULA_PREFIX}-paso-2-linea-a`, `${CANNED_FORMULA_PREFIX}-paso-2-linea-b`],
      [addedStepText],
    ]);

    // --- 10. Y en la ficha, ingredientes y pasos (R29).
    await page.getByTestId('formula-import-summary-link').click();
    await page.waitForURL((url) => url.pathname === recipeEditRoute(seedRecipeId), { timeout: 60_000 });
    await expect(page.getByTestId('recipe-field-name')).toHaveValue(CANNED_FORMULA_RECIPE_NAME);
    await expect(page.getByTestId('recipe-line-row')).toHaveCount(3);
    await expect(page.getByTestId('recipe-steps-list').getByTestId('recipe-step-row')).toHaveCount(3);

    // --- 11. Reabrir la MISMA revision por su direccion (R2), cambiar el nombre (R17) y confirmar
    // sin choque para crear una receta NUEVA (R19).
    await page.goto(formulaImportRoute(documentFileId));
    await expect(page.getByTestId('formula-import-review')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('formula-import-clash')).toBeVisible({ timeout: 30_000 });

    // El `fill` puede llegar antes de que la pagina hidrate; funciona porque la pantalla relee
    // el valor del DOM al perder el foco, asi que se espera el valor en pantalla y se sale con
    // un Tab real.
    const nameField = page.getByTestId('formula-import-name');
    await nameField.fill(renamedRecipeName);
    await expect(nameField).toHaveValue(renamedRecipeName);
    await nameField.press('Tab');
    await expect(page.getByTestId('formula-import-clash')).toHaveCount(0, { timeout: 30_000 });

    await page.getByTestId('formula-import-row-choose-button-2').click();
    await selectProductByName(page, 'formula-import-row-product-picker-2', secondProductName);
    await page.getByTestId('formula-import-row-percentage-2').fill(CANNED_FORMULA_MISSING_PERCENTAGE);
    await expect(page.getByTestId('formula-import-sum')).toContainText('100,00');

    // Foto de la receta reemplazada ANTES del segundo confirmar: no deberia cambiar (R19).
    const replacedRecipeBefore = await prisma.recipe.findUnique({
      where: { id: seedRecipeId },
      include: { lines: true },
    });

    await expect(page.getByTestId('formula-import-confirm')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('formula-import-confirm').click();

    await expect(page.getByTestId('formula-import-summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('formula-import-summary-outcome')).toHaveText('Se creó una fórmula nueva.');

    // --- 12. En base: una receta NUEVA (id distinto) y la reemplazada, INTACTA (R19).
    const newRecipe = await prisma.recipe.findFirst({
      where: { companyId: company, name: renamedRecipeName, deletedAt: null },
      include: { lines: true },
    });
    expect(newRecipe, 'deberia haberse creado una receta nueva').not.toBeNull();
    expect(newRecipe?.id).not.toBe(seedRecipeId);

    const replacedRecipeAfter = await prisma.recipe.findUnique({
      where: { id: seedRecipeId },
      include: { lines: true },
    });
    expect(JSON.parse(JSON.stringify(replacedRecipeAfter))).toEqual(
      JSON.parse(JSON.stringify(replacedRecipeBefore)),
    );
  });
});
