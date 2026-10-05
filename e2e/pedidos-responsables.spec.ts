/**
 * E2E del recorrido completo de responsables sobre la pantalla de pedidos (QC-102, T16, R37).
 *
 * QUE RECORRE, en un solo `test(...)` y en este orden, que es literalmente el que pactaron la
 * decision cerrada 12 de esta ficha y QC-87 dec. 11:
 *   1. abrir un pedido desde el LISTADO, por la entrada propia «Responsables» de su fila (R24);
 *   2. MARCAR UNA PERSONA suelta y confirmar (R32);
 *   3. APLICAR UN GRUPO y confirmar (R32), que entra con sus dos personas y su nombre CONGELADO;
 *   4. SACAR A ALGUIEN —la persona suelta— con su accion propia (R31);
 *   5. cerrar el panel, volver a pedir el LISTADO y comprobar alli los AVATARES y el NOMBRE DEL
 *      GRUPO (R37).
 *
 * POR QUE ES UN SOLO RECORRIDO Y NO CINCO TESTS: cada paso es la precondicion del siguiente
 * —aplicar un grupo exige un pedido abierto, sacar a alguien exige haberlo metido— y partirlo
 * obligaria a sembrar por la base el estado de los anteriores, que es justo lo que un test de
 * extremo a extremo existe para NO hacer. Mismo criterio que `e2e/grupos-de-trabajo.spec.ts`.
 *
 * DONDE SE COMPRUEBA EL PASO 5, Y POR QUE ASI. El paso 5 no es decorativo: es el motivo de que
 * esta ficha sea `fullstack`. Se comprueba en DOS mitades, las dos **sobre el listado ya servido
 * de nuevo por el servidor** (`page.goto` de la lista, no estado de cliente que sobreviviera al
 * panel), de modo que lo que se afirma es el resultado de la CONSULTA EN LOTE de la pagina:
 *   - los AVATARES, en la celda de la columna nueva (`data-table-cell-responsibles`), por su
 *     nombre accesible —que es el `displayName` completo (R21)—;
 *   - el NOMBRE DEL GRUPO, abriendo el panel desde esa misma fila del listado. La columna de la
 *     fila muestra iniciales y `+N` **y nada mas** (R17, R18, decision cerrada 8): el nombre del
 *     grupo se presenta agrupado por origen en el panel (R25). Esa segunda puerta desde el
 *     listado es la que R24 y R35 exigen, y abrirla **no cuesta ninguna consulta** (R26): el
 *     panel pinta lo que la fila ya trajo.
 *
 * EL GRUPO SE RENOMBRA POR LA BASE ANTES DEL PASO 5, a proposito (R12, decision cerrada 6). Lo
 * que el listado debe seguir mostrando es el nombre **congelado en la fila de asignacion** que
 * QC-86 guardo, no el nombre vigente de `work_groups`. Si alguien resolviera el nombre con un
 * join —lo que R5 prohibe— este paso se pondria rojo, y ese es exactamente su valor aqui.
 *
 * QUE APORTA SOBRE UNIT E INTEGRACION, que es lo unico que justifica su coste:
 *  - la cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, la
 *    regla ruta->rol, el Server Component de la lista con sus CUATRO lecturas (pedidos, recetas,
 *    responsables en lote y catalogos) y las Server Actions REALES de QC-87 —asignar y
 *    desasignar— contra Postgres. En unit todas ellas son dobles;
 *  - el panel lateral con su portal y el `<Toaster />` del layout: jsdom no ejercita ninguno;
 *  - `router.refresh()` de verdad: que la persona aparezca y desaparezca porque el SERVIDOR lo
 *    volvio a decir, no porque el cliente insertara una fila;
 *  - Chromium y WebKit. WebKit es el motor de iOS y la regla multiplataforma pide ejercitarlo.
 *
 * LO QUE ESTE SPEC **NO** HACE: tocar `e2e/pedidos.spec.ts` (R38). Aquel recorrido —alta,
 * correlativo y cancelacion— sigue como estaba; este archivo es nuevo y no comparte ni fixture ni
 * prefijo con el.
 *
 * EL PEDIDO SE SIEMBRA POR LA BASE y no por la pantalla: darlo de alta por el formulario es el
 * recorrido de QC-35 R48, que ya tiene su E2E, y repetirlo aqui alargaria el camino sin afirmar
 * nada nuevo. El correlativo arranca alto y aleatorio —mismo mecanismo que
 * `tests/integration/asignaciones/use-case-fixture.ts`— para no chocar con
 * `orders_order_year_order_sequence_key`; el ano sale de `created_at` porque el CHECK
 * `orders_order_year_matches_created_at` lo ata.
 *
 * LAS TRES PERSONAS DEL FIXTURE NACEN `active` EXPLICITAMENTE, y no es un detalle: la columna es
 * `@default(pending)`, y QC-87 solo asigna cuentas `active`. Con `pending` el paso 2 «tendria
 * exito» y no habria nada que ver.
 *
 * EL ACTOR NO APARECE ENTRE LOS CANDIDATOS (QC-66 dec. 12): `listUsers` EXCLUYE al actor, asi que
 * el administrador no puede asignarse a si mismo. Por eso el fixture crea a OTRAS personas.
 *
 * DATOS Y AISLAMIENTO, copiando el patron ya asentado de `e2e/pedidos.spec.ts` y
 * `e2e/grupos-de-trabajo.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc102_e2e_` y dentro el `RUN_ID` del worker;
 *  - cada worker tiene su propia EMPRESA, y personas, grupos y asignaciones estan acotados a la
 *    empresa del actor, asi que un worker no puede ver ni tocar las filas del otro;
 *  - la fila del pedido se localiza SIEMPRE por su correlativo, nunca por «la primera fila»:
 *    Chromium y WebKit corren a la vez sobre la misma base y `orders` no tiene empresa;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra SIEMPRE, aunque el test reviente, por los identificadores de ESTE worker y
 *    respetando el orden que imponen las FK RESTRICT: asignaciones -> pedido -> pertenencias ->
 *    grupo -> receta -> personas -> empresa.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus
 * modulos son de CLIENTE (`'use client'`, JSX, hooks) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec sin aportar nada. Mismo criterio que
 * `e2e/grupos-de-trabajo.spec.ts`. Ningun assert mira copy: todo se localiza por `data-testid`,
 * por atributo de datos o por valores del fixture; el unico texto que se compara es el que
 * producen `buildDisplayName` y `formatOrderNumber`, que son funciones del CONTRATO.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  buildDisplayName,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

// QC-93: la entrada y su aterrizaje, derivado de los permisos del usuario en la base.
import { loginAndLand } from './helpers/landing';
import { openOrderRowMenu, rowMenuTrigger } from './helpers/order-distribution';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc102_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Edad minima para considerar huerfana una fila con nuestro prefijo (ver cabecera). */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

