/**
 * E2E del aislamiento por empresa del inventario (QC-49, T15; cubre R27 y ejercita R14, R15, R16 y
 * R20 de extremo a extremo).
 *
 * DOS EMPRESAS, UNA SOLA SESION. No hacen falta dos sesiones vivas y por eso no se montan: la
 * sesion real es la de la empresa A, y los datos de la empresa B **no necesitan sesion para
 * existir** —se siembran con Prisma en el `beforeAll`, igual que `e2e/permisos.spec.ts` siembra su
 * empresa y su usuario—. Lo que R27 pide probar es que hace *una* sesion frente a datos ajenos, y
 * eso es exactamente lo que este recorrido mide (`design.md > 8`).
 *
 * UN SOLO TEST ENCADENADO, mismo criterio que `e2e/permisos.spec.ts`: partirlo obligaria a recrear
 * la sesion en cada paso y dejaria sin cubrir justo lo unico que este nivel aporta —que los pasos
 * encajan seguidos: lo que no se ve en la lista tampoco se puede borrar conociendo su
 * identificador, y el nombre que «ya existe» en otra empresa sigue estando libre en la propia—.
 *
 * QUE APORTA SOBRE UNIT E INTEGRACION, que es lo unico que justifica su coste:
 *  - **El HTML SERVIDO** (R14). Los tests de integracion afirman sobre el `where` y sobre las filas
 *    que devuelve el repositorio; aqui se afirma sobre el documento que llega al navegador. Una
 *    fila que el servidor mandara y el cliente ocultase con CSS pasaria alli y CAE aqui, porque lo
 *    que se inspecciona es el cuerpo de la respuesta de `goto`, no el DOM ya pintado.
 *  - **La Server Action REAL con un identificador ajeno** (R15, R16). El nivel de service usa
 *    dobles; aqui viajan la cookie firmada, `getSessionUser` + `getSessionContext`, el caso de uso
 *    y Postgres. Y el identificador ajeno no se fabrica con un `fetch` a mano: se sustituye por DOM
 *    el valor del campo oculto del dialogo de borrado, que es el mismo gesto que tiene a su alcance
 *    quien abra las herramientas de desarrollo.
 *  - **La unicidad por empresa en la base de verdad** (R20). En integracion se comprueba el indice;
 *    aqui se comprueba que el ALTA por la pantalla acepta un nombre que otra empresa ya tiene.
 *  - Corre en Chromium y en WebKit (el motor de iOS).
 *
 * CONTROL POSITIVO, deliberado y fuera de lo que `design.md > 8` enumera: el recorrido termina
 * borrando el producto PROPIO de A por el mismo dialogo y comprobando en base que SI queda con
 * `deleted_at`. Sin el, un aislamiento roto por exceso —una pantalla que no ensena nada y un
 * borrado que siempre falla— daria verde en todos los pasos anteriores. Cada asercion en negativo
 * de este archivo tiene al lado su gemela en positivo sobre el mismo dato: la lista contiene el
 * producto de A y no el de B; el borrado rechaza el de B y acepta el de A.
 *
 * DATOS: `products`, `presentations`, `product_batches` y `units` son tablas reales y COMPARTIDAS,
 * y los dos proyectos corren a la vez. Por eso, copiando el patron de `e2e/permisos.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc49_e2e_` y dentro el `RUN_ID` del worker
 *    —prefijo PROPIO, distinto del de los demas specs, que comparten base con este—;
 *  - las busquedas de las dos pantallas se hacen por ese token, nunca por «la primera fila» ni por
 *    el total, que el otro proyecto puede estar moviendo en el mismo instante;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**: sin el corte por edad se
 *    llevaria por delante el fixture que el otro proyecto acaba de crear;
 *  - `afterAll` borra SIEMPRE, aunque el test reviente, y en el orden que imponen las FK
 *    `RESTRICT`: lotes -> productos -> presentaciones -> unidades -> usuarios -> empresas.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` lo siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts`) y la regla ruta->rol compara por nombre exacto, asi que
 * un rol efimero no probaria nada. Si falta, el `beforeAll` lo dice en vez de dar un rojo
 * incomprensible a mitad del recorrido. La otra fila ajena de la que depende es
 * `documentTypeCode: 'CC'`, que inserta la migracion de QC-4.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// `normalizeCompanyName` es la UNICA definicion de «mismo nombre de empresa» (QC-47 R3) y
// `ROLE_ADMINISTRADOR` la unica fuente del nombre del rol (QC-54): los dos por el barrel, nunca
// por ruta profunda ni como literal a mano.
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
// Las normalizaciones salen del contrato de su modulo por el mismo motivo: `name_normalized` se
// calcula con esas funciones y con ninguna otra, tambien cuando quien siembra es un fixture.
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc49_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su E2E contra la misma base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion esta usando AHORA. Una hora deja fuera
 * cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Token comun a las filas de las DOS empresas. Es la pieza clave del recorrido: las dos pantallas
 * se piden BUSCANDO POR EL, asi que la fila de B casaria con la misma consulta que la de A y
 * apareceria si el ambito por empresa no filtrara. Sin token comun, la ausencia de B no probaria
 * nada: podria ser del filtro de busqueda y no del aislamiento.
 */
