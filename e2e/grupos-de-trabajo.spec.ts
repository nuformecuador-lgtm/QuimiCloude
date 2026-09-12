/**
 * E2E de la pestana de grupos de trabajo (QC-85, T14): el recorrido COMPLETO de R42 en un solo
 * guion —entrar a la pantalla de usuarios, cambiar a la pestana de grupos, crear un grupo,
 * renombrarlo, meter a una persona, sacarla y borrarlo—, comprobando en cada paso lo que la
 * pantalla presenta.
 *
 * Por que existe, y por que AQUI: **QC-84 dec. 17 difirio su E2E a esta ficha** con motivo —cuando
 * se construyeron los siete casos de uso todavia no habia pantalla que abrir con ellos— y la
 * decision cerrada 11 lo recoge. Es UN solo `test(...)` y no siete porque R42 pide un RECORRIDO:
 * renombrar exige haber creado, sacar exige haber metido, y borrar exige que el grupo exista.
 * Partirlo en siete casos independientes obligaria a sembrar por la base el estado de los seis
 * anteriores, que es exactamente lo que un recorrido de extremo a extremo esta para no hacer.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, el
 *    corte por permiso de la pagina (`usuarios.consultar`), el Server Component de la lista de
 *    grupos y las **cinco Server Actions de escritura** de QC-84 (crear, renombrar, meter, sacar,
 *    borrar) mas las **dos de lectura** (grupos y miembros) y la **consulta de personas** de QC-66,
 *    todas contra Postgres. En unit todas ellas son dobles.
 *  - **El conmutador de pestanas y la direccion** (R1, R3): activar la pestana NAVEGA, y que
 *    `?tab=grupos` sirva la seccion de grupos desde el servidor solo se ve con el servidor delante.
 *  - **Las tres capas superpuestas**: el panel lateral es un `Sheet` con su portal, el borrado un
 *    `AlertDialog` con el suyo y el aviso un `<Toaster />` del layout. jsdom no ejercita ninguno.
 *  - **La lista de miembros se vuelve a pedir al servidor tras cada exito** (R30): que la persona
 *    aparezca y desaparezca de verdad —y no porque el cliente insertara una fila— solo lo demuestra
 *    la base real.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * LA PERSONA QUE SE METE ESTA `active`, Y NO ES UN DETALLE DEL FIXTURE (`design.md > 10.2`):
 * `createAddWorkGroupMember` crea la fila SEA CUAL SEA el estado de cuenta, pero la lista de
 * miembros **solo muestra cuentas activas** (QC-84 dec. 3, R25) y toda cuenta **nace `pending`**
 * (QC-66 R13). Una persona recien creada por la pantalla se anadiria con exito y NO apareceria en
 * la lista —y eso es el comportamiento correcto, no un fallo—. Por eso el fixture la crea por la
 * base con `accountStatus: 'active'` explicito: solo asi el paso «meter» tiene algo que afirmar.
 *
 * EL ACTOR NO APARECE ENTRE LOS CANDIDATOS (`design.md > 10.1`, QC-66 dec. 12): `listUsers`
 * EXCLUYE al actor, asi que el administrador no puede meterse a si mismo en un grupo. Por eso el
 * fixture crea a OTRA persona y el buscador busca a esa.
 *
 * POR QUE LA LISTA SE PIDE CON BUSQUEDA EN LA URL: `work_groups` es una tabla real y compartida, y
 * el filtrado ocurre EN EL SERVIDOR sobre el conjunto entero (R14), asi que pedir la lista con el
 * termino de este worker es lo que garantiza que el grupo creado no se escape a una pagina que el
 * recorrido no visita. El cambio de pestana SI se hace pulsando el conmutador —R42 lo nombra—; lo
 * que se hace por URL es acotar la lista despues, igual que en `e2e/usuarios.spec.ts`. Ninguna URL
 * se escribe como literal: todas salen de `USERS_ROUTE` (R3).
 *
 * POR QUE EL FIXTURE SIEMBRA UN GRUPO «PREVIO»: con cero filas la pantalla pinta el estado vacio
 * (R18) y el disparador del alta **no esta en el arbol** —vive dentro de `WorkGroupTable`, que solo
 * se monta cuando hay filas—. El grupo previo es una PRECONDICION del recorrido, como la empresa y
 * los usuarios, y por eso se siembra por la base y no por la pantalla. Ademas sirve de testigo al
 * final: tras borrar el grupo del recorrido, el previo sigue en la lista, asi que «la fila
 * desaparecio» no se confunde con «la lista se vacio».
 *
 * LO QUE ESTE SPEC NO CREA: los roles ni sus permisos. `Administrador` —que tiene
 * `usuarios.consultar` y `usuarios.modificar`— y `Operador` los siembra `pnpm run db:seed`. Si el
 * rol falta, el `beforeAll` falla diciendo que hay que sembrar, en vez de dar un rojo
 * incomprensible a medio camino.
 *
 * DATOS Y AISLAMIENTO, copiando el patron ya asentado de `e2e/usuarios.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc85_e2e_` y dentro el `RUN_ID` del worker;
 *  - cada worker tiene su propia EMPRESA, y tanto los grupos como los usuarios estan acotados a la
 *    empresa del actor, asi que un worker no puede ver las filas del otro;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra SIEMPRE, aunque el test reviente, y por la EMPRESA de este worker.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus modulos
 * son de CLIENTE (`'use client'`, JSX, `useActionState`) e importarlos desde el proceso de Node del
 * runner arrastraria React al spec sin aportar nada. Mismo criterio que `e2e/usuarios.spec.ts`.
 * Ningun assert mira copy (R41): todo se localiza por `data-testid`, por rol ARIA, por atributo de
 * datos o por valores del fixture; el unico texto que se compara es el que produce
 * `buildDisplayName`, que es una funcion del CONTRATO, no un literal de la pantalla.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` —que arranca el `webServer` de la config— carga el suyo.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

// Todo como VALOR y por el barrel del modulo —nunca por ruta profunda, nunca un literal a mano—.
// Aqui SI se puede importar el barrel: este archivo corre en Node, no en el navegador.
import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  buildDisplayName,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { DASHBOARD_ROUTE, LOGIN_ROUTE, USERS_ROUTE } from '@/lib/shared/routes';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc85_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Edad minima para considerar huerfana una fila con nuestro prefijo (ver cabecera). */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Tamano de pagina maximo que ofrece la pantalla (R13). */
const LIST_PAGE_SIZE = '25';

