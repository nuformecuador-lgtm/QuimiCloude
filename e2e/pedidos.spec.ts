/**
 * E2E de la pantalla de pedidos (QC-35, T15): el camino completo del Administrador (R48) y el
 * rechazo del que no lo es (R49).
 *
 * Por que existe, y por que AQUI: `design.md > 13` lo pide entero -login -> `ORDERS_ROUTE` ->
 * alta con la receta tomada del selector CON BUSQUEDA, cantidad y precio decimales y la
 * prioridad por defecto visible -> el pedido en la lista por su correlativo -> cancelarlo con
 * motivo -> el motivo en su fila-, sobre el patron ya mergeado de `e2e/inventario.spec.ts`,
 * `e2e/recetas.spec.ts` y `e2e/proveedores.spec.ts`.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware,
 *    regla ruta->rol, Server Component de la lista, las Server Actions REALES de `pedidos`
 *    (QC-34), `recetas` (QC-57) y `unidades` (QC-32) contra Postgres, y `router.refresh()`. En
 *    unit todas esas actions son dobles.
 *  - **La tabla compartida de QC-55 montada de verdad** (esta pantalla es su primer consumidor):
 *    fijado de la columna del correlativo, paginacion y celda de acciones con sus dialogos.
 *  - El selector de receta CON BUSQUEDA AL SERVIDOR (R31) y el de unidad, que es la primitiva
 *    `Select` con su portal: jsdom no ejercita ninguno de los dos igual.
 *  - **El corte por rol de verdad** (R49): en unit se afirma la DECISION (`decideRouteAccess`);
 *    aqui se afirma que el usuario acaba fuera y sin ver ni un dato.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * DATOS: `orders`, `recipes` y `units` son tablas reales y COMPARTIDAS, y varios
 * proyectos/worktrees pueden correr a la vez. Por eso, copiando el patron ya asentado:
 *  - todo lo que este spec crea lleva el prefijo `qc35_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts de la lista filtran por el CORRELATIVO que el backend devolvio en el alta y por
 *    el MOTIVO que lleva el `RUN_ID`, **nunca** por «la primera fila» ni por totales: Chromium y
 *    WebKit corren a la vez sobre la misma base y ambos crean pedidos;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, respetando el orden que imponen las FK
 *    RESTRICT: pedidos -> receta -> unidad -> usuarios -> empresa.
 *
 * EL PEDIDO SE BORRA A MANO EN `afterAll`, y no por la pantalla: el borrado de la UI es LOGICO
 * (`deleted_at`), asi que la fila seguiria en la base contando para los tests de integracion de
 * otras features. Lo que este spec ensucia, este spec lo borra de verdad.
 *
 * LA RECETA Y LA UNIDAD SON FIXTURE, no se dan de alta por la UI: cada una tiene su propia
 * pantalla y su propio E2E, y el recorrido de R48 es el del pedido. La unidad se crea SIN
 * simbolo a proposito, porque el selector muestra `symbol ?? name` (`unit-select.tsx`) y asi la
 * opcion se localiza por el nombre con `RUN_ID` en vez de por un simbolo que se repetiria.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` y `Operador` los siembra
 * `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts`), y el rol tiene que llamarse
 * EXACTAMENTE asi porque la regla ruta->rol compara por nombre. Si falta, el `beforeAll` falla
 * diciendo que hay que sembrar, en vez de dar un rojo incomprensible en mitad del recorrido.
 *
 * NINGUN LITERAL `'/pedidos'`: la URL se deriva SIEMPRE de `ORDERS_ROUTE` (R2), igual que el
 * correlativo se deriva SIEMPRE de `formatOrderNumber` (R10) y la prioridad por defecto de
 * `DEFAULT_ORDER_PRIORITY` (R27). Ningun assert mira copy (R44).
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { DEFAULT_ORDER_PRIORITY, formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, LOGIN_ROUTE, ORDERS_ROUTE } from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc35_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/recetas.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez, y ademas puede haber otro worktree corriendo su propio E2E contra la misma base:
 * borrar por prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando. Una
 * hora deja fuera cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

/**
 * Orden con el que se pide la lista: por fecha de solicitud, del mas nuevo al mas viejo. No es un
 * atajo para «la primera fila» -el assert sigue filtrando por el correlativo- sino para que el
 * pedido recien creado caiga en las primeras paginas y el recorrido no tenga que pasear la lista
 * entera. `createdAt` esta en `ORDER_QUERYABLE.sortable`, asi que el parser lo acepta (R18).
 */
