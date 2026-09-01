/**
 * E2E del flujo de autenticacion (QC-7, T12; `design.md > 7` nivel 4).
 *
 * Que aporta sobre lo que ya cubren unit e integracion: el navegador de verdad. Aqui se
 * ejercita la cadena completa —formulario real, Server Action, redireccion y cookie emitida
 * por el servidor— en Chromium y en WebKit (el motor de iOS), que es donde una cookie
 * `httpOnly`/`SameSite` puede comportarse distinto sin que ningun test de Node lo note.
 *
 * DATOS (R21): este spec NO usa el seed de QC-6 —que sigue `pending`— ni ningun dato
 * preexistente. Crea su propio rol y su propio usuario con `username` aleatorio y hash real,
 * y los borra al final. Asi el camino feliz se puede demostrar sin acoplar la feature a datos
 * que otra pueda cambiar. El `documentTypeCode: 'CC'` es la unica fila ajena de la que
 * depende, y la inserta la migracion de QC-4.
 *
 * AISLAMIENTO ENTRE PROYECTOS: `playwright.config.ts` corre este archivo una vez por proyecto
 * (chromium y webkit) y con `fullyParallel` puede repartir sus tests en varios workers. El
 * sufijo aleatorio se calcula al cargar el modulo, o sea una vez por PROCESO de worker, de
 * modo que cada ejecucion tiene su propio usuario y ninguna pisa a la otra ni al borrar.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse (igual que en los tests de integracion), y `next dev` —que arranca el `webServer`
 * de la config— carga el suyo, incluido `SESSION_SECRET`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { SESSION_COOKIE_NAME } from '@/lib/modules/identity/adapters/driven/session/session-cookie';
import { GENERIC_CREDENTIALS_ERROR } from '@/lib/modules/identity/adapters/driving/login-form-state';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/**
 * Sufijo unico de esta ejecucion. Se usa en el nombre de usuario, el correo, el documento y
 * el nombre del rol: los tres indices unicos de `users` y el `name` unico de `roles` son
 * globales, asi que sin sufijo dos ejecuciones simultaneas chocarian.
 */
const suffix = randomUUID().replace(/-/g, '');

const username = `qc7_e2e_${suffix}`;
/** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
const password = `Qc7-E2E-${suffix.slice(0, 12)}`;

let userId: string | null = null;
let roleId: string | null = null;

test.beforeAll(async () => {
  const role = await prisma.role.create({
    data: {
      name: `qc7_e2e_rol_${suffix}`,
      description: 'Rol efimero del E2E de login (QC-7). Se borra en afterAll.',
    },
    select: { id: true },
  });
  roleId = role.id;

  // Hash REAL: el objetivo del E2E es que bcrypt, el adaptador Prisma y la Server Action se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  const user = await prisma.user.create({
    data: {
      firstNames: 'Usuario',
      lastNames: 'De Prueba E2E',
      birthDate: new Date('1990-01-01'),
      email: `qc7_e2e_${suffix}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc7${suffix}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId: role.id,
    },
    select: { id: true },
  });
  userId = user.id;
});

test.afterAll(async () => {
  // El usuario primero y el rol despues: la FK `users.role_id` es `onDelete: Restrict`.
  // El `finally` garantiza que el rol se intenta borrar aunque el borrado del usuario falle,
  // para no dejar basura que reviente la unicidad de `roles.name` en la siguiente ejecucion.
  try {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    if (roleId) await prisma.role.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  }
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
