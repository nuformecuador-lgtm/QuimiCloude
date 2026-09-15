/**
 * E2E de la pantalla de productos (QC-22, T15): el camino completo del Administrador y el
 * rechazo del que no lo es.
 *
 * Por que existe, y por que AQUI: la decision del 2026-09-03 lo pide entero -login →
 * `/inventario` → alta → el producto aparece en la lista- y cierra el diferimiento que QC-20
 * dejo apuntando a esta ficha. Los motivos por los que QC-11 y QC-12 difirieron su E2E ya no
 * aplican: hay sesion real (QC-8, QC-9) y Playwright montado con 4 specs.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware,
 *    Server Component de la lista, Server Actions de alta y `router.refresh()`. En jsdom las
 *    seis actions son dobles (T12); aqui son las de QC-20 contra Postgres.
 *  - **El corte por rol de verdad** (R4): en unit se afirma la DECISION (`decideRouteAccess`);
 *    aqui se afirma que el usuario acaba fuera y sin ver la tabla.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo,
 *    no suponerlo.
 *
 * QC-90 (T13) lo amplia con el PRIMER LOTE, que el alta crea siempre en `product_batches`:
 *  - un alta con presentacion y **solo costo total**, donde el costo unitario del lote lo DERIVA
 *    el servidor (`total / existencia` a 4 decimales) — es el unico sitio del repo donde esa
 *    derivacion se ejercita de punta a punta, navegador -> Server Action -> Postgres (QC-90 R32);
 *  - elegir un producto que YA EXISTE en el autocomplete: se le agrega otro lote y no nace un
 *    segundo producto (QC-90 R17, R18).
 * El importe se lee de vuelta de la base con `unit_cost::text`, NUNCA como `number`: es la unica
 * forma de afirmar lo que la columna `decimal(14,4)` guardo sin que la coma flotante lo
 * reinterprete por el camino (QC-90 R4).
 *
 * DATOS: `products` y `presentations` son tablas reales y COMPARTIDAS, y los dos proyectos
 * corren a la vez. Por eso, copiando el patron de `e2e/session.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc22_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts de la lista filtran por ESE nombre, nunca por «la primera fila» ni por el
 *    total de productos, que el otro proyecto puede estar moviendo en el mismo instante;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente;
 *  - desde QC-90 la limpieza empieza por `product_batches`: su FK a `products` es `RESTRICT`, asi
 *    que borrar los productos primero lo RECHAZA la base y el spec dejaria basura en una base
 *    compartida — que es exactamente lo que pone rojos los tests de integracion que cuentan filas.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` y `Operador` los siembra
 * `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts`), y el rol tiene que llamarse
 * EXACTAMENTE asi porque la regla ruta→rol compara por nombre: un rol efimero con sufijo
 * `RUN_ID` no probaria nada. Si falta, el `beforeAll` falla diciendo que hay que sembrar, en
 * vez de dar un rojo incomprensible en mitad del recorrido.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

// `normalizeCompanyName` es la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3):
// `companies.name_normalized` se calcula con esta y con ninguna otra.
import {
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, INVENTORY_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc22_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/session.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez: borrar por prefijo a secas se llevaria el producto que el otro proyecto acaba de dar
 * de alta. Una hora deja fuera cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc22-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc22-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Nombres de los datos de catalogo que crea el recorrido del Administrador. */
const productName = `${FIXTURE_PREFIX}producto_${RUN_ID}`;
const presentationName = `${FIXTURE_PREFIX}presentacion_${RUN_ID}`;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria, asi que el
 * fixture necesita la suya. NUNCA la de instalacion: el indice `companies_name_unique` es
 * GLOBAL y el nombre chocaria con el de la empresa que siembra `db:seed`.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;

/**
 * Existencia que se escribe en el alta. Constante para que el assert de «crear la presentacion no
 * pierde lo ya escrito» compare contra el mismo valor que se tecleo, sin repetir el literal.
 */