const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/**
 * Nombres del fixture. Los sufijos son de dos letras a proposito: el nombre de presentacion admite
 * 60 caracteres (`presentation-input.ts`) y el token ya gasta 41; con sufijos largos el alta del
 * paso 5 rechazaria y el rojo no hablaria de QC-49.
 */
const PRODUCT_A_NAME = `${SHARED_TOKEN}_pa`;
const PRODUCT_B_NAME = `${SHARED_TOKEN}_pb`;
const PRESENTATION_A_NAME = `${SHARED_TOKEN}_ea`;
/** El nombre que el paso 5 vuelve a dar de alta EN A. Es el de la presentacion de B, exacto. */
const PRESENTATION_B_NAME = `${SHARED_TOKEN}_eb`;
const UNIT_A_NAME = `${SHARED_TOKEN}_ua`;
const UNIT_B_NAME = `${SHARED_TOKEN}_ub`;

/** Empresas efimeras de este worker. NUNCA la de instalacion: `companies_name_unique` es GLOBAL. */
const COMPANY_A_NAME = `${SHARED_TOKEN}_ca`;
const COMPANY_B_NAME = `${SHARED_TOKEN}_cb`;

/** El unico usuario con sesion del recorrido: Administrador de la empresa A. */
const ADMIN_USERNAME = `${SHARED_TOKEN}_admin`;
const ADMIN_PASSWORD = `Qc49-Admin-${RUN_ID.slice(0, 12)}`;

/** Tamano de pagina maximo que ofrecen las dos pantallas: menos paginas que recorrer. */
const LIST_PAGE_SIZE = '25';
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** `data-testid` de las dos pantallas. Ningun assert mira copy. */
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

/** Identificadores que siembra el `beforeAll` y que el recorrido necesita nombrar. */
let productAId: string | null = null;
let productBId: string | null = null;
let unitAId: string | null = null;

