/**
 * E2E del aislamiento por empresa en proveedores (R37; ejercita R14, R25, R27 y R28).
 *
 * Una sola sesion real, la de la empresa A. Lo de B se siembra con Prisma porque no necesita
 * sesion para existir. Es un unico test encadenado porque lo que este nivel aporta es que los
 * cuatro pasos encajan seguidos, y cada negativo lleva su positivo sobre el mismo dato: sin el, un
 * aislamiento roto por exceso -una lista vacia, un borrado que nunca funciona- daria verde.
 *
 * LAS DOS EMPRESAS COMPARTEN TOKEN DE BUSQUEDA: la lista se pide filtrando por el, asi que la fila
 * de B casaria con la misma consulta si el ambito por empresa no filtrara. Sin eso, su ausencia
 * podria venir del filtro y no del aislamiento.
 *
 * QUE PRUEBA QUE NO HAY ORACULO DE EXISTENCIA: ni la pagina de detalle ni el error del dialogo se
 * comparan contra un texto escrito aqui, sino contra el que sale para un identificador que no
 * existe en NINGUNA empresa. Si «de otra empresa» y «no existe» dieran respuestas distintas, quien
 * sondea identificadores aprenderia que proveedores tienen las demas empresas, y esa diferencia es
 * exactamente lo que estas comparaciones ponen en rojo.
 *
 * LOS PROVEEDORES SE BORRAN A MANO en `afterAll`: el de la pantalla es logico y dejaria la fila
 * viva para el resto del repo. El orden lo imponen las FK -incluidas las dos compuestas de esta
 * feature-: lineas de catalogo -> proveedores -> presentaciones -> unidades -> usuario -> empresas.
 *
 * Ningun assert mira copy: `data-testid` y valores del fixture.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { UNEXPECTED_ERROR_NOTICE_TESTID } from '@/components/shared/unexpected-error-notice';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeSupplierName } from '@/lib/modules/proveedores';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc59_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Chromium, WebKit y otros worktrees comparten base: borrar huerfanos por prefijo a secas se
 * llevaria filas de una ejecucion viva. Una hora deja fuera cualquier ejecucion en curso.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Token comun de este worker: es tambien el termino con el que se pide la lista. */
const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es global. */
const COMPANY_A_NAME = `${SHARED_TOKEN}_ca`;
const COMPANY_B_NAME = `${SHARED_TOKEN}_cb`;

const UNIT_A_NAME = `${SHARED_TOKEN}_ua`;
const UNIT_B_NAME = `${SHARED_TOKEN}_ub`;
const PRESENTATION_A_NAME = `${SHARED_TOKEN}_ea`;
const PRESENTATION_B_NAME = `${SHARED_TOKEN}_eb`;
const SUPPLIER_A_NAME = `${SHARED_TOKEN}_sa`;

/** El nombre de B es el que el ultimo paso vuelve a dar de alta en A: unico por empresa (R14). */
const SUPPLIER_B_NAME = `${SHARED_TOKEN}_sb`;

const LINE_A_NAME = `${SHARED_TOKEN}_la`;
const LINE_B_NAME = `${SHARED_TOKEN}_lb`;

const ADMIN_USERNAME = `${SHARED_TOKEN}_admin`;
const ADMIN_PASSWORD = `Qc59-Admin-${RUN_ID.slice(0, 12)}`;

/** Al menos un telefono o un correo: lo exige `suppliers_contact_required`. */
const SUPPLIER_PHONE = '+573000000000';
const LINE_COST = '12.3456';

/** Nombre del parametro de la URL con el que el filtro de proveedor se sincroniza. */
const SUPPLIER_SEARCH_PARAM = 'supplier';

/** Ningun assert mira copy: solo `data-testid`. */
const SUPPLIERS_TITLE = 'proveedores-title';
const DETAIL_LINK = 'supplier-detail-link';
const DETAIL_NAME = 'supplier-detail-name';
const NOT_FOUND = 'supplier-not-found';
const NOT_FOUND_LINK = 'supplier-not-found-link';
const DELETE_OPEN = 'supplier-delete-open';
const DELETE_DIALOG = 'delete-supplier-dialog';
const DELETE_ID_FIELD = 'delete-supplier-id';
const DELETE_CONFIRM = 'delete-supplier-confirm';
const DELETE_ERROR = 'delete-supplier-error';
const CREATE_OPEN = 'supplier-create-open';
const SUPPLIER_SHEET = 'supplier-sheet';
const FIELD_NAME = 'supplier-field-name';
const FIELD_PHONE = 'supplier-field-phone';
const FORM_SUBMIT = 'supplier-form-submit';
const FORM_ERROR = 'supplier-form-error';

