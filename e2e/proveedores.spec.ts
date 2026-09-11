/**
 * E2E de las dos pantallas de proveedores (QC-44, T18): el camino completo del Administrador
 * (R51) y el rechazo del que no lo es (R52).
 *
 * Por que existe, y por que AQUI: `design.md > 12` lo pide entero -login -> `SUPPLIERS_ROUTE` ->
 * alta de proveedor -> su pagina de detalle -> alta de una linea de catalogo -> la linea aparece
 * en la lista-, sobre el patron ya mergeado de `e2e/inventario.spec.ts` (QC-22) y
 * `e2e/recetas.spec.ts` (QC-26), que a su vez heredan de `e2e/session.spec.ts` (QC-9).
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware,
 *    los dos Server Components (lista y detalle) y las Server Actions REALES de `proveedores`
 *    (QC-43/QC-52) y de `inventario` (QC-20) contra Postgres, mas `router.refresh()`. En jsdom
 *    todas esas actions son dobles; aqui son las de verdad.
 *  - **El corte por rol de verdad** (R52): en unit se afirma la DECISION (`decideRouteAccess`);
 *    aqui se afirma que el usuario acaba fuera y sin ver ni un dato.
 *  - El selector de presentacion con su alta en linea (R38) tal como lo ve un navegador: es la
 *    primitiva `Select` de base-ui, con su portal, y la creacion invoca la Server Action desde
 *    el manejador sin anidar formularios. jsdom no ejercita igual ninguna de las dos cosas.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo,
 *    no suponerlo.
 *
 * LA URL NUNCA SE ESCRIBE A MANO: sale de `SUPPLIERS_ROUTE` y de `supplierDetailRoute` (R2, R3),
 * igual que `DASHBOARD_ROUTE` y `LOGIN_ROUTE`. Y ningun assert mira literales de copy (R47): se
 * afirma sobre `data-testid` estables y sobre roles accesibles.
 *
 * DATOS: `suppliers`, `supplier_catalog_lines`, `presentations` y `users` son tablas reales y
 * COMPARTIDAS, y los dos proyectos de Playwright corren a la vez. Por eso:
 *  - todo lo que este spec crea lleva el prefijo `qc44_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts filtran por ESE nombre, nunca por «la primera fila» ni por totales;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra SIEMPRE por los nombres EXACTOS de este worker, aunque el test reviente:
 *    un E2E que ensucia la base pone rojo un test de integracion ajeno (le paso a QC-9).
 *
 * LA PRESENTACION NO SE DA POR SEMBRADA. `pnpm run db:seed` no crea ninguna (solo roles y tipos
 * de documento), asi que el `beforeAll` **comprueba contra la base** si hay alguna utilizable y
 * el recorrido elige camino:
 *  - si la hay -> se toma DEL SELECTOR, que es lo que R51 pide;
 *  - si no la hay -> se crea con el alta en linea del propio selector (R38), que es justamente el
 *    motivo de que ese alta exista.
 * «Utilizable» excluye a proposito las presentaciones que son fixture de OTRO E2E (`_e2e_` en el
 * nombre): la FK `supplier_catalog_lines_presentation_id_fkey` es RESTRICT, asi que apuntar una
 * linea nuestra a la presentacion de otro spec haria fallar el `afterAll` de aquel spec.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` y `Operador` los siembra
 * `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts`), y el rol tiene que llamarse
 * EXACTAMENTE asi porque la regla ruta->rol compara por nombre: un rol efimero con sufijo
 * `RUN_ID` no probaria nada. Si falta, el `beforeAll` falla diciendo que hay que sembrar, en vez
 * de dar un rojo incomprensible en mitad del recorrido.
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
import {
  DASHBOARD_ROUTE,
  LOGIN_ROUTE,
  SUPPLIERS_ROUTE,
  supplierDetailRoute,
} from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc44_e2e_';

/** Marca que llevan los fixtures de TODOS los E2E del repo (`qc22_e2e_`, `qc26_e2e_`, este). */
const E2E_FIXTURE_MARK = '_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/session.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez: borrar por prefijo a secas se llevaria el proveedor que el otro proyecto acaba de dar
 * de alta. Una hora deja fuera cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc44-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc44-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Nombres de lo que el recorrido del Administrador da de alta POR LA UI. */