/** Igualdad EXACTA de texto: un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/** URL de una lista, SIEMPRE derivada de la constante de ruta, con la busqueda ya puesta. */
function listUrl(route: string, search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${route}?${query.toString()}`;
}

/**
 * Siembra una empresa con su unidad, su presentacion, su producto y el lote que los ata.
 *
 * Se escribe con Prisma y no por la pantalla a proposito: para la empresa B no hay sesion, y para
 * la A lo que el recorrido tiene que ejercitar es el LISTADO y el BORRADO, no el alta —que ya
 * cubre entera `e2e/inventario.spec.ts`—. Los `name_normalized` salen de las funciones del
 * contrato de cada modulo; los disparadores de coherencia de QC-49 exigen ademas que las tres
 * filas declaren la MISMA empresa y que la unidad sea de ella o de sistema, asi que cada empresa
 * lleva su propia unidad.
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
      stock: 10,
      qtyAlert: 2,
      companyId: company.id,
    },
    select: { id: true },
  });

  // El lote: sin el, el producto no tendria de donde derivar su unidad (QC-80) y la fila de la
  // lista se pintaria a medias. Su empresa es la misma que la del producto y la de la
  // presentacion, que es lo que `product_batches_check_company` exige.
  await prisma.productBatch.create({
    data: {
      productId: product.id,
      presentationId: presentation.id,
      companyId: company.id,
      stock: 10,
      unitCost: '3.5000',
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

  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc49_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). El orden lo imponen las FK `RESTRICT`, y el corte POR EDAD impide
  // que este borrado se lleve el fixture que el otro proyecto acaba de crear.
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
  // Las empresas, DESPUES de todo lo suyo: `users.company_id` es `onDelete: Restrict` (QC-47 R11)
  // y las tres FK de QC-49 tambien.
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

  // El unico usuario del recorrido, en la empresa A. Hash REAL: el objetivo es que bcrypt, el
  // adaptador Prisma y la Server Action de login se entiendan de verdad.
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
      // QC-78 R1: explicito, no por defecto. `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara, y por el token de
  // ESTE worker —nunca por `FIXTURE_PREFIX` a secas: el otro proyecto esta corriendo—. El orden lo
  // imponen las FK `RESTRICT`: lotes -> productos -> presentaciones -> unidades -> usuarios ->
  // empresas. El borrado de producto es FISICO: el de la pantalla es logico (`deletedAt`) y
  // dejaria la fila viva para el resto del repo.
  //
  // Cada paso corre pase lo que pase con el anterior; el primer fallo se guarda y se relanza al
  // final, para que un borrado imposible no se quede callado.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () =>
      prisma.productBatch.deleteMany({
        where: { product: { name: { startsWith: SHARED_TOKEN } } },
      }),
    () => prisma.product.deleteMany({ where: { name: { startsWith: SHARED_TOKEN } } }),
    // Por prefijo: arrastra tambien la presentacion que el paso 5 crea EN A con el nombre de la
    // de B, sin tener que enumerarla aparte.
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

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
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

    // --- 2. `/inventario` buscando el token COMUN a las dos empresas (R14).
    const inventoryResponse = await page.goto(listUrl(INVENTORY_ROUTE, SHARED_TOKEN));
    await expect(page.getByTestId(INVENTORY_TITLE)).toBeVisible({ timeout: 60_000 });

    // El assert que importa va contra el CUERPO DE LA RESPUESTA, no contra el DOM: una fila que el
    // servidor mandara y el cliente ocultase con CSS —o filtrase en el navegador— pasaria mirando
    // el DOM y cae aqui. Y el positivo va sobre el MISMO documento: si el de A tampoco estuviera,
    // la ausencia del de B no probaria aislamiento sino una pantalla vacia.
    const inventoryHtml = (await inventoryResponse?.text()) ?? '';
    expect(
      inventoryHtml.includes(PRODUCT_A_NAME),
      'el producto de la propia empresa debe viajar en el HTML servido',
    ).toBe(true);
    expect(
      inventoryHtml.includes(PRODUCT_B_NAME),
      'el producto de la empresa B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);

    // Y la tabla, ya pintada, tiene exactamente la fila de A y ninguna de B.
    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRODUCT_A_NAME) }),
    ).toHaveCount(1, { timeout: 60_000 });
    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(PRODUCT_B_NAME) }),
    ).toHaveCount(0);

    // --- 3. Lo mismo en `/configuracion/presentaciones` (R14).
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

    // --- 4. «Conociendo el identificador» (R15, R16). Se abre el dialogo de borrado de un producto
    // PROPIO —el unico que la lista ofrece— y se sustituye por DOM el valor del campo oculto por el
    // identificador del producto de B. Es el gesto que tiene a mano cualquiera con las
    // herramientas de desarrollo abiertas, y ejercita la Server Action REAL: no se fabrica ninguna
    // peticion ni se inventa ninguna ruta.
    await page.goto(listUrl(INVENTORY_ROUTE, SHARED_TOKEN));
    await expect(page.getByTestId(INVENTORY_TITLE)).toBeVisible({ timeout: 60_000 });

    const abrirBorrado = page.getByTestId(DELETE_OPEN);
    await expect(abrirBorrado, 'la lista de A debe ofrecer el borrado de su unico producto').toHaveCount(1, {
      timeout: 60_000,
    });
    await abrirBorrado.click();
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible({ timeout: 60_000 });

    const campoOculto = page.getByTestId(DELETE_ID_FIELD);
    // El campo lleva de serie el identificador del producto PROPIO: si no fuera asi, sustituirlo no
    // demostraria nada.
    await expect(campoOculto).toHaveValue(productAId);
    await campoOculto.evaluate((element, idAjeno) => {
      (element as HTMLInputElement).value = idAjeno;
    }, productBId);
    await expect(campoOculto).toHaveValue(productBId);

    await page.getByTestId(DELETE_CONFIRM).click();

    // El error se pinta y el dialogo SIGUE ABIERTO: cerrarlo dejaria creyendo que se borro.
    await expect(page.getByTestId(DELETE_ERROR)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DELETE_DIALOG)).toBeVisible();

    // Y la fila de B sigue viva EN BASE, que es lo que R27 pide de verdad: la pantalla podria
    // mentir en cualquiera de los dos sentidos.
    const productoBTrasElIntento = await prisma.product.findUnique({
      where: { id: productBId },
      select: { deletedAt: true },
    });
    expect(
      productoBTrasElIntento?.deletedAt ?? null,
      'el producto de la empresa B no puede quedar marcado como borrado',
    ).toBeNull();

    // CONTROL POSITIVO del mismo dialogo: con SU identificador, el borrado funciona. Sin esto, un
    // borrado siempre roto daria el mismo verde que un aislamiento correcto.
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

    // --- 5. La unicidad del nombre de presentacion es POR EMPRESA (R20): A da de alta una
    // presentacion con el nombre EXACTO de la de B y la operacion tiene EXITO. Con el indice unico
    // global de antes de QC-49 esto fallaria con «ya existe», que ademas seria un oraculo sobre el
    // catalogo ajeno.
    await page.goto(listUrl(PRESENTATIONS_ROUTE, PRESENTATION_B_NAME));
    await expect(page.getByTestId(PRESENTATIONS_TITLE)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(PRESENTATION_CREATE_OPEN).first().click();
    await expect(page.getByTestId(PRESENTATION_SHEET)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(PRESENTATION_FIELD_NAME).fill(PRESENTATION_B_NAME);

    // La unidad se elige por su IDENTIFICADOR (`data-value`), no por su etiqueta: es la unidad de
    // la empresa A, y elegir por texto podria casar con la que otro proyecto esta creando.
    await page.getByTestId(PRESENTATION_UNIT_SELECT).click();
    const opcionUnidadA = page.locator(
      `[data-testid="${PRESENTATION_UNIT_OPTION}"][data-value="${unitAId}"]`,
    );
    await expect(opcionUnidadA, 'la unidad de la empresa A debe estar disponible').toBeVisible({
      timeout: 60_000,
    });
    await opcionUnidadA.click();

    await page.getByTestId(PRESENTATION_FORM_SUBMIT).click();

    // El panel se cierra: es la senal de exito del servidor. Si el alta hubiera chocado con el
    // nombre de B, seguiria abierto con el error de duplicado.
    await expect(page.getByTestId(PRESENTATION_SHEET)).toHaveCount(0, { timeout: 60_000 });

    // Y en base hay DOS presentaciones con ese nombre, una por empresa: eso es exactamente lo que
    // el indice `(company_id, name_normalized)` permite y el global de antes prohibia.
    expect(
      await prisma.presentation.count({ where: { name: PRESENTATION_B_NAME } }),
      'el mismo nombre de presentacion debe poder existir en dos empresas distintas',
    ).toBe(2);
  });
});
