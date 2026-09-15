/**
 * E2E del flujo de autenticacion (QC-7, T12; `design.md > 7` nivel 4).
 *
 * Que aporta sobre lo que ya cubren unit e integracion: el navegador de verdad. Aqui se
 * ejercita la cadena completa —formulario real, Server Action, redireccion y cookie emitida
 * por el servidor— en Chromium y en WebKit (el motor de iOS), que es donde una cookie
 * `httpOnly`/`SameSite` puede comportarse distinto sin que ningun test de Node lo note.
 *
 * DATOS (R21): este spec NO usa el seed de QC-6 —que sigue `pending`— ni ningun dato
 * preexistente. Crea su propio rol y sus propios usuarios con `username` aleatorio y hash
 * real, y los borra al final. Asi el camino feliz se puede demostrar sin acoplar la feature
 * a datos que otra pueda cambiar. El `documentTypeCode: 'CC'` es la unica fila ajena de la
 * que depende, y la inserta la migracion de QC-4.
 *
 * UN USUARIO POR TEST: el camino de error suma uno a `failed_login_attempts` del usuario que
 * usa. Compartir el usuario entre los dos tests significa que, con `fullyParallel` y
 * `retries: 2` en CI, las repeticiones del camino de error pueden llegar a 5 y BLOQUEAR la
 * cuenta, volviendo rojo el camino feliz por una razon que no es un fallo del login. Se
 * descarto resetear los contadores en un `beforeEach` porque con `fullyParallel` los dos
 * tests de este archivo pueden correr a la vez en workers distintos del MISMO proyecto: el
 * reset de uno pisaria el estado del otro. Un usuario por test es lo unico que aisla de
 * verdad.
 *
 * AISLAMIENTO ENTRE PROYECTOS Y WORKERS: `RUN_ID` se calcula al cargar el modulo, o sea una
 * vez por PROCESO de worker, y va dentro del `username`, del correo, del documento y del
 * nombre del rol —los tres indices unicos de `users` y el `name` unico de `roles` son
 * globales—. Cada ejecucion crea y borra solo lo suyo.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse (igual que en los tests de integracion), y `next dev` —que arranca el `webServer`
 * de la config— carga el suyo, incluido `SESSION_SECRET`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

// La UNICA definicion de «mismo nombre de empresa» (QC-47 R3), del contrato publico
// del modulo: `companies.name_normalized` se calcula con esta y con ninguna otra.
import { normalizeCompanyName, type UserAccountStatus } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
// El nombre de la cookie lo declara el codec del valor de sesion (QC-9 T4), no el adaptador de
// transporte: un solo dueño por simbolo.
import { SESSION_COOKIE_NAME } from '@/lib/modules/identity/adapters/driven/session/session-token';
import { GENERIC_CREDENTIALS_ERROR } from '@/lib/modules/identity/adapters/driving/login-form-state';
import { prisma } from '@/lib/shared/db/prisma';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand, permissionsForUsername } from './helpers/landing';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/**
 * La sonda de QC-93 R18: los `data-testid` de DATOS (titulo, tabla, filas, lista y estado vacio) de
 * inventario, recetas, pedidos, proveedores, unidades, presentaciones y usuarios. Existe para que
 * «quien no tiene ningun permiso no ve nada» sea algo que alguien nota: si uno solo aparece ante
 * ese usuario, es un AGUJERO REAL de permisos —se para y se abre ficha, no se arregla en un test—.
 *
 * No hay ninguno inventado: cada uno sale de una comprobacion de cuenta cero que ya hace el E2E de
 * su modulo (`e2e/<modulo>.spec.ts`) y esta confirmado en `app/`/`components/`.
 */
const MODULE_DATA_TESTIDS = [
  // e2e/inventario.spec.ts
  'inventario-title',
  'data-table',
  'product-list-empty',
  // e2e/recetas.spec.ts
  'recipes-title',
  'recipe-table',
  'recipe-list-empty',
  // e2e/pedidos.spec.ts
  'pedidos-title',
  'order-list',
  'order-list-empty',
  // e2e/proveedores.spec.ts
  'proveedores-title',
  'supplier-table',
  'supplier-row',
  'supplier-list',
  'supplier-list-empty',
  // e2e/unidades.spec.ts
  'unidades-title',
  'unit-list',
  'unit-list-empty',
  // e2e/presentaciones.spec.ts
  'presentaciones-title',
  'presentation-list',
  'presentation-list-empty',
  // e2e/usuarios.spec.ts
  'usuarios-title',
  'user-list',
  'user-list-empty',
] as const;

