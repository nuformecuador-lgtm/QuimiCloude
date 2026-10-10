/**
 * E2E del camino completo de QC-64 (T14, R28): redactar un paso con NEGRILLA y una LISTA DE
 * VERIFICACION en el editor, guardar la receta, REABRIRLA y comprobar que el paso se ve igual que
 * se guardo (R9), y recorrer el asistente dentro de la «Vista previa» hasta Finalizar (R17, R22).
 *
 * ARCHIVO NUEVO y no un caso mas dentro de `e2e/recetas.spec.ts` (`design.md > 11`): aquel cubre el
 * camino de QC-26 y su corte por rol, y engordarlo con un recorrido que ya dura minutos mezcla dos
 * features en un mismo `afterAll`.
 *
 * QUE APORTA sobre los unitarios, que es lo unico que justifica su coste:
 *  - **El editor de verdad en un navegador de verdad.** En jsdom, ProseMirror no tiene ni
 *    `getClientRects` ni `Range` completos: lo que se afirma alli es el DOM que la libreria pinta,
 *    no que SELECCIONAR de verdad y pulsar el boton de la barra produzca `<strong>`. Aqui se
 *    escribe con teclado real, se selecciona el parrafo con un triple clic y se pulsa el boton de
 *    la barra.
 *  - **La ida y vuelta completa del documento del paso** (QC-62): editor -> `editorJsonToStepDocument`
 *    -> Server Action REAL -> Postgres -> `RecipeDetail` -> `stepDocumentToEditorJson` -> editor.
 *    Ninguna prueba unitaria cruza esa cadena; R9 es justo esa cadena.
 *  - **Chromium y WEBKIT.** WebKit es el motor de iOS y es lo que acredita el punto 2 de
 *    `design.md > 2.5`: la dependencia de UI que entro en T2 se comprueba en Safari, no se supone.
 *    Por eso los atajos de teclado del editor NO se usan para aplicar negrilla: se pulsa el BOTON
 *    de la barra, que es el control que R2/R27 exigen y el unico que se comporta igual en los dos
 *    motores (`Control+b` en WebKit/macOS no es el atajo del sistema).
 *
 * DATOS: `recipes`, `recipe_lines`, `products` y `presentations` son tablas reales y COMPARTIDAS, y
 * varios worktrees pueden correr a la vez. Se copia el mecanismo de `e2e/recetas.spec.ts`, no se
 * improvisa: prefijo propio `qc64_e2e_` con el `RUN_ID` del worker dentro, limpieza de huerfanos
 * por prefijo **y edad**, y `afterAll` que borra por **nombre exacto** respetando el orden de las
 * FK RESTRICT (recetas -> productos -> presentaciones -> usuarios -> empresa).
 *
 * LOS ROLES NO SE CREAN AQUI: `Administrador` lo siembra `pnpm run db:seed` y la regla ruta->rol
 * compara por nombre exacto. Si falta, el `beforeAll` falla diciendolo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { prisma } from '@/lib/shared/db/prisma';
import { FORMULAS_ROUTE, NEW_RECIPE_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand } from './helpers/landing';
import { openRowActionsMenuItem } from './helpers/row-actions-menu';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc64_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/recetas.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez y puede haber otro worktree corriendo lo suyo: borrar por prefijo a secas se llevaria filas
 * que otra ejecucion viva esta usando. Una hora deja fuera cualquier ejecucion viva.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo de la lista: menos paginas que recorrer al buscar la fila. */
