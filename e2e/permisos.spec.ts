/**
 * E2E del recorrido completo de un usuario con el rol `Operador` (QC-75, T14; R21).
 *
 * Es el flujo critico «permisos» que `CHECKPOINTS.md` exige y que QC-74 difirio con motivo: cuando
 * se construyo el modelo de permisos todavia no habia ninguna pantalla que abrir con ellos. QC-75
 * crea el corte —menu filtrado en el servidor y 404 por URL— asi que el recorrido ya se puede
 * ejercitar entero en un navegador real.
 *
 * Un solo recorrido y un solo test a proposito, igual que `e2e/session.spec.ts`: lo que R21 pide es
 * la CADENA (entra -> aterriza -> ve un menu corto -> pide por URL lo que no puede -> 404 con
 * salida), y partirla en tests independientes obligaria a recrear la sesion en cada uno y dejaria
 * sin cubrir justo lo unico que este nivel aporta: que los pasos encajan seguidos.
 *
 * Que aporta sobre unit e integracion:
 * - **El HTML servido de verdad** (R2). Los tests unitarios del layout afirman sobre el arbol
 *   renderizado en Node; aqui se afirma sobre lo que llega al navegador. Un item ocultado con CSS o
 *   filtrado en el cliente pasaria alli y caeria aqui.
 * - **El status HTTP real** (R7). `notFound()` responde 404 en el documento inicial —404 en
 *   respuestas no-streamed; 200 solo si la respuesta ya habia empezado a stream, y nuestras paginas
 *   cortan antes de renderizar nada y la zona privada no tiene `loading.tsx`—. Eso solo se puede
 *   medir sobre la respuesta que devuelve `page.goto`, no sobre el texto de la pagina.
 * - **Los permisos REALES del seed**. El dato bajo prueba es que el rol `Operador` sembrado por
 *   QC-6/QC-74 tiene exactamente `inventario.consultar`: con un rol inventado se estaria probando
 *   el fixture, no el sistema.
 * - Corre en Chromium y en WebKit (el motor de iOS).
 *
 * POR QUE EL 404 ES EN `/pedidos` Y NO EN `/inventario`: `SEED_ROLE_PERMISSIONS` da al `Operador`
 * exactamente `inventario.consultar` (QC-74 R9), o sea que inventario es justamente el unico modulo
 * que **si** puede consultar —y por eso es donde aterriza el login (R11)—. El 404 apunta a un modulo
 * que ese rol no tiene; `requirements.md > Preguntas abiertas 2` lo deja escrito.
 *
 * DATOS: este spec SI depende del seed para el rol `Operador` y sus permisos. Lo efimero es el
 * USUARIO —creado con hash real y borrado al final— y su EMPRESA. El rol nunca se crea ni se borra
 * aqui: `roles.name` es unico y es un dato compartido con produccion/seed, no un fixture. La otra
 * fila ajena de la que depende es `documentTypeCode: 'CC'`, que inserta la migracion de QC-4.
 *
 * AISLAMIENTO ENTRE PROYECTOS Y WORKERS: `RUN_ID` se calcula al cargar el modulo, o sea una vez por
 * PROCESO de worker, y va dentro del `username`, del correo, del documento y del nombre de pila
 * —los tres indices unicos de `users` son globales—. El prefijo es `qc75_e2e_`: propio, distinto del
 * de los demas specs, que comparten base con este.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse, y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// `ROLE_OPERADOR` se toma del barrel del modulo, como VALOR (nunca `import type`, nunca por ruta
// profunda ni como literal a mano): `identity/domain/roles.ts` es su unica fuente y el barrel la
// publica (QC-54). `normalizeCompanyName` es la UNICA definicion de «mismo nombre de empresa»
// (QC-47 R3): `companies.name_normalized` se calcula con esta y con ninguna otra.
import { normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, ORDERS_ROUTE } from '@/lib/shared/routes';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/** Prefijo con el que este spec marca TODO usuario que crea. Nada fuera de el se toca. */
const USERNAME_PREFIX = 'qc75_e2e_';

