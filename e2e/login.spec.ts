/**
 * E2E del flujo de autenticacion (QC-7, T12; `design.md > 7` nivel 4).
 *
 * Que aporta sobre lo que ya cubren unit e integracion: el navegador de verdad. Aqui se
 * ejercita la cadena completa —formulario real, Server Action, redireccion y cookie emitida
 * por el servidor— en Chromium y en WebKit (el motor de iOS), que es donde una cookie
 * `httpOnly`/`SameSite` puede comportarse distinto sin que ningun test de Node lo note.
 *
 * DATOS (R21): este spec NO usa el seed de QC-6 —que sigue `pending`— ni ningun dato
 * preexistente. Crea su propio rol, su propia EMPRESA y sus propios usuarios con `username`
 * aleatorio y hash real, y los borra al final. Asi el camino feliz se puede demostrar sin
 * acoplar la feature a datos que otra pueda cambiar. El `documentTypeCode: 'CC'` es la unica
 * fila ajena de la que depende, y la inserta la migracion de QC-4.
 *
 * QC-47 (R14, R17): el rol dejo de ser una columna de `users` y vive en `memberships`, y una
 * persona SIN pertenencia no puede entrar —el login la trata como no encontrada—. Por eso el
 * fixture siembra ademas una empresa propia y la pertenencia que une usuario, empresa y rol.
 * La empresa es del TEST, nunca la de instalacion, para no chocar con el seed (R4).
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

import { expect, test } from '@playwright/test';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
// El nombre de la cookie lo declara el codec del valor de sesion (QC-9 T4), no el adaptador de
// transporte: un solo dueño por simbolo.
import { SESSION_COOKIE_NAME } from '@/lib/modules/identity/adapters/driven/session/session-token';
import { GENERIC_CREDENTIALS_ERROR } from '@/lib/modules/identity/adapters/driving/login-form-state';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/** Prefijos con los que este spec marca TODO lo que crea. Nada fuera de ellos se toca. */
const USERNAME_PREFIX = 'qc7_e2e_';
const ROLE_NAME_PREFIX = 'qc7_e2e_rol_';
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

/**
 * Crea un usuario propio del test que lo pide. `label` distingue los usuarios dentro del
 * mismo worker; `RUN_ID` los distingue entre workers y proyectos.
 */
async function createTestUser(label: string): Promise<{ username: string; password: string }> {
  if (!roleId) throw new Error('el rol del fixture no existe: fallo el beforeAll');
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

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
      // QC-47 (R17): sin pertenencia el login trataria a esta persona como no encontrada.
      memberships: { create: { companyId, roleId } },
    },
    select: { id: true },
  });

  return { username, password };
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS. Existe porque un `pnpm run e2e` interrumpido a media
  // ejecucion (p. ej. por falta de disco) deja usuarios y roles `qc7_e2e_*` en la base, y esa
  // basura pone rojo un test de OTRA feature —`identity-constraints.int.test.ts` afirma
  // `user.count() === 0`—: media hora para entender un rojo que no es del codigo.
  // Pertenencias antes que usuarios, y usuarios antes que roles y empresas: las tres FK de
  // `memberships` son `onDelete: Restrict` (QC-47 R11). El veto al
  // borrado fisico de `docs/architecture.md > Anti-patrones` habla del codigo de produccion;
  // esto es un fixture de test y borra solo filas propias, por prefijo y con edad minima.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // El corte de edad NO se puede aplicar por igual a todas las tablas: el rol y la empresa se
  // crean unos segundos ANTES que su usuario, asi que hay una ventana de esos pocos segundos en
  // la que el rol huerfano ya es "viejo" y su usuario todavia no. Borrar entonces el rol o la
  // empresa chocaria con las FK `memberships_role_id_fkey` / `memberships_company_id_fkey`
  // (`onDelete: Restrict`), el `deleteMany` lanzaria DENTRO del `beforeAll` y el spec entero se
  // pondria rojo por la limpieza y no por el login: exactamente el rojo confuso que este barrido
  // venia a evitar.
  // Por eso se decide primero QUE roles y QUE empresas se van a borrar, y se borran sus usuarios
  // aunque sean recientes. Se descarto envolver esos borrados en un `try`/`catch`: eso evitaria
  // el rojo del E2E, pero dejaria vivos el rol y —peor— el usuario huerfano hasta la siguiente
  // ejecucion, y un usuario huerfano es justo lo que pone rojo a `identity-constraints.int.test.ts`
  // (`user.count() === 0`). Se cambiaria un rojo confuso por otro en otra feature.
  const orphanRoles = await prisma.role.findMany({
    where: { name: { startsWith: ROLE_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRoleIds = orphanRoles.map((role) => role.id);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);

  // El prefijo propio sigue siendo condicion en TODAS las ramas del `OR`: ampliar el barrido a
  // los usuarios de los roles y las empresas condenados no puede convertirse en una puerta para
  // tocar filas ajenas. QC-47: el rol ya no esta en `users`, asi que la condena se lee por la
  // pertenencia.
  const orphanUsers = await prisma.user.findMany({
    where: {
      username: { startsWith: USERNAME_PREFIX },
      OR: [
        { createdAt: { lt: orphanCutoff } },
        { memberships: { some: { roleId: { in: orphanRoleIds } } } },
        { memberships: { some: { companyId: { in: orphanCompanyIds } } } },
      ],
    },
    select: { id: true },
  });
  const orphanUserIds = orphanUsers.map((user) => user.id);

  await prisma.membership.deleteMany({ where: { userId: { in: orphanUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: orphanUserIds } } });
  await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  await prisma.role.deleteMany({ where: { id: { in: orphanRoleIds } } });

  // El rol si se comparte entre los dos tests: ningun intento de login lo muta.
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${RUN_ID}`,
      description: 'Rol efimero del E2E de login (QC-7). Se borra en afterAll.',
    },
    select: { id: true },
  });
  roleId = role.id;

  // La empresa se comparte igual que el rol, y por la misma razon. Nombre PROPIO del spec: el
  // indice unico de `companies` es global, y usar el de instalacion chocaria con el seed (R4).
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: por eso se
  // borra por prefijo de `RUN_ID` (no por ids acumulados en memoria) y cada paso va en su
  // propio `try`/`catch`, para que un fallo al borrar usuarios no impida borrar el rol ni
  // cerrar la conexion. El orden lo mandan las tres FK `Restrict` de `memberships` (QC-47 R11):
  // pertenencias, usuarios y solo entonces empresa y rol.
  try {
    const users = await prisma.user.findMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } catch {
    // se intenta borrar la empresa y el rol igualmente
  }
  try {
    await prisma.company.deleteMany({ where: { name: `${COMPANY_NAME_PREFIX}${RUN_ID}` } });
  } catch {
    // se intenta borrar el rol igualmente
  }
  try {
    await prisma.role.deleteMany({ where: { name: `${ROLE_NAME_PREFIX}${RUN_ID}` } });
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
    const { username, password } = await createTestUser('ok');

    await page.goto(LOGIN_PATH);

    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    // Se espera por la RUTA, no por contenido de la pagina: QC-12 esta `pending` y hoy
    // `/dashboard` devuelve 404. Eso no invalida el test — lo que R19 exige es el destino, y
    // lo que R9 exige es la cookie; ninguno de los dos dice nada de lo que se pinte alli.
    await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });

    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );

    expect(sessionCookie, 'no se emitio la cookie de sesion').toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
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
});
