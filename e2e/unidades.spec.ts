/**
 * E2E de la pantalla de unidades de medida (QC-39, T14): el camino completo de quien tiene los dos
 * permisos y el rechazo de quien no los tiene (R50, R12).
 *
 * Por que existe, y por que AQUI: `requirements.md > R50` lo pide entero —login -> `UNITS_ROUTE`
 * -> alta de una unidad **derivada** de una base existente -> verla en la lista **con su
 * equivalencia armada**— y ademas un segundo recorrido donde una sesion valida SIN los permisos de
 * unidades recibe 404 dentro del layout privado y no ve la tabla. Se escribe sobre el patron ya
 * mergeado de `e2e/presentaciones.spec.ts` —la pantalla hermana— y de `e2e/permisos.spec.ts`.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, los
 *    DOS cortes por permiso de la pagina (`unidades.consultar` y `unidades.modificar`, R12), el
 *    Server Component de la lista con sus DOS lecturas —la pagina y el catalogo del que sale el
 *    indice de la equivalencia—, la Server Action REAL de alta de QC-38 contra Postgres y el
 *    `router.refresh()` posterior. En unit todas esas operaciones son dobles.
 *  - **La equivalencia armada de punta a punta** (R17): el factor viaja como TEXTO desde
 *    `Decimal(14,4)`, se le quitan los ceros de relleno y la frase se compone con el nombre de
 *    OTRA fila, resuelta por la segunda lectura. Eso solo se demuestra con la base de datos real:
 *    en unit el indice se le pasa a mano a la columna.
 *  - **El selector de «deriva de»** (R36) es un `Select` de Base UI con su portal, y el panel
 *    lateral es un `Sheet` con el suyo: jsdom no ejercita ninguno de los dos igual.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * NAVEGACION SIEMPRE POR URL (`page.goto`), nunca pulsando el item del menu: lo que este spec
 * afirma es el camino de la PANTALLA, y pulsar `nav-unidades` meteria en el recorrido el filtrado
 * del menu por permisos, que ya cubre `e2e/permisos.spec.ts` con sus propios fixtures y que aqui
 * seria una segunda cosa fallando por el mismo rojo. La URL se deriva SIEMPRE de `UNITS_ROUTE`
 * (R8): ningun literal `'/configuracion/...'` en todo el archivo.
 *
 * POR QUE LA BASE SE SIEMBRA POR LA BASE DE DATOS Y LA DERIVADA POR LA INTERFAZ: R50 pide el alta
 * de una unidad **derivada de una base existente**, o sea que la base es una PRECONDICION del
 * recorrido, no lo que se prueba. Ademas el estado vacio de esta pantalla **no** ofrece «crear la
 * primera» (R24, decision cerrada): el disparador del alta vive junto a la lista, asi que con la
 * busqueda puesta y cero filas no habria por donde empezar. Sembrar la base deja la lista con una
 * fila —y con su disparador— y hace que el recorrido pruebe exactamente lo que R50 nombra.
 *
 * POR QUE NINGUNA DE LAS DOS UNIDADES DECLARA SIMBOLO: `units_company_symbol_unique` es un indice
 * unico parcial y `symbol` admite 10 caracteres, que no dan para meter el `RUN_ID` de este worker;
 * dos ejecuciones simultaneas con el mismo simbolo corto chocarian. Sin simbolo, la frase de
 * equivalencia se compone con los NOMBRES (`unitLabel` cae al nombre cuando no hay simbolo, R17),
 * que si llevan el `RUN_ID` y por tanto son unicos. Es la via que ademas ejercita ese degradado.
 *
 * DATOS: `units` es una tabla real y COMPARTIDA, y los dos proyectos de Playwright corren a la vez.
 * Por eso, copiando el patron ya asentado:
 *  - todo lo que este spec crea lleva el prefijo `qc39_e2e_` y dentro el `RUN_ID` del worker;
 *  - el assert de la lista filtra por ESE nombre —pidiendo la lista con el parametro de busqueda,
 *    que resuelve el servidor contra `name_normalized`—, **nunca** por «la primera fila» ni por el
 *    total: Chromium y WebKit crean su unidad en el mismo instante sobre la misma tabla;
 *  - el termino de busqueda se elige para que la NORMALIZACION lo conserve: `normalizeUnitName`
 *    quita todo lo que no sea `[a-z0-9]`, asi que `qc39_e2e_<RUN_ID>` normaliza a
 *    `qc39e2e<RUN_ID>` y es prefijo de los normalizados de las dos unidades, que llevan el sufijo
 *    DESPUES del `RUN_ID` justamente para eso;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, y **tolera** que el borrado se rechace.
 *
 * EL BORRADO DE UNIDADES ES FISICO —`units` no lleva `deleted_at`— y **una unidad derivada retiene
 * a su base**: por eso la limpieza borra SIEMPRE primero las derivadas y luego las base
 * (`design.md > 12`, riesgo 6). Aun asi, si el borrado se rechaza —`unit_in_use`: un producto, una
 * linea de receta u otra unidad que derive—, se AVISA por consola y la limpieza sigue: tumbar
 * `afterAll` convertiria en rojo una suite cuyos dos recorridos pasaron.
 *
 * LO QUE ESTE SPEC NO CREA: los roles ni sus permisos. `Administrador` —que tiene
 * `unidades.consultar` y `unidades.modificar`— y `Operador` —que tiene SOLO
 * `inventario.consultar`, o sea ninguno de los dos— los siembra `pnpm run db:seed`
 * (`lib/modules/identity/domain/roles.ts` y `domain/permissions.ts`). Sus permisos son el dato bajo
 * prueba del recorrido 2: con un rol inventado se estaria probando el fixture. Si el rol falta, el
 * `beforeAll` falla diciendo que hay que sembrar, en vez de dar un rojo incomprensible en mitad del
 * recorrido.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus modulos
 * son de CLIENTE (`'use client'`, JSX, `useActionState`) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec sin aportar nada. Es el mismo criterio que
 * `e2e/presentaciones.spec.ts`, `e2e/inventario.spec.ts` y `e2e/pedidos.spec.ts`. Ningun assert
 * mira copy (R49): todo se localiza por `data-testid`, por rol ARIA o por valores del fixture.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import type { Prisma } from '@prisma/client';

// `normalizeCompanyName` es la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3):
// `companies.name_normalized` se calcula con esta y con ninguna otra. `normalizeUnitName` es la
// suya para `units.name_normalized` (QC-32 R4): el fixture que se inserta por la base de datos
// tiene que escribir esa columna con la MISMA funcion que usa el modulo, o la busqueda del
// recorrido no encontraria la fila.
import {
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { UNITS_ROUTE } from '@/lib/shared/routes';

// QC-93: la entrada y su aterrizaje, derivado de los permisos del usuario en la base.
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc39_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E contra la misma base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando. Una hora deja fuera
 * cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla (R21). */