/**
 * Prefijo de la empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria, asi
 * que el fixture necesita su propia empresa. NUNCA la de instalacion: el indice
 * `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa del seed.
 */
const COMPANY_NAME_PREFIX = 'qc75_e2e_empresa_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestros prefijos. Chromium y WebKit corren a la
 * vez, asi que la limpieza defensiva NO puede borrar por prefijo a secas: se llevaria por delante el
 * usuario que el otro proyecto acaba de crear. Una hora deja fuera cualquier ejecucion viva y dentro
 * cualquier resto de una ejecucion anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Apellido del usuario del fixture. Fijo: lo unico que necesita ser unico es el nombre. */
const LAST_NAMES = 'Permisos';

/**
 * Los `data-testid` de los items de menu que el `Operador` NO puede ver (R2, R3). `nav-produccion`
 * es el GRUPO: su unico hijo hoy es «Recetas», y sin `recetas.consultar` el grupo entero desaparece
 * —etiqueta y disparador incluidos—, que es justo la decision cerrada nº 4.
 */
const HIDDEN_NAV_TEST_IDS = [
  'nav-dashboard',
  'nav-pedidos',
  'nav-proveedores',
  'nav-produccion',
  'nav-produccion-recetas',
] as const;

/** Palabras que la pantalla de 404 NO puede contener (R7). */
const FORBIDDEN_404_WORDS = ['permiso', 'rol', 'autoriz', 'pedido'] as const;

let roleId: string | null = null;
let companyId: string | null = null;