/**
 * Nombres de los parametros de lista y valor de la pestana, tal y como los declaran
 * `usuarios-tabs.ts` y `user-list-params.ts`. Se repiten aqui como constantes locales por el mismo
 * motivo que los `data-testid` (ver cabecera): el barrel de la ruta es de cliente.
 */
const TAB_PARAM = 'tab';
const GROUPS_TAB = 'grupos';
const PAGE_SIZE_PARAM = 'pageSize';
const SEARCH_PARAM = 'q';

/** `data-testid` de la pantalla de personas, del conmutador y de la seccion de grupos (R41). */
const USERS_TITLE_TESTID = 'usuarios-title';
const USER_LIST_TESTID = 'user-list';
const TABS_TESTID = 'usuarios-tabs';
const TAB_GROUPS_TESTID = 'usuarios-tab-grupos';
const GROUP_SECTION_TESTID = 'work-group-section';

/** `data-testid` de la lista de grupos y de la tabla compartida. */
const GROUP_LIST_TESTID = 'work-group-list';
const GROUP_LIST_EMPTY_TESTID = 'work-group-list-empty';
const GROUP_CREATE_OPEN_TESTID = 'work-group-create-open';
const GROUP_NAME_CELL_TESTID = 'data-table-cell-name';
const GROUP_ACTION_EDIT_TESTID = 'work-group-action-edit';
const GROUP_ACTION_DELETE_TESTID = 'work-group-action-delete';

