/**
 * E2E del cierre de TODAS las sesiones de otra persona desde la pantalla (QC-101, T10; R17).
 *
 * Por que existe: es el UNICO sitio donde la revocacion de QC-23 se demuestra de punta a punta.
 * Hasta esta ficha estaba probada en el servicio y nunca ejercitada desde la interfaz; los cortes
 * de sesion ya cubiertos en `e2e/session.spec.ts` usan UNA sola sesion y matan la cuenta por fuera
 * con Prisma, porque entonces no existia la accion administrativa. Aqui esa sustitucion desaparece:
 * quien cierra es OTRO navegador, por el panel real, con la Server Action real.
 *
 * DOS SESIONES VIVAS A LA VEZ (`design.md > 5`). Patron nuevo en el repo: el fixture `browser` y
 * DOS `browser.newContext()`, que es lo unico que garantiza dos frascos de cookies distintos en el
 * mismo test. `page` no vale —es uno solo— y clonar `storageState` duplicaria UNA sesion, no
 * montaria dos personas (`e2e/theme.spec.ts:212-213` hace eso otro).
 *
 * DATOS (mismo molde que `e2e/usuarios.spec.ts` y `e2e/session.spec.ts`):
 *  - roles REALES del seed: `Administrador` —trae `usuarios.consultar` y `usuarios.modificar`— para
 *    quien cierra, y `Operador` —solo `inventario.consultar`— para la victima, que por eso aterriza
 *    en `INVENTORY_ROUTE`. Con roles inventados se probaria el fixture, no el permiso;
 *  - empresa efimera propia (nunca la del seed: `companies_name_unique` es global) y, dentro, SOLO
 *    estas dos personas: el listado esta acotado a la empresa del actor;
 *  - prefijo `qc101_e2e_` + `RUN_ID` por proceso en nombre de usuario, correo y documento —los
 *    indices unicos de `users` son globales, y Chromium y WebKit corren a la vez—;
 *  - limpieza defensiva de huerfanos por prefijo Y por edad, y borrado en `afterAll` por los nombres
 *    EXACTOS de este worker.
 *
 * NINGUNA ESCRITURA POR PRISMA en el recorrido: solo fixtures y limpieza. El sello de revocacion lo
 * sube la pantalla o no lo sube nadie.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus modulos
 * son de CLIENTE (`'use client'`, JSX, `useActionState`) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec. Mismo criterio que `e2e/usuarios.spec.ts`. Ningun assert mira
 * copy: los textos se comprueban por INCLUSION del nombre de la victima, que es dato del fixture
 * compuesto con `buildDisplayName` —funcion del contrato—, nunca comparando una frase copiada.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page, type Response } from '@playwright/test';

// Todo como VALOR y por el barrel del modulo: `normalizeCompanyName` es la UNICA definicion de
// «mismo nombre de empresa» (QC-47 R3), `buildDisplayName` la UNICA del nombre que pinta la
// pantalla, y los roles y el tipo de documento son los del seed y el conjunto cerrado de QC-4.
// Aqui SI se puede importar el barrel: este archivo corre en Node, no en el navegador.
import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  buildDisplayName,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { SESSION_COOKIE_NAME } from '@/lib/modules/identity/adapters/driven/session/session-token';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, INVENTORY_ROUTE, LOGIN_ROUTE, USERS_ROUTE } from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc101_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y puede haber otro worktree corriendo su propio E2E: borrar por prefijo a secas se llevaria
 * una fila que otra ejecucion todavia esta usando. Una hora deja fuera cualquier ejecucion viva y
 * dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Nombres de los parametros de lista, tal y como los declara `user-list-params.ts`. */
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';
const LIST_PAGE_SIZE = '25';

/** `data-testid` de las pantallas que recorre el test (constantes locales: ver cabecera). */
const LOGIN_FORM_TESTID = 'login-form';
const LOGIN_USERNAME_TESTID = 'login-username';
const LOGIN_PASSWORD_TESTID = 'login-password';
const LOGIN_SUBMIT_TESTID = 'login-submit';
const INVENTORY_TITLE_TESTID = 'inventario-title';
const PRIVATE_USER_NAME_TESTID = 'private-user-name';
const USERS_TITLE_TESTID = 'usuarios-title';
const USER_LIST_TESTID = 'user-list';
const USER_ROW_ACTIONS_TESTID = 'user-row-actions';
const USER_ACTION_EDIT_TESTID = 'user-action-edit';
const USER_SHEET_TESTID = 'user-sheet';
const USER_FORM_END_SESSIONS_TESTID = 'user-form-end-sessions';
const END_USER_SESSIONS_DIALOG_TESTID = 'end-user-sessions-dialog';
const END_USER_SESSIONS_MESSAGE_TESTID = 'end-user-sessions-message';
const END_USER_SESSIONS_CONFIRM_TESTID = 'end-user-sessions-confirm';
const END_USER_SESSIONS_ERROR_TESTID = 'end-user-sessions-error';

