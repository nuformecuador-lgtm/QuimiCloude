/**
 * E2E del error INESPERADO (QC-70, T15; R33, R13). **Un solo caso**, y el motivo esta escrito en
 * `design.md > 6 ter`: lo que esta ficha cambia de verdad en el navegador es que un error que NO
 * es de dominio pasa de reventar la pantalla a pintarse DENTRO de ella con un mensaje neutro. Eso
 * no lo ve ningun unitario -en unit la accion es un doble y no hay ni Prisma ni documento HTML-.
 * El resto del cambio -valores de codigo y textos- ya lo cubren los unitarios de los cinco modulos
 * y de los once archivos de UI, y un E2E por pantalla seria pagar minutos de Playwright por lo que
 * un `render` ya prueba.
 *
 * COMO SE PROVOCA EL ERROR AJENO, SIN UNA SOLA LINEA DE PRODUCCION PARA TESTS (T15 lo prohibe
 * explicitamente): navegando a `/produccion/formulas/<id-que-no-es-uuid>`. El camino, comprobado
 * archivo a archivo antes de escribir este spec:
 *
 *   `EditarRecetaPage` pasa el `id` de la URL TAL CUAL a `getRecipeAction(id)` -> `createGetRecipe`
 *   -> `findAliveById(id)` -> `prisma.recipe.findFirst({ where: { id, deletedAt: null } })`.
 *
 * Nadie valida la FORMA del `id` por el camino -ni un esquema en el borde, ni el caso de uso- y
 * `Recipe.id` es `@db.Uuid` en `db/schema.prisma`. Asi que Prisma rechaza el valor en el driver,
 * antes de tocar la base, con `P2023 Inconsistent column data: Error creating UUID`. Es un error
 * que NACE EN PRISMA, no en el dominio: `createErrorStateTranslator(RecetasError)` no lo reconoce
 * como suyo, lo manda al log y devuelve el codigo generico `unexpected` (R12, R14).
 *
 * Es exactamente el caso que R33 describe, y es alcanzable desde un navegador con una sesion
 * normal. No hace falta ningun `throw` de mentira en produccion.
 *
 * QUE SE AFIRMA, y por que las tres cosas juntas:
 *  (a) la pantalla SIGUE EN PIE -el armazon de la zona privada esta ahi- y no ha caido en la
 *      pantalla de error del framework;
 *  (b) el mensaje que se lee es el del CATALOGO para `unexpected`, tomado de
 *      `errorMessage(UNEXPECTED_ERROR_CODE)` y nunca copiado a mano aqui: un literal duplicado en
 *      el test dejaria de morder el dia que el catalogo cambie, que es justo cuando tiene que
 *      morder;
 *  (c) el HTML SERVIDO no contiene ningun detalle interno -ni `Prisma`, ni `Inconsistent column
 *      data`, ni `findFirst`, ni `UUID`, ni nombres de tabla, ni traza-. Se mira el documento
 *      entero (`page.content()`), no el texto visible: un detalle escondido en un atributo o en
 *      una carga util serializada es un detalle filtrado igual (R13).
 *
 * EL PERMISO VA ANTES QUE EL ERROR: `EditarRecetaPage` empieza con
 * `requirePagePermission('recetas.consultar')`, asi que sin ese permiso la respuesta es 404 y no
 * se llega nunca al error que este caso quiere ver. Por eso el usuario del fixture lleva el rol
 * `Administrador` REAL del seed, que es quien tiene `recetas.consultar` (QC-74). El rol no se crea
 * aqui: `roles.name` es unico y es un dato compartido con el seed y con produccion.
 *
 * DATOS: este spec NO crea ninguna receta -no hace falta ninguna: el `id` de la URL revienta antes
 * de que la consulta llegue a mirar fila alguna-. Lo unico efimero es el USUARIO con el que se
 * entra y su EMPRESA, ambos con el prefijo `qc70_e2e_` y el `RUN_ID` de este worker dentro, igual
 * que en `e2e/recetas.spec.ts` y `e2e/permisos.spec.ts`: los indices unicos de `users` son
 * globales y Chromium y WebKit corren a la vez. `afterAll` los borra SIEMPRE, aunque el test
 * reviente, y en el orden que impone la FK `users.company_id` (`Restrict`): usuario y despues
 * empresa.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// El mensaje bajo prueba sale del CATALOGO, no de un literal: es su unica fuente (QC-70 R1).
import { errorMessage, UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
// `normalizeCompanyName` es la UNICA definicion de <<mismo nombre de empresa>> (QC-47 R3), y
// `ROLE_ADMINISTRADOR` se toma del barrel como VALOR, nunca como literal a mano (QC-54).
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc70_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que `e2e/recetas.spec.ts`). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E: borrar por prefijo a secas se
 * llevaria una fila que otra ejecucion esta usando ahora mismo. Una hora deja fuera cualquier
 * ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const adminUser = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc70-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

/**
 * El identificador que la base rechaza. Tiene forma valida de segmento de URL -y por eso llega
 * entero hasta Prisma- pero no es un identificador universal, que es lo que exige `recipes.id`
 * (`@db.Uuid`).
 *
 * **El valor no puede contener ninguna de las palabras de `FORBIDDEN_IN_HTML`**, y esto no es
 * cosmetica: el identificador viaja en la URL y Next lo devuelve dentro de la carga util del
 * documento, asi que un valor descriptivo como `...-no-es-un-uuid-...` pondria rojo el paso (c)
 * por culpa del propio fixture y no de una fuga real. Se comprobo corriendolo.
 */