const LIST_PAGE_SIZE = '25';

/**
 * Nombres de los parametros de lista, tal y como los declara `unit-list-params.ts`. Se repiten
 * aqui como constantes locales por el mismo motivo que los `data-testid` (ver cabecera): ese
 * modulo vive en la carpeta de componentes de la ruta, cuyo barrel publica modulos de cliente.
 */
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** `data-testid` de la pantalla, del panel lateral y de la tabla compartida (R49). */
const TITLE_TESTID = 'unidades-title';
const LIST_TESTID = 'unit-list';
const LIST_EMPTY_TESTID = 'unit-list-empty';
const CREATE_OPEN_TESTID = 'unit-create-open';
const SHEET_TESTID = 'unit-sheet';
const FIELD_NAME_TESTID = 'unit-field-name';
const FIELD_BASE_TESTID = 'unit-field-base';
const FIELD_FACTOR_TESTID = 'unit-field-factor';
const OPTION_BASE_TESTID = 'unit-option-base';
const FORM_SUBMIT_TESTID = 'unit-form-submit';
const DATA_TABLE_TESTID = 'data-table';
const NAME_CELL_TESTID = 'data-table-cell-name';
/** Id de la columna de equivalencia (`unit-columns.tsx`), tal y como lo compone `DataTable`. */
const EQUIVALENCE_CELL_TESTID = 'data-table-cell-equivalence';
/** El 404 de la zona privada (QC-75 R8): se pinta DENTRO del layout, con su menu ya filtrado. */
const NOT_FOUND_TESTID = 'private-not-found';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc39-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc39-Oper-${RUN_ID.slice(0, 12)}`,
};

/**
 * Las dos unidades del recorrido. **El `RUN_ID` va ANTES del sufijo** para que el termino de
 * busqueda —el prefijo comun, sin sufijo— siga siendo prefijo de los dos nombres NORMALIZADOS
 * (ver cabecera). Los dos caben holgadamente en el maximo de 60 del esquema del dominio.
 */
const UNIT_NAME_PREFIX = `${FIXTURE_PREFIX}${RUN_ID}`;
/** La base: precondicion del recorrido, sembrada por la base de datos. */
const baseUnitName = `${UNIT_NAME_PREFIX}_base`;
/** La derivada: lo que el recorrido da de alta POR LA INTERFAZ (R50). */
const derivedUnitName = `${UNIT_NAME_PREFIX}_derivada`;

/**
 * Factor de la derivada. Entero y sin decimales a proposito: la base de datos lo devuelve como
 * `1000.0000` y la pantalla tiene que quitar los ceros de relleno (R17), asi que la frase esperada
 * dice `1000` y no `1000.0000`. Cumple el patron del dominio (1-10 digitos enteros, hasta 4
 * decimales) y es un texto de principio a fin: aqui tampoco hay coma flotante.
 */
const FACTOR = '1000';

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria. NUNCA la de
 * instalacion: el indice `companies_name_unique` es GLOBAL y chocaria con la de `db:seed`. Ademas
 * el ambito del catalogo de unidades es por empresa (QC-76 R18), asi que la unidad base sembrada
 * cuelga de ESTA empresa y solo la ve el administrador de este worker.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;
let baseUnitId: string | null = null;

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
      firstNames: `Qc39${RUN_ID.slice(0, 8)}`,
      lastNames: 'Unidades',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde
      // esa ficha `pending` no entra por el login, asi que este usuario efimero no
      // llegaria a la pantalla que este spec ejercita.
      accountStatus: 'active',
    },
    select: { id: true },
  });
}

/**
 * URL de la lista, SIEMPRE derivada de `UNITS_ROUTE` (R8), con el termino de busqueda ya puesto.
 *
 * **La busqueda va en la URL desde el primer `goto`**, y no se teclea en la caja, por dos motivos:
 * el filtrado ocurre EN EL SERVIDOR sobre el catalogo entero (R18), asi que la fila creada no puede
 * escaparse a una pagina que el recorrido no visite; y como el panel lateral no navega, el
 * `router.refresh()` posterior al alta reejecuta el Server Component con ESTA MISMA consulta, que
 * es justo lo que R32 y R38 prometen.
 */
function unitsUrl(search: string): string {
  const query = new URLSearchParams({ [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE, [SEARCH_PARAM]: search });
  return `${UNITS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/** Borra las unidades del fixture que casen con `where`, tolerando el rechazo por estar en uso. */
async function deleteUnitsTolerandoUso(
  where: Prisma.UnitWhereInput,
  detalle: string,
): Promise<void> {
  try {
    await prisma.unit.deleteMany({ where });
  } catch (error) {
    // `unit_in_use`: un producto, una linea de receta o —el caso propio de esta pantalla— OTRA
    // unidad que deriva de esta la retienen, y la FK es restrictiva. Se avisa y la limpieza sigue
    // (`design.md > 12`, riesgo 6): tumbar aqui pondria en rojo una suite que paso.
    console.warn(`[qc39 e2e] no se pudo borrar ${detalle} (probablemente en uso):`, error);
  }
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc39_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). **Primero las derivadas y luego las base**: una derivada retiene a su
  // base, asi que el orden inverso dejaria la mitad sin borrar.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  await deleteUnitsTolerandoUso(
    {
      nameNormalized: { startsWith: normalizeUnitName(FIXTURE_PREFIX) },
      createdAt: { lt: orphanCutoff },
      baseUnitId: { not: null },
    },
    'las unidades derivadas huerfanas',
  );
  await deleteUnitsTolerandoUso(
    {
      nameNormalized: { startsWith: normalizeUnitName(FIXTURE_PREFIX) },
      createdAt: { lt: orphanCutoff },
    },
    'las unidades base huerfanas',
  );
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas van DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`
  // (QC-47 R11) y borrarlas antes lo rechazaria la base.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios y que su unidad.
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  await createUserWithRole(operatorUser, ROLE_OPERADOR);

  // La unidad BASE de la que derivara la que crea el recorrido. Es de la EMPRESA del fixture
  // —nunca de sistema (`company_id NULL`), que es un dato compartido— y no declara simbolo (ver
  // cabecera). `name_normalized` se escribe con `normalizeUnitName`, la misma funcion contra la
  // que compara la busqueda del listado.
  baseUnitId = (
    await prisma.unit.create({
      data: {
        name: baseUnitName,
        nameNormalized: normalizeUnitName(baseUnitName),
        companyId,
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: cada paso va en su
  // propio `try`/`finally`. El orden lo imponen las FK restrictivas: unidad DERIVADA -> unidad
  // BASE -> usuarios -> empresa.
  //
  // **Por los nombres EXACTOS de ESTE worker, NUNCA por `FIXTURE_PREFIX`**: `fullyParallel` reparte
  // los dos tests de este archivo en workers DISTINTOS, cada uno con su propio `RUN_ID` y su propio
  // fixture. Borrar por prefijo aqui se llevaria lo que el OTRO worker acaba de crear.
  try {
    await deleteUnitsTolerandoUso({ name: derivedUnitName }, `la unidad derivada "${derivedUnitName}"`);
    await deleteUnitsTolerandoUso({ name: baseUnitName }, `la unidad base "${baseUnitName}"`);
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

test.describe('pantalla de unidades', () => {
  test('el Administrador entra por la URL, da de alta una unidad derivada y la ve en la lista con su equivalencia armada (R50)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 1. La pantalla se sirve a quien tiene los DOS permisos (R12, la mitad que deja pasar). Se
    // llega POR URL derivada de la constante; el item `nav-unidades` existe (T2) pero aqui no se
    // pulsa a proposito (ver cabecera).
    const listUrl = unitsUrl(UNIT_NAME_PREFIX);
    await page.goto(listUrl);
    await expect(page.getByTestId(TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 2. Con la busqueda puesta, la lista trae EXACTAMENTE la unidad base del fixture: el
    // servidor filtro sobre el catalogo entero contra `name_normalized` (R18). Que haya lista —y no
    // estado vacio— es lo que pone el disparador del alta en la pantalla (R24, R32).
    await expect(page.getByTestId(LIST_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(
      page.getByTestId(NAME_CELL_TESTID).filter({ hasText: exactText(baseUnitName) }),
    ).toHaveCount(1);

    // --- 3. El alta ocurre en un panel lateral, SIN cambiar de URL (R32).
    const urlBeforeSheet = page.url();
    await page.getByTestId(CREATE_OPEN_TESTID).first().click();
    await expect(page.getByTestId(SHEET_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 4. Nombre. El simbolo se deja SIN declarar: la clave no debe viajar en el envio (R34) y
    // la equivalencia caera entonces a los nombres (R17).
    await page.getByTestId(FIELD_NAME_TESTID).fill(derivedUnitName);

    // --- 5. La unidad de la que deriva se elige EN EL SELECTOR (R36), que solo ofrece unidades
    // base del ambito visible. La opcion se localiza por su `data-testid` filtrando por el nombre
    // del FIXTURE —no por copy— porque todas las opciones de base comparten identificador.
    await page.getByTestId(FIELD_BASE_TESTID).click();
    const baseOption = page.getByTestId(OPTION_BASE_TESTID).filter({ hasText: exactText(baseUnitName) });
    await expect(baseOption).toHaveCount(1, { timeout: 60_000 });
    await baseOption.click();

    // --- 6. Factor, como TEXTO (el campo es `inputMode="decimal"`, nunca `type="number"`): en este
    // modulo el decimal no pasa por coma flotante en ningun punto del camino.
    await page.getByTestId(FIELD_FACTOR_TESTID).fill(FACTOR);

    // --- 7. Guardar: la Server Action REAL de QC-38 contra Postgres, sin `fetch` de por medio
    // (R44).
    await page.getByTestId(FORM_SUBMIT_TESTID).click();

    // --- 8. Con exito el panel se cierra y se avisa por el `<Toaster />` que el layout privado YA
    // monta (R38, R39). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId(SHEET_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 9. Lo guardo el backend de verdad, no solo lo pinto la pantalla: la fila existe, cuelga de
    // la unidad base del fixture y su factor llego intacto.
    const created = await prisma.unit.findFirstOrThrow({
      where: { name: derivedUnitName },
      select: { id: true, baseUnitId: true, factor: true, symbol: true },
    });
    expect(created.baseUnitId, 'la unidad creada debe derivar de la base del fixture').toBe(
      baseUnitId,
    );
    // Se compara con `Decimal.equals` y NO con `toString()`: el valor vuelve de un
    // `DECIMAL(14,4)` y como se serialicen sus ceros de relleno es cosa de la libreria, no del
    // dato. Lo que se afirma es la IGUALDAD NUMERICA exacta, sin pasar por coma flotante.
    expect(created.factor?.equals(FACTOR), 'el factor debe llegar intacto').toBe(true);
    // R34: sin simbolo declarado, la clave no viaja y la columna queda nula —nunca cadena vacia,
    // que el indice unico parcial si compararia—.
    expect(created.symbol, 'un simbolo no declarado no debe guardarse como cadena vacia').toBeNull();

    // --- 10. Y la unidad esta en la lista sin que el usuario recargue nada (R38), con los MISMOS
    // parametros de lista que habia antes de abrir el panel (R32).
    expect(page.url(), 'cerrar el panel no debe perder los parametros de lista').toBe(urlBeforeSheet);
    await expect(page.getByTestId(LIST_TESTID)).toBeVisible({ timeout: 60_000 });

    // El assert filtra POR EL NOMBRE, nunca por «la primera fila» ni por el total: la busqueda la
    // resolvio el servidor sobre el catalogo entero y solo pueden quedar las dos filas de ESTE
    // worker, porque los nombres llevan su `RUN_ID`.
    const nameCell = page.getByTestId(NAME_CELL_TESTID).filter({ hasText: exactText(derivedUnitName) });
    await expect(nameCell).toHaveCount(1, { timeout: 60_000 });
    await expect(nameCell.first()).toBeVisible();

    // --- 11. LA EQUIVALENCIA ARMADA (R17, R50), que es lo que este recorrido aporta sobre los
    // tests de unidad: la frase se compone en la FILA de la unidad creada —localizada por el id que
    // puso la base de datos, no por su posicion— con el nombre de OTRA fila, resuelto por la
    // segunda lectura de la seccion, y con el factor ya sin los ceros de relleno que devuelve
    // `Decimal(14,4)`. La cadena esperada se compone aqui con los valores del FIXTURE: no es copy
    // de la interfaz, es el formato que R17 define (R49).
    const equivalenceCell = page
      .getByTestId(`data-table-row-${created.id}`)
      .getByTestId(EQUIVALENCE_CELL_TESTID);
    await expect(equivalenceCell).toHaveText(
      exactText(`1 ${derivedUnitName} = ${FACTOR} ${baseUnitName}`),
      { timeout: 60_000 },
    );
  });

  test('una sesion valida sin los permisos de unidades recibe 404 dentro del layout privado y no ve la tabla (R12)', async ({
    page,
  }) => {
    // El Operador del seed no tiene `unidades.consultar` ni `unidades.modificar` (QC-74 R9), asi que
    // la pantalla de unidades —que exige los dos— le esta cerrada. Donde aterriza lo deriva
    // `loginAndLand` de sus permisos (`e2e/helpers/landing.ts`).
    await loginAndLand(page, operatorUser);

    // Sesion valida, permisos ausentes: **404, sin redireccion**. La respuesta es indistinguible de
    // la de una ruta que no existe, que es justo lo que evita delatar que el modulo esta ahi. No es
    // «no autenticado»: no acaba en el login, y esa diferencia es lo que un redirect al login
    // enmascararia.
    const response = await page.goto(UNITS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);

    // Y ese 404 se pinta DENTRO del layout privado (QC-75 R8): el usuario conserva su menu y su
    // salida en vez de quedarse en una pagina pelada.
    await expect(page.getByTestId(NOT_FOUND_TESTID)).toBeVisible({ timeout: 60_000 });

    // Ni un dato del catalogo: ni el titulo, ni la tabla compartida, ni la lista, ni siquiera el
    // estado vacio —que ya delataria que la pantalla existe— ni el disparador del alta.
    await expect(page.getByTestId(TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(CREATE_OPEN_TESTID)).toHaveCount(0);
  });
});
