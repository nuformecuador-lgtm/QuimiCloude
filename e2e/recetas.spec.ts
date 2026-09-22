/**
 * E2E de la pantalla de recetas (QC-26, T24): el camino completo del Administrador y el rechazo
 * del que no lo es (R52).
 *
 * Por que existe, y por que AQUI: `design.md > 12` lo pide entero -login -> la pantalla -> «nueva»
 * -> alta con una linea de producto y un paso -> la receta aparece en la lista-, sobre el patron
 * ya asentado de `e2e/session.spec.ts` (QC-9) y `e2e/inventario.spec.ts` (QC-22).
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware,
 *    Server Component de la lista, las Server Actions REALES de `recetas` (QC-25) y `unidades`
 *    (QC-26) contra Postgres, y `router.refresh()`. En unit esas cinco actions son dobles.
 *  - El selector de producto y el de unidad tal como los ve un navegador: el primero pagina
 *    dentro de su propio desplegable (R28) y el segundo es la primitiva `Select` de base-ui, con
 *    su propio portal -algo que jsdom no ejercita igual.
 *  - **El corte por rol de verdad** (R6): en unit se afirma la DECISION (`decideRouteAccess`);
 *    aqui se afirma que recibe 404 en su sitio y sin ver la tabla.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * SIN SUBIDA DE IMAGEN, y el motivo es de diseno, no de pereza (`design.md > 12`): exigiria
 * bucket real y red, y el gate corre sin red a proposito (QC-25 R43) -seria una prueba de
 * infraestructura ajena-. Los tres estados de la imagen ya se cubren en unitario sobre
 * `buildRecipePayload` (`recipe-form-payload.test.ts`).
 *
 * DATOS: `recipes`, `recipe_lines`, `products` y `presentations` son tablas reales y
 * COMPARTIDAS, y varios proyectos/worktrees pueden correr a la vez. Por eso, copiando el patron
 * de `e2e/session.spec.ts` y `e2e/inventario.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc26_e2e_` y dentro el `RUN_ID` del worker;
 *  - los asserts de la lista filtran por ESE nombre, nunca por «la primera fila» ni por el total
 *    de recetas, que otro proyecto puede estar moviendo en el mismo instante;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que otra ejecucion viva acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, respetando el orden que imponen las FK
 *    RESTRICT: recetas (sus lineas van en cascada) -> productos -> presentaciones -> usuarios.
 *
 * LAS UNIDADES NO SE SIEMBRAN: las cuatro filas del catalogo las inserta la propia migracion de
 * QC-32, asi que el selector de unidad ya tiene contenido sin fixture propio (`design.md > 12`).
 * Este spec toma la que el selector ofrezca primero: lo unico que R52 exige es que la cantidad
 * viaje como cadena decimal y que la unidad salga DEL selector, no de un id inventado a mano.
 *
 * LO QUE ESTE SPEC NO CREA: los roles. `Administrador` y `Operador` los siembra
 * `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts`), y el rol tiene que llamarse
 * EXACTAMENTE asi porque la regla ruta->rol compara por nombre. Si falta, el `beforeAll` falla
 * diciendo que hay que sembrar, en vez de dar un rojo incomprensible en mitad del recorrido.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

// `normalizeCompanyName` es la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3):
// `companies.name_normalized` se calcula con esta y con ninguna otra.
import {
  normalizeCompanyName,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { FORMULAS_ROUTE, NEW_RECIPE_ROUTE } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc26_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/session.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a
 * la vez, y ademas puede haber otro worktree corriendo su propio E2E contra otra base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando. Una hora deja
 * fuera cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc26-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc26-Oper-${RUN_ID.slice(0, 12)}`,
};

/** Nombres de los datos de catalogo que este spec crea como fixture (no por la UI). */
const productName = `${FIXTURE_PREFIX}producto_${RUN_ID}`;

/** Nombre de la receta que el recorrido del Administrador da de alta POR LA UI. */
const recipeName = `${FIXTURE_PREFIX}receta_${RUN_ID}`;

// Solo difieren en la letra: su orden relativo delata el sentido del orden por nombre.
const orderRecipeAName = `${FIXTURE_PREFIX}orden_a_${RUN_ID}`;
const orderRecipeBName = `${FIXTURE_PREFIX}orden_b_${RUN_ID}`;