/** El aviso del `<Toaster />` de sonner que ya monta el layout privado. */
const TOAST_SELECTOR = '[data-sonner-toast]';

type Credentials = { readonly username: string; readonly password: string };

/**
 * El termino con el que el administrador pide la lista: substring del nombre de usuario de los dos
 * fixtures, asi que la fila de la victima esta en la pagina que se visita.
 */
const SEARCH_TERM = `${FIXTURE_PREFIX}${RUN_ID}`;

const adminUser: Credentials = {
  username: `${SEARCH_TERM}_admin`,
  password: `Qc101-Admin-${RUN_ID.slice(0, 12)}`,
};

const victimUser: Credentials = {
  username: `${SEARCH_TERM}_victima`,
  password: `Qc101-Victima-${RUN_ID.slice(0, 12)}`,
};

/**
 * Nombre y apellido de la victima. El nombre lleva `RUN_ID` para que un verde no pueda estar mirando
 * a la victima del otro proyecto; por eso R19 se afirma sobre el aviso QUITANDO el nombre antes de
 * buscar digitos.
 */
const VICTIM_FIRST_NAMES = `Qc101${RUN_ID.slice(0, 8)}`;
const VICTIM_LAST_NAMES = 'Victima';
const VICTIM_DISPLAY_NAME = buildDisplayName(
  VICTIM_FIRST_NAMES,
  VICTIM_LAST_NAMES,
  victimUser.username,
);

/** Empresa efimera de este worker. NUNCA la de instalacion. */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;
let victimId: string | null = null;

async function createUserWithRole(
  user: Credentials,
  roleName: string,
  names: { readonly firstNames: string; readonly lastNames: string },
): Promise<string> {
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

  // Hash REAL: los dos logins pasan por bcrypt, el adaptador Prisma y la Server Action de verdad.
  const created = await prisma.user.create({
    data: {
      firstNames: names.firstNames,
      lastNames: names.lastNames,
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // QC-78 R1: explicito. La columna es `@default(pending)` y `pending` no entra por el login.
      // Ademas R7/R11: el control de cierre SOLO se ofrece sobre cuentas `active`.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Entra por el formulario real y aterriza donde le corresponde a ese usuario (QC-75 R11: el primer
 * item del menu que puede ver). El Administrador aterriza en `DASHBOARD_ROUTE`; el Operador, en
 * `INVENTORY_ROUTE`.
 */
async function login(page: Page, user: Credentials, landing: string): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId(LOGIN_USERNAME_TESTID).fill(user.username);
  await page.getByTestId(LOGIN_PASSWORD_TESTID).fill(user.password);
  await page.getByTestId(LOGIN_SUBMIT_TESTID).click();
  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });
}

