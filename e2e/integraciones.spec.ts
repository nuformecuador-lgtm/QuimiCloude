/**
 * E2E del grupo «Integraciones» del menu privado y de sus tres paginas. El recorrido de la conexion
 * de WhatsApp vive en `integraciones-whatsapp.spec.ts`.
 *
 * Que aporta sobre unit e integracion:
 * - **El HTML servido de verdad.** Para quien no tiene el permiso se afirma con `toHaveCount(0)`
 *   sobre los `data-testid`: el grupo y sus hijos no viajan al navegador, no estan solo ocultos.
 * - **El status HTTP real.** Cada ruta pedida por URL responde 200 a quien puede y 404 a quien no,
 *   medido sobre la respuesta de `page.goto`, no sobre el texto de la pagina.
 * - **Los permisos REALES del seed.** Que roles tienen `integraciones.modificar` se toma de
 *   `SEED_ROLE_PERMISSIONS`, no de una lista escrita aqui; los roles son los sembrados y nunca se
 *   crean ni se borran.
 * - Corre en Chromium y en WebKit (proyectos de `playwright.config.ts`).
 *
 * DATOS: lo efimero son los USUARIOS —uno por caso, con hash real— y la EMPRESA de cada worker.
 * Todo lleva el prefijo `qc222_e2e_` y el `RUN_ID` del proceso; la limpieza defensiva borra por
 * edad y el `afterAll` borra por `RUN_ID`.
 *
 * ENTRADA: siempre por `loginAndLand`, que deriva el aterrizaje de los permisos reales del usuario.
 * El unico `waitForURL` de este archivo sigue a un clic de menu.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import {
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_MAESTRO,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import {
  AI_PROVIDER_INTEGRATION_LABEL,
  INVENTORY_INTEGRATION_LABEL,
  WHATSAPP_INTEGRATION_LABEL,
} from '@/lib/shared/navigation/private-nav';
import {
  AI_PROVIDER_INTEGRATION_ROUTE,
  INVENTORY_INTEGRATION_ROUTE,
  WHATSAPP_INTEGRATION_ROUTE,
} from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO usuario que crea. Nada fuera de el se toca. */
const USERNAME_PREFIX = 'qc222_e2e_';

/**
 * Prefijo de la empresa efimera de este worker. `users.company_id` es obligatoria y el indice
 * `companies_name_unique` es GLOBAL: nunca se usa la empresa de instalacion.
 */
const COMPANY_NAME_PREFIX = 'qc222_e2e_empresa_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestros prefijos. Chromium y WebKit corren a la
 * vez: borrar por prefijo a secas se llevaria el usuario que el otro proyecto acaba de crear.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** El permiso que abre el grupo y sus tres paginas. */
const INTEGRATIONS_PERMISSION = 'integraciones.modificar';

/** `data-testid` del grupo del menu. */
const GROUP_TEST_ID = 'nav-integraciones';

/** Los tres hijos del grupo, en el orden del menu: testId, ruta y etiqueta (todas constantes). */
const INTEGRATION_CHILDREN = [
  {
    testId: 'nav-integraciones-proveedor-ia',
    route: AI_PROVIDER_INTEGRATION_ROUTE,
    label: AI_PROVIDER_INTEGRATION_LABEL,
  },
  {
    testId: 'nav-integraciones-inventarios',
    route: INVENTORY_INTEGRATION_ROUTE,
    label: INVENTORY_INTEGRATION_LABEL,
  },
  {
    testId: 'nav-integraciones-whatsapp',
    route: WHATSAPP_INTEGRATION_ROUTE,
    label: WHATSAPP_INTEGRATION_LABEL,
  },
] as const;

/** Palabras que la pantalla de 404 NO puede contener: distinguirian «no existe» de «no puedes». */
const FORBIDDEN_404_WORDS = ['permiso', 'rol', 'autoriz'] as const;

/** Roles del seed cuyo conjunto de permisos contiene el de integraciones. */
const ROLES_WITH_PERMISSION = Object.entries(SEED_ROLE_PERMISSIONS)
  .filter(([, permissions]) => permissions.includes(INTEGRATIONS_PERMISSION))
  .map(([role]) => role);