/** Identificador que no es de ninguna empresa: el patron con el que se compara «de otra». */
const UNKNOWN_ID = randomUUID();

let companyAId: string | null = null;
let companyBId: string | null = null;
let supplierAId: string | null = null;
let supplierBId: string | null = null;
let lineAId: string | null = null;
let lineBId: string | null = null;

/** Un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function listUrl(): string {
  const query = new URLSearchParams({ [SUPPLIER_SEARCH_PARAM]: SHARED_TOKEN });
  return `${SUPPLIERS_ROUTE}?${query.toString()}`;
}

/**
 * Con Prisma y no por la pantalla: B no tiene sesion, y el alta por la UI ya la cubre
 * `e2e/proveedores.spec.ts`. Cada empresa lleva su unidad y su presentacion propias porque las dos
 * FK compuestas de esta feature exigen que la linea, su proveedor y su presentacion declaren la
 * misma empresa.
 */
async function seedCompanySuppliers(input: {
  readonly companyName: string;
  readonly unitName: string;
  readonly presentationName: string;
  readonly supplierName: string;
  readonly lineName: string;
}): Promise<{ companyId: string; supplierId: string; lineId: string }> {
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

  const supplier = await prisma.supplier.create({
    data: {
      name: input.supplierName,
      nameNormalized: normalizeSupplierName(input.supplierName),
      phone: SUPPLIER_PHONE,
      companyId: company.id,
    },
    select: { id: true },
  });

  const line = await prisma.supplierCatalogLine.create({
    data: {
      supplierId: supplier.id,
      name: input.lineName,
      nameNormalized: normalizeSupplierName(input.lineName),
      presentationId: presentation.id,
      cost: LINE_COST,
      companyId: company.id,
    },
    select: { id: true },
  });

  return { companyId: company.id, supplierId: supplier.id, lineId: line.id };
}

