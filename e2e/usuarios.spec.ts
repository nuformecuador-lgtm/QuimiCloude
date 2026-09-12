/**
 * E2E de la pantalla de administracion de usuarios (QC-67, T15): el camino completo de quien tiene
 * los dos permisos y el rechazo de quien no tiene ninguno (R42, R4).
 *
 * Por que existe, y por que AQUI: `requirements.md > R42` lo pide entero —login -> `USERS_ROUTE`
 * -> **alta de un usuario** -> verlo en la lista **con estado `pending`**— y ademas un segundo
 * recorrido donde una sesion valida SIN `usuarios.consultar` recibe 404 dentro del layout privado
 * y no ve la tabla. Cierra ademas la E2E que QC-66 difirio aqui con motivo: cuando se construyo el
 * modulo todavia no habia pantalla que abrir con el.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, el
 *    corte por permiso de la pagina (`usuarios.consultar`), el Server Component de la lista con sus
 *    DOS lecturas —la pagina de usuarios y el catalogo de roles—, la Server Action REAL de alta de
 *    QC-66 contra Postgres y el `router.refresh()` posterior. En unit todas esas operaciones son
 *    dobles.
 *  - **La cuenta nace `pending` de punta a punta** (R28, decision cerrada 8): el estado no lo
 *    escribe el formulario —no lo captura siquiera (R23)— sino el caso de uso, y la columna pinta
 *    **el almacenado** tal cual vuelve de la consulta (R20). Eso solo se demuestra con la base real.
 *  - **Los dos selectores** —tipo de documento y rol— son `Select` de Base UI con su portal, y el
 *    panel es un `Sheet` con el suyo: jsdom no ejercita ninguno de los dos igual.
 *  - **El catalogo de roles viene de QC-94**: que el `roleId` que viaja sea un identificador real y
 *    no un nombre solo se ve con la consulta de verdad detras.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * NAVEGACION SIEMPRE POR URL (`page.goto`), nunca pulsando el item del menu: lo que este spec
 * afirma es el camino de la PANTALLA, y pulsar `nav-usuarios` meteria en el recorrido el filtrado
 * del menu por permisos, que ya cubre `e2e/permisos.spec.ts` con sus propios fixtures y que aqui
 * seria una segunda cosa fallando por el mismo rojo. La URL se deriva SIEMPRE de `USERS_ROUTE`
 * (R1): ningun literal de la ruta en todo el archivo.
 *
 * POR QUE EL ALTA ES POR LA INTERFAZ Y EL RESTO POR LA BASE: R42 nombra el alta, asi que esa es la
 * unica escritura que pasa por la pantalla. La empresa, el administrador y el operador del fixture
 * son PRECONDICIONES del recorrido y se siembran por la base de datos, como en los specs hermanos.
 *
 * EL ACTOR NO SE VE A SI MISMO (R11, QC-66 decision 12): por eso el recorrido crea a OTRA persona y
 * busca a esa. Afirmar sobre la fila del administrador seria afirmar sobre una fila que la consulta
 * no devuelve nunca.
 *
 * LO QUE ESTE SPEC NO CREA: los roles ni sus permisos. `Administrador` —que tiene
 * `usuarios.consultar` y `usuarios.modificar`— y `Operador` —que tiene SOLO `inventario.consultar`,
 * o sea ninguno de los dos— los siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts` y `domain/permissions.ts`). Sus permisos son el dato bajo
 * prueba del recorrido 2: con un rol inventado se estaria probando el fixture. Si el rol falta, el
 * `beforeAll` falla diciendo que hay que sembrar, en vez de dar un rojo incomprensible a medio
 * camino.
 *
 * DATOS Y AISLAMIENTO: `users` es una tabla real y COMPARTIDA, y los dos proyectos de Playwright
 * corren a la vez. Por eso, copiando el patron ya asentado de `e2e/unidades.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc67_e2e_` y dentro el `RUN_ID` del worker, en
 *    el nombre de usuario, el correo y el numero de documento —los tres indices unicos de `users`
 *    son GLOBALES—;
 *  - el assert de la lista filtra por el nombre de usuario del fixture —pidiendo la lista con el
 *    parametro de busqueda, que resuelve el SERVIDOR sobre el conjunto entero (R12)—, nunca por
 *    «la primera fila» ni por el total;
 *  - ademas cada worker tiene su propia EMPRESA, y el listado esta acotado a la del actor, asi que
 *    el administrador de este worker no puede ni ver las filas del otro;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, y por los nombres EXACTOS de este worker.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus modulos
 * son de CLIENTE (`'use client'`, JSX, `useActionState`) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec sin aportar nada. Es el mismo criterio de `e2e/unidades.spec.ts`
 * y `e2e/presentaciones.spec.ts`. Ningun assert mira copy (R41): todo se localiza por
 * `data-testid`, por rol ARIA, por atributo de datos o por valores del fixture.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

// Todo como VALOR y por el barrel del modulo —nunca por ruta profunda, nunca un literal a mano—:
// `normalizeCompanyName` es la UNICA definicion de «mismo nombre de empresa» (QC-47 R3),
// `DOCUMENT_TYPE_CC` es el conjunto cerrado de QC-4 y los dos roles son los del seed (QC-54).
// Aqui SI se puede importar el barrel: este archivo corre en Node, no en el navegador.
import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, LOGIN_ROUTE, DASHBOARD_ROUTE, USERS_ROUTE } from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc67_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E: borrar por prefijo a secas se
 * llevaria una fila que otra ejecucion todavia esta usando. Una hora deja fuera cualquier ejecucion
 * viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla (R16). */
