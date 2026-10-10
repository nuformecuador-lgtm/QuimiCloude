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
 *    aqui se afirma que recibe 404 en su sitio y no ve ni un dato.
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
import { normalizePresentationName } from '@/lib/modules/inventario';
import { DEFAULT_ORDER_PRIORITY, formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';
import {
  addPackagingLine,
  openOrderRowMenu,
  packagingLine,
  rowMenuTrigger,
} from './helpers/order-distribution';
import { seedPackaging } from './helpers/packaging';

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

const PRESENTATION_CONTENT = '1';
const ORDER_PACKAGES = '12';
/** Envases de sobra para la linea del reparto: el alta los aparta. */
const PACKAGING_STOCK = '100';
const PACKAGING_UNIT_COST = '0.5000';

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
const presentationName = `${FIXTURE_PREFIX}presentacion_${RUN_ID}`;
/** El envase del reparto, con la presentacion de arriba como presentacion fija. */
const packagingName = `${FIXTURE_PREFIX}envase_${RUN_ID}`;
const packagingLot = `${FIXTURE_PREFIX}lote_envase_${RUN_ID}`;

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
let presentationId: string | null = null;
let unitId: string | null = null;
let packagingId: string | null = null;

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
  const created = await createFixtureUser({
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
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde
      // esa ficha `pending` no entra por el login, asi que este usuario efimero no
      // llegaria a la pantalla que este spec ejercita.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
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
 * porque la pantalla todavia no tiene caja de busqueda y la base es compartida: aunque se pida
 * por fecha descendente, otro worker puede haber empujado la fila a la segunda pagina. De paso
 * ejercita la paginacion de QC-55 en un navegador de verdad.
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
  const orphanRecipeIds = orphanRecipes.map((recipe) => recipe.id);

  // Los asientos de los envases huerfanos restringen el borrado de sus pedidos y de sus lotes.
  const orphanPackagingBatchIds = (
    await prisma.productBatch.findMany({
      where: {
        product: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      },
      select: { id: true },
    })
  ).map((batch) => batch.id);
  if (orphanPackagingBatchIds.length > 0) {
    await prisma.reservationMovement.deleteMany({
      where: { batchId: { in: orphanPackagingBatchIds } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { batchId: { in: orphanPackagingBatchIds } },
    });
  }

  // Los pedidos huerfanos se identifican por SU receta de fixture: la tabla `orders` no tiene
  // ningun campo de texto donde llevar el prefijo, y desde el 2026-09-07 tampoco tiene unidad.
  // Por eso van primero, y por eso este borrado no puede alcanzar ningun pedido que no sea de un
  // E2E viejo de esta ficha.
  if (orphanRecipeIds.length > 0) {
    await prisma.orderPresentationLine.deleteMany({
      where: { order: { recipeId: { in: orphanRecipeIds } } },
    });
    await prisma.order.deleteMany({ where: { recipeId: { in: orphanRecipeIds } } });
  }
  await prisma.recipe.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // El envase, despues de sus pedidos y antes que su presentacion fija.
  if (orphanPackagingBatchIds.length > 0) {
    await prisma.productBatch.deleteMany({ where: { id: { in: orphanPackagingBatchIds } } });
  }
  await prisma.product.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // La presentacion se borra antes que su unidad: su FK hacia `units` la rechaza si no.
  await prisma.presentation.deleteMany({
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

  // La empresa del worker, ya creada arriba. Se copia a una constante para que el tipo sea
  // `string` y no `string | null`: `recipes.company_id` no admite nulo (QC-50).
  const empresaDelWorker = companyId;
  if (empresaDelWorker === null) throw new Error('el fixture no creo la empresa del worker');

  // Receta y unidad de FIXTURE (`design.md > 13`), con las MISMAS funciones de normalizacion del
  // dominio que usa la app: `name_normalized` es NOT NULL en las dos tablas. La receta es de la
  // MISMA empresa en la que abre sesion el Administrador: si fuera otra, el aislamiento por
  // empresa la ocultaria del pedido.
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: recipeName,
        nameNormalized: normalizeRecipeName(recipeName),
        createdBy: adminUserId,
        companyId: empresaDelWorker,
      },
      select: { id: true },
    })
  ).id;

  // La unidad de fixture se sigue creando -y borrando- aunque el PEDIDO ya no la use desde el
  // 2026-09-07: el catalogo de unidades sigue existiendo y la limpieza de huerfanos de arriba lo
  // recorre.
  //
  // SIN simbolo a proposito: asi ninguna otra unidad del entorno comparte su etiqueta.
  const unit = await prisma.unit.create({
    data: { name: unitName, nameNormalized: normalizeUnitName(unitName), symbol: null },
    select: { id: true },
  });
  unitId = unit.id;

  // Presentacion de la MISMA empresa que el Administrador: el selector del panel solo ofrece las
  // de su propia empresa, y elegir una de otra la dejaria fuera de la busqueda.
  presentationId = (
    await prisma.presentation.create({
      data: {
        name: presentationName,
        nameNormalized: normalizePresentationName(presentationName),
        unitId: unit.id,
        // Sin contenido el selector del reparto no deja anadirla.
        content: PRESENTATION_CONTENT,
        companyId: empresaDelWorker,
      },
      select: { id: true },
    })
  ).id;

  packagingId = (
    await seedPackaging({
      companyId: empresaDelWorker,
      name: packagingName,
      presentationId,
      stock: PACKAGING_STOCK,
      unitCost: PACKAGING_UNIT_COST,
      lot: packagingLot,
      createdBy: adminUserId,
    })
  ).productId;
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
    if (companyId !== null) {
      // Lo que el alta aparto y libero del envase restringe el borrado del pedido y del lote.
      await prisma.reservationMovement.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
    }
    if (recipeId !== null) {
      await prisma.orderPresentationLine.deleteMany({ where: { order: { recipeId } } });
      await prisma.order.deleteMany({ where: { recipeId } });
    }
  } finally {
    try {
      await prisma.recipe.deleteMany({ where: { name: recipeName } });
      // El envase, ANTES que su presentacion fija.
      if (packagingId !== null) {
        await prisma.productBatch.deleteMany({ where: { productId: packagingId } });
        await prisma.product.deleteMany({ where: { id: packagingId } });
      }
    } finally {
      try {
        // La presentacion, ANTES que su unidad: su FK hacia `units` la rechaza si no.
        await prisma.presentation.deleteMany({ where: { name: presentationName } });
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
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('pantalla de pedidos', () => {
  test('el Administrador entra, da de alta un pedido, lo ve por su correlativo y lo cancela con motivo (R48, R29)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

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

    // --- 4. Cantidad DECIMAL, escrita como texto (R39), y la unidad del pedido.
    await page.getByTestId('order-field-quantity').fill(ORDER_QUANTITY);
    await page.getByTestId('order-form').getByTestId('presentation-unit-select').click();
    await page.locator(`[data-testid="presentation-unit-option"][data-value="${unitId}"]`).click();

    // --- 4b. Una linea de reparto con el envase, tomado del selector de envases con busqueda.
    const orderForm = page.getByTestId('order-form');
    const distribution = page.getByTestId('order-distribution-field');
    await addPackagingLine(
      page,
      orderForm,
      { productId: packagingId ?? '', name: packagingName },
      ORDER_PACKAGES,
    );
    await expect(packagingLine(distribution, packagingId ?? '')).toHaveAttribute(
      'data-presentation-id',
      presentationId ?? '',
    );
    await expect(distribution.getByTestId('order-distribution-available')).toHaveAttribute(
      'data-state',
      'ready',
      { timeout: 60_000 },
    );

    // --- 5. La prioridad por defecto esta VISIBLE y preseleccionada (R27): no se toca el
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
        presentationLines: { select: { presentationId: true, packagingProductId: true } },
      },
    });
    const numberText = formatOrderNumber({
      year: created.orderYear,
      sequence: created.orderSequence,
    });

    // La prioridad que se guardo es la del contrato (R27) y los decimales llegaron intactos
    // (R39): ni el formulario ni la pantalla los pasaron por coma flotante.
    expect(created.priority).toBe(DEFAULT_ORDER_PRIORITY);
    expect(Number(created.quantity)).toBe(Number(ORDER_QUANTITY));
    expect(
      created.presentationLines.map((line) => [line.packagingProductId, line.presentationId]),
      'el reparto guardado lleva el envase elegido y la presentacion fija de ese envase (R29)',
    ).toContainEqual([packagingId, presentationId]);

    // --- 10. Y el pedido esta en la lista, localizado POR SU CORRELATIVO (R7, R10).
    const row = await findOrderRow(page, numberText);
    await expect(row, `el pedido ${numberText} deberia verse en la lista`).toBeVisible({
      timeout: 60_000,
    });
    await expect(row.getByTestId('data-table-cell-recipeName')).toHaveText(recipeName);
    await expect(
      row.getByTestId('order-distribution'),
      'la fila del listado muestra el reparto con el envase elegido (R29)',
    ).toHaveText(`${ORDER_PACKAGES} × ${packagingName}`);

    // --- 11. Cancelacion con motivo (R37): el dialogo pide el motivo y solo entonces confirma.
    await (await openOrderRowMenu(page, rowMenuTrigger(row), 'order-action-cancel')).click();
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
    await expect(
      await openOrderRowMenu(page, rowMenuTrigger(cancelledRow), 'order-action-edit'),
    ).toBeDisabled();

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

  test('un usuario sin pedidos.consultar recibe 404 dentro del layout privado y no ve ningun dato de pedidos (R49)', async ({
    page,
  }) => {
    // El Operador del seed no lleva `pedidos.consultar`. Su aterrizaje NO se escribe aqui: lo
    // deriva el helper de sus permisos reales (QC-93 R11), y la premisa del caso -que no aterriza
    // ya en pedidos- se dice en voz alta para que un cambio de permisos no la vuelva muda.
    const landing = await loginAndLand(page, operatorUser);
    expect(landing, 'la premisa del caso: el usuario no aterriza en pedidos').not.toBe(ORDERS_ROUTE);

    // Sesion valida, permiso ausente: **404 en su sitio, sin redireccion** (QC-75). La regla
    // ruta-rol que lo sacaba al dashboard ya no existe. No es «no autenticado»: no acaba en el
    // login, y esa diferencia es lo que R49 pide y lo que un redirect al login enmascararia.
    const response = await page.goto(ORDERS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);
    expect(new URL(page.url()).pathname, 'el 404 no redirige: la URL sigue siendo la pedida').toBe(
      ORDERS_ROUTE,
    );

    // Y ese 404 se pinta DENTRO del layout privado (QC-75 R8).
    await expect(page.getByTestId('private-not-found')).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId('pedidos-title')).toHaveCount(0);
    await expect(page.getByTestId('order-list')).toHaveCount(0);
    await expect(page.getByTestId('data-table')).toHaveCount(0);
    await expect(page.getByTestId('order-list-empty')).toHaveCount(0);
    await expect(page.getByTestId('order-list-error')).toHaveCount(0);
  });
});