/** `data-testid` del panel lateral y de su formulario del nombre. */
const GROUP_SHEET_TESTID = 'work-group-sheet';
const GROUP_FORM_TESTID = 'work-group-form';
const GROUP_NAME_FIELD_TESTID = 'work-group-field-name';
const GROUP_FORM_SUBMIT_TESTID = 'work-group-form-submit';
const GROUP_FORM_CANCEL_TESTID = 'work-group-form-cancel';
const GROUP_FORM_ERROR_TESTID = 'work-group-form-error';
const GROUP_NAME_ERROR_TESTID = 'work-group-error-name';

/** `data-testid` del bloque de miembros y de su buscador de personas. */
const MEMBERS_TESTID = 'work-group-members';
const MEMBERS_EMPTY_TESTID = 'work-group-members-empty';
const MEMBERS_ERROR_TESTID = 'work-group-members-error';
const MEMBER_ROW_TESTID = 'work-group-member-row';
const MEMBER_NAME_TESTID = 'work-group-member-name';
const MEMBER_REMOVE_TESTID = 'work-group-member-remove';
const MEMBERS_POSITION_TESTID = 'work-group-members-position';
const MEMBER_SEARCH_TESTID = 'work-group-member-search';
const CANDIDATE_TESTID = 'work-group-candidate';
const ADD_ERROR_TESTID = 'work-group-add-error';
const REMOVE_ERROR_TESTID = 'work-group-remove-error';

/** `data-testid` del dialogo de confirmacion del borrado. */
const DELETE_DIALOG_TESTID = 'delete-work-group-dialog';
const DELETE_MESSAGE_TESTID = 'delete-work-group-message';
const DELETE_ID_TESTID = 'delete-work-group-id';
const DELETE_CONFIRM_TESTID = 'delete-work-group-confirm';
const DELETE_ERROR_TESTID = 'delete-work-group-error';

type Credentials = { readonly username: string; readonly password: string };

/**
 * El termino con el que el recorrido pide la lista de grupos y busca a la persona. **El `RUN_ID` va
 * ANTES del sufijo** para que sea substring de los tres nombres de grupo y de los dos nombres de
 * usuario de este worker: la busqueda del modulo es `contains` insensible a mayusculas.
 */
const SEARCH_TERM = `${FIXTURE_PREFIX}${RUN_ID}`;

const adminUser: Credentials = {
  username: `${SEARCH_TERM}_admin`,
  password: `Qc85-Admin-${RUN_ID.slice(0, 12)}`,
};

/**
 * La persona que el recorrido mete y saca del grupo. **Nace `active` a proposito** (ver cabecera):
 * con `pending` se anadiria con exito y no apareceria en la lista, que es el comportamiento
 * correcto y no lo que R42 quiere demostrar. No inicia sesion nunca: es un sujeto, no un actor.
 */
const memberUser: Credentials = {
  username: `${SEARCH_TERM}_miembro`,
  password: `Qc85-Miembro-${RUN_ID.slice(0, 12)}`,
};

/** Los nombres del fixture de la persona. De ellos sale su nombre mostrable, via contrato. */
const memberFirstNames = `Qc85${RUN_ID.slice(0, 8)}`;
const memberLastNames = 'Miembro';
const memberDisplayName = buildDisplayName(memberFirstNames, memberLastNames, memberUser.username);

/** Los tres nombres de grupo del recorrido. Los tres llevan el termino, asi que los tres casan. */
const previousGroupName = `${SEARCH_TERM}_previo`;
const createdGroupName = `${SEARCH_TERM}_nuevo`;
const renamedGroupName = `${SEARCH_TERM}_renombrado`;