/** La foto de una fila de B que no puede moverse con nada de lo que haga A. */
async function snapshotSupplier(id: string) {
  return prisma.supplier.findUniqueOrThrow({
    where: { id },
    select: {
      companyId: true,
      name: true,
      nameNormalized: true,
      phone: true,
      email: true,
      updatedBy: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
}

async function snapshotLine(id: string) {
  return prisma.supplierCatalogLine.findUniqueOrThrow({
    where: { id },
    select: {
      companyId: true,
      supplierId: true,
      name: true,
      presentationId: true,
      cost: true,
      updatedBy: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
}

/** Lo que la pagina de detalle ensena para un identificador que no lleva a ningun proveedor. */
async function readNotFoundScreen(
  page: Page,
  id: string,
): Promise<{ status: number | undefined; text: string; href: string | null; code: string | null }> {
  const response = await page.goto(supplierDetailRoute(id));
  const alert = page.getByTestId(NOT_FOUND);
  await expect(alert).toBeVisible({ timeout: 60_000 });

  return {
    status: response?.status(),
    text: (await alert.innerText()).trim(),
    href: await page.getByTestId(NOT_FOUND_LINK).getAttribute('href'),
    code: await alert.getAttribute('data-code'),
  };
}

/**
 * Sustituye por DOM el identificador del campo oculto del dialogo de borrado y confirma; devuelve
 * el texto del error si la baja se rechazo, o `null` si el dialogo se cerro.
 *
 * POR QUE LA SUSTITUCION SE REPITE EN LA FASE DE CAPTURA DEL `submit`: el campo es
 * `defaultValue={supplier.id}`, y en un campo oculto `value` y `defaultValue` son el mismo
 * atributo. Cualquier re-render del dialogo -la apertura, el foco, el `pointerdown` del boton-
 * hace que React reescriba el atributo con el id original, y lo hace ANTES del clic. El `submit`
 * en captura sobre `window` corre despues de todos esos eventos y antes de que React construya el
 * `FormData`, asi que lo que viaja es lo que un usuario con las herramientas de desarrollo habria
 * dejado escrito.
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

/** El intento cruzado: se sustituye el id, se rechaza, y se devuelve el texto que se ensena. */
async function rejectedDeleteMessage(page: Page, id: string): Promise<string> {
  await submitDeleteWithSubstitutedId(page, id);

  const error = page.getByTestId(DELETE_ERROR);
  await expect(error).toBeVisible({ timeout: 60_000 });
  // Un error CATALOGADO, no el inesperado: el inesperado se pinta con el aviso compartido y
  // llevaria identificador de peticion, que aqui no toca.
  await expect(page.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toHaveCount(0);
  // Con error el dialogo sigue abierto: cerrarlo dejaria creyendo que la baja ocurrio.
  await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible();

  return (await error.innerText()).trim();
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
  // filas. El orden lo imponen las FK, y las empresas van al final porque lo que apunta a
  // `companies` es `Restrict`.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.supplierCatalogLine.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.supplier.deleteMany({
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
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  const empresaA = await seedCompanySuppliers({
    companyName: COMPANY_A_NAME,
    unitName: UNIT_A_NAME,
    presentationName: PRESENTATION_A_NAME,
    supplierName: SUPPLIER_A_NAME,
    lineName: LINE_A_NAME,
  });
  companyAId = empresaA.companyId;
  supplierAId = empresaA.supplierId;
  lineAId = empresaA.lineId;

  const empresaB = await seedCompanySuppliers({
    companyName: COMPANY_B_NAME,
    unitName: UNIT_B_NAME,
    presentationName: PRESENTATION_B_NAME,
    supplierName: SUPPLIER_B_NAME,
    lineName: LINE_B_NAME,
  });
  companyBId = empresaB.companyId;
  supplierBId = empresaB.supplierId;
  lineBId = empresaB.lineId;

  // Hash real: el login tiene que pasar por bcrypt, el adaptador Prisma y la Server Action de
  // verdad. La cuenta es de la empresa A: es la unica sesion de todo el recorrido.
  await prisma.user.create({
    data: {
      firstNames: `Qc59${RUN_ID.slice(0, 8)}`,
      lastNames: 'Aislamiento',
      birthDate: new Date('1990-01-01'),
      email: `${ADMIN_USERNAME}@example.test`,
      phone: SUPPLIER_PHONE,
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
  // Por el token de ESTE worker y nunca por `FIXTURE_PREFIX` a secas: el otro proyecto sigue
  // corriendo. Por prefijo del token para arrastrar tambien el proveedor que el ultimo paso da de
  // alta en A con el nombre del de B. Cada paso corre aunque falle el anterior, y el primer fallo
  // se relanza al final.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.supplierCatalogLine.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
    () => prisma.supplier.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
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

  // La base queda como se encontro: si algo sobrevivio, este archivo lo dice en vez de dejar la
  // basura para que reviente un test de integracion ajeno.
  try {
    const restos =
      (await prisma.supplierCatalogLine.count({ where: { name: { startsWith: SHARED_TOKEN } } })) +
      (await prisma.supplier.count({ where: { name: { startsWith: SHARED_TOKEN } } })) +
      (await prisma.presentation.count({ where: { name: { startsWith: SHARED_TOKEN } } })) +
      (await prisma.unit.count({ where: { name: { startsWith: SHARED_TOKEN } } })) +
      (await prisma.user.count({ where: { username: { startsWith: SHARED_TOKEN } } })) +
      (await prisma.company.count({ where: { name: { startsWith: SHARED_TOKEN } } }));
    if (restos !== 0) {
      primerFallo ??= new Error(`el fixture dejo ${restos} filas de ${SHARED_TOKEN} en la base`);
    }
  } catch (error) {
    primerFallo ??= error;
  }

  await prisma.$disconnect();

  if (primerFallo !== undefined) throw primerFallo;
});

// El primer `goto` compila la ruta bajo demanda en `next dev` y bcrypt tarda a proposito: un
// timeout corto da rojos que no son del codigo.
test.setTimeout(240_000);

test.describe('aislamiento por empresa de proveedores', () => {
  test('con sesion en la empresa A: la lista no trae proveedores de B, el detalle de uno de B es indistinguible de uno inexistente, darlo de baja conociendo su identificador se rechaza y lo deja intacto con su linea, y el nombre de un proveedor de B se puede usar en A (R37; R14, R25, R27, R28)', async ({
    page,
  }) => {
    if (!companyAId || !companyBId || !supplierAId || !supplierBId || !lineAId || !lineBId) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }

    const supplierBBefore = await snapshotSupplier(supplierBId);
    const lineBBefore = await snapshotLine(lineBId);

    // --- 0. Una sola sesion, la de la empresa A.
    await loginAndLand(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    // --- 1. El listado (R25), contra el cuerpo de la respuesta y no solo el DOM: una fila
    // ocultada con CSS o filtrada en el navegador pasaria mirando el DOM. El positivo va sobre el
    // MISMO documento para que la ausencia de B no sea una pantalla vacia, y el termino de
    // busqueda es el que casa con las dos empresas.
    const listResponse = await page.goto(listUrl());
    await expect(page.getByTestId(SUPPLIERS_TITLE)).toBeVisible({ timeout: 60_000 });

    const listHtml = (await listResponse?.text()) ?? '';
    expect(
      listHtml.includes(supplierAId),
      'el proveedor de la propia empresa debe viajar en el HTML servido',
    ).toBe(true);
    expect(
      listHtml.includes(supplierBId),
      'el identificador del proveedor de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);
    expect(
      listHtml.includes(SUPPLIER_B_NAME),
      'el nombre del proveedor de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);

    await expect(
      page.locator(`[data-testid="supplier-showcase-row-${supplierAId}"]`),
    ).toHaveCount(1, { timeout: 60_000 });
    await expect(
      page.locator(`[data-testid="supplier-showcase-row-${supplierBId}"]`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(DETAIL_LINK).filter({ hasText: exactText(SUPPLIER_A_NAME) }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId(DETAIL_LINK).filter({ hasText: exactText(SUPPLIER_B_NAME) }),
    ).toHaveCount(0);

    // --- 2. La URL del detalle de B conociendo su identificador (R27). Se compara contra la de un
    // identificador que no existe en ninguna empresa: si las dos pantallas no fueran la misma,
    // sondear identificadores diria cuales existen en otra empresa.
    const ajena = await readNotFoundScreen(page, supplierBId);
    const detailHtmlAjena = await page.content();
    expect(
      detailHtmlAjena.includes(SUPPLIER_B_NAME),
      'la pagina de detalle no puede filtrar el nombre del proveedor de B',
    ).toBe(false);
    expect(
      detailHtmlAjena.includes(LINE_B_NAME),
      'la pagina de detalle no puede filtrar la linea de catalogo del proveedor de B',
    ).toBe(false);
    await expect(page.getByTestId(DETAIL_NAME)).toHaveCount(0);

    const inexistente = await readNotFoundScreen(page, UNKNOWN_ID);
    expect(
      ajena,
      'la ficha de un proveedor de otra empresa tiene que ser indistinguible de la de un identificador inexistente',
    ).toEqual(inexistente);

    // Control positivo del MISMO camino: el detalle de un proveedor propio SI se ensena. Sin esto,
    // una pagina de detalle rota del todo daria el mismo verde.
    await page.goto(supplierDetailRoute(supplierAId));
    await expect(page.getByTestId(DETAIL_NAME)).toHaveText(SUPPLIER_A_NAME, { timeout: 60_000 });
    await expect(page.getByTestId(NOT_FOUND)).toHaveCount(0);

    // --- 3. Baja cruzada conociendo el identificador. El control de baja vive en la cabecera del
    // propio detalle, donde ya se esta tras el control positivo anterior. El id de B se mete por
    // DOM en el campo oculto del dialogo del proveedor PROPIO: es el gesto de quien abre las
    // herramientas de desarrollo, y ejercita la Server Action real sin fabricar ninguna peticion.
    await page.getByTestId(DELETE_OPEN).click();
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible({ timeout: 60_000 });

    // Si el campo no trajera de serie el identificador propio, sustituirlo no demostraria nada.
    await expect(page.getByTestId(DELETE_ID_FIELD)).toHaveValue(supplierAId);

    const errorAjeno = await rejectedDeleteMessage(page, supplierBId);
    const errorInexistente = await rejectedDeleteMessage(page, UNKNOWN_ID);
    expect(
      errorAjeno,
      'la baja de un proveedor de otra empresa tiene que fallar igual que la de uno inexistente, nunca como un permiso que falta',
    ).toBe(errorInexistente);

    // En base, campo a campo, porque la pantalla podria mentir en cualquiera de los dos sentidos.
    expect(supplierBBefore.deletedAt).toBeNull();
    expect(lineBBefore.deletedAt).toBeNull();
    expect(
      await snapshotSupplier(supplierBId),
      'el proveedor de B tiene que seguir intacto: ni dado de baja ni tocado',
    ).toEqual(supplierBBefore);
    expect(
      await snapshotLine(lineBId),
      'la linea de catalogo de B tiene que seguir intacta: el arrastre de la baja no puede alcanzarla',
    ).toEqual(lineBBefore);

    const ownAfterAttempt = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierAId },
      select: { deletedAt: true },
    });
    expect(
      ownAfterAttempt.deletedAt,
      'el intento cruzado tampoco puede dar de baja el proveedor propio que abrio el dialogo',
    ).toBeNull();

    // Control positivo: el MISMO dialogo y el MISMO camino de sustitucion, con el identificador
    // propio, SI da de baja. Sin esto, un borrado siempre roto -o una sustitucion que no llegara
    // al servidor- daria el mismo verde que un aislamiento correcto.
    await submitDeleteWithSubstitutedId(page, supplierAId);
    await expect(page.getByTestId(DELETE_DIALOG)).toHaveCount(0, { timeout: 60_000 });

    const ownAfterDelete = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierAId },
      select: { deletedAt: true },
    });
    expect(
      ownAfterDelete.deletedAt,
      'el proveedor propio SI se tiene que poder dar de baja: es el control positivo del mismo dialogo',
    ).not.toBeNull();
    const ownLineAfterDelete = await prisma.supplierCatalogLine.findUniqueOrThrow({
      where: { id: lineAId },
      select: { deletedAt: true },
    });
    expect(
      ownLineAfterDelete.deletedAt,
      'la baja del proveedor propio arrastra su linea: lo mismo que NO le paso a la de B',
    ).not.toBeNull();

    // --- 4. Alta en A con el MISMO nombre que el proveedor de B (R14): se completa sin error,
    // porque el nombre es unico por empresa y no global.
    //
    // La baja con exito navega ella misma a la lista: se espera esa navegacion en vez de disparar
    // una propia, que la pisaria.
    await page.waitForURL((url) => url.pathname === SUPPLIERS_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId(SUPPLIERS_TITLE)).toBeVisible({ timeout: 60_000 });
    await expect(
      page.locator(`[data-testid="supplier-showcase-row-${supplierAId}"]`),
    ).toHaveCount(0);

    await page.getByTestId(CREATE_OPEN).first().click();
    await expect(page.getByTestId(SUPPLIER_SHEET)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(FIELD_NAME).fill(SUPPLIER_B_NAME);
    await page.getByTestId(FIELD_PHONE).fill(SUPPLIER_PHONE);
    await page.getByTestId(FORM_SUBMIT).click();

    // El panel se cierra: con error seguiria abierto con el mensaje a la vista.
    await expect(page.getByTestId(SUPPLIER_SHEET)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId(FORM_ERROR)).toHaveCount(0);

    const createdInA = await prisma.supplier.findMany({
      where: { companyId: companyAId, deletedAt: null },
      select: { id: true, name: true },
    });
    expect(createdInA, 'el alta debe dejar exactamente un proveedor vivo en A').toHaveLength(1);
    expect(createdInA[0]!.name).toBe(SUPPLIER_B_NAME);
    expect(
      createdInA[0]!.id,
      'el alta crea una fila nueva de A: no puede haber tocado la de B',
    ).not.toBe(supplierBId);

    await expect(
      page.getByTestId(DETAIL_LINK).filter({ hasText: exactText(SUPPLIER_B_NAME) }),
      'el proveedor recien dado de alta en A deberia verse en la vista de A',
    ).toHaveCount(1, { timeout: 60_000 });

    // Y B no se entera de nada de lo que hizo A: su proveedor y su linea, tal cual.
    expect(await snapshotSupplier(supplierBId)).toEqual(supplierBBefore);
    expect(await snapshotLine(lineBId)).toEqual(lineBBefore);
    expect(await prisma.supplier.count({ where: { companyId: companyBId } })).toBe(1);
  });
});