const LIST_PAGE_SIZE = '25';

/**
 * Nombres de los parametros de lista, tal y como los declara `user-list-params.ts`. Se repiten
 * aqui como constantes locales por el mismo motivo que los `data-testid` (ver cabecera).
 */
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** `data-testid` de la pantalla, del panel lateral y de la tabla compartida (R41). */
const TITLE_TESTID = 'usuarios-title';
const LIST_TESTID = 'user-list';
const LIST_EMPTY_TESTID = 'user-list-empty';
const CREATE_OPEN_TESTID = 'user-create-open';
const SHEET_TESTID = 'user-sheet';
const FORM_SUBMIT_TESTID = 'user-form-submit';
const FIELD_FIRST_NAMES_TESTID = 'user-field-first-names';
const FIELD_LAST_NAMES_TESTID = 'user-field-last-names';
const FIELD_BIRTH_DATE_TESTID = 'user-field-birth-date';
const FIELD_EMAIL_TESTID = 'user-field-email';
const FIELD_PHONE_TESTID = 'user-field-phone';
const FIELD_DOCUMENT_TYPE_TESTID = 'user-field-document-type';
const FIELD_DOCUMENT_NUMBER_TESTID = 'user-field-document-number';
const FIELD_USERNAME_TESTID = 'user-field-username';
const FIELD_ROLE_TESTID = 'user-field-role';
const OPTION_DOCUMENT_TYPE_TESTID = 'user-option-document-type';
const OPTION_ROLE_TESTID = 'user-option-role';
const STATUS_BADGE_TESTID = 'user-status';
const DATA_TABLE_TESTID = 'data-table';
const USERNAME_CELL_TESTID = 'data-table-cell-username';
/** El 404 de la zona privada (QC-75 R8): se pinta DENTRO del layout, con su menu ya filtrado. */
const NOT_FOUND_TESTID = 'private-not-found';

/** El estado en el que NACE toda cuenta (QC-66 R13). La pantalla no lo elige: lo pinta (R20). */
const PENDING_STATUS = 'pending';

/** Palabras que la pantalla de 404 NO puede contener (R4): delatarian que la pantalla existe. */
const FORBIDDEN_404_WORDS = ['usuario', 'permiso', 'rol', 'autoriz'] as const;

type Credentials = { readonly username: string; readonly password: string };

/**
 * El termino con el que el recorrido pide la lista. **El `RUN_ID` va ANTES del sufijo** para que
 * este prefijo comun sea substring de los nombres de usuario de los TRES fixtures: la busqueda del
 * modulo es `contains` insensible a mayusculas sobre nombres, correo y nombre de usuario, asi que
 * un `RUN_ID` al final no daria ningun prefijo compartido.
 */
const SEARCH_TERM = `${FIXTURE_PREFIX}${RUN_ID}`;