/** Orden con el que se pide la lista: lo recien creado cae en las primeras paginas (QC-35 R18). */
const LIST_SORT = 'createdAt:desc';

/** `data-testid` de la pantalla y de la tabla compartida. */
const ORDERS_TITLE_TESTID = 'pedidos-title';
const DATA_TABLE_TESTID = 'data-table';
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const RESPONSIBLES_CELL_TESTID = 'data-table-cell-responsibles';
const NEXT_PAGE_TESTID = 'data-table-next';

/** `data-testid` de la columna de responsables y de la cuarta accion de la fila (QC-102 T7, T13). */
const RESPONSIBLE_AVATAR_TESTID = 'responsible-avatar';
const RESPONSIBLES_MISSING_TESTID = 'order-missing-responsibles';
const ROW_ACTION_RESPONSIBLES_TESTID = 'order-action-responsibles';

/** `data-testid` de la seccion de responsables DENTRO del panel que ya existia (QC-102 T8, T9). */
const SHEET_RESPONSIBLES_TESTID = 'order-sheet-responsibles';
const RESPONSIBLES_SECTION_TESTID = 'order-responsibles';
const RESPONSIBLES_EMPTY_TESTID = 'order-responsibles-empty';
const RESPONSIBLE_GROUP_TESTID = 'order-responsible-group';
const RESPONSIBLE_GROUP_NAME_TESTID = 'order-responsible-group-name';
const RESPONSIBLE_PERSON_TESTID = 'order-responsible-person';
const RESPONSIBLE_REMOVE_PERSON_TESTID = 'order-responsible-remove-person';
const RESPONSIBLE_CANDIDATE_TESTID = 'order-responsible-candidate';
const RESPONSIBLE_WORK_GROUP_TESTID = 'order-responsible-work-group';
const RESPONSIBLE_CONFIRM_TESTID = 'order-responsible-confirm';
const RESPONSIBLE_ERROR_TESTID = 'order-responsible-error';
/** Cierra el panel de formulario (`components/ui/sheet.tsx`: `isForm` desactiva Escape a
 * proposito, para no tirar un formulario a medio llenar de un gesto sin querer). */
