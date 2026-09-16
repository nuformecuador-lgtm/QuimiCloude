// QC-93 — el UNICO sitio de los E2E donde se decide a donde aterriza un login (R1).
//
// Trece suites llevaban su propia copia con la ruta escrita dentro; cuando QC-75 cambio la regla
// de aterrizaje ninguna se actualizo y los casos quedaron afirmando algo que ya no pasa. Aqui el
// destino no se escribe: se DERIVA con las mismas funciones que usa el login y de los permisos que
// ese usuario tiene de verdad en la base.
//
// `import type` a proposito: Vitest importa este archivo en su test unitario y no debe arrastrar el
// runner de Playwright.
import type { Page } from '@playwright/test';

import { prisma } from '@/lib/shared/db/prisma';
import {
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
} from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE, LOGIN_ROUTE } from '@/lib/shared/routes';

export type Credentials = {
  username: string;
  password: string;
};

/**
 * El destino que el login dara a ESTOS permisos (R2, R3). Es literalmente la composicion de
 * `login-action.ts:122-126`: sin regla propia ni segunda lista, asi que si el menu se reordena o
 * cambia el permiso de un item, este destino cambia con el.
 */
export function landingRouteForPermissions(permissions: readonly string[]): string {
  return (
    firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permissions)) ??
    DASHBOARD_ROUTE
  );
}

/**
 * Los permisos del usuario VIVO con ese username, leidos de la base: usuario -> rol ->
 * `role_permissions` (R4). De la base y no del catalogo del seed, porque hay fixtures con roles
 * efimeros que el seed no conoce.
 *
 * Sin usuario vivo, falla nombrando el username (R5): un fixture mal sembrado tiene que romper,
 * no convertirse en un aterrizaje por defecto que no afirma nada.
 */
export async function permissionsForUsername(username: string): Promise<readonly string[]> {
  const user = await prisma.user.findFirst({
    where: { username, deletedAt: null },
    select: { role: { select: { permissions: { select: { permissionCode: true } } } } },
  });

  if (user === null) {
    throw new Error(
      `landing: no existe un usuario vivo con username "${username}"; no se puede derivar su aterrizaje`,
    );
  }

  return user.role.permissions.map((permission) => permission.permissionCode);
}

/** El destino esperado para ese usuario: sus permisos reales pasados por la regla del login. */
export async function expectedLandingRoute(username: string): Promise<string> {
  return landingRouteForPermissions(await permissionsForUsername(username));
}

/**
 * Entra por el formulario real y espera al destino derivado; devuelve esa ruta (R6).
 *
 * No admite parametro de aterrizaje (R7): congelar la premisa en la llamada es lo que dejo mudos
 * estos casos cuando QC-75 cambio la regla. El destino se calcula ANTES de pulsar, para que un
 * fixture mal sembrado falle aqui y no tras 60 s de espera.
 */
export async function loginAndLand(page: Page, credentials: Credentials): Promise<string> {
  const destination = await expectedLandingRoute(credentials.username);

  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(credentials.username);
  await page.getByTestId('login-password').fill(credentials.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 60_000 });

  return destination;
}
