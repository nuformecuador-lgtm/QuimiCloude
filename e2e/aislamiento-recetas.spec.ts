/**
 * E2E del aislamiento por empresa en recetas (QC-50, T20, R31).
 *
 * Una sola sesion real, la de la empresa A. La receta de B se siembra con Prisma porque no
 * necesita sesion para existir.
 *
 * POR QUE EL RECORRIDO NO COPIA EL "campo oculto" DE INVENTARIO/PEDIDOS (design.md > 14 lo
 * prohibe, y ademas es imposible): el dialogo de borrado de recetas no lee el id de un campo del
 * DOM, lo captura del CIERRE de React en `delete-recipe-dialog.tsx` (`await
 * deleteRecipeAction(recipe.id)`). No hay ningun nodo que reescribir con las herramientas de
 * desarrollo, asi que fabricar uno seria inventar una superficie de ataque que la pantalla no
 * tiene. El gesto real que SI existe -y que por eso se ejercita aqui- es pegar en la barra de
 * direcciones un enlace al detalle: alguien de B te pasa "mira esta formula" o el enlace queda en
 * el historial del navegador, y entras a `/produccion/formulas/<id>` con sesion en A.
 *
 * ESTE RECORRIDO CIERRA TAMBIEN LA ESCRITURA, no solo la lectura: `EditarRecetaPage` es el UNICO
 * lugar que monta `RecipeForm` en modo edicion, con los datos de la receta ya cargados listos para
 * guardarse. Si `getRecipeAction` no acotara por empresa, este mismo recorrido pintaria el
 * formulario de B relleno y listo para que A lo modificara con un submit. Que en su lugar aparezca
 * `recipe-not-found` prueba que la escritura nunca llega a estar al alcance, sin necesidad de un
 * segundo test que intente el POST de actualizacion.
 *
 * LA COMPARACION CON UN ID INEXISTENTE ES EL CORAZON DE LA PRUEBA: `get-recipe.ts:35-36` hace
 * `findAliveById(id, scope)` -ya acotado por empresa- y ante `null` lanza la MISMA
 * `RecipeNotFoundError`, tanto si el id no existe en ninguna empresa como si existe pero es de
 * otra. No hay un camino que diga "esta ahi pero no es tuya": eso seria un oraculo de existencia
 * sobre datos ajenos. Por eso el test no se conforma con ver `recipe-not-found` para el id de B:
 * afirma que la pantalla es indistinguible de la que sale para un UUID que no esta en ninguna
 * tabla.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeProductName } from '@/lib/modules/inventario';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { FORMULAS_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc50_e2e_';

const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Chromium, WebKit y otros worktrees comparten base: borrar huerfanos por prefijo a secas se
 * llevaria filas de una ejecucion viva. Una hora deja fuera cualquier ejecucion en curso.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalacion: `companies_name_unique` es global. */
const COMPANY_A_NAME = `${SHARED_TOKEN}_ca`;
const COMPANY_B_NAME = `${SHARED_TOKEN}_cb`;

const RECIPE_B_NAME = `${SHARED_TOKEN}_receta_b`;

/** El ingrediente de A con el que el alta del paso 4 puede guardarse. */
const PRODUCT_A_NAME = `${SHARED_TOKEN}_producto_a`;

const ADMIN_USERNAME = `${SHARED_TOKEN}_admin`;
const ADMIN_PASSWORD = `Qc50-Admin-${RUN_ID.slice(0, 12)}`;

/** Un UUID que no puede coincidir con ninguna fila sembrada: la contraparte "no existe en nada". */
const NONEXISTENT_RECIPE_ID = randomUUID();

/** Ningun assert mira copy: solo `data-testid`. */
const RECIPES_TITLE = 'recipes-title';
const NAME_CELL = 'data-table-cell-name';
const NOT_FOUND = 'recipe-not-found';
const NOT_FOUND_LINK = 'recipe-not-found-link';
const FORM_TITLE = 'recipe-form-title';
const CREATE_OPEN = 'recipe-create-open';
const FIELD_NAME = 'recipe-field-name';
const FORM_SUBMIT = 'recipe-form-submit';
const LINE_PRODUCT = 'recipe-line-product-0';
const LINE_PERCENTAGE = 'recipe-line-percentage-0';

let companyAId: string | null = null;
let companyBId: string | null = null;
let recipeBId: string | null = null;
let adminUserId: string | null = null;