/** Prefijos con los que este spec marca TODO lo que crea. Nada fuera de ellos se toca. */
const USERNAME_PREFIX = 'qc7_e2e_';
const ROLE_NAME_PREFIX = 'qc7_e2e_rol_';
/**
 * Prefijo de la empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria,
 * asi que el fixture necesita su propia empresa. NUNCA la de instalacion: el indice
 * `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa del seed.
 */
const COMPANY_NAME_PREFIX = 'qc7_e2e_empresa_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestros prefijos. Chromium y WebKit
 * corren a la vez, asi que la limpieza defensiva NO puede borrar por prefijo a secas: se
 * llevaria por delante el usuario que el otro proyecto acaba de crear. Una hora deja fuera
 * cualquier ejecucion viva y dentro cualquier resto de una ejecucion anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

let roleId: string | null = null;
let companyId: string | null = null;
/** Empresa efimera que nace ya dada de baja (QC-48 R3): sirve al caso de la empresa no viva. */
let deletedCompanyId: string | null = null;

/**
 * Estado de cuenta con el que nace el usuario del fixture y, si el caso lo pide, el plazo de
 * bloqueo. Desde QC-78 el estado manda en el login (R1), y la columna tiene `@default(pending)`
 * en `db/schema.prisma`: por eso TODO usuario que deba poder entrar lo lleva EXPLICITO.
 */
type AccountState = { accountStatus: UserAccountStatus; lockedUntil?: Date };

/** Lo que necesita un usuario para poder entrar. Nunca implicito: el default de la columna no lo es. */
const ACTIVE_ACCOUNT: AccountState = { accountStatus: 'active' };

/**
 * Crea un usuario propio del test que lo pide. `label` distingue los usuarios dentro del
 * mismo worker; `RUN_ID` los distingue entre workers y proyectos. `targetCompanyId` solo lo
 * pasa el caso de la empresa dada de baja (QC-48 R3); por defecto se usa la empresa viva.
 * `accountState` solo lo pasan los casos de QC-78 R28: el resto nace `active` a proposito.
 */
