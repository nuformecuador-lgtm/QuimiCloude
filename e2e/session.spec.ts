/**
 * E2E del ciclo completo de sesion sobre una ruta privada (QC-9, T19; R24).
 *
 * R24 viene HEREDADO de QC-8, donde quedo fuera de alcance porque entonces no existia ninguna
 * URL privada que pedir (`specs/QC-8-sesion-actual-y-logout/requirements.md > Preguntas abiertas 3`).
 * QC-9 la crea —el middleware de `/inventario`—, asi que el recorrido ya se puede ejercitar
 * entero, y ampliado con lo que QC-9 añade: la vuelta a **la ruta que se habia pedido** (R8).
 *
 * Un solo recorrido para R24 a proposito: lo que R24 exige es la CADENA, y partirla en cinco
 * tests independientes obligaria a recrear la sesion en cada uno y dejaria sin cubrir justo lo
 * unico que este nivel aporta —que los cinco pasos encajan seguidos en un navegador real—. Los
 * pasos sueltos ya estan cubiertos en unit e integracion (`design.md > 12`).
 *
 * QC-78 (R28 b) añade un SEGUNDO recorrido a este archivo, con su propio usuario: una sesion ya
 * abierta cuya cuenta deja de estar `active` no llega a la siguiente pantalla privada. Es otra
 * cadena distinta —dos peticiones con la misma cookie y un cambio de estado en medio—, no un paso
 * mas de la primera, y por eso no se cuelga del recorrido de R24.
 *
 * Que aporta sobre unit e integracion: el navegador de verdad. La redireccion del middleware,
 * la cookie `httpOnly` que emite el servidor, el `<form>` real de la Server Action de logout y
 * —esto solo se puede afirmar aqui— el **historial del navegador**: que pulsar "atras" despues
 * de cerrar sesion no devuelve la zona privada desde la cache. Corre en Chromium y en WebKit
 * (el motor de iOS), donde cookie y bfcache pueden comportarse distinto sin que ningun test de
 * Node lo note.
 *
 * DATOS: este spec SI depende del seed de QC-6 para el rol `Administrador`, y desde QC-75 por otro
 * motivo: el middleware ya no exige ningun rol (esa ficha retiro la lista ruta->rol), pero
 * `/inventario` exige el permiso `inventario.consultar` en la propia pagina, y quien lo tiene es
 * ese rol real del seed. Con un rol inventado —sin permisos— el paso que aterriza en la pantalla
 * recibiria un 404. Lo efimero sigue siendo el USUARIO: se crea con
 * hash real, colgado del rol `Administrador` real, y se borra al final. El rol nunca se crea ni
 * se borra aqui, porque `roles.name` es unico y es un dato compartido con produccion/seed, no un
 * fixture. La otra fila ajena de la que depende es `documentTypeCode: 'CC'`, que inserta la
 * migracion de QC-4.
 *
 * AISLAMIENTO ENTRE PROYECTOS Y WORKERS: `RUN_ID` se calcula al cargar el modulo, o sea una vez
 * por PROCESO de worker, y va dentro del `username`, del correo, del documento y del nombre de
 * pila —los tres indices unicos de `users` son globales, y el nombre de pila entra ahi para que
 * el paso 3 pueda afirmar el nombre EXACTO sin confundirse con el del otro proyecto—. El prefijo
 * es `qc9_e2e_`: propio, distinto del de `e2e/login.spec.ts`, que comparte base con este.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse (igual que en los tests de integracion), y `next dev` —que arranca el `webServer`
 * de la config— carga el suyo, incluido `SESSION_SECRET`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// La UNICA definicion de «mismo nombre de empresa» (QC-47 R3), del contrato publico
// del modulo: `companies.name_normalized` se calcula con esta y con ninguna otra.
// `ROLE_ADMINISTRADOR` se toma del mismo barrel, como VALOR (nunca `import type`, nunca por
// ruta profunda): `identity/domain/roles.ts` es su unica fuente y el barrel la publica (QC-54).
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { SESSION_COOKIE_NAME } from '@/lib/modules/identity/adapters/driven/session/session-token';
import { RETURN_PARAM } from '@/lib/modules/identity/domain/return-path';
import { prisma } from '@/lib/shared/db/prisma';
import { INVENTORY_ROUTE, LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';
import { createFixtureUser } from './helpers/fixture-user';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/** Prefijo con el que este spec marca TODO usuario que crea. Nada fuera de el se toca. */
const USERNAME_PREFIX = 'qc9_e2e_';

/**
 * Prefijo de la empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria,
 * asi que el fixture necesita su propia empresa. NUNCA la de instalacion: el indice
 * `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa del seed.
 */