const ORDER_FORM_CANCEL_TESTID = 'order-form-cancel';

/** Valor de `data-section` con el que el panel abre en responsables (QC-102 R24). */
const RESPONSIBLES_SECTION_VALUE = 'responsibles';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc102-Admin-${RUN_ID.slice(0, 12)}`,
};

/** La persona que el recorrido MARCA suelta en el paso 2 y SACA en el paso 4. */
const looseUser: Credentials = {
  username: `${FIXTURE_PREFIX}suelta_${RUN_ID}`,
  password: `Qc102-Suelta-${RUN_ID.slice(0, 12)}`,
};

/** Las dos personas que entran POR EL GRUPO en el paso 3, y que quedan al final. */
const memberOneUser: Credentials = {
  username: `${FIXTURE_PREFIX}miembro1_${RUN_ID}`,
  password: `Qc102-Miembro1-${RUN_ID.slice(0, 12)}`,
};
const memberTwoUser: Credentials = {
  username: `${FIXTURE_PREFIX}miembro2_${RUN_ID}`,
  password: `Qc102-Miembro2-${RUN_ID.slice(0, 12)}`,
};

/** Los nombres del fixture. De ellos salen los nombres mostrables, VIA CONTRATO. */
const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [adminUser.username]: 'Administra',
  [looseUser.username]: 'Suelta',
  [memberOneUser.username]: 'Miembrouno',
  [memberTwoUser.username]: 'Miembrodos',
};
const firstNames = `Qc102${RUN_ID.slice(0, 8)}`;

function displayNameOf(user: Credentials): string {
  return buildDisplayName(firstNames, LAST_NAMES_BY_USERNAME[user.username] ?? '', user.username);
}

/**
 * El grupo del recorrido. Se crea con un nombre y **se renombra por la base antes del paso 5**:
 * lo que el listado debe seguir mostrando es el PRIMERO, el que quedo congelado en la fila de
 * asignacion (R12).
 */
const workGroupName = `${FIXTURE_PREFIX}grupo_${RUN_ID}`;
const renamedWorkGroupName = `${FIXTURE_PREFIX}grupo_renombrado_${RUN_ID}`;

/** Catalogo minimo que el pedido necesita, creado como fixture. */
const recipeName = `${FIXTURE_PREFIX}receta_${RUN_ID}`;

/** Empresa efimera de este worker. NUNCA la de instalacion: `companies_name_unique` es GLOBAL. */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

/** Cantidad del pedido sembrado. Decimal, como el resto de la pantalla. */
const ORDER_QUANTITY = '12.5';

/**
 * Posicion del correlativo del pedido de este fixture. Alta y aleatoria para no chocar con
 * `orders_order_year_order_sequence_key` ni con el worker del otro navegador.
 */
const ORDER_SEQUENCE = 830_000 + Math.floor(Math.random() * 60_000);

let companyId: string | null = null;
let adminUserId: string | null = null;
let looseUserId: string | null = null;
let memberOneUserId: string | null = null;
let memberTwoUserId: string | null = null;
let workGroupId: string | null = null;
let recipeId: string | null = null;
let orderId: string | null = null;
let orderNumberText: string | null = null;

async function createUserWithRole(user: Credentials, roleName: string): Promise<string> {
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
  const created = await prisma.user.create({
    data: {
      firstNames,
      lastNames: LAST_NAMES_BY_USERNAME[user.username] ?? 'Fixture',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // EXPLICITO, no por defecto (ver cabecera): QC-87 solo asigna cuentas `active`.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** URL de la lista, SIEMPRE derivada de `ORDERS_ROUTE`. Ningun literal de ruta en este spec. */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: LIST_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: `2026-0000012` no puede casar con `2026-00000123`. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/** La fila de la tabla compartida cuyo correlativo es EXACTAMENTE `numberText`. */
function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`)
    .filter({
      has: page.getByTestId(ORDER_NUMBER_CELL_TESTID).filter({ hasText: exactText(numberText) }),
    });
}

