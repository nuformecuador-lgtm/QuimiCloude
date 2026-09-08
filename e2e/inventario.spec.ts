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
 * DATOS: `products` y `presentations` son tablas reales y COMPARTIDAS, y los dos proyectos
 * corren a la vez. Por eso, copiando el patron de `e2e/session.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc22_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts de la lista filtran por ESE nombre, nunca por «la primera fila» ni por el
 *    total de productos, que el otro proyecto puede estar moviendo en el mismo instante;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente.
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
import { DASHBOARD_ROUTE, INVENTORY_ROUTE, LOGIN_ROUTE } from '@/lib/shared/routes';

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

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc22_e2e_*` en
  // la base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). Productos primero: `products.presentation_id` es `Restrict`.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

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
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: por eso se borra
  // por el `RUN_ID` y cada paso va en su propio `try`/`finally`. El orden lo imponen las FK:
  // productos -> presentaciones, y los usuarios al final. El borrado de producto es FISICO: el
  // de la pantalla es logico (`deletedAt`) y dejaria la fila viva para el resto del repo.
  try {
    await prisma.product.deleteMany({ where: { name: { startsWith: productName } } });
  } finally {
    try {
      await prisma.presentation.deleteMany({ where: { name: { startsWith: presentationName } } });
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
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('catalogo de productos', () => {
  test('el Administrador entra, da de alta un producto con una presentacion nueva y lo ve en la lista (R4, R17, R18, R21, R24)', async ({
    page,
  }) => {
    await login(page, adminUser);

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

  test('un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)', async ({
    page,
  }) => {
    await login(page, operatorUser);

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