const COMPANY_NAME_PREFIX = 'qc9_e2e_empresa_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestros prefijos. Chromium y WebKit corren
 * a la vez, asi que la limpieza defensiva NO puede borrar por prefijo a secas: se llevaria por
 * delante el usuario que el otro proyecto acaba de crear. Una hora deja fuera cualquier
 * ejecucion viva y dentro cualquier resto de una ejecucion anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Apellido del usuario del fixture. Fijo: lo unico que necesita ser unico es el nombre. */
const LAST_NAMES = 'Sesion';

let roleId: string | null = null;
let companyId: string | null = null;

/**
 * Usuario propio del test que lo pide. `label` lo distingue DENTRO del worker (los tres indices
 * unicos de `users` son globales) y `RUN_ID` entre workers y proyectos. Cada test tiene el suyo:
 * el de QC-78 R28 apaga su cuenta a mitad de recorrido, y compartirla dejaria al otro test
 * dependiendo del orden en que corran con `fullyParallel`.
 */
async function createTestUser(label: string): Promise<{
  username: string;
  password: string;
  displayName: string;
}> {
  if (!roleId) throw new Error('el rol del fixture no existe: fallo el beforeAll');
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const suffix = `${RUN_ID}${label}`;
  const username = `${USERNAME_PREFIX}${suffix}`;
  /** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
  const password = `Qc9-E2E-${RUN_ID.slice(0, 12)}`;
  // Nombre de pila unico por worker Y POR TEST: el paso 3 afirma el nombre EXACTO que pinta la
  // barra, y con Chromium y WebKit a la vez un nombre compartido daria un `strict mode
  // violation` o, peor, un verde que en realidad mira al usuario del otro proyecto.
  const firstNames = `Qc9${RUN_ID.slice(0, 8)}${label}`;

  // Hash REAL: el objetivo del E2E es que bcrypt, el adaptador Prisma y la Server Action se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await createFixtureUser({
    data: {
      firstNames,
      lastNames: LAST_NAMES,
      birthDate: new Date('1990-01-01'),
      email: `${username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc9${suffix}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId,
      companyId,
      // EXPLICITO: `users.account_status` tiene `@default(pending)` en `db/schema.prisma` y desde
      // QC-78 (R1) solo `active` entra al login. Sin esta linea, TODO recorrido de este archivo
      // se quedaria en la pantalla de login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  // Lo que la barra lateral debe pintar: primer nombre + primer apellido
  // (`lib/modules/identity/domain/display-name.ts`). Se compone aqui a partir de los MISMOS
  // datos que se acaban de insertar, para que el test afirme el nombre real del usuario y no
  // un literal escrito a mano que podria envejecer.
  return { username, password, displayName: `${firstNames} ${LAST_NAMES}` };
}

test.beforeAll(async () => {
  // El rol es el `Administrador` REAL sembrado por QC-6, no un fixture: es quien tiene
  // `inventario.consultar`, el permiso que la pantalla exige desde QC-75, y sin el este recorrido
  // acabaria en un 404. Por eso no se crea aqui (`roles.name` es unico: crearlo lo convertiria en
  // dato compartido con produccion/seed).
  // Si no existe, el fallo tiene que decir exactamente que falta el seed, no un rojo generico de
  // FK al crear el usuario.
  const adminRole = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!adminRole) {
    throw new Error(
      `el rol '${ROLE_ADMINISTRADOR}' no existe: correr el seed de QC-6 antes de este E2E`,
    );
  }
  roleId = adminRole.id;

  // LIMPIEZA DEFENSIVA DE HUERFANOS. Existe porque un `pnpm run e2e` interrumpido a media
  // ejecucion deja usuarios `qc9_e2e_*` en la base, y esa basura pone rojo un test de OTRA
  // feature —`tests/integration/identity/identity-constraints.int.test.ts` afirma
  // `user.count() === 0`—: media hora para entender un rojo que no es del codigo.
  // Solo usuarios: el rol usado aqui es `Administrador`, un dato real, no un fixture con prefijo,
  // asi que no hay ningun rol huerfano que barrer (nunca se crea uno con `ROLE_NAME_PREFIX`
  // porque esa constante ya no existe). El razonamiento completo sobre el corte de edad esta en
  // `e2e/login.spec.ts`, que resolvio esto primero; aqui se replica sobre el prefijo de usuario
  // propio de QC-9.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.user.deleteMany({
    where: { username: { startsWith: USERNAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas, DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker. `nameNormalized` sale de `normalizeCompanyName`, no de
  // una copia escrita a mano: es la UNICA definicion (QC-47 R3).
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el test reventara: por eso se borra por prefijo de `RUN_ID` (no por un
  // id acumulado en memoria). Solo usuarios: el rol (`Administrador`) es un dato real sembrado
  // por QC-6, nunca un fixture de este test, asi que este `afterAll` NO toca la tabla `roles` en
  // absoluto —borrar por `name: ROLE_ADMINISTRADOR` se llevaria por delante el rol real que usan
  // otros tests y el propio seed—.
  try {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
    });
    // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict` (R11).
    await prisma.company.deleteMany({ where: { name: `${COMPANY_NAME_PREFIX}${RUN_ID}` } });
  } finally {
    await prisma.$disconnect();
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt
// con coste 10 tarda a proposito. Un timeout corto aqui produce rojos que no son del codigo.
test.setTimeout(180_000);

/**
 * Cuenta las redirecciones de NAVEGACION que ocurren mientras corre `navegar` (QC-78 R29).
 *
 * Solo `resourceType() === 'document'` y **sin 304**, y las dos exclusiones son a base de haber
 * fallado: `next dev` responde los chunks de `_next/static` con **304 Not Modified**, que cae de
 * lleno en el rango 300-399. Contar toda respuesta 3xx daba 15, 20 o 29 «redirecciones» de
 * JavaScript segun lo que el navegador tuviera ya en cache — y pasaba o fallaba por la cache, no
 * por el producto. Lo que R29 mide es cuantas veces rebota el DOCUMENTO, que es lo unico que el
 * usuario sufre.
 */
async function contarRedireccionesDeNavegacion(
  page: import('@playwright/test').Page,
  navegar: () => Promise<void>,
): Promise<string[]> {
  const saltos: string[] = [];
  const contar = (respuesta: import('@playwright/test').Response) => {
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

test.describe('ciclo de sesion sobre una ruta privada', () => {
  test('pide una pantalla privada sin sesion, entra, aterriza en ella, ve su nombre, cierra sesion y atras no muestra la zona privada', async ({
    page,
    context,
  }) => {
    const { username, password, displayName } = await createTestUser('ciclo');

    // --- 1. Ruta privada sin sesion -> login, con la ruta pedida como destino de vuelta (R2, R7).
    await page.goto(INVENTORY_ROUTE);
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    expect(
      new URL(page.url()).searchParams.get(RETURN_PARAM),
      'el login debe recordar la ruta que se habia pedido',
    ).toBe(INVENTORY_ROUTE);

    // --- 2. Credenciales correctas -> se acaba EN LA PANTALLA QUE SE HABIA PEDIDO (R8).
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    await page.waitForURL((url) => url.pathname === INVENTORY_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 3. La barra lateral muestra el nombre REAL del usuario, no un placeholder.
    await expect(page.getByTestId('private-user-name')).toHaveText(displayName);

    // La sesion existe de verdad como cookie del servidor. No es lo que R24 pide, pero sin esta
    // linea el paso 5 no distinguiria "no hay sesion" de "nunca la hubo".
    expect(
      (await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE_NAME),
      'no se emitio la cookie de sesion',
    ).toBe(true);

    // --- 4. Cerrar sesion -> login. Desde el 2026-09-07 (decision humana) el control es un boton
    // del encabezado, junto al de tema: un solo gesto, sin menu que abrir antes.
    await page.getByTestId('private-logout').click();
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });

    // --- 5. Volver atras NO muestra la zona privada.
    // Es el paso que solo se puede afirmar en un navegador real: la entrada de `/inventario`
    // sigue en el historial, y lo que se comprueba es que el navegador no la sirve desde su
    // cache. Se espera a la URL del login: si la pagina privada se restaurara, la URL se
    // quedaria en `/inventario` y este `waitForURL` fallaria diciendo justo eso.
    await page.goBack();
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    await expect(page.getByTestId('private-user-name')).toHaveCount(0);
    await expect(page.getByTestId('inventario-title')).toHaveCount(0);
  });

  test('una sesion abierta cuya cuenta deja de estar activa no llega a la siguiente pantalla privada y acaba en el login', async ({
    page,
    context,
  }) => {
    // Cubre QC-78 R28 (b), y con el R20 y R21: la resolucion de sesion relee la ficha en CADA
    // peticion, asi que apagar la cuenta por fuera basta para que la siguiente navegacion no
    // entre. Solo se puede afirmar de verdad aqui: es una cadena de dos peticiones del mismo
    // navegador con la MISMA cookie.
    const { username, password } = await createTestUser('r28');

    // --- 1. Entrar por el formulario real y comprobar que se esta DENTRO de la zona privada.
    await page.goto(INVENTORY_ROUTE);
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => url.pathname === INVENTORY_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // --- 2. La cuenta se apaga POR FUERA, sin tocar la sesion ni la cookie. Es un `update`
    // directo a proposito: simula la accion administrativa de QC-66, que todavia no existe.
    // `updateMany` y no `update`: `users.username` NO es un unico de Prisma —la unicidad la impone
    // el indice parcial `users_username_unique` en SQL—, y el `username` lleva `RUN_ID`, asi que
    // alcanza exactamente a la fila de este test y a ninguna otra.
    await prisma.user.updateMany({ where: { username }, data: { accountStatus: 'inactive' } });

    // --- 3. La siguiente pantalla privada ya no se abre. Se vuelve a pedir `/inventario` —una
    // peticion NUEVA— en vez de otra ruta privada cualquiera porque las demas exigen permisos
    // propios (QC-75) y un 404 por permiso se confundiria con el corte que aqui se quiere probar.
    //
    // QC-78 R29 — se cuentan las redirecciones ANTES de navegar. Este mismo paso murio con
    // `Load cannot follow more than 20 redirections` cuando el corte redirigia al login pelado:
    // el borde veia la cookie viva y devolvia a la zona privada, el layout volvia a cortar, y
    // asi sin fin. Contar es lo unico que distingue «acaba en el login» de «acaba en el login
    // despues de rebotar»: sin esto, un bucle de 19 saltos pasaria el test.
    const redirecciones = await contarRedireccionesDeNavegacion(page, async () => {
      await page.goto(INVENTORY_ROUTE);
      await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    });
    await expect(page.getByTestId('inventario-title')).toHaveCount(0);
    await expect(page.getByTestId('private-user-name')).toHaveCount(0);

    // UNA sola: la de `/inventario` al login. Ni una mas (R29).
    expect(
      redirecciones,
      `la salida al login debe costar UNA redireccion y costo ${redirecciones.length}: ${redirecciones.join(' -> ')}`,
    ).toHaveLength(1);

    // --- 4. La cookie NO se borro. Lo fija la decision cerrada del 2026-09-08 («sale en la
    // siguiente navegacion», sin borrar la cookie y sin mensaje que diga por que): el corte lo
    // hace la relectura de la ficha en cada peticion, no una limpieza del transporte. Si algun
    // dia se decidiera borrarla, este test tiene que discutirse, no ajustarse en silencio.
    expect(
      (await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE_NAME),
      'el corte por estado no debe borrar la cookie de sesion',
    ).toBe(true);

    // --- 5. Y la pantalla de login NO explica el motivo: ningun aviso, ninguna pista de que la
    // cuenta existe ni de en que estado esta (misma discrecion que R3 impone en el login).
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('una sesion abierta cuya ficha se da de baja tampoco rebota: sale al login en una sola redireccion', async ({
    page,
  }) => {
    // QC-78 R29 sobre un corte PREEXISTENTE: la baja logica de QC-8 R11 (`users.deleted_at`).
    //
    // Por que existe este test y no basta con el de arriba: el bucle NO era del corte por estado.
    // `resolveSession` devuelve `null` por TRES caminos —baja logica (QC-8 R11), empresa no viva
    // (QC-48 R15) y estado de cuenta (QC-78 R20)— y los tres salen por el MISMO `redirect`, asi
    // que los tres rebotaban igual. El defecto era anterior a esta ficha; QC-78 solo lo hizo
    // alcanzable. Si la marca se hubiera puesto solo en el camino del estado, estos otros dos
    // seguirian rotos y nadie se enteraria: no habia ningun E2E que abriera sesion y matara la
    // ficha despues. Este es ese E2E.
    const { username, password } = await createTestUser('r29baja');

    await page.goto(INVENTORY_ROUTE);
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => url.pathname === INVENTORY_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId('inventario-title')).toBeVisible({ timeout: 60_000 });

    // La ficha se da de baja POR FUERA. `deleted_at` con valor es el unico criterio de QC-8 R11,
    // y el `where` del lector de sesion lo aplica, asi que la resolucion devuelve `null` sin que
    // el estado de cuenta tenga nada que ver: esta cuenta sigue `active`.
    await prisma.user.updateMany({ where: { username }, data: { deletedAt: new Date() } });

    const redirecciones = await contarRedireccionesDeNavegacion(page, async () => {
      await page.goto(INVENTORY_ROUTE);
      await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 60_000 });
    });
    await expect(page.getByTestId('inventario-title')).toHaveCount(0);

    expect(
      redirecciones,
      `la salida al login debe costar UNA redireccion y costo ${redirecciones.length}: ${redirecciones.join(' -> ')}`,
    ).toHaveLength(1);

    // Y la marca es la MISMA que la del corte por estado: opaca, no dice cual de los tres fue
    // (R30 a). Se compara con la constante, no con un literal copiado.
    expect(new URL(page.url()).search).toBe(
      LOGIN_ROUTE_SESSION_ENDED.slice(LOGIN_ROUTE_SESSION_ENDED.indexOf('?')),
    );
  });
});
