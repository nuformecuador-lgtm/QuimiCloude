/**
 * E2E de la pantalla de presentaciones (QC-45, T11): el camino completo del Administrador y el
 * rechazo del que no lo es (R36, R6).
 *
 * Por que existe, y por que AQUI: `design.md > 10` lo pide entero -login -> `PRESENTATIONS_ROUTE`
 * -> alta de una presentacion -> verla en la lista FILTRANDO POR SU NOMBRE-, sobre el patron ya
 * mergeado de `e2e/inventario.spec.ts` y `e2e/pedidos.spec.ts`.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware,
 *    corte por permiso de la pagina, Server Component de la lista, las Server Actions REALES de
 *    `inventario` (QC-20) contra Postgres y `router.refresh()`. En unit todas esas actions son
 *    dobles.
 *  - La tabla compartida de QC-55 montada de verdad, con su busqueda AL SERVIDOR (R10): jsdom no
 *    ejercita la navegacion por cadena de consulta igual que un navegador.
 *  - **El corte por permiso de verdad** (R6): en unit se afirma que `page.tsx` exige el codigo
 *    (test de fuente); aqui se afirma el STATUS de la respuesta real y que no se ve ni un dato.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * NAVEGACION SIEMPRE POR URL (`page.goto`), nunca por el menu lateral: lo que este spec afirma es
 * el camino de la pantalla, y pulsar el item del sidebar meteria en el recorrido el filtrado del
 * menu, que ya cubre `e2e/permisos.spec.ts` con sus propios fixtures. La URL se deriva SIEMPRE de
 * `PRESENTATIONS_ROUTE` (R2): ningun literal `'/configuracion/...'`.
 *
 * **RONDA 2 (2026-09-08): el recorrido 2 ya no espera una redireccion.** QC-75 borro la regla
 * ruta->rol del borde (R16): a quien no tiene el permiso ya no se le saca al dashboard, se le
 * responde **404 dentro del layout privado** —indistinguible de una ruta que no existe—. El assert
 * es sobre el `status()` de la respuesta real de `goto` y sobre `private-not-found`, copiando
 * `e2e/permisos.spec.ts`.
 *
 * DATOS: `presentations` es una tabla real y COMPARTIDA, y los dos proyectos de Playwright corren
 * a la vez. Por eso, copiando el patron ya asentado:
 *  - todo lo que este spec crea lleva el prefijo `qc45_e2e_` y dentro el `RUN_ID` del worker;
 *  - el assert de la lista filtra por ESE nombre -pidiendo la lista con el parametro de busqueda,
 *    que resuelve el servidor-, **nunca** por «la primera fila» ni por el total: Chromium y WebKit
 *    crean su presentacion en el mismo instante sobre la misma tabla;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, y **tolera** que el borrado se rechace.
 *
 * EL BORRADO DE PRESENTACIONES ES FISICO y la FK `products.presentation_id` es `ON DELETE
 * RESTRICT` (QC-14, QC-20 D6): si un producto de otro spec quedo apuntando a una presentacion de
 * este, la base rechaza el borrado con `presentation_in_use`. Ese rechazo **no tumba la suite**
 * (`design.md > 10`): se avisa por consola y la limpieza sigue con el resto de las tablas. Tumbar
 * `afterAll` convertiria en rojo una suite cuyos dos recorridos pasaron.
 *
 * LO QUE ESTE SPEC NO CREA: los roles ni sus permisos. `Administrador` y `Operador` -y el
 * conjunto de permisos de cada uno, QC-74- los siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts` y `domain/permissions.ts`). El rol tiene que llamarse
 * EXACTAMENTE asi porque el usuario del fixture se crea buscandolo por nombre. Si falta, el
 * `beforeAll` falla diciendo que hay que sembrar, en vez de dar un rojo incomprensible en mitad
 * del recorrido.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados de los componentes de la ruta: son
 * modulos de CLIENTE (`'use client'`, JSX, `useActionState`) y su barrel es la T9, que todavia no
 * existe; importarlos desde el proceso de Node del runner arrastraria React al spec sin aportar
 * nada. Es el mismo criterio que `e2e/inventario.spec.ts` y `e2e/pedidos.spec.ts`. Ningun assert
 * mira copy (R35).
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

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
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  PRESENTATIONS_ROUTE,
} from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc45_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/inventario.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E contra la misma base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando. Una hora deja fuera
 * cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla (R12). */
const LIST_PAGE_SIZE = '25';