/**
 * Roles del seed SIN el permiso, salvo el Maestro. El Maestro se excluye por nombre: no tiene
 * empresa, y la empresa vacia es unica para el Maestro —solo un Maestro puede tenerla—, asi que
 * este spec no puede crear uno efimero sin chocar con el del seed. Que el Maestro no ve el grupo
 * lo cubre un test unitario del filtrado del menu.
 */
const ROLES_WITHOUT_PERMISSION = Object.keys(SEED_ROLE_PERMISSIONS).filter(
  (role) => !ROLES_WITH_PERMISSION.includes(role) && role !== ROLE_MAESTRO,
);

const roleIds = new Map<string, string>();
let companyId: string | null = null;

async function createUserWithRole(
  roleName: string,
  suffix: string,
): Promise<{ username: string; password: string }> {
  const roleId = roleIds.get(roleName);
  if (!roleId) throw new Error(`el rol '${roleName}' no se resolvio: fallo el beforeAll`);
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const username = `${USERNAME_PREFIX}${RUN_ID}_${suffix}`;
  /** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
  const password = `Qc222-E2E-${RUN_ID.slice(0, 12)}`;

  // Hash REAL: lo que se prueba es que bcrypt, el adaptador Prisma y la Server Action se entienden.
  await prisma.user.create({
    data: {
      firstNames: `Qc222${RUN_ID.slice(0, 8)}${suffix}`,
      lastNames: 'Integraciones',
      birthDate: new Date('1990-01-01'),
      email: `${username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc222${RUN_ID}${suffix}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId,
      companyId,
      // Explicito: la columna es `pending` por defecto y una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return { username, password };
}

test.beforeAll(async () => {
  // Los roles son los REALES del seed: sus permisos son el dato bajo prueba. Nunca se crean aqui
  // (`roles.name` es unico y compartido con el seed); si falta uno, el fallo nombra el seed.
  for (const roleName of [...ROLES_WITH_PERMISSION, ...ROLES_WITHOUT_PERMISSION]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(`el rol '${roleName}' no existe: correr el seed antes de este E2E`);
    }
    roleIds.set(roleName, role.id);
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS, por edad: una ejecucion interrumpida deja filas con nuestros
  // prefijos, y el corte por edad evita borrar las del otro proyecto que corre a la vez.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.user.deleteMany({
    where: { username: { startsWith: USERNAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas, DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // `nameNormalized` sale de `normalizeCompanyName`: es la UNICA definicion del nombre normalizado.
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE por prefijo de `RUN_ID`, aunque un caso reventara. Los roles no se tocan.
  try {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
    });
    // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict`.
    await prisma.company.deleteMany({ where: { name: `${COMPANY_NAME_PREFIX}${RUN_ID}` } });
  } finally {
    await prisma.$disconnect();
  }
});

// Timeout amplio: `next dev` compila cada ruta bajo demanda y bcrypt con coste 10 tarda a proposito.
test.setTimeout(180_000);

test.describe('el menu de integraciones segun el permiso de quien entra', () => {
  test('R21: el unico rol del seed con el permiso de integraciones es el Administrador, y hay roles sin el que recorrer', () => {
    // Ancla: si el seed da el permiso a otro rol, este E2E deja de cubrirlo en silencio. Rojo aqui.
    expect(
      ROLES_WITH_PERMISSION,
      `los roles del seed con '${INTEGRATIONS_PERMISSION}' cambiaron: revisar los casos de este E2E`,
    ).toEqual([ROLE_ADMINISTRADOR]);
    expect(
      ROLES_WITHOUT_PERMISSION.length,
      'no queda ningun rol del seed sin el permiso que recorrer',
    ).toBeGreaterThan(0);
  });

  test('R19: el Administrador ve el grupo, lo despliega, abre cada integracion con su titulo y su contenido (estado vacio, o las pestanas de WhatsApp), y cada ruta por URL responde 200', async ({
    page,
  }) => {
    const credentials = await createUserWithRole(ROLE_ADMINISTRADOR, 'admin');

    // --- 1. Entra y aterriza donde deriva el helper.
    await loginAndLand(page, credentials);

    // --- 2. El grupo esta y al pulsarlo despliega sus tres hijos.
    const group = page.getByTestId(GROUP_TEST_ID);
    await expect(group).toBeVisible({ timeout: 60_000 });
    await group.click();
    for (const child of INTEGRATION_CHILDREN) {
      await expect(page.getByTestId(child.testId)).toBeVisible();
    }

    // --- 3. Cada hijo, en el orden del menu: clic, su ruta, su titulo y su contenido. WhatsApp ya
    // no es un estado vacio: pinta sus pestanas; su recorrido vive en `integraciones-whatsapp.spec.ts`.
    for (const child of INTEGRATION_CHILDREN) {
      await page.getByTestId(child.testId).click();
      await page.waitForURL((url) => url.pathname === child.route, { timeout: 60_000 });
      await expect(page.getByTestId('integration-title')).toHaveText(child.label, {
        timeout: 60_000,
      });
      if (child.route === WHATSAPP_INTEGRATION_ROUTE) {
        await expect(page.getByTestId('whatsapp-integration-tabs')).toBeVisible();
        await expect(page.getByTestId('integration-empty')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('integration-empty')).toBeVisible();
      }
    }

    // --- 4. Pedida por URL, cada ruta responde 200.
    for (const child of INTEGRATION_CHILDREN) {
      const response = await page.goto(child.route);
      expect(response?.status(), `${child.route} debe responder 200 al Administrador`).toBe(200);
    }
  });

  for (const [index, roleName] of ROLES_WITHOUT_PERMISSION.entries()) {
    test(`R20: el rol '${roleName}' no recibe el grupo ni sus hijos en el HTML y cada ruta por URL responde 404 con la pantalla de no encontrado y la salida presente`, async ({
      page,
    }) => {
      const credentials = await createUserWithRole(roleName, `sin${index}`);

      // --- 1. Entra y aterriza donde deriva el helper.
      await loginAndLand(page, credentials);

      // --- 2. Ni el grupo ni sus hijos viajan al navegador. `toHaveCount(0)` sobre el testId: no
      // basta con que esten ocultos.
      await expect(page.getByTestId(GROUP_TEST_ID), `${GROUP_TEST_ID} no debe llegar`).toHaveCount(
        0,
      );
      for (const child of INTEGRATION_CHILDREN) {
        await expect(page.getByTestId(child.testId), `${child.testId} no debe llegar`).toHaveCount(
          0,
        );
      }

      // --- 3. Cada ruta pedida por URL: 404 real y la pantalla de no encontrado del layout privado.
      for (const child of INTEGRATION_CHILDREN) {
        const response = await page.goto(child.route);
        expect(
          response?.status(),
          `${child.route} debe responder 404, indistinguible de una ruta que no existe`,
        ).toBe(404);

        const notFound = page.getByTestId('private-not-found');
        await expect(notFound).toBeVisible({ timeout: 60_000 });

        const notFoundText = ((await notFound.textContent()) ?? '').toLowerCase();
        for (const word of FORBIDDEN_404_WORDS) {
          expect(
            notFoundText.includes(word),
            `la pantalla de 404 no puede mencionar «${word}»`,
          ).toBe(false);
        }
      }

      // --- 4. La salida sigue alcanzable sobre la pantalla de 404. Ya no hay menu de usuario que
      // abrir (`components/private/nav-user.tsx`): cerrar sesion vive en el encabezado. Se afirma
      // que es visible y que toma el foco de teclado, sin pulsarlo —eso cerraria la sesion— y sin
      // raton: bajo `next dev`, en WebKit, el overlay de desarrollo se interpone sobre el 404.
      const logout = page.getByTestId('private-logout');
      await expect(logout).toBeVisible();
      await logout.focus();
      await expect(logout).toBeFocused();
    });
  }
});