const LIST_SORT = 'createdAt:desc';

/** Cantidad y precio DECIMALES (R39, R48): viajan como cadena de punta a punta. */
const ORDER_QUANTITY = '12.5';
const ORDER_UNIT_PRICE = '1234.5678';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc35-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc35-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Catalogo minimo que el alta necesita (`design.md > 13`), creado como fixture. */
const recipeName = `${FIXTURE_PREFIX}receta_${RUN_ID}`;
const unitName = `${FIXTURE_PREFIX}unidad_${RUN_ID}`;

/** Motivo de la cancelacion. Lleva el `RUN_ID` para que el assert no case con el de otro worker. */
const cancellationReason = `Cancelado por el E2E ${RUN_ID}`;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria. NUNCA la de
 * instalacion: el indice `companies_name_unique` es GLOBAL y chocaria con la de `db:seed`.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;
let adminUserId: string | null = null;
let recipeId: string | null = null;
let unitId: string | null = null;

async function createUserWithRole(user: Credentials, roleName: string): Promise<string> {
  if (!companyId) {
    throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  }
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque la regla ruta-rol compara por ` +
        'nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  const created = await prisma.user.create({
    data: {
      firstNames: `Qc35${RUN_ID.slice(0, 8)}`,
      lastNames: 'Pedidos',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  });

  return created.id;
}

/** Entra por el formulario real y aterriza en el dashboard. */
async function login(page: Page, user: Credentials): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });
}

/**
 * URL de la lista, SIEMPRE derivada de `ORDERS_ROUTE` (R2). Ningun literal de ruta en este spec.
 */
function ordersUrl(): string {
  const query = new URLSearchParams({ pageSize: LIST_PAGE_SIZE, sort: LIST_SORT });
  return `${ORDERS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: `2026-0000012` no puede casar con `2026-00000123`. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * La fila de la tabla compartida cuyo correlativo es EXACTAMENTE `numberText`. Nunca «la primera
 * fila»: los dos proyectos de Playwright crean un pedido cada uno en el mismo instante, asi que
 * la primera fila puede ser la del otro navegador.
 */
function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator('[data-testid^="data-table-row-"]')
    .filter({
      has: page.getByTestId('data-table-cell-orderNumber').filter({ hasText: exactText(numberText) }),
    });
}

/**
 * Recorre las paginas de la lista hasta encontrar la fila del correlativo pedido. Hace falta
 * porque la pantalla NO tiene busqueda (R20, `ORDER_QUERYABLE.searchable` es `false`) y la base
 * es compartida: aunque se pida por fecha descendente, otro worker puede haber empujado la fila
 * a la segunda pagina. De paso ejercita la paginacion de QC-55 en un navegador de verdad.
 */
async function findOrderRow(page: Page, numberText: string): Promise<Locator> {
  const next = page.getByTestId('data-table-next');

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
    await expect(page.getByTestId('data-table')).toBeVisible({ timeout: 60_000 });
  }
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc35_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). Orden que imponen las FK RESTRICT: pedidos -> recetas -> unidades
  // -> usuarios -> empresas.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  const orphanRecipes = await prisma.recipe.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanUnits = await prisma.unit.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);
  const orphanUnitIds = orphanUnits.map((unit) => unit.id);

  // Los pedidos huerfanos se identifican por SU receta o SU unidad de fixture: la tabla `orders`
  // no tiene ningun campo de texto donde llevar el prefijo. Por eso van primero, y por eso este
  // borrado no puede alcanzar ningun pedido que no sea de un E2E viejo de esta ficha.
  if (orphanRecipeIds.length > 0 || orphanUnitIds.length > 0) {
    await prisma.order.deleteMany({
      where: {
        OR: [{ recipeId: { in: orphanRecipeIds } }, { unitId: { in: orphanUnitIds } }],
      },
    });
  }
  await prisma.recipe.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.unit.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas van DESPUES de sus usuarios: `users.company_id` es
  // `onDelete: Restrict` (QC-47 R11) y borrarlas antes lo rechazaria la base.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios. `nameNormalized` sale de
  // `normalizeCompanyName`, la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3).
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  adminUserId = await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  await createUserWithRole(operatorUser, ROLE_OPERADOR);

  // Receta y unidad de FIXTURE (`design.md > 13`), con las MISMAS funciones de normalizacion del
  // dominio que usa la app: `name_normalized` es NOT NULL en las dos tablas.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: recipeName,
        nameNormalized: normalizeRecipeName(recipeName),
        createdBy: adminUserId,
      },
      select: { id: true },
    })
  ).id;

  // SIN simbolo a proposito: el selector pinta `symbol ?? name`, asi que la opcion se localiza
  // por el nombre con `RUN_ID` y no por un simbolo que compartiria con otras unidades.
  unitId = (
    await prisma.unit.create({
      data: { name: unitName, nameNormalized: normalizeUnitName(unitName), symbol: null },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: cada paso va en su
  // propio `try`/`finally`. El orden lo imponen las FK RESTRICT: los pedidos liberan receta,
  // unidad y usuarios; la empresa va la ultima.
  //
  // **Por los ids y nombres EXACTOS de ESTE worker, NUNCA por `FIXTURE_PREFIX`**: `fullyParallel`
  // reparte los dos tests de este archivo en workers DISTINTOS, cada uno con su propio `RUN_ID` y
  // su propio fixture. Borrar por prefijo aqui se llevaria por delante lo que el OTRO worker
  // acaba de crear.
  //
  // El pedido se borra FISICAMENTE: el borrado de la pantalla es logico (`deleted_at`) y dejaria
  // la fila contando en los tests de integracion de otras features.
  try {
    if (recipeId !== null || unitId !== null) {
      await prisma.order.deleteMany({
        where: {
          OR: [
            ...(recipeId === null ? [] : [{ recipeId }]),
            ...(unitId === null ? [] : [{ unitId }]),
          ],
        },
      });
    }
  } finally {
    try {
      await prisma.recipe.deleteMany({ where: { name: recipeName } });
    } finally {
      try {
        await prisma.unit.deleteMany({ where: { name: unitName } });
      } finally {
        try {
          await prisma.user.deleteMany({
            where: { username: { in: [adminUser.username, operatorUser.username] } },
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
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('pantalla de pedidos', () => {
  test('el Administrador entra, da de alta un pedido, lo ve por su correlativo y lo cancela con motivo (R48)', async ({
    page,
  }) => {
    await login(page, adminUser);

    // --- 1. La pantalla se sirve a un Administrador (R49, la mitad que deja pasar).
    await page.goto(ordersUrl());
    await expect(page.getByTestId('pedidos-title')).toBeVisible({ timeout: 60_000 });

    // --- 2. El disparador del alta abre el panel lateral (R25). Aparece en la cabecera de la
    // lista y tambien en el estado vacio: vale cualquiera de los dos.
    await page.getByTestId('order-create-open').first().click();
    await expect(page.getByTestId('order-form')).toBeVisible({ timeout: 60_000 });

    // --- 3. Receta TOMADA DEL SELECTOR CON BUSQUEDA (R31): se escribe el nombre, la consulta la
    // resuelve el servidor y se elige la opcion. Nada de inventar el id a mano.
    const picker = page.getByTestId('recipe-picker');
    await picker.click();
    await picker.fill(recipeName);
    const recipeOption = page.getByTestId('recipe-picker-option').filter({ hasText: recipeName });
    await expect(recipeOption).toHaveCount(1, { timeout: 60_000 });
    await recipeOption.click();
    // Lo que viaja en el `FormData` es el id elegido, no el texto escrito.
    await expect(page.getByTestId('recipe-picker-value')).toHaveValue(recipeId ?? '');

    // --- 4. Cantidad y precio DECIMALES, escritos como texto (R39).
    await page.getByTestId('order-field-quantity').fill(ORDER_QUANTITY);
    await page.getByTestId('order-field-unitPrice').fill(ORDER_UNIT_PRICE);

    // --- 5. Unidad, del selector (R32).
    await page.getByTestId('order-unit-select').click();
    await page.getByTestId('order-unit-option').filter({ hasText: unitName }).click();

    // --- 6. La prioridad por defecto esta VISIBLE y preseleccionada (R27): no se toca el
    // desplegable, solo se comprueba que muestra algo. Que ese algo sea el defecto del contrato
    // se afirma mas abajo sobre lo que el backend guardo, sin depender de ningun copy (R44).
    await expect(page.getByTestId('order-priority-select')).not.toHaveText('');

    // --- 7. Guardar: la Server Action REAL de `pedidos` (QC-34) contra Postgres, sin `fetch` de
    // por medio (R41).
    await page.getByTestId('order-form-submit').click();

    // --- 8. Con exito el panel se cierra y avisa por el `<Toaster />` que el layout privado YA
    // monta (R35, R36). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId('order-form')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 9. El correlativo lo pone el BACKEND (secuencia por ano de QC-33), asi que se lee de
    // donde el alta lo dejo y se compone SIEMPRE con `formatOrderNumber` (R10), nunca a mano.
    const created = await prisma.order.findFirstOrThrow({
      where: { recipeId: recipeId ?? '', deletedAt: null },
      select: {
        id: true,
        orderYear: true,
        orderSequence: true,
        priority: true,
        quantity: true,
        unitPrice: true,
        unitId: true,
      },
    });
    const numberText = formatOrderNumber({
      year: created.orderYear,
      sequence: created.orderSequence,
    });

    // La prioridad que se guardo es la del contrato (R27) y los decimales llegaron intactos
    // (R39): ni el formulario ni la pantalla los pasaron por coma flotante.
    expect(created.priority).toBe(DEFAULT_ORDER_PRIORITY);
    expect(created.unitId).toBe(unitId);
    expect(Number(created.quantity)).toBe(Number(ORDER_QUANTITY));
    expect(Number(created.unitPrice)).toBe(Number(ORDER_UNIT_PRICE));

    // --- 10. Y el pedido esta en la lista, localizado POR SU CORRELATIVO (R7, R10).
    const row = await findOrderRow(page, numberText);
    await expect(row, `el pedido ${numberText} deberia verse en la lista`).toBeVisible({
      timeout: 60_000,
    });
    await expect(row.getByTestId('data-table-cell-recipeName')).toHaveText(recipeName);

    // --- 11. Cancelacion con motivo (R37): el dialogo pide el motivo y solo entonces confirma.
    await row.getByTestId('order-action-cancel').click();
    await expect(page.getByTestId('cancel-order-dialog')).toBeVisible({ timeout: 60_000 });
    // Sin motivo no hay cancelacion posible: el control de confirmar nace deshabilitado.
    await expect(page.getByTestId('cancel-order-confirm')).toBeDisabled();
    await page.getByTestId('cancel-order-reason').fill(cancellationReason);
    await page.getByTestId('cancel-order-confirm').click();

    // --- 12. El dialogo se cierra y la lista se pone al dia sin que el usuario recargue (R35).
    await expect(page.getByTestId('cancel-order-dialog')).toHaveCount(0, { timeout: 60_000 });

    // --- 13. El motivo se ve EN SU FILA (R11, R48), buscada otra vez por el correlativo: tras el
    // refresco la fila es un nodo nuevo.
    const cancelledRow = await findOrderRow(page, numberText);
    await expect(
      cancelledRow.getByTestId('data-table-cell-cancellationReason'),
      'el motivo de la cancelacion deberia verse en la fila del pedido',
    ).toHaveText(cancellationReason, { timeout: 60_000 });
    // Con el pedido en estado final los tres controles quedan inertes y con su motivo a la vista
    // (R24), sin depender de ningun `title`.
    await expect(cancelledRow.getByTestId('order-action-edit')).toBeDisabled();

    // Lo cancelo el backend de verdad, no solo lo pinto la pantalla. El CHECK
    // `orders_cancellation_reason_matches_status` (QC-34) garantiza que un motivo guardado
    // implica `status = 'CANCELADO'`: afirmar el motivo es afirmar el estado.
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
      select: { cancellationReason: true, deletedAt: true },
    });
    expect(persisted.cancellationReason).toBe(cancellationReason);
    expect(persisted.deletedAt).toBeNull();
  });

  test('un usuario que no es Administrador acaba fuera y no ve ningun dato de pedidos (R49)', async ({
    page,
  }) => {
    await login(page, operatorUser);

    // Sesion valida, rol distinto: la regla ruta-rol lo saca al dashboard SIN renderizar nada de
    // la pantalla. No es «no autenticado»: acaba en el dashboard, no en el login, y esa
    // diferencia es justo lo que R49 pide y lo que un redirect al login enmascararia.
    await page.goto(ordersUrl());
    await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });

    await expect(page.getByTestId('pedidos-title')).toHaveCount(0);
    await expect(page.getByTestId('order-list')).toHaveCount(0);
    await expect(page.getByTestId('data-table')).toHaveCount(0);
    await expect(page.getByTestId('order-list-empty')).toHaveCount(0);
    await expect(page.getByTestId('order-list-error')).toHaveCount(0);
  });
});