async function createTestUser(
  label: string,
  targetCompanyId: string | null = companyId,
  accountState: AccountState = ACTIVE_ACCOUNT,
): Promise<{ username: string; password: string }> {
  if (!roleId) throw new Error('el rol del fixture no existe: fallo el beforeAll');
  if (!targetCompanyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const suffix = `${RUN_ID}${label}`;
  const username = `${USERNAME_PREFIX}${suffix}`;
  /** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
  const password = `Qc7-E2E-${suffix.slice(0, 12)}`;

  // Hash REAL: el objetivo del E2E es que bcrypt, el adaptador Prisma y la Server Action se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames: 'Usuario',
      lastNames: 'De Prueba E2E',
      birthDate: new Date('1990-01-01'),
      email: `${USERNAME_PREFIX}${suffix}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc7${suffix}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId,
      companyId: targetCompanyId,
      // EXPLICITO siempre, incluido el `active` del camino feliz: la columna tiene
      // `@default(pending)` y desde QC-78 (R1) un usuario `pending` no entra. Confiar en el
      // default dejaria en rojo el camino feliz de este mismo archivo.
      accountStatus: accountState.accountStatus,
      lockedUntil: accountState.lockedUntil ?? null,
    },
    select: { id: true },
  });

  return { username, password };
}

/**
 * Las cuatro columnas que un intento de login PODRIA tocar. R6 exige que el rechazo por estado
 * `pending`/`inactive` no escriba ninguna: se leen antes y despues del intento y se comparan.
 */
async function readLockColumns(username: string) {
  // `findFirst` y no `findUnique`: `users.username` NO es un unico de Prisma —la unicidad la
  // impone el indice parcial `users_username_unique` en SQL—, asi que el cliente no ofrece
  // `where: { username }` como clave unica.
  return prisma.user.findFirstOrThrow({
    where: { username },
    select: {
      failedLoginAttempts: true,
      lockLevel: true,
      lockedUntil: true,
      accountStatus: true,
    },
  });
}

/**
 * Hace un intento de login por el formulario real y devuelve el texto EXACTO que el navegador
 * acaba mostrando. Devolver el texto —y no afirmarlo aqui— es lo que permite al caso de R28
 * comparar dos mensajes OBSERVADOS entre si, en vez de comparar cada uno con un literal copiado.
 */
async function attemptLogin(
  page: Page,
  username: string,
  password: string,
): Promise<string> {
  await page.goto(LOGIN_PATH);

  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();

  // El aviso llega en un toast de sonner. Se localiza por su atributo estructural, NO por su
  // texto: localizarlo por el texto esperado convertiria la comparacion posterior en una
  // tautologia (encontrariamos solo lo que ya damos por bueno).
  const toast = page.locator('[data-sonner-toast]').first();
  await expect(toast).toBeVisible({ timeout: 60_000 });

  return ((await toast.textContent()) ?? '').trim();
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS. Existe porque un `pnpm run e2e` interrumpido a media
  // ejecucion (p. ej. por falta de disco) deja usuarios y roles `qc7_e2e_*` en la base, y esa
  // basura pone rojo un test de OTRA feature —`identity-constraints.int.test.ts` afirma
  // `user.count() === 0`—: media hora para entender un rojo que no es del codigo.
  // Usuarios antes que roles por la FK `users.role_id` (`onDelete: Restrict`). El veto al
  // borrado fisico de `docs/architecture.md > Anti-patrones` habla del codigo de produccion;
  // esto es un fixture de test y borra solo filas propias, por prefijo y con edad minima.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // El corte de edad NO se puede aplicar por igual a las dos tablas: el rol se crea unos
  // segundos ANTES que su usuario, asi que hay una ventana de esos pocos segundos en la que el
  // rol huerfano ya es "viejo" y su usuario todavia no. Borrar entonces el rol chocaria con la
  // FK `users.role_id` (`onDelete: Restrict`), el `deleteMany` lanzaria DENTRO del `beforeAll`
  // y el spec entero se pondria rojo por la limpieza y no por el login: exactamente el rojo
  // confuso que este barrido venia a evitar.
  // Por eso se decide primero QUE roles se van a borrar, y se borran sus usuarios aunque sean
  // recientes. Se descarto envolver el borrado de roles en un `try`/`catch`: eso evitaria el
  // rojo del E2E, pero dejaria vivos el rol y —peor— el usuario huerfano hasta la siguiente
  // ejecucion, y un usuario huerfano es justo lo que pone rojo a `identity-constraints.int.test.ts`
  // (`user.count() === 0`). Se cambiaria un rojo confuso por otro en otra feature.
  const orphanRoles = await prisma.role.findMany({
    where: { name: { startsWith: ROLE_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRoleIds = orphanRoles.map((role) => role.id);

  // Lo mismo, y por la misma razon, con la empresa efimera: se crea unos segundos ANTES que su
  // usuario, y `users.company_id` tambien es `onDelete: Restrict`. Se decide primero CUALES se
  // van a borrar y se arrastran sus usuarios aunque todavia sean recientes.
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  // El prefijo propio sigue siendo condicion en AMBAS ramas del `OR`: ampliar el barrido a los
  // usuarios de los roles condenados no puede convertirse en una puerta para tocar filas ajenas.
  // Antes, las sesiones cerradas de EXACTAMENTE esos usuarios (mismo `where`, via la relacion):
  // `revoked_sessions.user_id` es `onDelete: Restrict` (QC-23) y el caso de QC-93 cierra sesion.
  await prisma.revokedSession.deleteMany({
    where: {
      user: {
        username: { startsWith: USERNAME_PREFIX },
        OR: [
          { createdAt: { lt: orphanCutoff } },
          { roleId: { in: orphanRoleIds } },
          { companyId: { in: orphanCompanyIds } },
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      username: { startsWith: USERNAME_PREFIX },
      OR: [
        { createdAt: { lt: orphanCutoff } },
        { roleId: { in: orphanRoleIds } },
        { companyId: { in: orphanCompanyIds } },
      ],
    },
  });
  await prisma.role.deleteMany({ where: { id: { in: orphanRoleIds } } });
  await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });

  // El rol si se comparte entre los dos tests: ningun intento de login lo muta.
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${RUN_ID}`,
      description: 'Rol efimero del E2E de login (QC-7). Se borra en afterAll.',
    },
    select: { id: true },
  });
  roleId = role.id;

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, no de
  // una copia escrita a mano: es la UNICA definicion (QC-47 R3).
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;

  // La segunda empresa nace YA dada de baja (QC-48 R3). Puede compartir el mismo nombre base
  // que la viva porque `companies_name_unique` es PARCIAL —`WHERE deleted_at IS NULL`—, o sea
  // que una empresa muerta no ocupa nombre; aun asi lleva sufijo propio para que el barrido de
  // huerfanos por `COMPANY_NAME_PREFIX` la alcance y para no confundirlas al leer la base.
  const deletedCompanyName = `${COMPANY_NAME_PREFIX}${RUN_ID}_baja`;
  const deletedCompany = await prisma.company.create({
    data: {
      name: deletedCompanyName,
      nameNormalized: normalizeCompanyName(deletedCompanyName),
      deletedAt: new Date(),
    },
    select: { id: true },
  });
  deletedCompanyId = deletedCompany.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: por eso se
  // borra por prefijo de `RUN_ID` (no por ids acumulados en memoria) y cada paso va en su
  // propio `try`/`catch`, para que un fallo al borrar usuarios no impida borrar el rol ni
  // cerrar la conexion. Usuarios primero: la FK `users.role_id` es `onDelete: Restrict`.
  // Y antes que los usuarios, sus sesiones cerradas: `revoked_sessions.user_id` es
  // `onDelete: Restrict` (QC-23) y el caso de QC-93 cierra sesion.
  try {
    await prisma.revokedSession.deleteMany({
      where: { user: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } } },
    });
  } catch {
    // se intenta borrar los usuarios igualmente
  }
  try {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
    });
  } catch {
    // se intenta borrar el rol igualmente
  }
  try {
    await prisma.role.deleteMany({ where: { name: `${ROLE_NAME_PREFIX}${RUN_ID}` } });
  } catch {
    // se borra la empresa igualmente
  }
  // Las empresas, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict` (QC-47 R11).
  // `startsWith` y no igualdad exacta porque este worker crea DOS: la viva y la dada de baja
  // (QC-48 R3), y las dos empiezan por `${COMPANY_NAME_PREFIX}${RUN_ID}`.
  try {
    await prisma.company.deleteMany({
      where: { name: { startsWith: `${COMPANY_NAME_PREFIX}${RUN_ID}` } },
    });
  } catch {
    // se cierra la conexion igualmente
  }
  await prisma.$disconnect();
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt
// con coste 10 tarda a proposito. Un timeout corto aqui produce rojos que no son del codigo.
test.setTimeout(120_000);

test.describe('login en navegador real', () => {
  test('entra con credenciales correctas y recibe la cookie de sesion httpOnly', async ({
    page,
    context,
  }) => {
    // Cubre R1 (autentica), R19 (destino) y R9 (cookie httpOnly) en navegador real.
    const user = await createTestUser('ok');

    // Se espera por la RUTA, no por contenido de la pagina: lo que R19 exige es el destino, y lo
    // que R9 exige es la cookie; ninguno de los dos dice nada de lo que se pinte alli. El destino
    // lo deriva el helper unico de los permisos del usuario (QC-93 R8): el rol efimero de este
    // archivo no tiene ninguno, asi que es el respaldo del login, pero no se escribe aqui.
    await loginAndLand(page, user);

    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );

    expect(sessionCookie, 'no se emitio la cookie de sesion').toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  test('sin ningun permiso de modulo entra al destino derivado, ve el 404 dentro del layout privado sin un solo dato de modulo y puede cerrar sesion sin volver atras (QC-93 R14-R18)', async ({
    page,
  }) => {
    // Usuario del rol efimero de este archivo, que nace SIN permisos (ver `beforeAll`).
    const user = await createTestUser('sinperm');

    // La premisa, dicha en voz alta: si algun dia el rol efimero ganara un permiso, este caso
    // dejaria de ejercitar lo que dice y tiene que romper aqui, no pasar en verde por otro camino.
    expect(await permissionsForUsername(user.username)).toEqual([]);

    // --- 1. R15: aterriza en el destino DERIVADO de sus permisos (por R3, el respaldo del login),
    // que el helper calcula con las funciones de produccion. No se escribe la ruta a mano.
    const landing = await loginAndLand(page, user);
    expect(new URL(page.url()).pathname).toBe(landing);

    // --- 2. R16: el 404 se pinta DENTRO del layout privado, con su menu y su salida.
    await expect(page.getByTestId('private-not-found')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('private-nav')).toBeAttached();
    const logout = page.getByTestId('private-logout');
    await expect(logout).toBeVisible();

    // --- 3. R18, la sonda: ni un dato de ningun modulo llega al navegador.
    for (const testId of MODULE_DATA_TESTIDS) {
      await expect(
        page.getByTestId(testId),
        `«${testId}» visible sin permisos: agujero real de permisos (QC-93 R18)`,
      ).toHaveCount(0);
    }

    // --- 4. R17: cerrar sesion lleva al login, y volver atras no devuelve a la zona privada.
    // Por TECLADO y no con `click()`: en la pantalla de 404 el overlay de `next dev` intercepta el
    // puntero en WebKit. Motivo completo en `e2e/permisos.spec.ts` (el bloque «POR QUE POR TECLADO»).
    await logout.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });

    // Mismo gesto que `e2e/session.spec.ts`: si el navegador restaurara la pagina privada desde su
    // cache, la URL no volveria al login y este `waitForURL` fallaria diciendo justo eso.
    await page.goBack();
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    await expect(page.getByTestId('private-not-found')).toHaveCount(0);
    await expect(page.getByTestId('private-nav')).toHaveCount(0);
    await expect(page.getByTestId('private-logout')).toHaveCount(0);
  });

  test('con credenciales incorrectas se queda en el login, avisa y no emite sesion', async ({
    page,
    context,
  }) => {
    // Cubre R2 (mensaje generico, sin decir que campo fallo) y R14 (ningun fallo emite sesion).
    // Usuario propio: este test gasta un intento fallido, y con reintentos en CI no debe
    // acercar al bloqueo por 5 intentos a ningun usuario que otro test necesite sano.
    const { username, password } = await createTestUser('ko');

    await page.goto(LOGIN_PATH);

    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(`${password}-incorrecta`);
    await page.getByTestId('login-submit').click();

    // El mensaje se afirma contra la constante exportada, nunca contra el literal: si la copy
    // cambia, cambia en un sitio. Llega en un toast, asi que se espera a que sea visible.
    await expect(page.getByText(GENERIC_CREDENTIALS_ERROR)).toBeVisible({ timeout: 60_000 });

    expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);

    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookie, 'un intento fallido no debe emitir cookie de sesion').toBeUndefined();
  });

  test('con la empresa dada de baja no entra pese a tener las credenciales correctas', async ({
    page,
    context,
  }) => {
    // Cubre QC-48 R3 y R27 en navegador real: la contrasena es la BUENA, y aun asi el login
    // rechaza porque la empresa de esa persona no esta viva. El rechazo es el generico de
    // siempre, asi que desde fuera este caso no se distingue de una contrasena incorrecta.
    const { username, password } = await createTestUser('baja', deletedCompanyId);

    await page.goto(LOGIN_PATH);

    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    // Misma constante exportada que usa el caso de credenciales incorrectas: si los dos mensajes
    // dejaran de ser el mismo, este test dejaria de pasar — que es justo lo que R3 pide afirmar.
    await expect(page.getByText(GENERIC_CREDENTIALS_ERROR)).toBeVisible({ timeout: 60_000 });

    expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);

    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookie, 'una empresa no viva no debe emitir cookie de sesion').toBeUndefined();
  });

  test('una cuenta que no esta activa ve el MISMO mensaje que una contrasena mala, no recibe sesion y no deja rastro', async ({
    page,
    context,
  }) => {
    // Cubre QC-78 R28 (a), y con el R1, R3, R4, R5 y R6 en navegador real.
    //
    // La contrasena que se usa contra las cuentas no activas es la BUENA: lo que se demuestra es
    // que ni siquiera la credencial correcta abre la puerta cuando el estado efectivo no es
    // `active`, no que una contrasena mala falle (eso ya lo cubre el test de arriba).
    //
    // Un usuario POR ESTADO, todos con el prefijo de este spec: compartir usuario entre casos es
    // justo lo que la cabecera de este archivo descarta con `fullyParallel` y `retries`.
    const pendingUser = await createTestUser('pend', companyId, { accountStatus: 'pending' });
    const inactiveUser = await createTestUser('inac', companyId, { accountStatus: 'inactive' });
    // `blocked` con plazo FUTURO: es el bloqueo automatico de QC-19 tal y como QC-78 lo unifica
    // (R10). Una hora por delante deja el plazo vigente durante toda la ejecucion.
    const blockedUser = await createTestUser('bloq', companyId, {
      accountStatus: 'blocked',
      lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Estado ANTES del intento, para las dos cuentas cuyo rechazo no debe escribir nada (R6).
    const pendingBefore = await readLockColumns(pendingUser.username);
    const inactiveBefore = await readLockColumns(inactiveUser.username);

    // --- 1. El mensaje de referencia: el que ve QUIEN SE EQUIVOCA DE CONTRASENA. Se OBSERVA en
    // la pantalla, no se copia de ningun sitio: es el patron con el que se comparan los demas.
    const wrongPasswordUser = await createTestUser('r28ko');
    const wrongPasswordMessage = await attemptLogin(
      page,
      wrongPasswordUser.username,
      `${wrongPasswordUser.password}-incorrecta`,
    );

    // Ancla, no asercion central: amarra el texto observado a la constante exportada para que un
    // toast ajeno (uno de otro origen) no pueda hacerse pasar por el aviso de credenciales.
    expect(wrongPasswordMessage).toContain(GENERIC_CREDENTIALS_ERROR);

    // --- 2. Los tres estados no activos, con la contrasena CORRECTA.
    for (const { label, user } of [
      { label: 'pending', user: pendingUser },
      { label: 'inactive', user: inactiveUser },
      { label: 'blocked', user: blockedUser },
    ]) {
      const message = await attemptLogin(page, user.username, user.password);

      // LA ASERCION CENTRAL DE R28 (a): igualdad entre DOS textos observados en el navegador. Si
      // algun dia el rechazo por estado dijera algo aunque fuera minimamente distinto —una coma,
      // un «tu cuenta esta...»—, esto se pone rojo, que es exactamente lo que R3 pide vigilar.
      expect(message, `el estado '${label}' no puede verse distinto de una contrasena mala`).toBe(
        wrongPasswordMessage,
      );

      expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);

      const sessionCookie = (await context.cookies()).find(
        (cookie) => cookie.name === SESSION_COOKIE_NAME,
      );
      expect(
        sessionCookie,
        `el estado '${label}' no debe emitir cookie de sesion (R4)`,
      ).toBeUndefined();
    }

    // --- 3. El intento no dejo rastro en `pending` ni en `inactive` (R5, R6): el corte por estado
    // ocurre ANTES de registrar el fallo, asi que las cuatro columnas siguen como estaban. No se
    // comprueba sobre `blocked` a proposito: ese caso si toca el camino de la politica de intentos.
    expect(
      await readLockColumns(pendingUser.username),
      'un rechazo por estado pending no debe escribir nada en la fila',
    ).toEqual(pendingBefore);
    expect(
      await readLockColumns(inactiveUser.username),
      'un rechazo por estado inactive no debe escribir nada en la fila',
    ).toEqual(inactiveBefore);
  });
});