/** Un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function listUrl(search: string): string {
  const query = new URLSearchParams({ pageSize: '25', q: search });
  return `${FORMULAS_ROUTE}?${query.toString()}`;
}

async function createCompany(name: string): Promise<string> {
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

/** La foto de la receta de B que no puede moverse con nada de lo que haga A. */
async function snapshotRecipe(id: string) {
  return prisma.recipe.findUniqueOrThrow({
    where: { id },
    select: { name: true, companyId: true, deletedAt: true, updatedAt: true, updatedBy: true },
  });
}

test.beforeAll(async () => {
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": este E2E no lo crea porque la regla ruta-rol compara ` +
        'por nombre exacto. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
    );
  }

  // Limpieza defensiva de huerfanos de una ejecucion interrumpida. El orden lo impone la FK
  // `recipes_company_id_fkey` (RESTRICT): la receta se borra antes que su empresa.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.recipe.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.product.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  companyAId = await createCompany(COMPANY_A_NAME);
  companyBId = await createCompany(COMPANY_B_NAME);

  // El ingrediente del alta del paso 4, en la empresa A: el formulario no deja guardar una receta
  // sin al menos una linea con producto y una suma del 100 %.
  await prisma.product.create({
    data: {
      name: PRODUCT_A_NAME,
      nameNormalized: normalizeProductName(PRODUCT_A_NAME),
      companyId: companyAId,
    },
    select: { id: true },
  });

  // Hash real: el login tiene que pasar por bcrypt, el adaptador Prisma y la Server Action de verdad.
  const admin = await createFixtureUser({
    data: {
      firstNames: `Qc50${RUN_ID.slice(0, 8)}`,
      lastNames: 'Aislamiento',
      birthDate: new Date('1990-01-01'),
      email: `${ADMIN_USERNAME}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: ADMIN_USERNAME,
      username: ADMIN_USERNAME,
      passwordHash: await createPasswordHash(ADMIN_PASSWORD),
      roleId: role.id,
      companyId: companyAId,
      // Explicito y no por defecto: una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  adminUserId = admin.id;

  // La receta de B se siembra directo por Prisma, sin sesion: B no la necesita para existir.
  recipeBId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_B_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_B_NAME),
        createdBy: admin.id,
        companyId: companyBId,
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Por los ids y nombres de ESTE worker, nunca por `FIXTURE_PREFIX` a secas: el otro proyecto
  // (Chromium/WebKit) o un worktree hermano pueden seguir corriendo. Cada paso corre aunque falle
  // el anterior, y el primer fallo se relanza al final. El orden lo impone `recipes_company_id_fkey`
  // (RESTRICT): las recetas antes que sus empresas.
  const companyIds = [companyAId, companyBId].filter((id): id is string => id !== null);
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.recipe.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.product.deleteMany({ where: { companyId: { in: companyIds } } }),
    () => prisma.user.deleteMany({ where: { username: ADMIN_USERNAME } }),
    () => prisma.company.deleteMany({ where: { name: { in: [COMPANY_A_NAME, COMPANY_B_NAME] } } }),
  ];

  let primerFallo: unknown;
  for (const paso of pasos) {
    try {
      await paso();
    } catch (error) {
      primerFallo ??= error;
    }
  }

  await prisma.$disconnect();

  if (primerFallo !== undefined) throw primerFallo;
});

// El primer `goto` compila la ruta bajo demanda en `next dev` y bcrypt tarda a proposito: un
// timeout corto da rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('aislamiento por empresa de recetas', () => {
  test('con sesion en la empresa A: la lista no trae la receta de B, pegar el enlace al detalle de B se ve identico a un id inexistente y no toca nada, y un alta en A con el mismo nombre se completa (R31)', async ({
    page,
  }) => {
    if (!companyAId || !companyBId || !recipeBId || !adminUserId) {
      throw new Error('el fixture no existe: fallo el beforeAll');
    }

    const recipeBBefore = await snapshotRecipe(recipeBId);

    // --- 1. Una sola sesion, la de la empresa A.
    await loginAndLand(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    // --- 2. La lista no trae la receta de B, contra el cuerpo de la respuesta y no solo el DOM:
    // una fila ocultada con CSS o filtrada en el navegador pasaria mirando el DOM.
    const listResponse = await page.goto(listUrl(SHARED_TOKEN));
    await expect(page.getByTestId(RECIPES_TITLE)).toBeVisible({ timeout: 60_000 });
    const listHtml = (await listResponse?.text()) ?? '';
    expect(
      listHtml.includes(RECIPE_B_NAME),
      'el nombre de la receta de B no puede viajar en el HTML servido de una sesion de A',
    ).toBe(false);
    await expect(
      page.getByTestId(NAME_CELL).filter({ hasText: exactText(RECIPE_B_NAME) }),
    ).toHaveCount(0);

    // --- 3. Pegar el enlace al detalle de B: mismo estado que un id inexistente, y sin efecto.
    const bResponse = await page.goto(recipeEditRoute(recipeBId));
    await expect(page.getByTestId(NOT_FOUND)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(FORM_TITLE)).toHaveCount(0);
    const bHtml = (await bResponse?.text()) ?? '';
    expect(
      bHtml.includes(RECIPE_B_NAME),
      'el nombre de la receta de B no puede aparecer en ninguna parte del HTML del detalle ajeno',
    ).toBe(false);

    const bBodyText = (await page.getByTestId(NOT_FOUND).innerText()).trim();
    const bLinkHref = await page.getByTestId(NOT_FOUND_LINK).getAttribute('href');

    const missingResponse = await page.goto(recipeEditRoute(NONEXISTENT_RECIPE_ID));
    await expect(page.getByTestId(NOT_FOUND)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(FORM_TITLE)).toHaveCount(0);
    const missingHtml = (await missingResponse?.text()) ?? '';
    expect(missingHtml.includes(RECIPE_B_NAME)).toBe(false);

    const missingBodyText = (await page.getByTestId(NOT_FOUND).innerText()).trim();
    const missingLinkHref = await page.getByTestId(NOT_FOUND_LINK).getAttribute('href');

    // El id ajeno y el id inexistente deben producir EXACTAMENTE el mismo estado visible: sin esto
    // no se descarta un oraculo de existencia sobre datos de otra empresa.
    expect(
      bBodyText,
      'el id ajeno y el id inexistente deben mostrar el mismo mensaje de "no encontrada"',
    ).toBe(missingBodyText);
    expect(bLinkHref).toBe(missingLinkHref);
    expect(bLinkHref).toBe(FORMULAS_ROUTE);

    // En base, porque la pantalla podria mentir en cualquiera de los dos sentidos: la receta de B
    // sigue intacta, ni borrada ni tocada por haber sido "visitada".
    expect(recipeBBefore.deletedAt).toBeNull();
    expect(
      await snapshotRecipe(recipeBId),
      'la receta de B tiene que seguir intacta: pegar el enlace no puede tener ningun efecto',
    ).toEqual(recipeBBefore);

    // --- 4. Alta en A con el MISMO nombre que la receta de B: se completa sin error porque el
    // nombre es unico por empresa, no global.
    await page.goto(FORMULAS_ROUTE);
    await expect(page.getByTestId(RECIPES_TITLE)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(CREATE_OPEN).first().click();
    await expect(page.getByTestId(FORM_TITLE)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(FIELD_NAME).fill(RECIPE_B_NAME);
    // Desde afa5a867 el Guardar solo se habilita con al menos una linea con producto y una suma
    // del 100 %. El ingrediente es de A: el selector solo ofrece productos de la empresa activa.
    const lineProduct = page.getByTestId(LINE_PRODUCT);
    await lineProduct.click();
    await lineProduct.fill(PRODUCT_A_NAME);
    await page
      .getByTestId(`${LINE_PRODUCT}-option`)
      .filter({ hasText: PRODUCT_A_NAME })
      .click();
    await page.getByTestId(LINE_PERCENTAGE).fill('100');
    await expect(page.getByTestId(FORM_SUBMIT)).toBeEnabled();
    await page.getByTestId(FORM_SUBMIT).click();

    // El alta redirige a la lista solo con exito: con el error de duplicado el formulario seguiria
    // a la vista.
    await expect(page.getByTestId(RECIPES_TITLE)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(FORM_TITLE)).toHaveCount(0);

    expect(
      await prisma.recipe.count({ where: { name: RECIPE_B_NAME, deletedAt: null } }),
      'el mismo nombre de receta debe poder existir en dos empresas distintas',
    ).toBe(2);
    expect(
      await prisma.recipe.count({
        where: { name: RECIPE_B_NAME, companyId: companyAId, deletedAt: null },
      }),
    ).toBe(1);

    // Y B no se entera de nada de lo que hizo A.
    expect(await snapshotRecipe(recipeBId)).toEqual(recipeBBefore);
  });
});