/**
 * Nombres de los parametros de lista, tal y como los declara `presentation-list-params.ts`. Se
 * repiten aqui como constantes locales por el mismo motivo que los `data-testid` (ver cabecera):
 * ese modulo vive en la carpeta de componentes de la ruta, cuyo barrel es la T9.
 */
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** `data-testid` de la pantalla y de la tabla compartida. Ningun assert mira copy (R35). */
const TITLE_TESTID = 'presentaciones-title';
const CREATE_OPEN_TESTID = 'presentation-create-open';
const SHEET_TESTID = 'presentation-sheet';
const FIELD_NAME_TESTID = 'presentation-field-name';
const FORM_SUBMIT_TESTID = 'presentation-form-submit';
const LIST_TESTID = 'presentation-list';
const LIST_EMPTY_TESTID = 'presentation-list-empty';
const DATA_TABLE_TESTID = 'data-table';
/** El 404 de la zona privada (QC-75 R8): se pinta DENTRO del layout, con su menu ya filtrado. */
const NOT_FOUND_TESTID = 'private-not-found';
const NAME_CELL_TESTID = 'data-table-cell-name';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc45-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc45-Oper-${RUN_ID.slice(0, 12)}`,
};

/**
 * Nombre de la presentacion que da de alta el recorrido del Administrador. Lleva el `RUN_ID` para
 * que el assert no case con la que el otro proyecto esta creando en el mismo instante, y cabe
 * holgadamente en el maximo de 60 del esquema del contrato.
 */
const presentationName = `${FIXTURE_PREFIX}pres_${RUN_ID}`;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria. NUNCA la de
 * instalacion: el indice `companies_name_unique` es GLOBAL y chocaria con la de `db:seed`.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;

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
      firstNames: `Qc45${RUN_ID.slice(0, 8)}`,
      lastNames: 'Presentaciones',
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

/**
 * Entra por el formulario real y aterriza donde le corresponde a ese usuario.
 *
 * **El destino se pasa como parametro desde QC-75 (R11)**: el login ya no lleva a todo el mundo al
 * dashboard, sino al PRIMER item del menu que esa persona puede ver. El Administrador aterriza en
 * `DASHBOARD_ROUTE`; el Operador, que no tiene `dashboard.consultar`, en `INVENTORY_ROUTE`. Dar
 * por hecho el dashboard para los dos dejaba este `waitForURL` colgado hasta agotar el tiempo.
 */
async function login(page: Page, user: Credentials, landing: string): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });
}

/**
 * URL de la lista, SIEMPRE derivada de `PRESENTATIONS_ROUTE` (R2), con el termino de busqueda ya
 * puesto.
 *
 * **La busqueda va en la URL desde el primer `goto`**, y no se teclea en la caja, por dos motivos:
 * el filtrado ocurre EN EL SERVIDOR sobre el catalogo entero (R10), asi que la fila creada no
 * puede escaparse a una pagina que el recorrido no visite; y como el panel lateral no navega, el
 * `router.refresh()` posterior al alta reejecuta el Server Component con ESTA MISMA consulta, que
 * es justo lo que R21 y R25 prometen.
 */
function presentationsUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${PRESENTATIONS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc45_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). Las presentaciones huerfanas pueden estar retenidas por un producto
  // (`ON DELETE RESTRICT`): el rechazo se tolera igual que en `afterAll`, porque esto es higiene,
  // no lo que el recorrido afirma.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  try {
    await prisma.presentation.deleteMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    });
  } catch (error) {
    console.warn('[qc45 e2e] presentaciones huerfanas retenidas por un producto:', error);
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas van DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`
  // (QC-47 R11) y borrarlas antes lo rechazaria la base.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios.
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
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: cada paso va en su
  // propio `try`/`finally`. El orden lo imponen las FK RESTRICT: presentacion -> usuarios ->
  // empresa.
  //
  // **Por los nombres EXACTOS de ESTE worker, NUNCA por `FIXTURE_PREFIX`**: `fullyParallel` reparte
  // los dos tests de este archivo en workers DISTINTOS, cada uno con su propio `RUN_ID` y su propio
  // fixture. Borrar por prefijo aqui se llevaria lo que el OTRO worker acaba de crear.
  //
  // El borrado de la presentacion es FISICO -`presentations` no lleva `deleted_at` a proposito
  // (QC-14, QC-20 D6)- y puede rechazarse con `presentation_in_use` si un producto de otro spec la
  // dejo enganchada. Ese caso se AVISA y no tumba la suite (`design.md > 10`), y aun asi el resto
  // de la limpieza se ejecuta entera: no se dejan usuarios ni empresas huerfanas por ello.
  try {
    await prisma.presentation.deleteMany({ where: { name: presentationName } });
  } catch (error) {
    console.warn(
      `[qc45 e2e] no se pudo borrar la presentacion "${presentationName}" (probablemente en uso ` +
        'por un producto de otro spec: la FK es ON DELETE RESTRICT). Se deja y la limpieza sigue:',
      error,
    );
  } finally {
    try {
      await prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, operatorUser.username] } },
      });
    } finally {
      // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict`.
      try {
        await prisma.company.deleteMany({ where: { name: companyName } });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('pantalla de presentaciones', () => {
  test('el Administrador entra por la URL, da de alta una presentacion y la ve en la lista filtrando por su nombre (R36)', async ({
    page,
  }) => {
    await login(page, adminUser, DASHBOARD_ROUTE);

    // --- 1. La pantalla se sirve a un Administrador (R6, la mitad que deja pasar). Se llega POR
    // URL derivada de la constante. El item de menu de Configuracion SI existe (T2), pero aqui no
    // se pulsa a proposito: meteria el filtrado del menu en el recorrido (ver cabecera).
    const listUrl = presentationsUrl(presentationName);
    await page.goto(listUrl);
    await expect(page.getByTestId(TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // Con la busqueda puesta y antes del alta, el catalogo filtrado no tiene ninguna fila: la
    // pantalla pinta su estado vacio, que es donde vive el disparador de «crear la primera» (R15).
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 2. El alta ocurre en un panel lateral, SIN cambiar de URL (R21). El disparador aparece
    // en el estado vacio y tambien en la cabecera de la lista: vale cualquiera de los dos.
    const urlBeforeSheet = page.url();
    await page.getByTestId(CREATE_OPEN_TESTID).first().click();
    await expect(page.getByTestId(SHEET_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 3. El unico campo de negocio de una presentacion (R22).
    await page.getByTestId(FIELD_NAME_TESTID).fill(presentationName);

    // --- 4. Guardar: la Server Action REAL de QC-20 contra Postgres, sin `fetch` de por medio
    // (R30).
    await page.getByTestId(FORM_SUBMIT_TESTID).click();

    // --- 5. Con exito el panel se cierra y se avisa por el `<Toaster />` que el layout privado YA
    // monta (R25, R26). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId(SHEET_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 6. Y la presentacion esta en la lista sin que el usuario recargue nada (R25), con los
    // MISMOS parametros de lista que habia antes de abrir el panel (R21).
    expect(page.url(), 'cerrar el panel no debe perder los parametros de lista').toBe(
      urlBeforeSheet,
    );
    await expect(page.getByTestId(LIST_TESTID)).toBeVisible({ timeout: 60_000 });

    // El assert filtra POR EL NOMBRE, nunca por «la primera fila» ni por el total: la busqueda la
    // resolvio el servidor sobre el catalogo entero (R10) y solo puede quedar ESTA fila, porque el
    // nombre lleva el `RUN_ID` de este worker.
    const nameCell = page
      .getByTestId(NAME_CELL_TESTID)
      .filter({ hasText: exactText(presentationName) });
    await expect(nameCell).toHaveCount(1, { timeout: 60_000 });
    await expect(nameCell.first()).toBeVisible();

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla.
    expect(
      await prisma.presentation.count({ where: { name: presentationName } }),
      'la presentacion deberia existir en la base',
    ).toBe(1);
  });

  test('un usuario sin `inventario.modificar` recibe 404 y no ve ni un dato (R6)', async ({
    page,
  }) => {
    // El Operador del seed lleva `inventario.consultar` y SOLO ese, asi que aterriza en inventario
    // (QC-75 R11) y la pantalla de presentaciones, que exige `inventario.modificar`, le esta
    // cerrada.
    await login(page, operatorUser, INVENTORY_ROUTE);

    // Sesion valida, permiso ausente: **404, sin redireccion**. Antes de QC-75 la regla ruta->rol
    // lo sacaba al dashboard; ahora la respuesta es indistinguible de la de una ruta que no
    // existe, que es justo lo que evita delatar que el modulo esta ahi. No es «no autenticado»:
    // no acaba en el login, y esa diferencia es lo que un redirect al login enmascararia.
    const response = await page.goto(PRESENTATIONS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);

    // Y ese 404 se pinta DENTRO del layout privado (QC-75 R8): el usuario conserva su menu y su
    // salida en vez de quedarse en una pagina pelada.
    await expect(page.getByTestId(NOT_FOUND_TESTID)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId(TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
  });
});
