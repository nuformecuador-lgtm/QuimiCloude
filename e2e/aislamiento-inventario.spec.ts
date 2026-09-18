/**
 * Una sola sesion, la de la empresa A: los datos de B se siembran con Prisma porque no necesitan
 * sesion para existir. Es un unico test encadenado porque lo que este nivel aporta es que los pasos
 * encajan seguidos. Cada negativo tiene su positivo sobre el mismo dato: sin el, un aislamiento
 * roto por exceso daria verde.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// `name_normalized` y el nombre del rol tienen una sola definicion, en el contrato de su modulo:
// el fixture la usa en vez de repetirla.
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc49_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Chromium, WebKit y otros worktrees comparten base: borrar huerfanos por prefijo a secas se
 * llevaria filas de una ejecucion viva. Una hora deja fuera cualquier ejecucion en curso.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Las dos pantallas se piden buscando por este token comun, asi que la fila de B casaria con la
 * misma consulta si el ambito por empresa no filtrara. Sin el, su ausencia podria venir del filtro
 * de busqueda y no del aislamiento.
 */
const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

// Sufijos de dos letras: el nombre de presentacion admite 60 caracteres y el token ya gasta 41.
const PRODUCT_A_NAME = `${SHARED_TOKEN}_pa`;
const PRODUCT_B_NAME = `${SHARED_TOKEN}_pb`;
const PRESENTATION_A_NAME = `${SHARED_TOKEN}_ea`;
const PRESENTATION_B_NAME = `${SHARED_TOKEN}_eb`;
const UNIT_A_NAME = `${SHARED_TOKEN}_ua`;
const UNIT_B_NAME = `${SHARED_TOKEN}_ub`;

/** Nunca la empresa de instalacion: `companies_name_unique` es global. */
const COMPANY_A_NAME = `${SHARED_TOKEN}_ca`;
const COMPANY_B_NAME = `${SHARED_TOKEN}_cb`;

const ADMIN_USERNAME = `${SHARED_TOKEN}_admin`;
const ADMIN_PASSWORD = `Qc49-Admin-${RUN_ID.slice(0, 12)}`;

/** El maximo que ofrecen las dos pantallas: menos paginas que recorrer. */
const LIST_PAGE_SIZE = '25';
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** Ningun assert mira copy: solo `data-testid`. */
const INVENTORY_TITLE = 'inventario-title';
const PRESENTATIONS_TITLE = 'presentaciones-title';
const NAME_CELL = 'data-table-cell-name';
const DELETE_OPEN = 'product-delete-open';
const DELETE_DIALOG = 'delete-product-dialog';
const DELETE_ID_FIELD = 'delete-product-id';
const DELETE_CONFIRM = 'delete-product-confirm';
const DELETE_ERROR = 'delete-product-error';
const PRESENTATION_CREATE_OPEN = 'presentation-create-open';
const PRESENTATION_SHEET = 'presentation-sheet';
const PRESENTATION_FIELD_NAME = 'presentation-field-name';
const PRESENTATION_UNIT_SELECT = 'presentation-unit-select';
const PRESENTATION_UNIT_OPTION = 'presentation-unit-option';
const PRESENTATION_FORM_SUBMIT = 'presentation-form-submit';

let productAId: string | null = null;
let productBId: string | null = null;
let unitAId: string | null = null;

/** Un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function listUrl(route: string, search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${route}?${query.toString()}`;
}

/**
 * Con Prisma y no por la pantalla: B no tiene sesion, y el alta ya la cubre
 * `e2e/inventario.spec.ts`. Cada empresa lleva su propia unidad porque la base exige que las filas
 * que se referencian declaren la misma empresa.
 */