/**
 * Empresa efimera de este worker. QC-47 R9 hizo `users.company_id` obligatoria, asi que el
 * fixture necesita la suya. NUNCA la de instalacion: el indice `companies_name_unique` es
 * GLOBAL y el nombre chocaria con el de la empresa que siembra `db:seed`.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;

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
      firstNames: `Qc26${RUN_ID.slice(0, 8)}`,
      lastNames: 'Recetas',
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
 * Elige, dentro del desplegable de producto (`ProductPicker`), la opcion cuyo nombre es
 * EXACTAMENTE `name`.
 *
 * Desde el cambio de mecanismo de R28 (2026-09-07) el desplegable ya no tiene botones de pagina:
 * pagina al llegar al final de su scroll y busca en el SERVIDOR. El helper usa las dos vias reales
 * de la pantalla, en el orden en que las usaria una persona -mirar lo que hay, escribir el nombre,
 * y si hiciera falta bajar-, y sigue sin filtrar por texto en cliente.
 */
async function selectProductByName(page: Page, testId: string, name: string): Promise<void> {
  const campo = page.getByTestId(testId);
  await campo.click();

  const option = page.getByTestId(`${testId}-option`).filter({ hasText: name });
  const popup = page.getByTestId(`${testId}-popup`);

  // Primero, tal cual esta: si el producto vino en la pagina precargada, se elige sin escribir
  // ni desplazar nada, que es el camino corto real del usuario.
  if ((await option.count()) === 0) {
    // Si no estaba, se BUSCA: el termino viaja al servidor (R28). Escribirlo no es fingir un
    // filtrado en cliente -la pantalla no lo hace-, es usar la busqueda que la pantalla tiene.
    await campo.fill(name);
  }

  try {
    await option.first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    // Ultimo recurso: bajar hasta el final del desplegable para que anexe las paginas
    // siguientes, que es el gesto con el que R28 pagina desde el 2026-09-07.
    for (let intento = 0; intento < 10 && (await option.count()) === 0; intento += 1) {
      await popup.evaluate((lista) => {
        lista.scrollTop = lista.scrollHeight;
      });
      await page.waitForTimeout(500);
    }
    if ((await option.count()) === 0) {
      throw new Error(`producto "${name}" no aparecio en el selector`);
    }
  }

  await option.first().click();
}

/**
 * Recorre las paginas de la lista hasta encontrar la celda de nombre pedida: sin buscar, una
 * receta recien creada puede caer en cualquier pagina. Nunca mira «la primera fila» ni el total,
 * que otra ejecucion puede estar moviendo.
 */