const stockValue = '7';

/**
 * Alerta de cantidad. El campo es `required` en el formulario (`product-field.tsx` lo traslada al
 * `<input>`), asi que sin el la validacion NATIVA del navegador bloquea el envio y la Server
 * Action ni se llama: el panel se queda abierto sin ningun error en pantalla. Se rellena aqui
 * porque el alta lo exige, no porque este recorrido lo afirme.
 */
const qtyAlertValue = '3';

/**
 * Costo unitario del recorrido de QC-22. Desde QC-90 el alta crea SIEMPRE un lote y exige uno de
 * los dos costos (R11): sin ninguno el panel rechaza y este recorrido -que afirma sobre el rol, el
 * panel y la lista, no sobre importes- se quedaria con el panel abierto para siempre. Se escribe
 * el unitario, que es el camino que NO deriva nada.
 */
const unitCostValue = '3.7500';

/**
 * Recorrido de QC-90 R32: presentacion y SOLO costo total. Los nombres cuelgan de `productName` y
 * de `presentationName` a proposito, para que la limpieza por `startsWith` de `afterAll` los
 * arrastre sin tener que enumerarlos uno a uno.
 */
const costProductName = `${productName}_costo`;
/**
 * OJO con el largo: el nombre de presentacion admite 60 caracteres
 * (`presentation-input.ts`), y el prefijo mas el `RUN_ID` ya gastan 54. Por eso el sufijo es de
 * una letra: con uno mas largo el alta en linea rechaza y el rojo que sale no habla de QC-90.
 */
const costPresentationName = `${presentationName}_c`;

/**
 * Los numeros del alta con solo costo total. NO son divisibles de forma exacta ni trivial: la
 * division `8000.05 / 7` da `1142.86428571...`, cuyo quinto decimal es `8`. Asi el assert
 * distingue el redondeo correcto (`1142.8643`) de un truncado (`1142.8642`) y de cualquier
 * paseo por coma flotante; con un total divisible los tres darian lo mismo y el test no probaria
 * nada (QC-90 R7).
 */
const costStockValue = '7';
const costTotalValue = '8000.05';
const derivedUnitCost = '1142.8643';

/**
 * Recorrido de QC-90 R17/R18: el mismo producto se da de alta DOS veces. La segunda se elige del
 * autocomplete, y lo escrito entonces en existencia y alerta -otros valores a proposito- tiene que
 * IGNORARSE: el producto queda como estaba y solo gana un lote.
 */
const repeatProductName = `${productName}_repetido`;
const repeatPresentationName = `${presentationName}_r`;
const repeatStockValue = '4';
const repeatQtyAlertValue = '2';
const firstBatchUnitCost = '5.5000';
const secondBatchUnitCost = '9.9999';
const ignoredStockValue = '99';
const ignoredQtyAlertValue = '77';