const adminUser: Credentials = {
  username: `${SEARCH_TERM}_admin`,
  password: `Qc67-Admin-${RUN_ID.slice(0, 12)}`,
};

/**
 * El operador cumple DOS papeles, y por eso existe aunque el recorrido 1 no inicie sesion con el:
 * es la sesion sin `usuarios.consultar` del recorrido 2 **y** la fila que hace que la lista del
 * recorrido 1 no arranque vacia. Esto ultimo no es decorado: con cero filas la pantalla pinta el
 * estado vacio de «la busqueda no encontro nada» (R18), que **no** ofrece «crear el primero»
 * —decision cerrada— y deja el disparador del alta fuera del arbol. El actor, ademas, no se ve a
 * si mismo (R11), asi que el administrador no puede ser esa fila.
 */
const operatorUser: Credentials = {
  username: `${SEARCH_TERM}_oper`,
  password: `Qc67-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Los NUEVE valores que el recorrido teclea en el panel (R23). Ni uno mas: el resto no se captura. */
const nuevoUsuario = {
  firstNames: `Qc67${RUN_ID.slice(0, 8)}`,
  lastNames: 'Usuarios',
  birthDate: '1990-01-01',
  email: `${SEARCH_TERM}_nuevo@example.test`,
  phone: '+573000000000',
  documentNumber: `qc67n${RUN_ID}`,
  username: `${SEARCH_TERM}_nuevo`,
} as const;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria. NUNCA la de
 * instalacion: el indice `companies_name_unique` es GLOBAL y chocaria con la de `db:seed`. Ademas
 * el listado de usuarios esta acotado a la empresa del actor, asi que esta empresa es tambien lo
 * que aisla la lista de este worker de la del otro.
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
      `falta el rol "${roleName}": este E2E no lo crea porque SUS PERMISOS son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames: `Qc67${RUN_ID.slice(0, 8)}`,
      lastNames: 'Fixture',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde esa ficha
      // `pending` no entra por el login, asi que este usuario efimero no llegaria a la pantalla.
      accountStatus: 'active',
    },
    select: { id: true },
  });
}

/**
 * Entra por el formulario real y aterriza donde le corresponde a ese usuario.
 *
 * **El destino se pasa como parametro desde QC-75 (R11)**: el login lleva al PRIMER item del menu
 * que esa persona puede ver. El Administrador aterriza en `DASHBOARD_ROUTE`; el Operador, que no
 * tiene `dashboard.consultar`, en `INVENTORY_ROUTE`.
 */
async function login(page: Page, user: Credentials, landing: string): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });
}

/**
 * URL de la lista, SIEMPRE derivada de `USERS_ROUTE` (R1), con el termino de busqueda ya puesto.
 *
 * **La busqueda va en la URL desde el primer `goto`**, y no se teclea en la caja, por dos motivos:
 * el filtrado ocurre EN EL SERVIDOR sobre el conjunto entero (R12), asi que la fila creada no puede
 * escaparse a una pagina que el recorrido no visite; y como el panel no navega, el
 * `router.refresh()` posterior al alta reejecuta el Server Component con ESTA MISMA consulta, que
 * es justo lo que R22 y R29 prometen.
 */
function usersUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${USERS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc67_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/identity/identity-constraints.int.test.ts` afirma `user.count() === 0`).
  // El corte POR EDAD no es un adorno: sin el, este `deleteMany` borraria el usuario que el otro
  // proyecto acaba de crear y que esta usando ahora mismo.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

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
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara. El orden lo imponen
  // las FK restrictivas: usuarios -> empresa.
  //
  // **Por los nombres EXACTOS de ESTE worker, NUNCA por `FIXTURE_PREFIX`**: `fullyParallel` reparte
  // los dos tests de este archivo en workers DISTINTOS, cada uno con su propio `RUN_ID` y su propio
  // fixture. Borrar por prefijo aqui se llevaria lo que el OTRO worker acaba de crear.
  try {
    await prisma.user.deleteMany({
      where: {
        username: { in: [adminUser.username, operatorUser.username, nuevoUsuario.username] },
      },
    });
  } finally {
    try {
      await prisma.company.deleteMany({ where: { name: companyName } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('pantalla de usuarios', () => {
  test('el Administrador entra por la URL, da de alta un usuario y lo ve en la lista con estado pending (R42)', async ({
    page,
  }) => {
    await login(page, adminUser, DASHBOARD_ROUTE);

    // --- 1. La pantalla se sirve a quien tiene `usuarios.consultar` (R4, la mitad que deja pasar).
    // Se llega POR URL derivada de la constante; el item `nav-usuarios` existe (T2) pero aqui no se
    // pulsa a proposito (ver cabecera).
    const listUrl = usersUrl(SEARCH_TERM);
    await page.goto(listUrl);
    await expect(page.getByTestId(TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 2. Con la busqueda puesta, la lista trae los usuarios de ESTE worker y **no** al
    // administrador que la pide (R11): el servidor filtro sobre el conjunto entero (R12). Que haya
    // lista —y no estado vacio— es lo que pone el disparador del alta en la pantalla (R18). Y la
    // persona que el recorrido va a crear todavia NO esta: asi la fila que se vea al final es la
    // que trajo la escritura, no una que ya estuviera ahi.
    await expect(page.getByTestId(LIST_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(
      page.getByTestId(USERNAME_CELL_TESTID).filter({ hasText: exactText(operatorUser.username) }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId(USERNAME_CELL_TESTID).filter({ hasText: exactText(adminUser.username) }),
      'el actor no aparece en su propio listado (R11)',
    ).toHaveCount(0);
    await expect(
      page.getByTestId(USERNAME_CELL_TESTID).filter({ hasText: exactText(nuevoUsuario.username) }),
    ).toHaveCount(0);

    // --- 3. El disparador del alta se ofrece porque la sesion trae ademas `usuarios.modificar`
    // (R6), y el alta ocurre en un PANEL LATERAL, SIN cambiar de URL (R22).
    const urlBeforeSheet = page.url();
    await page.getByTestId(CREATE_OPEN_TESTID).first().click();
    await expect(page.getByTestId(SHEET_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 4. Los siete campos de texto de los NUEVE (R23). Ni contrasena, ni empresa, ni estado de
    // cuenta: el formulario no los captura, asi que aqui no hay nada que teclear de ellos (R35).
    await page.getByTestId(FIELD_FIRST_NAMES_TESTID).fill(nuevoUsuario.firstNames);
    await page.getByTestId(FIELD_LAST_NAMES_TESTID).fill(nuevoUsuario.lastNames);
    await page.getByTestId(FIELD_BIRTH_DATE_TESTID).fill(nuevoUsuario.birthDate);
    await page.getByTestId(FIELD_EMAIL_TESTID).fill(nuevoUsuario.email);
    await page.getByTestId(FIELD_PHONE_TESTID).fill(nuevoUsuario.phone);
    await page.getByTestId(FIELD_DOCUMENT_NUMBER_TESTID).fill(nuevoUsuario.documentNumber);
    await page.getByTestId(FIELD_USERNAME_TESTID).fill(nuevoUsuario.username);

    // --- 5. Tipo de documento: del conjunto CERRADO del contrato (R25), nunca de un literal.
    await page.getByTestId(FIELD_DOCUMENT_TYPE_TESTID).click();
    const documentOption = page
      .getByTestId(OPTION_DOCUMENT_TYPE_TESTID)
      .filter({ hasText: exactText(DOCUMENT_TYPE_CC) });
    await expect(documentOption).toHaveCount(1, { timeout: 60_000 });
    await documentOption.click();

    // --- 6. Rol: las opciones vienen de la CONSULTA DE ROLES del modulo (R24, QC-94). Se elige el
    // `Operador` del seed, localizado por su nombre —que es dato del catalogo, no copy de la
    // pantalla—; lo que viaja en el envio es su identificador, que este spec no conoce ni escribe.
    await page.getByTestId(FIELD_ROLE_TESTID).click();
    const roleOption = page
      .getByTestId(OPTION_ROLE_TESTID)
      .filter({ hasText: exactText(ROLE_OPERADOR) });
    await expect(roleOption).toHaveCount(1, { timeout: 60_000 });
    await roleOption.click();

    // --- 7. Guardar: la Server Action REAL de QC-66 contra Postgres, sin `fetch` de por medio
    // (R36).
    await page.getByTestId(FORM_SUBMIT_TESTID).click();

    // --- 8. Con exito el panel se cierra y se avisa por el `<Toaster />` que el layout privado YA
    // monta (R28, R29). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId(SHEET_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 9. Lo guardo el backend de verdad, no solo lo pinto la pantalla: la fila existe, nacio
    // `pending` (QC-66 R13) y cuelga de la empresa DEL ACTOR, que el formulario no envia (R23).
    const created = await prisma.user.findFirstOrThrow({
      where: { username: nuevoUsuario.username },
      select: { id: true, accountStatus: true, companyId: true, email: true },
    });
    expect(created.accountStatus, 'la cuenta nace pending, no la elige la pantalla').toBe(
      PENDING_STATUS,
    );
    expect(created.companyId, 'la empresa sale del actor, no del formulario').toBe(companyId);
    expect(created.email).toBe(nuevoUsuario.email);

    // --- 10. Y el usuario esta en la lista sin que nadie recargue nada (R29), con los MISMOS
    // parametros de lista que habia antes de abrir el panel (R22).
    expect(page.url(), 'cerrar el panel no debe perder los parametros de lista').toBe(urlBeforeSheet);
    await expect(page.getByTestId(LIST_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);

    // El assert filtra POR EL NOMBRE DE USUARIO, nunca por «la primera fila» ni por el total: la
    // busqueda la resolvio el servidor sobre el conjunto entero y el listado esta acotado a la
    // empresa de ESTE worker.
    const usernameCell = page
      .getByTestId(USERNAME_CELL_TESTID)
      .filter({ hasText: exactText(nuevoUsuario.username) });
    await expect(usernameCell).toHaveCount(1, { timeout: 60_000 });
    await expect(usernameCell.first()).toBeVisible();

    // --- 11. EL ESTADO `pending` EN LA LISTA (R42, R20), que es lo que este recorrido aporta sobre
    // los tests de unidad: se lee en la FILA de la persona creada —localizada por el id que puso la
    // base de datos, no por su posicion— y se afirma sobre el ATRIBUTO DE DATOS del distintivo, no
    // sobre su etiqueta: el estado es un valor del conjunto cerrado del modulo, no copy (R41).
    const statusBadge = page
      .getByTestId(`data-table-row-${created.id}`)
      .getByTestId(STATUS_BADGE_TESTID);
    await expect(statusBadge).toHaveAttribute('data-status', PENDING_STATUS, { timeout: 60_000 });
  });

  test('una sesion valida sin `usuarios.consultar` recibe 404 dentro del layout privado y no ve la tabla (R4, R42)', async ({
    page,
  }) => {
    // El Operador del seed lleva `inventario.consultar` y SOLO ese (QC-74 R9), asi que aterriza en
    // inventario (QC-75 R11) y la pantalla de usuarios —que exige `usuarios.consultar`— le esta
    // cerrada.
    await login(page, operatorUser, INVENTORY_ROUTE);

    // Sesion valida, permiso ausente: **404, sin redireccion**. La respuesta es indistinguible de la
    // de una ruta que no existe, que es justo lo que evita delatar que el modulo esta ahi. No es
    // «no autenticado»: no acaba en el login, y esa diferencia es lo que un redirect enmascararia.
    const response = await page.goto(USERS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);

    // Y ese 404 se pinta DENTRO del layout privado (QC-75 R8): el usuario conserva su menu y su
    // salida en vez de quedarse en una pagina pelada.
    const notFound = page.getByTestId(NOT_FOUND_TESTID);
    await expect(notFound).toBeVisible({ timeout: 60_000 });

    // Y no delata nada (R4): ni el modulo, ni el permiso, ni que la pantalla exista.
    const notFoundText = ((await notFound.textContent()) ?? '').toLowerCase();
    for (const word of FORBIDDEN_404_WORDS) {
      expect(
        notFoundText.includes(word),
        `la pantalla de 404 no puede mencionar «${word}»: distinguiria «no existe» de «no puedes»`,
      ).toBe(false);
    }

    // Ni un dato de usuarios: ni el titulo, ni la tabla compartida, ni la lista, ni siquiera el
    // estado vacio —que ya delataria que la pantalla existe— ni el disparador del alta.
    await expect(page.getByTestId(TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(CREATE_OPEN_TESTID)).toHaveCount(0);
  });
});