const supplierName = `${FIXTURE_PREFIX}proveedor_${RUN_ID}`;
const catalogLineName = `${FIXTURE_PREFIX}linea_${RUN_ID}`;

/** Presentacion que el recorrido crea EN LINEA solo si la base no ofrece ninguna utilizable. */
const presentationName = `${FIXTURE_PREFIX}presentacion_${RUN_ID}`;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria, asi que el
 * fixture necesita la suya. NUNCA la de instalacion: el indice `companies_name_unique` es
 * GLOBAL y el nombre chocaria con el de la empresa que siembra `db:seed`.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;

/** Telefono del proveedor: el alta exige al menos un telefono o un correo. */
const supplierPhone = '+573000000000';

/**
 * Costo de la linea. Cadena decimal con cuatro decimales a proposito (R41): el importe viaja como
 * texto de punta a punta y la celda lo pinta tal cual, asi que el assert compara la MISMA cadena
 * que se tecleo. Un `type="number"` o un `toFixed` por el camino lo delataria aqui.
 */
const catalogLineCost = '12.3456';

/**
 * Nombre de una presentacion ya existente y NO fixture de otro E2E, o `null` si la base no tiene
 * ninguna. Lo resuelve el `beforeAll` contra la base: no se da por sembrada (`design.md > 12`).
 */
let reusablePresentationName: string | null = null;

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
      firstNames: `Qc44${RUN_ID.slice(0, 8)}`,
      lastNames: 'Proveedores',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: supplierPhone,
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

/** Entra por el formulario real y aterriza en el dashboard. */
async function login(page: Page, user: Credentials): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });
}

/**
 * Deja el selector de presentacion con una presentacion ELEGIDA y devuelve su nombre.
 *
 * Dos caminos, y cual se toma lo decide la base, no una suposicion (`design.md > 12`):
 *  - hay una presentacion reutilizable -> se abre el desplegable y se elige ESA, recorriendo con
 *    «Cargar más» si no estuviera en la primera pagina (el backend no ofrece busqueda);
 *  - no hay ninguna -> se crea con el alta en linea del propio selector (R38).
 */
async function choosePresentation(page: Page): Promise<string> {
  if (reusablePresentationName === null) {
    await page.getByTestId('presentation-create-open').click();
    await page.getByTestId('presentation-create-name').fill(presentationName);
    await page.getByTestId('presentation-create-submit').click();

    // El sub-formulario se cierra y la presentacion nueva queda SELECCIONADA, sin salir del panel.
    await expect(page.getByTestId('presentation-create')).toHaveCount(0, { timeout: 60_000 });
    return presentationName;
  }

  // Desde el 2026-09-07 el selector es un autocomplete: se BUSCA en el servidor y, si hiciera
  // falta, se baja hasta el final del desplegable para que anexe la pagina siguiente. Ya no hay
  // boton «Cargar más». Se usan las dos vias reales de la pantalla, en el orden en que las usaria
  // una persona.
  const wanted = reusablePresentationName;
  const campo = page.getByTestId('presentation-select');
  await campo.click();

  const option = page.getByTestId('presentation-option').filter({ hasText: wanted });
  const popup = page.getByTestId('presentation-popup');

  if ((await option.count()) === 0) {
    await campo.fill(wanted);
  }

  try {
    await option.first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    for (let intento = 0; intento < 10 && (await option.count()) === 0; intento += 1) {
      await popup.evaluate((lista) => {
        lista.scrollTop = lista.scrollHeight;
      });
      await page.waitForTimeout(500);
    }
    if ((await option.count()) === 0) {
      throw new Error(`la presentacion "${wanted}" no aparecio en el selector`);
    }
  }

  await option.first().click();
  return wanted;
}