const LIST_PAGE_SIZE = '25';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc64-Admin-${RUN_ID.slice(0, 12)}`,
};

const productName = `${FIXTURE_PREFIX}producto_${RUN_ID}`;
const recipeName = `${FIXTURE_PREFIX}receta_${RUN_ID}`;
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

/** Textos que el recorrido escribe DENTRO del editor. Llevan el `RUN_ID` para no confundirse. */
const PARAGRAPH_TEXT = `Mezclar en frio ${RUN_ID.slice(0, 8)}`;
const ITEM_1_TEXT = `Verificar temperatura ${RUN_ID.slice(0, 8)}`;
const ITEM_2_TEXT = `Verificar presion ${RUN_ID.slice(0, 8)}`;

let companyId: string | null = null;

async function createAdmin(user: Credentials): Promise<string> {
  if (!companyId) {
    throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  }
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": este E2E no lo crea porque la regla ruta-rol compara ` +
        'por nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr el E2E.',
    );
  }

  const created = await prisma.user.create({
    data: {
      firstNames: `Qc64${RUN_ID.slice(0, 8)}`,
      lastNames: 'Pasos',
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
 * Elige en el desplegable de producto la opcion cuyo nombre es EXACTAMENTE `name`. Mismo helper
 * que `e2e/recetas.spec.ts`: desde el 2026-09-07 el selector busca en el servidor y pagina al
 * llegar al final de su scroll, y eso es lo que se ejercita aqui.
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
 * Escribe en un campo CONTROLADO por React y no sigue hasta que el valor **se queda**.
 *
 * No es una espera decorativa: el formulario llega del servidor ya pintado, asi que el campo se
 * puede rellenar ANTES de que Next hidrate la pagina; cuando la hidratacion llega, React repinta
 * desde su estado —vacio— y se lleva por delante lo escrito. Chromium hidrata antes de que el test
 * llegue aqui y WebKit no, y ese es exactamente el rojo que dio la primera version de este spec:
 * el nombre viajaba vacio y el guardado se quedaba en «revisa los campos marcados».
 */
async function fillControlled(locator: Locator, value: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await locator.fill(value);
        return locator.inputValue();
      },
      { timeout: 60_000 },
    )
    .toBe(value);
}

/**
 * Recorre las paginas de la lista hasta encontrar la FILA de la receta pedida: sin buscar, una
 * receta recien creada cae en cualquier pagina. Nunca se mira «la primera fila» ni el total, que
 * otro proyecto puede mover.
 */
async function findRecipeRow(page: Page, name: string): Promise<Locator> {
  const row = page
    .locator('[data-testid^="data-table-row-"]')
    .filter({ has: page.getByTestId('data-table-cell-name').filter({ hasText: name }) });
  const next = page.getByTestId('data-table-next');

  for (;;) {
    if ((await row.count()) > 0) return row;
    if ((await next.count()) === 0 || (await next.isDisabled())) return row;

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

/**
 * Pulsa un boton de la barra de formato y NO sigue hasta que el area editable tiene el foco DE
 * VERDAD.
 *
 * No es una espera decorativa ni un `sleep` disfrazado: el comando `focus()` de TipTap devuelve el
 * foco al `contenteditable` **dentro de un `requestAnimationFrame`**, asi que durante ese fotograma
 * el foco sigue en el BOTON. Las teclas que se manden en esa ventana las recibe el boton — y un
 * `Enter` sobre un boton enfocado lo **vuelve a activar** en vez de partir el parrafo—. Con la
 * maquina cargada (los dos proyectos de Playwright a la vez) el fotograma se colaba a tiempo y el
 * caso pasaba; corrido en aislado fallaba 5 de 5 en Chromium, con TODO el texto en negrilla y el
 * primer item pegado al parrafo.
 *
 * Es el equivalente en Playwright del `esperarAlFocoDiferidoDelEditor()` que el unitario de R27 ya
 * usa en jsdom: se espera A LA CONDICION —el area editable enfocada—, no a un reloj. Vive en un
 * helper para que no se olvide en ninguna pulsacion.
 */
async function pulsarBarraYEsperarFoco(boton: Locator, editable: Locator): Promise<void> {
  await boton.click();
  await expect(editable).toBeFocused({ timeout: 60_000 });
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un E2E interrumpido deja filas `qc64_e2e_*`, y esa basura pone
  // rojos tests de otras features que cuentan filas. Orden que imponen las FK RESTRICT.
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
  // Las empresas DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict` (QC-47 R11).
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createAdmin(adminUser);

  // Producto de FIXTURE (no por la UI): el recorrido de esta feature es el EDITOR, no la pantalla
  // de inventario, que ya tiene su propio E2E (QC-22). Sin presentacion desde el 2026-09-09: la
  // presentacion se mudo a `product_batches`.
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
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara: cada paso en su
  // propio `try`/`finally`, y por NOMBRE EXACTO de este worker —nunca por prefijo, que se llevaria
  // por delante lo que el otro proyecto de Playwright esta usando en ese mismo instante—.
  try {
    await prisma.recipe.deleteMany({ where: { name: recipeName } });
  } finally {
    try {
      await prisma.product.deleteMany({ where: { name: productName } });
    } finally {
      try {
        await prisma.user.deleteMany({ where: { username: adminUser.username } });
      } finally {
        try {
          await prisma.company.deleteMany({ where: { name: companyName } });
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(240_000);

test.describe('editor y lectura de pasos', () => {
  test('el Administrador redacta un paso con negrilla y lista de verificacion, lo guarda, lo reabre igual y recorre la vista previa hasta Finalizar (R28)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 1. Nueva receta.
    await page.goto(NEW_RECIPE_ROUTE);
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    // --- 2. AÑADIR EL PASO ES LO PRIMERO, y el orden no es capricho: la fila del paso solo aparece
    // si React ya esta hidratado, asi que ver el area editable ACREDITA que el formulario responde
    // a su estado. Escribir antes de eso deja el valor en el DOM y la hidratacion se lo lleva
    // -exactamente lo que pasaba en WebKit, que hidrata mas tarde que Chromium: el nombre viajaba
    // vacio y el guardado moria en «revisa los campos marcados»-.
    await page.getByTestId('recipe-step-add').click();

    const editable = page.getByTestId('recipe-step-text-0');
    const boldButton = page.getByTestId('recipe-step-text-0-bold');
    const checklistButton = page.getByTestId('recipe-step-text-0-checklist');
    await expect(editable).toBeVisible({ timeout: 60_000 });

    await fillControlled(page.getByTestId('recipe-field-name'), recipeName);

    // --- 3. Una linea de producto: el formulario la exige, y no es lo que esta feature prueba.
    // Sin unidad -la linea ya no la lleva- y al 100 % para que la suma sea exacta y el Guardar
    // se habilite.
    await selectProductByName(page, 'recipe-line-product-0', productName);
    await fillControlled(page.getByTestId('recipe-line-percentage-0'), '100');

    // --- 4. EL PASO, escrito como lo escribiria una persona: teclado real dentro del
    // `contenteditable` y los BOTONES de la barra de formato. Nada de inyectar JSON por JS: el
    // valor entero de este test es que ejercita la interfaz en un navegador de verdad.
    await editable.click();
    await expect(editable).toBeFocused({ timeout: 60_000 });
    await page.keyboard.type(PARAGRAPH_TEXT);

    // Un parrafo nuevo, y sobre el la LISTA DE VERIFICACION desde su boton. `Enter` se manda con el
    // foco ya dentro del area editable —aqui no ha habido pulsacion de barra por medio—, y la
    // pulsacion del boton espera al foco diferido antes de que se teclee el primer item.
    await page.keyboard.press('Enter');
    await pulsarBarraYEsperarFoco(checklistButton, editable);
    await expect(checklistButton).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.type(ITEM_1_TEXT);
    await page.keyboard.press('Enter');
    await page.keyboard.type(ITEM_2_TEXT);
    await expect(editable.locator('li[data-type="taskItem"]')).toHaveCount(2);

    // LA NEGRILLA, AL FINAL Y SOBRE UNA SELECCION EXPLICITA. El orden no es cosmetico: aplicarla
    // antes obligaba a apagarla despues —al colapsar la seleccion el cursor hereda la marca del
    // caracter anterior— y esa salvaguarda decidia leyendo `aria-pressed`, que lo pinta el estado
    // de React (`useEditorState`) y puede ir un tick por detras de la marca guardada en el editor.
    // Redactando primero el texto y marcando despues, no hay nada que apagar ni atributo que leer.
    //
    // El triple clic selecciona el parrafo entero y se comporta igual en los dos motores; `End`
    // depende del sistema. Y se pulsa el BOTON de la barra, no `Control+b`: en WebKit/macOS el
    // atajo del sistema es otro, y R2/R27 hablan del control, no del atajo.
    await editable.locator('p').first().click({ clickCount: 3 });
    await pulsarBarraYEsperarFoco(boldButton, editable);
    await expect(boldButton).toHaveAttribute('aria-pressed', 'true');

    // Lo que el editor pinta ANTES de guardar: UNA negrilla, la del parrafo —el `strict mode` de
    // Playwright hace de conteo: si la marca se hubiera colado en los items, habria mas de un
    // `<strong>` y esto seria rojo—, dos items, y ninguna marca dentro de la lista.
    await expect(editable.locator('strong')).toHaveText(PARAGRAPH_TEXT);
    await expect(editable.locator('li[data-type="taskItem"]')).toHaveCount(2);
    await expect(editable.locator('li strong')).toHaveCount(0);

    // --- 5. Guardar: la Server Action REAL contra Postgres, sin `fetch` de por medio.
    await page.getByTestId('recipe-form-submit').click();
    await page.waitForURL((url) => url.pathname === FORMULAS_ROUTE, { timeout: 60_000 });

    const saved = await prisma.recipe.findFirst({
      where: { name: recipeName, deletedAt: null },
      select: { id: true, updatedAt: true },
    });
    expect(saved, 'la receta deberia existir en la base tras guardar').not.toBeNull();
    if (!saved) return;

    // --- 6. REABRIR la receta para editarla, desde la lista y por su boton de Editar.
    await page.goto(`${FORMULAS_ROUTE}?pageSize=${LIST_PAGE_SIZE}`);
    await expect(page.getByTestId('recipes-title')).toBeVisible({ timeout: 60_000 });
    const row = await findRecipeRow(page, recipeName);
    await expect(row.first()).toBeVisible({ timeout: 60_000 });
    await (
      await openRowActionsMenuItem(
        page,
        row.first().getByTestId('recipe-row-actions'),
        'recipe-edit-open',
      )
    ).click();
    await page.waitForURL((url) => url.pathname === recipeEditRoute(saved.id), { timeout: 60_000 });
    await expect(page.getByTestId('recipe-form')).toBeVisible({ timeout: 60_000 });

    // --- 7. R9: el paso se ve IGUAL que se guardo. No basta con que el texto coincida —eso lo
    // cumpliria un aplanado a texto plano—: el `<strong>` sigue siendo `<strong>` y los items
    // siguen siendo items de lista de verificacion.
    const reopened = page.getByTestId('recipe-step-text-0');
    await expect(reopened).toBeVisible({ timeout: 60_000 });
    await expect(reopened.locator('strong')).toHaveText(PARAGRAPH_TEXT);

    const reopenedItems = reopened.locator('li[data-type="taskItem"]');
    await expect(reopenedItems).toHaveCount(2);
    await expect(reopenedItems.nth(0)).toContainText(ITEM_1_TEXT);
    await expect(reopenedItems.nth(1)).toContainText(ITEM_2_TEXT);

    // --- 8. VISTA PREVIA.
    await page.getByTestId('recipe-form-preview-open').click();
    const preview = page.getByTestId('recipe-form-preview');
    await expect(preview).toBeVisible({ timeout: 60_000 });
    await expect(preview.getByTestId('step-reader')).toBeVisible();
    await expect(preview.getByTestId('step-reader-document')).toContainText(PARAGRAPH_TEXT);

    // R17: con items sin marcar NO se puede avanzar, y el MOTIVO esta en pantalla como texto
    // visible —no como `title` ni tras un `:hover`—.
    const finish = preview.getByTestId('step-reader-finish');
    const reason = preview.getByTestId('step-reader-blocked-reason');
    await expect(finish).toBeDisabled();
    await expect(reason).toBeVisible();
    await expect(reason).not.toBeEmpty();

    const items = preview.getByTestId('step-reader-document').getByRole('checkbox');
    await expect(items).toHaveCount(2);

    // Con UNO marcado sigue bloqueado: el bloqueo es por items pendientes, no por «haber tocado».
    await items.nth(0).click();
    await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(finish).toBeDisabled();
    await expect(reason).toBeVisible();

    // --- 9. Marcados los dos, Finalizar (R22): cierra el modal, no guarda de nuevo y no navega
    // fuera del formulario.
    await items.nth(1).click();
    await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(reason).toHaveCount(0);
    await expect(finish).toBeEnabled();

    await finish.click();
    await expect(preview).not.toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).pathname, 'Finalizar no debe navegar fuera del formulario').toBe(
      recipeEditRoute(saved.id),
    );
    await expect(page.getByTestId('recipe-form')).toBeVisible();

    const afterFinish = await prisma.recipe.findUnique({
      where: { id: saved.id },
      select: { updatedAt: true },
    });
    expect(
      afterFinish?.updatedAt.getTime(),
      'Finalizar no debe guardar la receta otra vez',
    ).toBe(saved.updatedAt.getTime());
  });
});