async function findRecipeCell(page: Page, name: string): Promise<Locator> {
  const cell = page.getByTestId('data-table-cell-name').filter({ hasText: name });
  const next = page.getByTestId('data-table-next');

  for (;;) {
    if ((await cell.count()) > 0) return cell;
    if ((await next.count()) === 0 || (await next.isDisabled())) return cell;

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
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc26_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/**`). Orden que imponen las FK RESTRICT: recetas (sus lineas van en
  // cascada) -> productos -> presentaciones -> usuarios.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  await prisma.recipe.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.product.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.presentation.deleteMany({
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

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  await createUserWithRole(operatorUser, ROLE_OPERADOR);

  // Producto de FIXTURE (no por la UI): lo que R52 pide es una linea con «producto de fixture»,
  // y crearlo aqui deja el recorrido del Administrador centrado en la pantalla de recetas, no en
  // la de inventario -que ya tiene su propio E2E (QC-22). Sin presentacion desde el 2026-09-09:
  // la presentacion se mudo a `product_batches`.
  // La empresa del worker, ya creada arriba. Se copia a una constante para que el tipo sea
  // `string` y no `string | null`: `products.company_id` no admite nulo (QC-49 R1).
  const empresaDelWorker = companyId;
  if (empresaDelWorker === null) throw new Error('el fixture no creo la empresa del worker');

  await prisma.product.create({
    // QC-49 (R1): `products.company_id` es NOT NULL con FK a `companies`. El producto de
    // fixture es de la MISMA empresa del worker -la que se acaba de crear arriba-, que es la
    // empresa en cuyo nombre se abre la sesion. `afterAll` ya borra el producto ANTES que la
    // empresa, que es el orden que exige `products_company_id_fkey` (ON DELETE RESTRICT).
    data: {
      name: productName,
      nameNormalized: normalizeProductName(productName),
      companyId: empresaDelWorker,
    },
  });

  // Con Prisma y no por la UI: el alta por pantalla ya la recorre el primer caso, y una receta
  // existe sin lineas. De la MISMA empresa en la que abre sesion el Administrador -QC-50 hizo
  // `recipes.company_id` obligatoria-: si fuera de otra, el aislamiento por empresa las
  // ocultaria de la lista y este spec dejaria de ver sus propias filas.
  await prisma.recipe.createMany({
    data: [orderRecipeAName, orderRecipeBName].map((name) => ({
      name,
      nameNormalized: normalizeRecipeName(name),
      companyId: empresaDelWorker,
    })),
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: cada paso va en su
  // propio `try`/`finally`. Recetas primero -sus `createdBy`/`updatedBy` son RESTRICT hacia
  // `users` y sus lineas RESTRICT hacia `products`, asi que ambas tienen que quedar libres antes
  // de tocar usuarios y productos-.
  //
  // **Por los nombres EXACTOS de ESTE worker, NUNCA por `FIXTURE_PREFIX`**:
  // `fullyParallel` reparte los dos tests de este archivo en workers DISTINTOS, cada uno con su
  // propio `RUN_ID` y su propia receta. Borrar por prefijo aqui se llevaria por delante la
  // receta que el OTRO worker acaba de crear -y eso fue exactamente lo que paso la primera vez
  // que se corrio este spec con los dos proyectos a la vez: el `afterAll` del test que NO crea
  // receta borraba la del test que si la crea, antes de que su propio assert contra la base
  // corriera-.
  try {
    await prisma.recipe.deleteMany({
      where: { name: { in: [recipeName, orderRecipeAName, orderRecipeBName] } },
    });
  } finally {
    try {
      await prisma.product.deleteMany({ where: { name: productName } });
    } finally {
      try {
        await prisma.user.deleteMany({
          where: { username: { in: [adminUser.username, operatorUser.username] } },
        });
      } finally {
        // La empresa, DESPUES de los usuarios: `users.company_id` es `onDelete: Restrict`
        // (QC-47 R11). Por el nombre EXACTO de ESTE worker, nunca por el prefijo.
        try {
          await prisma.company.deleteMany({ where: { name: companyName } });
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt
// tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('catalogo de recetas', () => {
  test('el Administrador entra, da de alta una receta con una linea y un paso, y la ve en la lista (R52)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 1. La pantalla se sirve a un Administrador (R6, la mitad que deja pasar).
    await page.goto(`${FORMULAS_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('recipes-title')).toBeVisible({ timeout: 60_000 });

    // --- 2. «Nueva» NAVEGA a su propia pagina, sin panel ni dialogo (R20). El control aparece
    // dos veces cuando el catalogo esta vacio (cabecera y estado vacio): vale cualquiera.
    await page.getByTestId('recipe-create-open').first().click();
    await page.waitForURL((url) => url.pathname === NEW_RECIPE_ROUTE, { timeout: 60_000 });
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    // --- 3. Nombre de la receta.
    await page.getByTestId('recipe-field-name').fill(recipeName);

    // --- 4. Una linea de producto: producto de FIXTURE, sin unidad -ya no la lleva la linea
    // (QC-147 R1)-, al 100 % para que la suma sea exacta y el Guardar se habilite (QC-147 R11).
    // La fila 0 ya esta en pantalla al abrir el formulario: es la fila en blanco de arranque,
    // asi que no hay que pedirla con ningun boton.
    await selectProductByName(page, 'recipe-line-product-0', productName);
    await page.getByTestId('recipe-line-percentage-0').fill('100');

    // --- 5. Un paso.
    await page.getByTestId('recipe-step-add').click();
    await page.getByTestId('recipe-step-text-0').fill(`Mezclar ${RUN_ID.slice(0, 8)}`);

    // --- 6. Guardar: la Server Action REAL de `recetas` (QC-25) contra Postgres, sin `fetch` de
    // por medio (R47).
    await page.getByTestId('recipe-form-submit').click();

    // --- 7. Con exito vuelve a la lista y avisa por toast, visible porque el layout privado YA
    // monta la region de avisos (R24, R25). Se afirma que HAY un aviso, no cual es su texto: los
    // asserts de este repo no miran literales de copy.
    await page.waitForURL((url) => url.pathname === FORMULAS_ROUTE, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 8. Y la receta esta en la lista sin que el usuario recargue nada.
    const cell = await findRecipeCell(page, recipeName);
    await expect(cell.first()).toBeVisible({ timeout: 60_000 });

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla.
    expect(
      await prisma.recipe.count({ where: { name: recipeName, deletedAt: null } }),
      'la receta deberia existir en la base',
    ).toBe(1);
  });

  test('busca las recetas propias por su nombre y las ordena por nombre descendente (R26)', async ({
    page,
  }) => {
    // Mismos valores que exporta `recipe-list-params.ts`; ningun E2E importa de `app/`.
    const PAGE_SIZE_PARAM = 'pageSize';
    const SEARCH_PARAM = 'q';
    const SORT_PARAM = 'sort';
    const NAME_COLUMN_ID = 'name';
    const NAME_DESC = `${NAME_COLUMN_ID}:desc`;

    await loginAndLand(page, adminUser);
    await page.goto(`${FORMULAS_ROUTE}?${PAGE_SIZE_PARAM}=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('data-table')).toBeVisible({ timeout: 60_000 });

    const nameCells = page.getByTestId('data-table-cell-name');
    const rowOf = (name: string) =>
      page.locator('[data-testid^="data-table-row-"]').filter({ has: nameCells.filter({ hasText: name }) });
    const ownOrderNames = async () =>
      (await nameCells.allTextContents())
        .map((text) => text.trim())
        .filter((text) => text === orderRecipeAName || text === orderRecipeBName);

    // Se reintenta porque lo escrito antes de hidratar no emite la busqueda, y WebKit hidrata tarde.
    const search = page.getByTestId('data-table-search');
    await expect(async () => {
      await search.fill('');
      await search.fill(RUN_ID);
      await page.waitForURL((url) => url.searchParams.get(SEARCH_PARAM) === RUN_ID, {
        timeout: 15_000,
      });
    }).toPass({ timeout: 120_000 });

    await expect(rowOf(orderRecipeAName)).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(orderRecipeBName)).toBeVisible({ timeout: 60_000 });
    await expect.poll(ownOrderNames, { timeout: 60_000 }).toEqual([orderRecipeAName, orderRecipeBName]);

    await page.getByTestId(`data-table-header-menu-${NAME_COLUMN_ID}`).click();
    await page.getByTestId(`data-table-sort-desc-${NAME_COLUMN_ID}`).click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get(SORT_PARAM) === NAME_DESC && url.searchParams.get(SEARCH_PARAM) === RUN_ID,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId(`data-table-head-${NAME_COLUMN_ID}`)).toHaveAttribute(
      'aria-sort',
      'descending',
      { timeout: 60_000 },
    );

    await expect.poll(ownOrderNames, { timeout: 60_000 }).toEqual([orderRecipeBName, orderRecipeAName]);
  });

  test('un usuario sin recetas.consultar recibe 404 dentro del layout privado y no ve ningun dato de recetas (R6)', async ({
    page,
  }) => {
    // El Operador del seed no lleva `recetas.consultar`. Su aterrizaje NO se escribe aqui: lo
    // deriva el helper de sus permisos reales (QC-93 R11), y la premisa del caso -que no aterriza
    // ya en recetas- se dice en voz alta para que un cambio de permisos no la vuelva muda.
    const landing = await loginAndLand(page, operatorUser);
    expect(landing, 'la premisa del caso: el usuario no aterriza en recetas').not.toBe(
      FORMULAS_ROUTE,
    );

    // Sesion valida, permiso ausente: **404 en su sitio, sin redireccion** (QC-75). La regla
    // ruta-rol que lo sacaba al dashboard ya no existe. No es «no autenticado»: no acaba en el
    // login, y esa diferencia es lo que R6 pide y lo que un redirect al login enmascararia.
    const response = await page.goto(FORMULAS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);
    expect(new URL(page.url()).pathname, 'el 404 no redirige: la URL sigue siendo la pedida').toBe(
      FORMULAS_ROUTE,
    );

    // Y ese 404 se pinta DENTRO del layout privado (QC-75 R8).
    await expect(page.getByTestId('private-not-found')).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId('recipes-title')).toHaveCount(0);
    await expect(page.getByTestId('data-table')).toHaveCount(0);
    await expect(page.getByTestId('recipe-list-empty')).toHaveCount(0);
  });
});