/**
 * Recorre las paginas de la lista hasta encontrar la fila del correlativo pedido. Hace falta
 * porque la pantalla NO tiene busqueda y `orders` es una tabla compartida y SIN empresa: otro
 * worker puede haber empujado la fila a la segunda pagina.
 */
async function findOrderRow(page: Page, numberText: string): Promise<Locator> {
  const next = page.getByTestId(NEXT_PAGE_TESTID);

  for (;;) {
    const row = rowByNumber(page, numberText);
    if ((await row.count()) > 0) return row.first();
    if ((await next.count()) === 0 || (await next.isDisabled())) return row.first();

    const before = new URL(page.url()).searchParams.get('page');
    await next.click();
    await page.waitForFunction(
      (previous) => new URL(window.location.href).searchParams.get('page') !== previous,
      before,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
  }
}

/** Pide la lista de nuevo AL SERVIDOR y devuelve la fila del pedido de este worker. */
async function openOrdersListAndFindRow(page: Page, numberText: string): Promise<Locator> {
  await page.goto(ordersUrl());
  await expect(page.getByTestId(ORDERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
  const row = await findOrderRow(page, numberText);
  await expect(row, `el pedido ${numberText} deberia verse en la lista`).toBeVisible({
    timeout: 60_000,
  });
  return row;
}

/**
 * Abre el panel en la seccion de responsables desde la fila del listado (R24) y devuelve la
 * seccion. Comprueba de paso que abre EN esa seccion y que la seccion se monta **dentro del panel
 * que ya existia**, no en una ruta nueva (R23): la URL no cambia.
 */
async function openResponsiblesPanel(page: Page, row: Locator): Promise<Locator> {
  const urlBeforeOpen = page.url();
  await (await openOrderRowMenu(page, rowMenuTrigger(row), ROW_ACTION_RESPONSIBLES_TESTID)).click();

  const anchor = page.getByTestId(SHEET_RESPONSIBLES_TESTID);
  await expect(anchor).toBeVisible({ timeout: 60_000 });
  await expect(anchor).toHaveAttribute('data-section', RESPONSIBLES_SECTION_VALUE);
  expect(page.url(), 'abrir el panel de responsables no debe navegar').toBe(urlBeforeOpen);

  const section = page.getByTestId(RESPONSIBLES_SECTION_TESTID);
  await expect(section).toBeVisible({ timeout: 60_000 });
  return section;
}

/** Un elemento por `data-testid` **y** por el identificador que lleva en su atributo de datos. */
function byTestIdAndUserId(scope: Page | Locator, testId: string, userId: string): Locator {
  return scope.locator(`[data-testid="${testId}"][data-user-id="${userId}"]`);
}

function byTestIdAndWorkGroupId(scope: Page | Locator, testId: string, groupId: string): Locator {
  return scope.locator(`[data-testid="${testId}"][data-work-group-id="${groupId}"]`);
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc102_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas. El corte POR EDAD no
  // es un adorno: sin el, este borrado se llevaria lo que el otro proyecto esta usando ahora
  // mismo. Orden que imponen las FK RESTRICT: asignaciones -> pedidos -> pertenencias -> grupos
  // -> recetas -> personas -> empresas.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  if (orphanCompanyIds.length > 0) {
    // `OrderAssignment` y `WorkGroupMember` no declaran `@relation` —sus FK son compuestas y van
    // escritas a mano en la migracion—, asi que se resuelven por identificadores.
    await prisma.orderAssignment.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.workGroupMember.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.workGroup.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }

  const orphanRecipes = await prisma.recipe.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);
  if (orphanRecipeIds.length > 0) {
    // Los pedidos huerfanos se identifican por SU receta de fixture: `orders` no tiene ningun
    // campo de texto donde llevar el prefijo ni columna de empresa.
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: orphanRecipeIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas van DESPUES de todo lo que cuelga de ellas: las FK son `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus personas y su grupo. `nameNormalized` sale de
  // `normalizeCompanyName`, la UNICA definicion de «mismo nombre de empresa» (QC-47 R3).
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  looseUserId = await createUserWithRole(looseUser, ROLE_OPERADOR);
  memberOneUserId = await createUserWithRole(memberOneUser, ROLE_OPERADOR);
  memberTwoUserId = await createUserWithRole(memberTwoUser, ROLE_OPERADOR);

  // El grupo del recorrido, con SUS DOS personas dentro: aplicar un grupo vacio no traeria a
  // nadie y el paso 3 no tendria nada que afirmar. `nameNormalized` sale de la UNICA definicion
  // de «mismo nombre de grupo» (QC-83 R3), importada del contrato y no reescrita aqui.
  workGroupId = (
    await prisma.workGroup.create({
      data: {
        name: workGroupName,
        nameNormalized: normalizeWorkGroupName(workGroupName),
        companyId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.workGroupMember.createMany({
    data: [
      { workGroupId, userId: memberOneUserId, companyId },
      { workGroupId, userId: memberTwoUserId, companyId },
    ],
  });

  // Receta de FIXTURE, con la MISMA funcion de normalizacion del dominio que usa la app:
  // `name_normalized` es NOT NULL. De la MISMA empresa en la que abre sesion el Administrador
  // (QC-50): si fuera otra, el aislamiento por empresa la ocultaria del pedido.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: recipeName,
        nameNormalized: normalizeRecipeName(recipeName),
        createdBy: adminUserId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  // El pedido del recorrido, en `PENDIENTE`: es uno de los dos estados que QC-87 admite para
  // asignar. El ano sale del reloj porque el CHECK `orders_order_year_matches_created_at` lo ata
  // a `created_at`.
  const order = await prisma.order.create({
    data: {
      orderYear: new Date().getUTCFullYear(),
      orderSequence: ORDER_SEQUENCE,
      recipeId,
      quantity: ORDER_QUANTITY,
      status: 'PENDIENTE',
      createdBy: adminUserId,
      // QC-60: `orders.company_id` es obligatoria. La empresa de la sesion del recorrido, o el
      // listado de ese administrador no traeria el pedido.
      companyId,
    },
    select: { id: true, orderYear: true, orderSequence: true },
  });
  orderId = order.id;
  // El correlativo se compone SIEMPRE con `formatOrderNumber` (QC-35 R10), nunca a mano.
  orderNumberText = formatOrderNumber({ year: order.orderYear, sequence: order.orderSequence });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara a mitad del
  // recorrido —y entonces quedan asignaciones sin retirar—. El orden lo imponen las FK RESTRICT.
  //
  // **Por los identificadores de ESTE worker, nunca por `FIXTURE_PREFIX`**: los dos proyectos de
  // Playwright corren a la vez, cada uno con su `RUN_ID`, y borrar por prefijo aqui se llevaria
  // lo que el otro acaba de crear.
  //
  // El pedido se borra FISICAMENTE: el borrado de la pantalla es logico (`deleted_at`) y dejaria
  // la fila contando en los tests de integracion de otras features.
  const scopedCompanyId = companyId;
  try {
    if (scopedCompanyId !== null) {
      await prisma.orderAssignment.deleteMany({ where: { companyId: scopedCompanyId } });
    }
  } finally {
    try {
      if (recipeId !== null) {
        await prisma.order.deleteMany({ where: { recipeId } });
      }
    } finally {
      try {
        if (scopedCompanyId !== null) {
          await prisma.workGroupMember.deleteMany({ where: { companyId: scopedCompanyId } });
          await prisma.workGroup.deleteMany({ where: { companyId: scopedCompanyId } });
        }
      } finally {
        try {
          await prisma.recipe.deleteMany({ where: { name: recipeName } });
        } finally {
          try {
            await prisma.user.deleteMany({
              where: {
                username: {
                  in: [
                    adminUser.username,
                    looseUser.username,
                    memberOneUser.username,
                    memberTwoUser.username,
                  ],
                },
              },
            });
          } finally {
            try {
              await prisma.company.deleteMany({ where: { name: companyName } });
            } finally {
              await prisma.$disconnect();
            }
          }
        }
      }
    }
  }
});

// Timeout amplio: el recorrido es largo, el primer `goto` hace que `next dev` compile la ruta bajo
// demanda y bcrypt tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(240_000);

test.describe('responsables en la pantalla de pedidos', () => {
  test('abrir un pedido, marcar una persona, aplicar un grupo, sacar a alguien y ver los avatares y el nombre del grupo EN EL LISTADO (R37)', async ({
    page,
  }) => {
    const numberText = orderNumberText;
    const storedOrderId = orderId;
    const looseId = looseUserId;
    const memberOneId = memberOneUserId;
    const memberTwoId = memberTwoUserId;
    const groupId = workGroupId;
    expect(numberText, 'el fixture del pedido no existe: fallo el beforeAll').not.toBeNull();
    expect(looseId, 'el fixture de las personas no existe: fallo el beforeAll').not.toBeNull();
    expect(groupId, 'el fixture del grupo no existe: fallo el beforeAll').not.toBeNull();
    if (
      numberText === null ||
      storedOrderId === null ||
      looseId === null ||
      memberOneId === null ||
      memberTwoId === null ||
      groupId === null
    ) {
      return;
    }

    await loginAndLand(page, adminUser);

    // --- 1. ABRIR EL PEDIDO desde el LISTADO. La fila se localiza por su correlativo y su celda
    // de responsables pinta el MARCADOR DE AUSENCIA (R19): todavia no hay nadie, y eso es un dato,
    // no una celda vacia ni un identificador tecnico.
    let row = await openOrdersListAndFindRow(page, numberText);
    let cell = row.getByTestId(RESPONSIBLES_CELL_TESTID);
    await expect(cell.getByTestId(RESPONSIBLES_MISSING_TESTID)).toHaveCount(1);
    await expect(cell.getByTestId(RESPONSIBLE_AVATAR_TESTID)).toHaveCount(0);

    // La cuarta entrada de la fila abre el MISMO panel en su seccion (R23, R24): ver quien prepara
    // un pedido no exige pasar por el formulario de edicion.
    let section = await openResponsiblesPanel(page, row);
    await expect(section.getByTestId(RESPONSIBLES_EMPTY_TESTID)).toBeVisible();

    // --- 2. MARCAR UNA PERSONA suelta y confirmar (R32). El catalogo de personas llego POR PROPS
    // desde el servidor (R27): marcar no consulta nada.
    await byTestIdAndUserId(section, RESPONSIBLE_CANDIDATE_TESTID, looseId).click();
    await expect(section.getByTestId(RESPONSIBLE_CONFIRM_TESTID)).toBeEnabled();
    await page.getByTestId(RESPONSIBLE_CONFIRM_TESTID).click();

    // Con exito avisa por el `<Toaster />` que el layout privado YA monta (R33). Se afirma que HAY
    // un aviso, no cual es su texto.
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });
    // Ningun error dentro del panel (R34): si la operacion hubiera fallado, el rojo diria cual.
    await expect(page.getByTestId(RESPONSIBLE_ERROR_TESTID)).toHaveCount(0);

    // La persona esta en el panel porque el SERVIDOR lo volvio a decir tras `router.refresh()`
    // (R33), no porque el cliente insertara una fila.
    await expect(
      byTestIdAndUserId(page, RESPONSIBLE_PERSON_TESTID, looseId),
      'la persona marcada deberia verse en el panel',
    ).toBeVisible({ timeout: 60_000 });

    // Y la escribio la Server Action REAL de QC-87 contra Postgres, suelta y sin grupo.
    const looseRow = await prisma.orderAssignment.findUniqueOrThrow({
      where: { orderId_userId: { orderId: storedOrderId, userId: looseId } },
      select: { workGroupId: true, workGroupName: true },
    });
    expect(looseRow.workGroupId).toBeNull();
    expect(looseRow.workGroupName).toBeNull();

    // --- 3. APLICAR UN GRUPO y confirmar (R32). Entra con SUS DOS personas en UNA sola operacion.
    await byTestIdAndWorkGroupId(page, RESPONSIBLE_WORK_GROUP_TESTID, groupId).click();
    await expect(page.getByTestId(RESPONSIBLE_CONFIRM_TESTID)).toBeEnabled();
    await page.getByTestId(RESPONSIBLE_CONFIRM_TESTID).click();

    const groupBlock = byTestIdAndWorkGroupId(page, RESPONSIBLE_GROUP_TESTID, groupId);
    await expect(groupBlock, 'el grupo aplicado deberia verse agrupado en el panel').toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId(RESPONSIBLE_ERROR_TESTID)).toHaveCount(0);
    // R25: TODOS los responsables, sin limite, y el NOMBRE DEL GRUPO junto a sus personas.
    await expect(groupBlock.getByTestId(RESPONSIBLE_GROUP_NAME_TESTID)).toHaveText(
      exactText(workGroupName),
    );
    await expect(byTestIdAndUserId(groupBlock, RESPONSIBLE_PERSON_TESTID, memberOneId)).toBeVisible();
    await expect(byTestIdAndUserId(groupBlock, RESPONSIBLE_PERSON_TESTID, memberTwoId)).toBeVisible();

    // El nombre del grupo quedo CONGELADO en cada fila de asignacion (R12, QC-86).
    const groupRows = await prisma.orderAssignment.findMany({
      where: { orderId: storedOrderId, workGroupId: groupId },
      select: { userId: true, workGroupName: true },
      orderBy: { userId: 'asc' },
    });
    expect(groupRows).toHaveLength(2);
    expect(groupRows.map((assignment) => assignment.workGroupName)).toEqual([
      workGroupName,
      workGroupName,
    ]);

    // --- 4. SACAR A ALGUIEN: la persona suelta, con su accion propia (R31). Es EXACTAMENTE esa
    // persona y ese pedido; los dos del grupo se quedan.
    await byTestIdAndUserId(page, RESPONSIBLE_REMOVE_PERSON_TESTID, looseId).click();
    await expect(
      byTestIdAndUserId(page, RESPONSIBLE_PERSON_TESTID, looseId),
      'la persona retirada no deberia seguir en el panel',
    ).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId(RESPONSIBLE_ERROR_TESTID)).toHaveCount(0);
    expect(
      await prisma.orderAssignment.count({
        where: { orderId: storedOrderId, userId: looseId },
      }),
    ).toBe(0);
    expect(await prisma.orderAssignment.count({ where: { orderId: storedOrderId } })).toBe(2);

    // --- 4bis. EL GRUPO SE RENOMBRA POR LA BASE (R12). Lo que el listado muestre a partir de
    // ahora tiene que seguir siendo el nombre CONGELADO: si alguien resolviera el nombre con un
    // join contra `work_groups` —lo que R5 prohibe—, el paso 5 se pondria rojo aqui.
    await prisma.workGroup.update({
      where: { id: groupId },
      data: {
        name: renamedWorkGroupName,
        nameNormalized: normalizeWorkGroupName(renamedWorkGroupName),
      },
    });

    // --- 5. CERRAR el panel y volver a pedir el LISTADO AL SERVIDOR. Lo que se afirma a partir de
    // aqui es el resultado de la CONSULTA EN LOTE de la pagina (R16), no estado de cliente que
    // sobreviviera al panel.
    //
    // Se cierra con «Cancelar» y NO con Escape: el panel es `isForm` y `components/ui/sheet.tsx`
    // desactiva a proposito el cierre por Escape en ese caso, para no tirar un formulario a medio
    // llenar de un gesto sin querer (vease su comentario). Escape aqui no cerraria nada y el test
    // se quedaria esperando el `toHaveCount(0)` hasta el timeout.
    await page.getByTestId(ORDER_FORM_CANCEL_TESTID).click();
    await expect(page.getByTestId(SHEET_RESPONSIBLES_TESTID)).toHaveCount(0, { timeout: 60_000 });

    row = await openOrdersListAndFindRow(page, numberText);
    cell = row.getByTestId(RESPONSIBLES_CELL_TESTID);

    // 5a. LOS AVATARES, en la columna nueva: uno por persona, con el NOMBRE COMPLETO como nombre
    // accesible (R21) y sin ninguna imagen. Ya no hay marcador de ausencia.
    await expect(cell.getByTestId(RESPONSIBLE_AVATAR_TESTID)).toHaveCount(2, { timeout: 60_000 });
    await expect(cell.getByTestId(RESPONSIBLES_MISSING_TESTID)).toHaveCount(0);
    await expect(cell.locator('img')).toHaveCount(0);
    await expect(byTestIdAndUserId(cell, RESPONSIBLE_AVATAR_TESTID, memberOneId)).toHaveAttribute(
      'aria-label',
      displayNameOf(memberOneUser),
    );
    await expect(byTestIdAndUserId(cell, RESPONSIBLE_AVATAR_TESTID, memberTwoId)).toHaveAttribute(
      'aria-label',
      displayNameOf(memberTwoUser),
    );
    // La persona retirada ya no esta en la fila.
    await expect(byTestIdAndUserId(cell, RESPONSIBLE_AVATAR_TESTID, looseId)).toHaveCount(0);

    // 5b. EL NOMBRE DEL GRUPO, desde esa misma fila del listado (ver cabecera): la fila muestra
    // iniciales y `+N` y nada mas (R17, R18), asi que el nombre del grupo se alcanza por la
    // segunda puerta que R24 y R35 exigen —y abrirla no cuesta ninguna consulta (R26)—. El nombre
    // que se ve es el CONGELADO, **no** el que `work_groups` tiene ahora (R12).
    section = await openResponsiblesPanel(page, row);
    const listedGroup = byTestIdAndWorkGroupId(section, RESPONSIBLE_GROUP_TESTID, groupId);
    await expect(listedGroup).toBeVisible({ timeout: 60_000 });
    await expect(
      listedGroup.getByTestId(RESPONSIBLE_GROUP_NAME_TESTID),
      'el listado debe mostrar el nombre del grupo CONGELADO en la asignacion, no el vigente',
    ).toHaveText(exactText(workGroupName));
    await expect(
      section.getByTestId(RESPONSIBLE_GROUP_NAME_TESTID).filter({
        hasText: exactText(renamedWorkGroupName),
      }),
    ).toHaveCount(0);
    await expect(byTestIdAndUserId(listedGroup, RESPONSIBLE_PERSON_TESTID, memberOneId)).toBeVisible();
    await expect(byTestIdAndUserId(listedGroup, RESPONSIBLE_PERSON_TESTID, memberTwoId)).toBeVisible();
  });
});