/** URL de la lista, SIEMPRE derivada de `USERS_ROUTE`, con la busqueda del `RUN_ID` ya puesta. */
function usersUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${USERS_ROUTE}?${query.toString()}`;
}

/**
 * Cuenta las redirecciones de NAVEGACION que ocurren mientras corre `navegar`. Copiado de
 * `e2e/session.spec.ts` (QC-78 R29), con su razon:
 *
 * Solo `resourceType() === 'document'` y **sin 304**, y las dos exclusiones son a base de haber
 * fallado: `next dev` responde los chunks de `_next/static` con **304 Not Modified**, que cae de
 * lleno en el rango 300-399. Contar toda respuesta 3xx daba 15, 20 o 29 «redirecciones» de
 * JavaScript segun lo que el navegador tuviera ya en cache — y pasaba o fallaba por la cache, no
 * por el producto. Lo que se mide es cuantas veces rebota el DOCUMENTO, que es lo unico que el
 * usuario sufre.
 */
async function contarRedireccionesDeNavegacion(
  page: Page,
  navegar: () => Promise<void>,
): Promise<string[]> {
  const saltos: string[] = [];
  const contar = (respuesta: Response) => {
    const esDocumento = respuesta.request().resourceType() === 'document';
    const esRedireccion = respuesta.status() >= 300 && respuesta.status() < 400;
    if (esDocumento && esRedireccion && respuesta.status() !== 304) saltos.push(respuesta.url());
  };
  page.on('response', contar);
  try {
    await navegar();
  } finally {
    page.off('response', contar);
  }
  return saltos;
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc101_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas. El corte POR EDAD evita
  // llevarse lo que el otro proyecto acaba de crear.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR, {
    firstNames: `Qc101${RUN_ID.slice(0, 8)}`,
    lastNames: 'Administrador',
  });
  victimId = await createUserWithRole(victimUser, ROLE_OPERADOR, {
    firstNames: VICTIM_FIRST_NAMES,
    lastNames: VICTIM_LAST_NAMES,
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara, y **por los nombres
  // EXACTOS de ESTE worker**, nunca por `FIXTURE_PREFIX`: el otro proyecto corre a la vez con su
  // propio `RUN_ID`. Orden impuesto por las FK restrictivas: usuarios -> empresa.
  try {
    await prisma.user.deleteMany({
      where: { username: { in: [adminUser.username, victimUser.username] } },
    });
  } finally {
    try {
      await prisma.company.deleteMany({ where: { name: companyName } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

// Timeout amplio: es el E2E mas caro del repo (`design.md > 7`) —dos contextos, dos logins con
// bcrypt real y `next dev` compilando bajo demanda—. Un timeout corto produce rojos que no son del
// codigo.
test.setTimeout(180_000);

test.describe('cierre de sesiones de otra persona desde la pantalla', () => {
  test('el administrador cierra las sesiones de otra persona y esa persona acaba en el login', async ({
    browser,
  }) => {
    if (!victimId) throw new Error('la victima del fixture no existe: fallo el beforeAll');

    // Dos frascos de cookies INDEPENDIENTES: dos personas, dos sesiones vivas a la vez.
    const adminContext = await browser.newContext();
    const victimContext = await browser.newContext();

    try {
      const victimPage = await victimContext.newPage();
      const adminPage = await adminContext.newPage();

      // --- 1. LA VICTIMA ENTRA por el formulario real y aterriza en una pantalla privada. Esta es
      // la sesion viva que la ficha promete cortar.
      await login(victimPage, victimUser, INVENTORY_ROUTE);
      await expect(victimPage.getByTestId(INVENTORY_TITLE_TESTID)).toBeVisible({
        timeout: 60_000,
      });
      // Sin esto, el paso 5 no distinguiria «no hay sesion» de «nunca la hubo».
      expect(
        (await victimContext.cookies()).some((cookie) => cookie.name === SESSION_COOKIE_NAME),
        'no se emitio la cookie de sesion de la victima',
      ).toBe(true);

      // --- 2. EL ADMINISTRADOR ENTRA en SU contexto y abre la lista por URL derivada de
      // `USERS_ROUTE`, con la busqueda del `RUN_ID` ya puesta.
      await login(adminPage, adminUser, DASHBOARD_ROUTE);
      const listUrl = usersUrl(SEARCH_TERM);
      await adminPage.goto(listUrl);
      await expect(adminPage.getByTestId(USERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
      await expect(adminPage.getByTestId(USER_LIST_TESTID)).toBeVisible({ timeout: 60_000 });

      // --- 3. ABRE EL PANEL DE DETALLE de la victima con el disparador de edicion de SU fila,
      // localizada por el identificador que puso la base —nunca por posicion—.
      const victimRowActions = adminPage.locator(
        `[data-testid="${USER_ROW_ACTIONS_TESTID}"][data-user-id="${victimId}"]`,
      );
      await expect(victimRowActions).toHaveCount(1, { timeout: 60_000 });
      await victimRowActions.getByTestId(USER_ACTION_EDIT_TESTID).click();

      const sheet = adminPage.getByTestId(USER_SHEET_TESTID);
      await expect(sheet).toBeVisible({ timeout: 60_000 });

      // R7: sobre OTRA persona con la cuenta `active`, el control se ofrece, y su nombre accesible
      // incluye el nombre de esa persona. El panel pide la ficha con `getUserAction`, asi que el
      // control aparece cuando termina esa lectura.
      const endSessionsTrigger = sheet.getByTestId(USER_FORM_END_SESSIONS_TESTID);
      await expect(endSessionsTrigger).toBeVisible({ timeout: 60_000 });
      await expect(endSessionsTrigger).toHaveAccessibleName(
        new RegExp(VICTIM_DISPLAY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      await endSessionsTrigger.click();

      // --- 4. CONFIRMA EN EL DIALOGO. R9: la descripcion nombra a la persona.
      const dialog = adminPage.getByTestId(END_USER_SESSIONS_DIALOG_TESTID);
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await expect(dialog.getByTestId(END_USER_SESSIONS_MESSAGE_TESTID)).toContainText(
        VICTIM_DISPLAY_NAME,
      );

      // Quien cierra es, explicitamente, EL OTRO NAVEGADOR: ninguna escritura por Prisma aqui.
      await dialog.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID).click();

      // R13: con exito, el aviso por el `<Toaster />` del layout y el dialogo cerrado. Ningun
      // rechazo pintado dentro (R14) antes de que desaparezca.
      const successToast = adminPage.locator(TOAST_SELECTOR).filter({
        hasText: VICTIM_DISPLAY_NAME,
      });
      await expect(successToast).toHaveCount(1, { timeout: 60_000 });
      await expect(successToast).toBeVisible();
      await expect(adminPage.getByTestId(END_USER_SESSIONS_ERROR_TESTID)).toHaveCount(0);
      await expect(dialog).toHaveCount(0, { timeout: 60_000 });

      // R19: el aviso no promete ningun numero. El nombre de la victima lleva el `RUN_ID`, que tiene
      // digitos, asi que se QUITA antes de buscarlos: lo que queda es solo el copy del aviso.
      const toastText = (await successToast.textContent()) ?? '';
      const toastWithoutName = toastText.split(VICTIM_DISPLAY_NAME).join('');
      expect(
        toastWithoutName,
        `el aviso de exito no puede afirmar cuantas sesiones se cerraron: «${toastText}»`,
      ).not.toMatch(/\d/);

      // --- 5. LA VICTIMA NAVEGA DE NUEVO en SU contexto y acaba en el login (R17). Se vuelve a
      // pedir `INVENTORY_ROUTE` —una peticion NUEVA con la MISMA cookie—, que es la ruta privada que
      // su rol si puede ver: un 404 por permiso se confundiria con el corte.
      //
      // Se cuentan las redirecciones ANTES de navegar: es lo unico que distingue «acaba en el
      // login» de «acaba en el login despues de rebotar». Sin esto, un bucle de 19 saltos pasaria.
      const redirecciones = await contarRedireccionesDeNavegacion(victimPage, async () => {
        await victimPage.goto(INVENTORY_ROUTE);
        await victimPage.waitForURL((url) => url.pathname === LOGIN_ROUTE, { timeout: 60_000 });
      });

      expect(
        redirecciones,
        `la salida al login debe costar UNA redireccion y costo ${redirecciones.length}: ${redirecciones.join(' -> ')}`,
      ).toHaveLength(1);

      // No llego a ver NADA privado.
      await expect(victimPage.getByTestId(INVENTORY_TITLE_TESTID)).toHaveCount(0);
      await expect(victimPage.getByTestId(PRIVATE_USER_NAME_TESTID)).toHaveCount(0);
      await expect(victimPage.getByTestId(LOGIN_FORM_TESTID)).toBeVisible({ timeout: 60_000 });

      // LO QUE ESTE E2E NO AFIRMA (`design.md > 5`): nada sobre el borrado de la cookie de la
      // victima. La cookie NO se borra: el corte lo hace la relectura del sello
      // `sessions_valid_from` en cada peticion (`resolve-session.ts`, corte 7), decision ya fijada
      // en `e2e/session.spec.ts` para los cortes por estado y por baja. Afirmar que se borra seria
      // falso; afirmar que sigue fijaria aqui un detalle de transporte que esta ficha no decide.
      // Tampoco afirma cuantas sesiones se cerraron: el sistema no lo sabe (R19).

      // --- 6. LA SESION DEL ADMINISTRADOR SIGUE VIVA: cerrar las de otro no cierra las propias.
      // Sin esto el recorrido no distinguiria «se corto a quien tocaba» de «se corto a todo el mundo».
      await adminPage.goto(listUrl);
      await expect(adminPage.getByTestId(USERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
      await expect(adminPage.getByTestId(USER_LIST_TESTID)).toBeVisible({ timeout: 60_000 });
      expect(
        new URL(adminPage.url()).pathname,
        'la sesion del administrador no debe acabar en el login',
      ).toBe(USERS_ROUTE);
      await expect(adminPage.getByTestId(LOGIN_FORM_TESTID)).toHaveCount(0);
    } finally {
      await adminContext.close();
      await victimContext.close();
    }
  });
});