/** Empresa efimera de este worker. NUNCA la de instalacion: `companies_name_unique` es GLOBAL. */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;
let memberUserId: string | null = null;
let previousGroupId: string | null = null;

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

  const isMember = user.username === memberUser.username;

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  const created = await prisma.user.create({
    data: {
      firstNames: isMember ? memberFirstNames : `Qc85${RUN_ID.slice(0, 8)}`,
      lastNames: isMember ? memberLastNames : 'Fixture',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // EXPLICITO, no por defecto (QC-78 R1, `design.md > 10.2`): la columna es `@default(pending)`,
      // `pending` no entra por el login y —lo que aqui importa— una persona `pending` NO aparece en
      // la lista de miembros aunque se la anada con exito.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** Entra por el formulario real. El Administrador aterriza en el panel (QC-75 R11). */
async function login(page: Page, user: Credentials, landing: string): Promise<void> {
  await page.goto(LOGIN_ROUTE);
  await page.getByTestId('login-username').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });
}

/** Destino de la pestana de grupos, derivado de `USERS_ROUTE` (R3): ningun literal de ruta. */
function groupsTabUrl(): string {
  return `${USERS_ROUTE}?${new URLSearchParams({ [TAB_PARAM]: GROUPS_TAB }).toString()}`;
}

/** La lista de grupos acotada al termino de este worker, tambien derivada de `USERS_ROUTE`. */
function groupsListUrl(search: string): string {
  const query = new URLSearchParams({
    [TAB_PARAM]: GROUPS_TAB,
    [PAGE_SIZE_PARAM]: LIST_PAGE_SIZE,
    [SEARCH_PARAM]: search,
  });
  return `${USERS_ROUTE}?${query.toString()}`;
}

/** Igualdad EXACTA de texto: un nombre no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/** Un elemento por `data-testid` **y** por el identificador que lleva en su `data-user-id`. */
function byTestIdAndUserId(page: Page, testId: string, userId: string): Locator {
  return page.locator(`[data-testid="${testId}"][data-user-id="${userId}"]`);
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc85_e2e_*` en la
  // base, y esa basura pone rojo tests de OTRAS features que cuentan filas. El corte POR EDAD no es
  // un adorno: sin el, este borrado se llevaria lo que el otro proyecto esta usando ahora mismo.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  // Las pertenencias PRIMERO: su FK compuesta contra `users` es `ON DELETE RESTRICT` (QC-83), asi
  // que borrar antes las personas lo rechazaria la base. `WorkGroupMember` no declara `@relation`
  // —sus dos FK son compuestas y van escritas a mano—, asi que se resuelve por identificadores.
  const orphanGroups = await prisma.workGroup.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanGroupIds = orphanGroups.map((group) => group.id);
  if (orphanGroupIds.length > 0) {
    await prisma.workGroupMember.deleteMany({ where: { workGroupId: { in: orphanGroupIds } } });
    await prisma.workGroup.deleteMany({ where: { id: { in: orphanGroupIds } } });
  }
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas van DESPUES de todo lo que cuelga de ellas: las FK son `onDelete: Restrict`.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios y sus grupos.
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  memberUserId = await createUserWithRole(memberUser, ROLE_OPERADOR);

  // El grupo testigo (ver cabecera): la lista no arranca vacia, asi que el disparador del alta esta
  // en el arbol. `nameNormalized` sale de la UNICA definicion de «mismo nombre de grupo» (QC-83 R3),
  // importada del contrato y no reescrita aqui.
  previousGroupId = (
    await prisma.workGroup.create({
      data: {
        name: previousGroupName,
        nameNormalized: normalizeWorkGroupName(previousGroupName),
        companyId,
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o el test reventara a mitad del recorrido
  // —y entonces quedan un grupo sin borrar y una pertenencia sin retirar—. El orden lo imponen las
  // FK restrictivas: pertenencias -> grupos -> usuarios -> empresa.
  //
  // **Por la EMPRESA de ESTE worker, nunca por `FIXTURE_PREFIX`**: los dos proyectos de Playwright
  // corren a la vez, cada uno con su `RUN_ID` y su propia empresa, y borrar por prefijo aqui se
  // llevaria lo que el otro acaba de crear.
  const scopedCompanyId = companyId;
  try {
    if (scopedCompanyId !== null) {
      await prisma.workGroupMember.deleteMany({ where: { companyId: scopedCompanyId } });
      await prisma.workGroup.deleteMany({ where: { companyId: scopedCompanyId } });
    }
  } finally {
    try {
      await prisma.user.deleteMany({
        where: { username: { in: [adminUser.username, memberUser.username] } },
      });
    } finally {
      try {
        await prisma.company.deleteMany({ where: { name: companyName } });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});

// Timeout amplio: el recorrido es largo, el primer `goto` hace que `next dev` compile la ruta bajo
// demanda y bcrypt tarda a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(240_000);

test.describe('pestana de grupos de trabajo', () => {
  test('crear, renombrar, meter a una persona, sacarla y borrar el grupo, en un solo recorrido (R42)', async ({
    page,
  }) => {
    const memberId = memberUserId;
    expect(memberId, 'el fixture de la persona no existe: fallo el beforeAll').not.toBeNull();
    if (memberId === null) return;

    await login(page, adminUser, DASHBOARD_ROUTE);

    // --- 1. ENTRAR A LA PANTALLA DE USUARIOS. Sin `tab` en la direccion, lo que se presenta es la
    // pestana de PERSONAS (R2, R6) y la seccion de grupos no esta en el arbol: se monta UNA sola
    // (R1). El conmutador si esta, con sus dos disparadores.
    await page.goto(USERS_ROUTE);
    await expect(page.getByTestId(USERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(TABS_TESTID)).toBeVisible();
    await expect(page.getByTestId(USER_LIST_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(GROUP_SECTION_TESTID)).toHaveCount(0);

    // --- 2. CAMBIAR A LA PESTANA DE GRUPOS **pulsando el conmutador** (R42). Activar una pestana
    // es una NAVEGACION: la direccion pasa a nombrar la pestana —con `tab` y NADA mas (R7)— y lo
    // que se presenta cambia de seccion, sin que el usuario recargue (R3).
    await page.getByTestId(TAB_GROUPS_TESTID).click();
    await page.waitForURL((url) => `${url.pathname}${url.search}` === groupsTabUrl(), {
      timeout: 60_000,
    });
    await expect(page.getByTestId(GROUP_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(USER_LIST_TESTID)).toHaveCount(0);

    // --- 3. La lista, acotada al termino de ESTE worker (R14): el filtrado lo resolvio el SERVIDOR
    // sobre el conjunto entero, asi que nada de lo que este recorrido cree puede escaparse a una
    // pagina que no visita. Esta el grupo testigo del fixture y **no** esta todavia el del
    // recorrido: asi la fila que se vea despues es la que trajo la escritura.
    const listUrl = groupsListUrl(SEARCH_TERM);
    await page.goto(listUrl);
    await expect(page.getByTestId(GROUP_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(GROUP_LIST_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(GROUP_LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(
      page.getByTestId(GROUP_NAME_CELL_TESTID).filter({ hasText: exactText(previousGroupName) }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId(GROUP_NAME_CELL_TESTID).filter({ hasText: exactText(createdGroupName) }),
    ).toHaveCount(0);

    // --- 4. CREAR UN GRUPO. El disparador del alta se ofrece porque la sesion trae ademas
    // `usuarios.modificar` (R9), y el alta ocurre en un PANEL LATERAL, SIN cambiar de URL (R20). El
    // panel del alta **no monta el bloque de miembros**: todavia no hay grupo al que anadir a nadie.
    const urlBeforeCreate = page.url();
    await page.getByTestId(GROUP_CREATE_OPEN_TESTID).click();
    const sheet = page.getByTestId(GROUP_SHEET_TESTID);
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(sheet).toHaveAttribute('data-mode', 'create');
    await expect(page.getByTestId(MEMBERS_TESTID)).toHaveCount(0);
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeCreate);

    // El formulario captura EXACTAMENTE un campo, el nombre (R22): no hay nada mas que teclear.
    await expect(page.getByTestId(GROUP_FORM_TESTID)).toBeVisible();
    await page.getByTestId(GROUP_NAME_FIELD_TESTID).fill(createdGroupName);
    // Con un nombre valido no hay aviso en vivo (R21).
    await expect(page.getByTestId(GROUP_NAME_ERROR_TESTID)).toHaveCount(0);
    await page.getByTestId(GROUP_FORM_SUBMIT_TESTID).click();

    // Con exito el panel se cierra, se avisa por el `<Toaster />` que el layout privado YA monta
    // —no se monta un segundo— y la lista se pone al dia sin que nadie recargue (R35). Se afirma
    // que HAY un aviso, no cual es su texto (R41).
    await expect(sheet).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'cerrar el panel no debe perder los parametros de lista').toBe(
      urlBeforeCreate,
    );

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla: la fila existe, cuelga de la
    // empresa DEL ACTOR —que el formulario no envia— y su clave normalizada la puso el dominio.
    const created = await prisma.workGroup.findFirstOrThrow({
      where: { name: createdGroupName },
      select: { id: true, companyId: true, nameNormalized: true, deletedAt: true },
    });
    expect(created.companyId, 'la empresa sale del actor, no del formulario').toBe(companyId);
    expect(created.nameNormalized).toBe(normalizeWorkGroupName(createdGroupName));
    expect(created.deletedAt).toBeNull();

    // Y esta en la lista, en SU fila —localizada por el identificador que puso la base, nunca por
    // su posicion— con el nombre como UNICA columna de datos (R12).
    const row = page.getByTestId(`data-table-row-${created.id}`);
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await expect(row.getByTestId(GROUP_NAME_CELL_TESTID)).toHaveText(exactText(createdGroupName));

    // --- 5. RENOMBRARLO. La misma fila, su accion de abrir, y el panel llega precargado con el
    // nombre que la lista muestra (R20, R23).
    await row.getByTestId(GROUP_ACTION_EDIT_TESTID).click();
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(sheet).toHaveAttribute('data-mode', 'edit');
    await expect(sheet).toHaveAttribute('data-work-group-id', created.id);
    await expect(page.getByTestId(GROUP_NAME_FIELD_TESTID)).toHaveValue(createdGroupName);

    await page.getByTestId(GROUP_NAME_FIELD_TESTID).fill(renamedGroupName);
    await page.getByTestId(GROUP_FORM_SUBMIT_TESTID).click();
    await expect(sheet).toHaveCount(0, { timeout: 60_000 });

    // Es la MISMA fila —mismo identificador— con otro nombre: renombrar no crea un grupo nuevo.
    await expect(row.getByTestId(GROUP_NAME_CELL_TESTID)).toHaveText(exactText(renamedGroupName), {
      timeout: 60_000,
    });
    await expect(
      page.getByTestId(GROUP_NAME_CELL_TESTID).filter({ hasText: exactText(createdGroupName) }),
    ).toHaveCount(0);
    const renamed = await prisma.workGroup.findUniqueOrThrow({
      where: { id: created.id },
      select: { name: true, nameNormalized: true },
    });
    expect(renamed.name).toBe(renamedGroupName);
    expect(renamed.nameNormalized).toBe(normalizeWorkGroupName(renamedGroupName));

    // --- 6. METER A UNA PERSONA. Se abre el panel otra vez sobre el grupo ya creado: ahi es donde
    // se gestionan los miembros (decision cerrada 4). El grupo todavia no tiene ninguno, y el
    // renombrado no le ha tocado los miembros (R23).
    await row.getByTestId(GROUP_ACTION_EDIT_TESTID).click();
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(MEMBERS_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(MEMBERS_ERROR_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(MEMBERS_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });

    // El buscador de personas consulta al SERVIDOR sobre el conjunto entero (R28). El actor NO
    // aparece entre los candidatos —`listUsers` lo excluye (QC-66 dec. 12)— y por eso el recorrido
    // busca a OTRA persona, la del fixture.
    await page.getByTestId(MEMBER_SEARCH_TESTID).fill(memberUser.username);
    const candidate = byTestIdAndUserId(page, CANDIDATE_TESTID, memberId);
    await expect(candidate).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId(CANDIDATE_TESTID)).toHaveCount(1);
    await candidate.click();

    // Se mete **de a una** y sin error: el panel sigue abierto y la lista se vuelve a pedir al
    // servidor (R30). La persona aparece **porque su cuenta esta `active`**: con `pending` la
    // operacion habria sido un exito igual y la lista no la mostraria (`design.md > 10.2`).
    await expect(page.getByTestId(ADD_ERROR_TESTID)).toHaveCount(0);
    const memberRow = byTestIdAndUserId(page, MEMBER_ROW_TESTID, memberId);
    await expect(memberRow).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId(MEMBER_ROW_TESTID)).toHaveCount(1);
    await expect(page.getByTestId(MEMBERS_EMPTY_TESTID)).toHaveCount(0);
    // De la persona se presenta su NOMBRE MOSTRABLE y nada mas (R31): ni correo, ni documento, ni
    // estado de cuenta. El texto esperado lo compone la funcion del CONTRATO, no un literal.
    await expect(memberRow.getByTestId(MEMBER_NAME_TESTID)).toHaveText(exactText(memberDisplayName));
    // Y la posicion dentro del total que devuelve la consulta (R26), leida de sus `data-*`.
    await expect(page.getByTestId(MEMBERS_POSITION_TESTID)).toHaveAttribute('data-total', '1');

    // Lo escribio el backend de verdad, con la empresa que la FK compuesta obliga a compartir.
    const membership = await prisma.workGroupMember.findUniqueOrThrow({
      where: { workGroupId_userId: { workGroupId: created.id, userId: memberId } },
      select: { companyId: true },
    });
    expect(membership.companyId).toBe(companyId);

    // --- 7. SACARLA. Cada miembro presentado ofrece su accion de sacarlo (R32), y tras el exito la
    // lista se vuelve a pedir al servidor: la fila desaparece porque la consulta ya no la devuelve,
    // no porque el cliente la retirara (R30).
    await byTestIdAndUserId(page, MEMBER_REMOVE_TESTID, memberId).click();
    await expect(page.getByTestId(REMOVE_ERROR_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(MEMBER_ROW_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId(MEMBERS_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(
      await prisma.workGroupMember.count({ where: { workGroupId: created.id } }),
      'sacar a la persona borra la pertenencia, no la esconde',
    ).toBe(0);

    // Cerrar el panel devuelve a la lista con los MISMOS parametros y en la MISMA pestana (R20).
    await page.getByTestId(GROUP_FORM_CANCEL_TESTID).click();
    await expect(sheet).toHaveCount(0, { timeout: 60_000 });
    expect(page.url()).toBe(urlBeforeCreate);

    // --- 8. BORRAR EL GRUPO. Se pide confirmacion en un dialogo que NOMBRA a ese grupo (R33): el
    // sujeto se afirma por el campo oculto que viaja en el envio —identificador, no copy— y el
    // mensaje contiene el nombre del fixture. Mientras no se confirme, no se invoca el borrado.
    await row.getByTestId(GROUP_ACTION_DELETE_TESTID).click();
    const dialog = page.getByTestId(DELETE_DIALOG_TESTID);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByTestId(DELETE_ID_TESTID)).toHaveValue(created.id);
    await expect(dialog.getByTestId(DELETE_MESSAGE_TESTID)).toContainText(renamedGroupName);
    expect(
      await prisma.workGroup.count({ where: { id: created.id, deletedAt: null } }),
      'mientras no se confirme, el grupo sigue vivo',
    ).toBe(1);

    await dialog.getByTestId(DELETE_CONFIRM_TESTID).click();

    // Con exito el dialogo se cierra y la fila deja de estar en la lista (R35). El grupo TESTIGO
    // sigue ahi: «la fila desaparecio» no se confunde con «la lista se vacio».
    await expect(page.getByTestId(DELETE_ERROR_TESTID)).toHaveCount(0);
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await expect(row).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId(GROUP_LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(`data-table-row-${previousGroupId}`)).toHaveCount(1);

    // Y el borrado es LOGICO, tal como lo dejo QC-84: la fila sigue en la tabla con su marca de
    // baja, y es esa marca la que la saca de la consulta.
    const deleted = await prisma.workGroup.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    expect(deleted.deletedAt).not.toBeNull();

    // Ningun rechazo se quedo pintado por el camino (R24, R29, R32, R34).
    await expect(page.getByTestId(GROUP_FORM_ERROR_TESTID)).toHaveCount(0);
  });
});