const REJECTED_ID = `${FIXTURE_PREFIX}id_que_la_base_rechaza_${RUN_ID.slice(0, 8)}`;

/**
 * Lo que el navegador NO puede recibir (R13). Cubre las familias de fuga: el nombre del ORM, el
 * texto literal del error de Prisma, el nombre de la operacion del cliente, el tipo de columna y
 * los nombres de tabla. La comparacion es EN MINUSCULAS contra el documento entero.
 */
const FORBIDDEN_IN_HTML = [
  'prisma',
  'inconsistent column data',
  'error creating uuid',
  'findfirst',
  'uuid',
  'recipe_lines',
  'invalid character',
] as const;

let companyId: string | null = null;

test.beforeAll(async () => {
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `el rol "${ROLE_ADMINISTRADOR}" no existe: correr \`pnpm run db:seed\` antes de este E2E. ` +
        'Este spec no lo crea porque `roles.name` es unico y sus permisos son dato del seed.',
    );
  }

  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc70_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas
  // (`tests/integration/identity/identity-constraints.int.test.ts` afirma `user.count() === 0`).
  // El corte POR EDAD no es adorno: sin el, este borrado se llevaria el usuario que el otro
  // proyecto (WebKit/Chromium) acaba de crear.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas, DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que su usuario. NUNCA la de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa del seed.
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames: `Qc70${RUN_ID.slice(0, 8)}`,
      lastNames: 'Errores',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara: cada paso en su
  // propio `try`/`finally`. Por el nombre EXACTO de ESTE worker, nunca por el prefijo: el otro
  // proyecto tiene su propio `RUN_ID` y esta corriendo a la vez.
  try {
    await prisma.user.deleteMany({ where: { username: adminUser.username } });
  } finally {
    try {
      // La empresa, DESPUES del usuario: `users.company_id` es `onDelete: Restrict` (QC-47 R11).
      await prisma.company.deleteMany({ where: { name: companyName } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('un error que no es de dominio, visto desde el navegador', () => {
  test('la pantalla sigue en pie, muestra el mensaje neutro de `unexpected` y no filtra ni un detalle interno (R33, R13)', async ({
    page,
  }) => {
    // --- 1. Sesion real, con el permiso `recetas.consultar`: sin el, la pagina responde 404 antes
    // de llegar a la consulta y no habria error que observar.
    await loginAndLand(page, adminUser);

    // --- 2. La ficha de una receta cuyo identificador la base no puede ni interpretar. El error
    // nace en Prisma, fuera de la familia `RecetasError`.
    const response = await page.goto(`${FORMULAS_ROUTE}/${REJECTED_ID}`);

    // --- 3. (a) La pantalla SIGUE EN PIE. Se afirma sobre el armazon de la zona privada, no sobre
    // «no veo un error»: si Next hubiera caido en su pantalla de error, el layout privado no
    // estaria. Y el documento se sirve con 200, no con el 500 de una excepcion sin atrapar.
    expect(
      response?.status(),
      'un error atrapado y traducido se sirve como pagina normal, no como 500',
    ).toBe(200);
    await expect(page.getByTestId('private-content')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('private-nav')).toBeAttached();

    // --- 4. (b) El mensaje es el del CATALOGO para el codigo generico, y el codigo que la
    // pantalla pinta es `unexpected`. El texto se toma de `errorMessage`, nunca copiado a mano.
    await expect(page.getByTestId('recipe-list-error')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('recipe-list-error-message')).toHaveText(
      errorMessage(UNEXPECTED_ERROR_CODE),
    );
    await expect(page.getByTestId('recipe-list-error-code')).toHaveText(UNEXPECTED_ERROR_CODE);

    // --- 5. (c) Y el documento SERVIDO no lleva ni un detalle interno. Se mira el HTML entero y no
    // solo el texto visible: un detalle en un atributo o en la carga util serializada esta
    // filtrado igual.
    const html = (await page.content()).toLowerCase();
    for (const needle of FORBIDDEN_IN_HTML) {
      expect(
        html.includes(needle),
        `el HTML servido no puede contener «${needle}»: es detalle interno (R13)`,
      ).toBe(false);
    }
  });
});