/**
 * Recorre las paginas de la lista de proveedores hasta encontrar la FILA cuyo nombre es el de
 * este worker. Hace falta porque la pantalla NO ofrece busqueda (decision cerrada) y el orden es
 * fijo: un proveedor recien creado puede caer en cualquier pagina. Se avanza con el control real
 * de paginacion -que de paso lo ejercita en un navegador- y se para cuando «siguiente» queda
 * deshabilitado. El assert NUNCA mira «la primera fila» ni el total: solo la fila con ESTE nombre.
 */
async function findSupplierRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByTestId('supplier-row').filter({ hasText: name });
  const next = page.getByTestId('supplier-page-next');

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
    await expect(page.getByTestId('supplier-list')).toBeVisible({ timeout: 60_000 });
  }
}

/** Lo mismo, pero sobre la lista del catalogo de la pagina de detalle. */
async function findCatalogRow(page: Page, name: string): Promise<Locator> {
  // Desde el 2026-09-07 el catalogo monta la tabla compartida: la fila lleva el id de la linea
  // (`data-table-row-<id>`) y el control de pagina su `data-testid`.
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

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc44_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). El orden lo imponen las FK RESTRICT: lineas -> proveedores ->
  // presentaciones -> usuarios (`suppliers.created_by` apunta a `users`).
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

  // COMPROBACION, no suposicion: ¿tiene la base alguna presentacion que este recorrido pueda
  // reutilizar? Se excluyen las de otros E2E porque su `afterAll` las borra y la FK es RESTRICT.
  const existing = await prisma.presentation.findFirst({
    where: { NOT: { name: { contains: E2E_FIXTURE_MARK } } },
    orderBy: { name: 'asc' },
    select: { name: true },
  });
  reusablePresentationName = existing?.name ?? null;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: por eso cada paso
  // va en su propio `try`/`finally`. Los nombres son los EXACTOS de ESTE worker -nunca el
  // prefijo-: `fullyParallel` reparte los dos tests de este archivo en workers DISTINTOS, cada
  // uno con su `RUN_ID`, y borrar por prefijo se llevaria por delante lo que el otro esta usando.
  //
  // El borrado es FISICO: el de la pantalla es logico (`deletedAt`) y dejaria la fila viva para
  // el resto del repo.
  try {
    await prisma.supplierCatalogLine.deleteMany({ where: { name: catalogLineName } });
  } finally {
    try {
      await prisma.supplier.deleteMany({ where: { name: supplierName } });
    } finally {
      try {
        // Solo existe si el recorrido tuvo que crearla en linea; si no, este borrado no encuentra
        // nada y NO toca ninguna presentacion ajena.
        await prisma.presentation.deleteMany({ where: { name: presentationName } });
      } finally {
        try {
          await prisma.user.deleteMany({
            where: { username: { in: [adminUser.username, operatorUser.username] } },
          });
        } finally {
          // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict`
          // (QC-47 R11). Por el nombre EXACTO de ESTE worker, nunca por el prefijo.
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

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('proveedores', () => {
  test('el Administrador entra, da de alta un proveedor, abre su detalle, anade una linea de catalogo y la ve en la lista (R51)', async ({
    page,
  }) => {
    await login(page, adminUser);

    // --- 1. La pantalla se sirve a un Administrador (R52, la mitad que deja pasar). La URL sale
    // de la constante, nunca de un literal (R2).
    await page.goto(`${SUPPLIERS_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('proveedores-title')).toBeVisible({ timeout: 60_000 });

    // --- 2. El alta ocurre en un panel lateral, SIN cambiar de URL (R26). El control de crear
    // aparece dos veces cuando la lista esta vacia (cabecera y estado vacio): vale cualquiera.
    const urlBeforeSheet = page.url();
    await page.getByTestId('supplier-create-open').first().click();
    await expect(page.getByTestId('supplier-sheet')).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 3. Nombre y telefono: el alta exige al menos una via de contacto (R27).
    await page.getByTestId('supplier-field-name').fill(supplierName);
    await page.getByTestId('supplier-field-phone').fill(supplierPhone);

    // --- 4. Guardar: la Server Action REAL de QC-43 contra Postgres, sin `fetch` de por medio.
    await page.getByTestId('supplier-form-submit').click();

    // --- 5. Con exito el panel se cierra y se avisa por toast, visible porque el layout privado
    // YA monta la region de avisos (R33, R34). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId('supplier-sheet')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 6. Y el proveedor esta en la lista sin que el usuario recargue nada (R33).
    const supplierRow = await findSupplierRow(page, supplierName);
    await expect(supplierRow.first()).toBeVisible({ timeout: 60_000 });

    // --- 7. Se entra al detalle POR EL ENLACE de la fila, que lo construye `supplierDetailRoute`
    // (R3). El assert de destino compara contra el helper, no contra un literal de URL.
    const supplier = await prisma.supplier.findFirstOrThrow({
      where: { name: supplierName, deletedAt: null },
      select: { id: true },
    });
    await supplierRow.first().getByTestId('supplier-detail-link').click();
    await page.waitForURL((url) => url.pathname === supplierDetailRoute(supplier.id), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('supplier-detail-name')).toHaveText(supplierName, {
      timeout: 60_000,
    });

    // --- 8. Alta de la linea de catalogo, tambien en panel lateral (R26, R29).
    await page.getByTestId('catalog-line-create-open').first().click();
    await expect(page.getByTestId('catalog-line-sheet')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('catalog-field-name').fill(catalogLineName);
    await page.getByTestId('catalog-field-cost').fill(catalogLineCost);

    // La presentacion sale DEL SELECTOR: la que ya hubiera, o una creada con su alta en linea si
    // la base no tenia ninguna (R37, R38). La unidad se deja en «sin unidad»: es opcional (R40).
    const chosenPresentation = await choosePresentation(page);
    // El selector es un campo de autocompletado desde el 2026-09-07: lo elegido se lee en su
    // VALOR, no en su texto contenido.
    await expect(page.getByTestId('presentation-select')).toHaveValue(chosenPresentation, {
      timeout: 60_000,
    });
    await expect(
      page.getByTestId('catalog-field-name'),
      'elegir la presentacion no puede perder lo ya escrito',
    ).toHaveValue(catalogLineName);
    await expect(
      page.getByTestId('catalog-field-cost'),
      'elegir la presentacion no puede perder lo ya escrito',
    ).toHaveValue(catalogLineCost);

    // --- 9. Guardar: Server Action REAL de QC-52 contra Postgres.
    await page.getByTestId('catalog-line-form-submit').click();
    await expect(page.getByTestId('catalog-line-sheet')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 10. Y la linea esta en la lista del catalogo, con el importe TAL CUAL se tecleo (R41).
    const catalogRow = await findCatalogRow(page, catalogLineName);
    await expect(catalogRow.first()).toBeVisible({ timeout: 60_000 });
    await expect(catalogRow.first().getByTestId('data-table-cell-name')).toHaveText(
      catalogLineName,
    );
    await expect(catalogRow.first().getByTestId('data-table-cell-cost')).toHaveText(
      catalogLineCost,
    );

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla.
    expect(
      await prisma.supplierCatalogLine.count({
        where: { name: catalogLineName, supplierId: supplier.id, deletedAt: null },
      }),
      'la linea de catalogo deberia existir en la base',
    ).toBe(1);
  });

  test('un usuario que no es Administrador acaba fuera y no ve ningun dato de proveedores (R52)', async ({
    page,
  }) => {
    await login(page, operatorUser);

    // Sesion valida, rol distinto: la regla ruta-rol lo saca al dashboard SIN renderizar nada de
    // la pantalla. No es «no autenticado»: acaba en el dashboard, no en el login, y esa
    // diferencia es justo lo que R52 pide y lo que un redirect al login enmascararia.
    await page.goto(SUPPLIERS_ROUTE);
    await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });

    await expect(page.getByTestId('proveedores-title')).toHaveCount(0);
    await expect(page.getByTestId('supplier-table')).toHaveCount(0);
    await expect(page.getByTestId('supplier-row')).toHaveCount(0);
    await expect(page.getByTestId('supplier-list')).toHaveCount(0);
    await expect(page.getByTestId('supplier-list-empty')).toHaveCount(0);
  });
});