async function createOperatorUser(): Promise<{ username: string; password: string }> {
  if (!roleId) throw new Error('el rol del fixture no existe: fallo el beforeAll');
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const username = `${USERNAME_PREFIX}${RUN_ID}`;
  /** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
  const password = `Qc75-E2E-${RUN_ID.slice(0, 12)}`;
  // Nombre de pila unico por worker: Chromium y WebKit corren a la vez y un nombre compartido daria
  // un `strict mode violation` o, peor, un verde que mira al usuario del otro proyecto.
  const firstNames = `Qc75${RUN_ID.slice(0, 8)}`;

  // Hash REAL: el objetivo del E2E es que bcrypt, el adaptador Prisma y la Server Action se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames,
      lastNames: LAST_NAMES,
      birthDate: new Date('1990-01-01'),
      email: `${username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc75${RUN_ID}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId,
      companyId,
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde
      // esa ficha `pending` no entra por el login, asi que este usuario efimero no
      // llegaria a la pantalla que este spec ejercita.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return { username, password };
}

test.beforeAll(async () => {
  // El rol es el `Operador` REAL del seed, no un fixture: SUS PERMISOS SON EL DATO BAJO PRUEBA
  // (`inventario.consultar` y nada mas, QC-74 R9). Por eso no se crea aqui —`roles.name` es unico:
  // crearlo lo convertiria en dato compartido con produccion/seed— y si falta, el fallo tiene que
  // decir exactamente que falta el seed, no un rojo generico de FK al crear el usuario.
  const operatorRole = await prisma.role.findUnique({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (!operatorRole) {
    throw new Error(
      `el rol '${ROLE_OPERADOR}' no existe: correr el seed (QC-6/QC-74) antes de este E2E`,
    );
  }
  roleId = operatorRole.id;

  // LIMPIEZA DEFENSIVA DE HUERFANOS. Existe porque un `pnpm run e2e` interrumpido a media ejecucion
  // deja usuarios `qc75_e2e_*` en la base, y esa basura pone rojo un test de OTRA feature
  // —`tests/integration/identity/identity-constraints.int.test.ts` afirma `user.count() === 0`—.
  // El corte POR EDAD no es un adorno: sin el, este `deleteMany` borraria el usuario que el otro
  // proyecto (WebKit/Chromium) acaba de crear y que esta usando ahora mismo.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.user.deleteMany({
    where: { username: { startsWith: USERNAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas, DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, no de una
  // copia escrita a mano: es la UNICA definicion (QC-47 R3).
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el test reventara: por eso se borra por prefijo de `RUN_ID` (no por un id
  // acumulado en memoria). El rol NO se toca en absoluto: es un dato real del seed, y borrar por
  // `name: ROLE_OPERADOR` se llevaria por delante el rol que usan el seed y otros tests.
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

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt con
// coste 10 tarda a proposito. Un timeout corto aqui produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('la zona privada segun los permisos de quien entra', () => {
  test('el Operador entra, aterriza en inventario, ve un menu corto y recibe 404 en un modulo que no puede consultar, con el control de cerrar sesion presente', async ({
    page,
  }) => {
    const { username, password } = await createOperatorUser();

    // --- 1. Credenciales correctas, sin destino de vuelta.
    await page.goto(LOGIN_PATH);
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    // --- 2. Aterriza en `/inventario`: el PRIMER item de su menu ya filtrado (R11). No es el
    // dashboard, que es donde llevaba el login antes de esta ficha y donde este rol veria un 404.
    await page.waitForURL((url) => url.pathname === INVENTORY_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 3. El menu es corto: solo esta el modulo que puede consultar (R2, R3).
    await expect(page.getByTestId('nav-inventario')).toBeVisible();
    for (const testId of HIDDEN_NAV_TEST_IDS) {
      // `toHaveCount(0)` sobre el `data-testid`, NUNCA sobre una clase CSS: lo que se demuestra es
      // que el item **no viaja en el HTML servido**, no que este oculto a la vista. Un item que no
      // se ve pero esta en el DOM es un item que se ve con las herramientas de desarrollo.
      await expect(page.getByTestId(testId), `${testId} no debe llegar al navegador`).toHaveCount(0);
    }

    // --- 4. Pedir por URL un modulo sin permiso responde 404 (R7).
    // La ruta se deriva de `ORDERS_ROUTE`, no se escribe a mano, y el status se afirma sobre la
    // RESPUESTA real que devuelve `goto`, no sobre el texto de la pagina.
    const response = await page.goto(ORDERS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una ruta que no existe',
    ).toBe(404);

    // --- 5. Ese 404 se pinta DENTRO del layout privado (R8) y no delata nada (R7).
    const notFound = page.getByTestId('private-not-found');
    await expect(notFound).toBeVisible({ timeout: 60_000 });

    const notFoundText = ((await notFound.textContent()) ?? '').toLowerCase();
    for (const word of FORBIDDEN_404_WORDS) {
      expect(
        notFoundText.includes(word),
        `la pantalla de 404 no puede mencionar «${word}»: distinguiria «no existe» de «no puedes»`,
      ).toBe(false);
    }

    // El control de cerrar sesion sigue ahi (R8, R14): sin el, quien no tenga ningun permiso
    // quedaria encerrado con la unica salida de borrar la cookie a mano. Vive dentro del menu de
    // usuario, asi que hay que abrirlo primero.
    //
    // POR QUE POR TECLADO Y NO CON EL RATON: el menu se abre con foco + `Enter`, no con `click()`.
    // El motivo es un artefacto del ENTORNO, no del codigo de la feature: el `webServer` del E2E
    // levanta `next dev`, y su overlay de desarrollo (`<nextjs-portal>`) se interpone sobre la
    // vista EN LA PANTALLA DE 404 y solo en WebKit, asi que la comprobacion de interceptacion de
    // puntero de Playwright nunca deja llegar el clic y el paso muere por timeout. Que es del
    // overlay y no del componente lo demuestra `e2e/session.spec.ts`, que hace este mismo
    // `getByTestId('private-user-trigger').click()` con raton en `/inventario` y pasa en WebKit;
    // la diferencia es la pantalla, no el control. Contra un build de produccion —sin overlay— el
    // raton volveria a funcionar. No se usa `{ force: true }` a proposito: eso taparia la
    // comprobacion en vez de rodearla. Y el teclado no rebaja lo que se demuestra, lo mejora: es
    // exactamente lo que R8 y R14 piden —que la salida sea ALCANZABLE— incluso sin puntero.
    const userTrigger = page.getByTestId('private-user-trigger');
    await expect(userTrigger).toBeVisible();
    await userTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('private-logout')).toBeVisible();
  });
});