async function seedCompanyInventory(input: {
  readonly companyName: string;
  readonly unitName: string;
  readonly presentationName: string;
  readonly productName: string;
}): Promise<{ companyId: string; unitId: string; presentationId: string; productId: string }> {
  const company = await prisma.company.create({
    data: {
      name: input.companyName,
      nameNormalized: normalizeCompanyName(input.companyName),
    },
    select: { id: true },
  });

  const unit = await prisma.unit.create({
    data: {
      name: input.unitName,
      nameNormalized: normalizeUnitName(input.unitName),
      companyId: company.id,
    },
    select: { id: true },
  });

  const presentation = await prisma.presentation.create({
    data: {
      name: input.presentationName,
      nameNormalized: normalizePresentationName(input.presentationName),
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  });

  const product = await prisma.product.create({
    data: {
      name: input.productName,
      nameNormalized: normalizeProductName(input.productName),
      qtyAlert: 2,
      companyId: company.id,
    },
    select: { id: true },
  });

  // Sin lote el producto no tiene de donde derivar su unidad y la fila de la lista saldria a medias.
  await prisma.productBatch.create({
    data: {
      productId: product.id,
      presentationId: presentation.id,
      companyId: company.id,
      stock: 10,
      unitCost: '3.5000',
      lot: `E2E-${RUN_ID}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
    },
    select: { id: true },
  });

  return {
    companyId: company.id,
    unitId: unit.id,
    presentationId: presentation.id,
    productId: product.id,
  };
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

  // Un `pnpm run e2e` interrumpido deja filas del prefijo que ponen rojos otros tests que cuentan
  // filas. El orden lo imponen las FK `RESTRICT`.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.productBatch.deleteMany({
    where: { product: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } } },
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
  // Las empresas al final: las FK que apuntan a `companies` son `Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  const empresaA = await seedCompanyInventory({
    companyName: COMPANY_A_NAME,
    unitName: UNIT_A_NAME,
    presentationName: PRESENTATION_A_NAME,
    productName: PRODUCT_A_NAME,
  });
  productAId = empresaA.productId;
  unitAId = empresaA.unitId;

  const empresaB = await seedCompanyInventory({
    companyName: COMPANY_B_NAME,
    unitName: UNIT_B_NAME,
    presentationName: PRESENTATION_B_NAME,
    productName: PRODUCT_B_NAME,
  });
  productBId = empresaB.productId;

  // Hash real: el login tiene que pasar por bcrypt, el adaptador Prisma y la Server Action de verdad.
  await prisma.user.create({
    data: {
      firstNames: `Qc49${RUN_ID.slice(0, 8)}`,
      lastNames: 'Aislamiento',
      birthDate: new Date('1990-01-01'),
      email: `${ADMIN_USERNAME}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: ADMIN_USERNAME,
      username: ADMIN_USERNAME,
      passwordHash: await createPasswordHash(ADMIN_PASSWORD),
      roleId: role.id,
      companyId: empresaA.companyId,
      // Explicito y no por defecto: una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  // Por el token de este worker y nunca por `FIXTURE_PREFIX` a secas: el otro proyecto sigue
  // corriendo. El borrado de producto es fisico porque el de la pantalla es logico y dejaria la
  // fila viva. Cada paso corre aunque falle el anterior, y el primer fallo se relanza al final.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () =>
      prisma.productBatch.deleteMany({
        where: { product: { name: { startsWith: SHARED_TOKEN } } },
      }),
    () => prisma.product.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
    // Por prefijo, para arrastrar tambien la presentacion que el recorrido crea en A con el nombre
    // de la de B.
    () => prisma.presentation.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
    () => prisma.unit.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
    () => prisma.user.deleteMany({ where: { username: { startsWith: SHARED_TOKEN } } }),
    () => prisma.company.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
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

test.describe('aislamiento por empresa del inventario', () => {
  test('con sesion en la empresa A: las listas no traen nada de B, borrar una fila de B conociendo su identificador se rechaza y la fila sigue intacta, y el nombre de una presentacion de B se puede usar en A (R27)', async ({
    page,
  }) => {
    if (!productAId || !productBId || !unitAId) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }

    // --- 1. Una sola sesion, la de la empresa A.
    await loginAndLand(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const inventoryResponse = await page.goto(listUrl(INVENTORY_ROUTE, SHARED_TOKEN));
    await expect(page.getByTestId(INVENTORY_TITLE)).toBeVisible({ timeout: 60_000 });

    // Contra el cuerpo de la respuesta y no el DOM: una fila ocultada con CSS o filtrada en el
    // navegador pasaria mirando el DOM. El positivo va sobre el mismo documento para que la
    // ausencia de B no sea una pantalla vacia.
    const inventoryHtml = (await inventoryResponse?.text()) ?? '';
    expect(
      inventoryHtml.includes(PRODUCT_A_NAME),
      'el producto de la propia empresa debe viajar en el HTML servido',
    ).toBe(true);
    expect(
      inventoryHtml.includes(PRODUCT_B_NAME),
      'el producto de la empresa B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);

    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRODUCT_A_NAME) }),
    ).toHaveCount(1, { timeout: 60_000 });
    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRODUCT_B_NAME) }),
    ).toHaveCount(0);

    const presentationsResponse = await page.goto(listUrl(PRESENTATIONS_ROUTE, SHARED_TOKEN));
    await expect(page.getByTestId(PRESENTATIONS_TITLE)).toBeVisible({ timeout: 60_000 });

    const presentationsHtml = (await presentationsResponse?.text()) ?? '';
    expect(
      presentationsHtml.includes(PRESENTATION_A_NAME),
      'la presentacion de la propia empresa debe viajar en el HTML servido',
    ).toBe(true);
    expect(
      presentationsHtml.includes(PRESENTATION_B_NAME),
      'la presentacion de la empresa B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);

    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRESENTATION_A_NAME) }),
    ).toHaveCount(1, { timeout: 60_000 });
    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRESENTATION_B_NAME) }),
    ).toHaveCount(0);

    // El identificador de B se mete por DOM en el campo oculto del dialogo de borrado del producto
    // propio: es el gesto de quien abra las herramientas de desarrollo, y ejercita la Server Action
    // real sin fabricar ninguna peticion.
    await page.goto(listUrl(INVENTORY_ROUTE, SHARED_TOKEN));
    await expect(page.getByTestId(INVENTORY_TITLE)).toBeVisible({ timeout: 60_000 });

    const abrirBorrado = page.getByTestId(DELETE_OPEN);
    await expect(abrirBorrado, 'la lista de A debe ofrecer el borrado de su unico producto').toHaveCount(1, {
      timeout: 60_000,
    });
    await abrirBorrado.click();
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible({ timeout: 60_000 });

    const campoOculto = page.getByTestId(DELETE_ID_FIELD);
    // Si el campo no trajera de serie el identificador propio, sustituirlo no demostraria nada.
    await expect(campoOculto).toHaveValue(productAId);
    await campoOculto.evaluate((element, idAjeno) => {
      (element as HTMLInputElement).value = idAjeno;
    }, productBId);
    await expect(campoOculto).toHaveValue(productBId);

    await page.getByTestId(DELETE_CONFIRM).click();

    // El dialogo sigue abierto: cerrarlo haria creer que se borro.
    await expect(page.getByTestId(DELETE_ERROR)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible();

    // En base, porque la pantalla podria mentir en cualquiera de los dos sentidos.
    const productoBTrasElIntento = await prisma.product.findUnique({
      where: { id: productBId },
      select: { deletedAt: true },
    });
    expect(
      productoBTrasElIntento?.deletedAt ?? null,
      'el producto de la empresa B no puede quedar marcado como borrado',
    ).toBeNull();

    // Con su propio identificador el borrado funciona: sin esto, un borrado siempre roto daria el
    // mismo verde que un aislamiento correcto.
    await campoOculto.evaluate((element, idPropio) => {
      (element as HTMLInputElement).value = idPropio;
    }, productAId);
    await page.getByTestId(DELETE_CONFIRM).click();
    await expect(page.getByTestId(DELETE_DIALOG)).toHaveCount(0, { timeout: 60_000 });

    const productoATrasElBorrado = await prisma.product.findUnique({
      where: { id: productAId },
      select: { deletedAt: true },
    });
    expect(
      productoATrasElBorrado?.deletedAt ?? null,
      'el producto propio SI se tiene que poder borrar: es el control positivo del mismo dialogo',
    ).not.toBeNull();

    // A da de alta una presentacion con el nombre exacto de la de B. Con un indice unico global
    // fallaria con «ya existe», que ademas seria un oraculo sobre el catalogo ajeno.
    await page.goto(listUrl(PRESENTATIONS_ROUTE, PRESENTATION_B_NAME));
    await expect(page.getByTestId(PRESENTATIONS_TITLE)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(PRESENTATION_CREATE_OPEN).first().click();
    await expect(page.getByTestId(PRESENTATION_SHEET)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(PRESENTATION_FIELD_NAME).fill(PRESENTATION_B_NAME);

    // Por `data-value` y no por etiqueta: el texto podria casar con la unidad que otro proyecto
    // esta creando.
    await page.getByTestId(PRESENTATION_UNIT_SELECT).click();
    const opcionUnidadA = page.locator(
      `[data-testid="${PRESENTATION_UNIT_OPTION}"][data-value="${unitAId}"]`,
    );
    await expect(opcionUnidadA, 'la unidad de la empresa A debe estar disponible').toBeVisible({
      timeout: 60_000,
    });
    await opcionUnidadA.click();

    await page.getByTestId(PRESENTATION_FORM_SUBMIT).click();

    // El panel solo se cierra con exito: con el error de duplicado seguiria abierto.
    await expect(page.getByTestId(PRESENTATION_SHEET)).toHaveCount(0, { timeout: 60_000 });

    expect(
      await prisma.presentation.count({ where: { name: PRESENTATION_B_NAME } }),
      'el mismo nombre de presentacion debe poder existir en dos empresas distintas',
    ).toBe(2);
  });
});