async function createUserWithRole(user: Credentials, roleName: string): Promise<void> {
  if (!companyId) {
    throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  }
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque la regla ruta-rol compara por ` +
        'nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames: `Qc22${RUN_ID.slice(0, 8)}`,
      lastNames: 'Inventario',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde
      // esa ficha `pending` no entra por el login, asi que este usuario efimero no
      // llegaria a la pantalla que este spec ejercita.
      accountStatus: 'active',
    },
    select: { id: true },
  });
}

/**
 * Recorre las paginas de la lista hasta encontrar la celda de nombre pedida.
 *
 * Hace falta porque la pantalla NO ofrece busqueda (R13, decision cerrada) y el orden es fijo
 * por nombre ascendente: un producto recien creado puede caer en cualquier pagina. Se avanza con
 * el control real de paginacion -que de paso ejercita R11 en un navegador- y se para cuando
 * «siguiente» queda deshabilitado. El assert NUNCA mira «la primera fila» ni el total: solo si
 * existe una celda con ESTE nombre.
 */
async function findProductCell(page: Page, name: string): Promise<Locator> {
  // Desde el 2026-09-07 la lista monta la tabla compartida: la celda y el control de pagina
  // llevan sus `data-testid` (`data-table-cell-<columna>`, `data-table-next`).
  const cell = page.getByTestId('data-table-cell-name').filter({ hasText: name });
  const next = page.getByTestId('data-table-next');

  for (;;) {
    if ((await cell.count()) > 0) return cell;
    if ((await next.count()) === 0 || (await next.isDisabled())) return cell;

    const before = new URL(page.url()).searchParams.get('page');
    await next.click();
    await page.waitForFunction(
      (previous) => new URL(window.location.href).searchParams.get('page') !== previous,
      before,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId('product-list')).toBeVisible({ timeout: 60_000 });
  }
}

/** Abre el panel lateral de alta y espera a que este montado. */
async function abrirPanelDeAlta(page: Page): Promise<void> {
  // El control de crear aparece dos veces cuando el catalogo esta vacio (cabecera y estado
  // vacio): vale cualquiera de los dos.
  await page.getByTestId('product-create-open').first().click();
  await expect(page.getByTestId('product-sheet')).toBeVisible({ timeout: 60_000 });
}

/** Crea una presentacion desde el propio selector, sin salir del panel, y la deja elegida. */
async function crearPresentacionEnLinea(page: Page, nombre: string): Promise<void> {
  await page.getByTestId('presentation-create-open').click();
  await page.getByTestId('presentation-create-name').fill(nombre);
  await page.getByTestId('presentation-create-submit').click();

  await expect(page.getByTestId('presentation-create')).toHaveCount(0, { timeout: 60_000 });
  // El selector es un campo de autocompletado, asi que lo elegido se lee en su VALOR.
  await expect(page.getByTestId('presentation-select')).toHaveValue(nombre, { timeout: 60_000 });
}

/**
 * Elige del desplegable una presentacion que YA existe: se escribe el nombre -la busqueda la
 * resuelve el servidor, con rebote- y se pulsa la opcion. El filtro es por ESTE nombre, que lleva
 * el `RUN_ID`, nunca «la primera opcion»: el otro proyecto crea las suyas a la vez.
 */
async function elegirPresentacionExistente(page: Page, nombre: string): Promise<void> {
  const campo = page.getByTestId('presentation-select');
  await campo.click();
  await campo.fill(nombre);

  const opcion = page.getByTestId('presentation-option').filter({ hasText: nombre });
  await expect(opcion.first()).toBeVisible({ timeout: 60_000 });
  await opcion.first().click();

  await expect(campo).toHaveValue(nombre, { timeout: 60_000 });
}

/**
 * Elige del autocomplete un producto que YA existe. Es el gesto que dispara QC-90 R17: lo que
 * viaja sigue siendo el NOMBRE -el `input` espejo-, no un identificador, porque el servidor
 * resuelve el producto por nombre normalizado (R15).
 */
async function elegirProductoExistente(page: Page, nombre: string): Promise<void> {
  const campo = page.getByTestId('product-field-name');
  await campo.click();
  await campo.fill(nombre);

  const opcion = page.getByTestId('product-name-option').filter({ hasText: nombre });
  await expect(opcion.first()).toBeVisible({ timeout: 60_000 });
  await opcion.first().click();

  await expect(page.getByTestId('product-name-value')).toHaveValue(nombre, { timeout: 60_000 });
}

/** Guarda el alta y espera a que el panel se cierre, que es la senal de exito del servidor. */
async function guardarAlta(page: Page): Promise<void> {
  await page.getByTestId('product-form-submit').click();
  await expect(page.getByTestId('product-sheet')).toHaveCount(0, { timeout: 60_000 });
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc22_e2e_*` en
  // la base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). Productos primero: `products.presentation_id` es `Restrict`.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // Lotes primero (QC-90): `product_batches.product_id` es `Restrict`, asi que un producto con
  // lotes NO se puede borrar. Se filtran por la edad DEL PRODUCTO, el mismo criterio que la linea
  // siguiente, para no desparejar los dos borrados.
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
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas van DESPUES de sus usuarios: `users.company_id` es
  // `onDelete: Restrict` (QC-47 R11) y borrarlas antes lo rechazaria la base.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios. `nameNormalized` sale de
  // `normalizeCompanyName`, la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3).
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  await createUserWithRole(operatorUser, ROLE_OPERADOR);
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara, y por el `RUN_ID`
  // de ESTE worker. El orden lo imponen las FK: LOTES -> productos -> presentaciones, y los
  // usuarios y su empresa al final. El borrado de producto es FISICO: el de la pantalla es logico
  // (`deletedAt`) y dejaria la fila viva para el resto del repo.
  //
  // Los pasos van en una lista y no en `try`/`finally` anidados (QC-90): con los lotes dentro ya
  // eran cinco niveles de sangria y el siguiente que se anadiera haria ilegible el orden de las
  // FK, que es justo lo unico importante de este bloque. Cada paso corre pase lo que pase con el
  // anterior; el primer fallo se guarda y se relanza al final, para que un borrado imposible no
  // se quede callado.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    // Los lotes, ANTES que sus productos: `product_batches.product_id` es `Restrict` y al reves
    // la base rechaza el borrado, dejando producto Y lote vivos en una base compartida.
    () =>
      prisma.productBatch.deleteMany({
        where: { product: { name: { startsWith: productName } } },
      }),
    () => prisma.product.deleteMany({ where: { name: { startsWith: productName } } }),
    () => prisma.presentation.deleteMany({ where: { name: { startsWith: presentationName } } }),
    () =>
      prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, operatorUser.username] } },
      }),
    // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict`
    // (QC-47 R11). Por el nombre EXACTO de ESTE worker, nunca por el prefijo.
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

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('catalogo de productos', () => {
  test('el Administrador entra, da de alta un producto con una presentacion nueva y lo ve en la lista (R4, R17, R18, R21, R24)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 1. La pantalla se sirve a un Administrador (R4, la mitad que deja pasar).
    await page.goto(`${INVENTORY_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 2. El alta ocurre en un panel lateral, SIN cambiar de URL (R17). El control de crear
    // aparece dos veces cuando el catalogo esta vacio (cabecera y estado vacio): vale cualquiera.
    const urlBeforeSheet = page.url();
    await page.getByTestId('product-create-open').first().click();
    await expect(page.getByTestId('product-sheet')).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 3. Se escriben los campos del producto ANTES de crear la presentacion, para poder
    // afirmar despues que crearla no se llevo por delante lo escrito (R24). Son el nombre y la
    // existencia: el costo dejo de existir en el producto con QC-52, y con el se fue su campo.
    await page.getByTestId('product-field-name').fill(productName);
    await page.getByTestId('product-field-stock').fill(stockValue);
    await page.getByTestId('product-field-qtyAlert').fill(qtyAlertValue);

    // --- 4. La presentacion se crea desde el propio selector y queda SELECCIONADA (R24).
    await page.getByTestId('presentation-create-open').click();
    await page.getByTestId('presentation-create-name').fill(presentationName);
    await page.getByTestId('presentation-create-submit').click();

    await expect(page.getByTestId('presentation-create')).toHaveCount(0, { timeout: 60_000 });
    // Desde el 2026-09-07 el selector es un campo de autocompletado, asi que lo elegido se lee
    // en su VALOR y no en su texto contenido.
    await expect(page.getByTestId('presentation-select')).toHaveValue(presentationName);
    await expect(
      page.getByTestId('product-field-name'),
      'crear la presentacion no puede perder lo ya escrito',
    ).toHaveValue(productName);
    await expect(
      page.getByTestId('product-field-stock'),
      'crear la presentacion no puede perder lo ya escrito',
    ).toHaveValue(stockValue);

    // --- 4 bis. El costo unitario del PRIMER LOTE. No estaba en este recorrido y desde QC-90
    // hace falta: el alta crea siempre un lote (QC-90 R1) y exige uno de los dos costos, asi que
    // sin ninguno el servidor rechaza con `invalid_input` (QC-90 R11) y el panel se queda abierto.
    // Este recorrido afirma sobre el rol, el panel y la lista; el importe solo lo pone porque el
    // alta lo exige. La derivacion del costo la ejercita el recorrido de QC-90 R32, mas abajo.
    await page.getByTestId('product-field-unitCost').fill(unitCostValue);

    // --- 5. Guardar: la Server Action de QC-20 contra Postgres, sin `fetch` de por medio (R18).
    await page.getByTestId('product-form-submit').click();

    // --- 6. Con exito el panel se cierra y se avisa por toast, que solo es visible porque el
    // layout privado monta la region de avisos (R21, R22). Se afirma que HAY un aviso, no cual
    // es su texto: los asserts de este repo no miran literales de copy.
    await expect(page.getByTestId('product-sheet')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 7. Y el producto esta en la lista sin que el usuario recargue nada (R21).
    const cell = await findProductCell(page, productName);
    await expect(cell.first()).toBeVisible({ timeout: 60_000 });

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla.
    expect(
      await prisma.product.count({ where: { name: productName, deletedAt: null } }),
      'el producto deberia existir en la base',
    ).toBe(1);
  });

  test('el alta con presentacion y solo costo total deja el lote con el costo unitario derivado (QC-90 R32, R7)', async ({
    page,
  }) => {
    // POR QUE EN E2E Y NO SOLO EN INTEGRACION: la derivacion ya tiene su test de dominio (T1) y su
    // test contra Postgres (T8), pero ninguno de los dos pasa por el navegador. QC-90 R32 pide
    // justo eso: que el importe salga del `<input>` como CADENA, cruce la Server Action sin
    // convertirse en `number` y llegue a `decimal(14,4)` con sus cuatro decimales. Un `parseFloat`
    // colado en el formulario dejaria los otros dos tests en verde y solo este en rojo.
    await loginAndLand(page, adminUser);

    await page.goto(`${INVENTORY_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    await abrirPanelDeAlta(page);

    await page.getByTestId('product-field-name').fill(costProductName);
    await page.getByTestId('product-field-stock').fill(costStockValue);
    await page.getByTestId('product-field-qtyAlert').fill(qtyAlertValue);

    // La presentacion es OBLIGATORIA en el alta (QC-90 R2) y se crea aqui mismo.
    await crearPresentacionEnLinea(page, costPresentationName);

    // SOLO el costo total: el unitario se deja vacio a proposito, que es la premisa de R7.
    await page.getByTestId('product-field-totalCost').fill(costTotalValue);
    await expect(
      page.getByTestId('product-field-unitCost'),
      'el recorrido pierde su sentido si el unitario viaja escrito',
    ).toHaveValue('');

    await guardarAlta(page);

    // El producto esta en la lista, sin recargar.
    const cell = await findProductCell(page, costProductName);
    await expect(cell.first()).toBeVisible({ timeout: 60_000 });

    // Y el LOTE quedo escrito con el costo unitario DERIVADO. Se lee con `unit_cost::text`, nunca
    // como `number`: es un importe y compararlo contra un literal numerico dejaria pasar
    // exactamente el error que esta ficha evita (QC-90 R4). Se filtra por ESTE nombre, no por «el
    // ultimo lote»: el otro proyecto esta dando de alta el suyo en el mismo instante.
    const lotes = await prisma.$queryRaw<Array<{ unit_cost: string; stock: number }>>`
      SELECT b.unit_cost::text AS unit_cost, b.stock AS stock
      FROM product_batches b
      JOIN products p ON p.id = b.product_id
      WHERE p.name = ${costProductName} AND p.deleted_at IS NULL
    `;

    expect(lotes, 'el alta debe crear exactamente un lote').toHaveLength(1);
    expect(
      lotes[0]?.unit_cost,
      `${costTotalValue} / ${costStockValue} redondeado a 4 decimales`,
    ).toBe(derivedUnitCost);
    expect(lotes[0]?.stock, 'la existencia escrita tambien va al lote').toBe(
      Number(costStockValue),
    );
  });

  test('elegir un producto que ya existe le agrega un lote y no crea otro producto (QC-90 R17, R18)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    await page.goto(`${INVENTORY_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 1. Primera alta: el producto NACE aqui, con su presentacion y su primer lote. No se
    // siembra por Prisma a proposito: el segundo alta tiene que poder encontrarlo con el
    // autocomplete real, que es lo que dispara el camino de R17.
    await abrirPanelDeAlta(page);
    await page.getByTestId('product-field-name').fill(repeatProductName);
    await page.getByTestId('product-field-stock').fill(repeatStockValue);
    await page.getByTestId('product-field-qtyAlert').fill(repeatQtyAlertValue);
    await crearPresentacionEnLinea(page, repeatPresentationName);
    await page.getByTestId('product-field-unitCost').fill(firstBatchUnitCost);
    await guardarAlta(page);

    const antes = await prisma.product.findMany({
      where: { name: repeatProductName, deletedAt: null },
      select: { id: true, name: true, stock: true, qtyAlert: true },
    });
    expect(antes, 'la primera alta deberia dejar un unico producto').toHaveLength(1);

    // --- 2. Segunda alta SOBRE ese mismo producto, elegido del desplegable. La existencia y la
    // alerta se escriben DISTINTAS a proposito: son las que el servidor tiene que ignorar (R18).
    await abrirPanelDeAlta(page);
    await elegirProductoExistente(page, repeatProductName);
    // La presentacion queda vacia al elegir un producto: el listado no la devuelve (R31), asi que
    // se elige a mano. Se reusa la misma, que ya existe.
    await elegirPresentacionExistente(page, repeatPresentationName);
    await page.getByTestId('product-field-stock').fill(ignoredStockValue);
    await page.getByTestId('product-field-qtyAlert').fill(ignoredQtyAlertValue);
    await page.getByTestId('product-field-unitCost').fill(secondBatchUnitCost);
    await guardarAlta(page);

    // --- 3. Sigue habiendo UN solo producto con ese nombre, y es el mismo de antes (R17).
    const despues = await prisma.product.findMany({
      where: { name: repeatProductName, deletedAt: null },
      select: { id: true, name: true, stock: true, qtyAlert: true },
    });

    expect(despues, 'la segunda alta NO debe crear otro producto').toHaveLength(1);
    // Nombre, existencia y alerta intactos: lo escrito en el panel se ignora (R18). Se compara la
    // fila entera contra la de antes, no campo a campo, para que un campo nuevo no se cuele sin
    // vigilancia.
    expect(despues[0], 'el producto que ya existia no puede cambiar').toEqual(antes[0]);

    // --- 4. Lo unico que cambio es que tiene DOS lotes.
    expect(
      await prisma.productBatch.count({ where: { productId: antes[0]!.id } }),
      'la segunda alta solo debe agregar un lote',
    ).toBe(2);
  });

  test('un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)', async ({
    page,
  }) => {
    await loginAndLand(page, operatorUser);

    // Sesion valida, rol distinto: la regla ruta-rol lo saca al dashboard SIN renderizar nada de
    // la pantalla. No es «no autenticado»: acaba en el dashboard, no en el login, y esa
    // diferencia es justo lo que R4 pide y lo que un redirect al login enmascararia.
    await page.goto(INVENTORY_ROUTE);
    await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });

    await expect(page.getByTestId('inventario-title')).toHaveCount(0);
    await expect(page.getByTestId('data-table')).toHaveCount(0);
    await expect(page.getByTestId('product-list-empty')).toHaveCount(0);
  });
});
