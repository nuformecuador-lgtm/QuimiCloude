/**
 * E2E de la pantalla de clientes (QC-155, T8): el camino completo de quien tiene los dos permisos
 * y el rechazo de quien no tiene ninguno (R41, R42).
 *
 * Por que existe, y por que AQUI: `requirements.md > R41` lo pide entero -login -> `CUSTOMERS_ROUTE`
 * -> ve la lista -> da de alta un cliente y lo ve -> lo encuentra con la caja de busqueda -> lo
 * edita y ve el dato cambiado -> lo da de baja y deja de verlo- y ademas un segundo recorrido
 * (R42) donde una sesion valida SIN `clientes.consultar` recibe 404 dentro del layout privado y
 * no ve ni el item del menu ni un solo dato de clientes. Es la unica verificacion de extremo a
 * extremo de todo el modulo (decision cerrada 7 de `requirements.md`): el modelo (QC-153) y el
 * CRUD (QC-154) ya se verifican con tests unitarios y de integracion.
 *
 * Que aporta sobre unit e integracion, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, el
 *    corte por permiso de la pagina (`clientes.consultar`), el Server Component de la lista, las
 *    Server Actions REALES de alta, edicion y baja de QC-154 contra Postgres, y el
 *    `router.refresh()` posterior de cada una.
 *  - **La sincronizacion de la caja de busqueda con la URL** (R18, `design.md > 5.3`): el
 *    recorrido escribe en la caja de verdad y espera a que la URL lo lleve, cosa que jsdom no
 *    reproduce igual que un navegador con su propio rebote de 300 ms.
 *  - El panel lateral (`Sheet`) y el dialogo de confirmacion (`AlertDialog`) son primitivos con su
 *    propio portal: jsdom no los monta igual.
 *  - Chromium y WebKit. WebKit es el motor de iOS, y la regla multiplataforma pide ejercitarlo.
 *
 * NAVEGACION SIEMPRE POR URL (`page.goto`), nunca pulsando el item del menu, salvo la UNICA
 * comprobacion de que `nav-clientes` existe o no para cada rol: pulsar el item metera en el
 * recorrido el filtrado del menu por permisos, que no es lo que este spec afirma. La URL se
 * deriva SIEMPRE de `CUSTOMERS_ROUTE` (R1): ningun literal `/clientes` en todo el archivo.
 *
 * POR QUE LA EMPRESA NACE SIN NINGUN CLIENTE: el estado vacio de R19 -"todavia no hay clientes
 * registrados", con el disparador de alta dentro- es justo el primer paso del recorrido 1, y solo
 * se ve con una empresa realmente sin filas. El alta, la busqueda, la edicion y la baja son
 * entonces las UNICAS escrituras del recorrido, todas por la interfaz: no hay ninguna precondicion
 * que sembrar por la base de datos, a diferencia de usuarios o unidades.
 *
 * EL APELLIDO LLEVA TILDE A PROPOSITO (R41: "lo encuentra con la caja de busqueda"): el recorrido
 * busca despues por el mismo apellido SIN tilde, para ejercitar de punta a punta la normalizacion
 * que QC-154 R41 dejo en el modulo (`normalizeCustomerText`, NFD + descarte de diacriticos). Se
 * importa esa MISMA funcion -nunca una segunda definicion- para componer el termino de busqueda a
 * partir del dato del fixture.
 *
 * DATOS Y AISLAMIENTO: `customers` es una tabla real y COMPARTIDA, y los dos proyectos de
 * Playwright corren a la vez. Por eso, copiando el patron ya asentado de `e2e/usuarios.spec.ts` y
 * `e2e/unidades.spec.ts`:
 *  - todo lo que este spec crea lleva el prefijo `qc155_e2e_` y dentro el `RUN_ID` del worker;
 *  - cada worker tiene su propia EMPRESA, y el listado de clientes esta acotado a la del actor, asi
 *    que el administrador de este worker no puede ver clientes de la empresa del otro;
 *  - el assert de la lista filtra por el APELLIDO del fixture -nunca por «la primera fila» ni por
 *    el total-, y el termino de busqueda lleva el `RUN_ID`, asi que los dos workers no pueden
 *    casar el uno con el otro;
 *  - la limpieza defensiva de huerfanos borra por prefijo **y por edad**, para no llevarse por
 *    delante lo que el otro proyecto acaba de crear;
 *  - `afterAll` borra siempre, aunque el test reviente, por la EMPRESA exacta de este worker (los
 *    clientes cuelgan de ella con FK restrictiva, asi que se borran antes).
 *
 * LO QUE ESTE SPEC NO CREA: los roles ni sus permisos. `Administrador` -que tiene
 * `clientes.consultar` y `clientes.modificar`- y `Operador` -que no tiene ninguno de los dos- los
 * siembra `pnpm run db:seed` (`lib/modules/identity/domain/roles.ts` y `domain/permissions.ts`).
 * Sus permisos son el dato bajo prueba del recorrido 2: con un rol inventado se estaria probando
 * el fixture. Si el rol falta, el `beforeAll` falla diciendolo, en vez de dar un rojo
 * incomprensible a medio camino.
 *
 * LOS `data-testid` VAN COMO CONSTANTES LOCALES y no importados del barrel de la ruta: sus
 * modulos son de CLIENTE (`'use client'`, JSX, `useActionState`) e importarlos desde el proceso de
 * Node del runner arrastraria React sin aportar nada. Es el mismo criterio que
 * `e2e/usuarios.spec.ts` y `e2e/unidades.spec.ts`. Ningun assert mira copy (R40): todo se localiza
 * por `data-testid`, por rol ARIA o por valores del fixture.
 *
 * VARIABLES DE ENTORNO: no se cargan a mano. `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` -que arranca el `webServer` de la config- carga el suyo.
 *
 * SE CORRE con `pnpm exec playwright test e2e/clientes.spec.ts --project=chromium
 * --project=webkit`, nunca con `pnpm run e2e -- <archivo>` (`design.md > 11`).
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// Todo como VALOR y por el barrel del modulo -nunca por ruta profunda, nunca un literal a mano-:
// aqui SI se puede importar el barrel de `clientes`, porque `normalizeCustomerText` es un modulo
// de dominio puro (sin 'use client'); este archivo corre en Node, no en el navegador.
import { normalizeCustomerText } from '@/lib/modules/clientes';
import {
  DOCUMENT_TYPE_CC,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';

// QC-93: la entrada y su aterrizaje, derivado de los permisos del usuario en la base.
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc155_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que los demas specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez, y ademas puede haber otro worktree corriendo su propio E2E contra la misma base: borrar por
 * prefijo a secas se llevaria una fila que otra ejecucion todavia esta usando. Una hora deja fuera
 * cualquier ejecucion viva y dentro cualquier resto de una anterior.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Nombres de los parametros de lista, tal y como los declara `customer-list-params.ts`. Se
 * repiten aqui como constantes locales por el mismo motivo que los `data-testid` (ver cabecera):
 * ese modulo vive en la carpeta de componentes de la ruta, cuyo barrel publica modulos de cliente.
 */
const SEARCH_PARAM = 'q';

/** `data-testid` de la pantalla, del panel lateral, de la tabla compartida y del dialogo (R40). */
const TITLE_TESTID = 'clientes-title';
const DATA_TABLE_TESTID = 'data-table';
const LIST_EMPTY_TESTID = 'customer-list-empty';
const CREATE_OPEN_TESTID = 'customer-create-open';
const SHEET_TESTID = 'customer-sheet';
const FORM_SUBMIT_TESTID = 'customer-form-submit';
const FIELD_FIRST_NAMES_TESTID = 'customer-field-first-names';
const FIELD_LAST_NAMES_TESTID = 'customer-field-last-names';
const FIELD_CITY_TESTID = 'customer-field-city';
const SEARCH_BOX_TESTID = 'data-table-search';
const NO_MATCHES_TESTID = 'customer-list-no-matches';
const LAST_NAMES_CELL_TESTID = 'data-table-cell-lastNames';
const CITY_CELL_TESTID = 'data-table-cell-city';
const ACTION_EDIT_TESTID = 'customer-action-edit';
const ACTION_DELETE_TESTID = 'customer-action-delete';
const DELETE_DIALOG_TESTID = 'delete-customer-dialog';
const DELETE_MESSAGE_TESTID = 'delete-customer-message';
const DELETE_CONFIRM_TESTID = 'delete-customer-confirm';
/** El 404 de la zona privada (QC-75 R8): se pinta DENTRO del layout, con su menu ya filtrado. */
const NOT_FOUND_TESTID = 'private-not-found';

/** Palabras que la pantalla de 404 NO puede contener (R6): delatarian que la pantalla existe. */
const FORBIDDEN_404_WORDS = ['cliente', 'permiso', 'autoriz'] as const;

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc155-Admin-${RUN_ID.slice(0, 12)}`,
};

const operatorUser: Credentials = {
  username: `${FIXTURE_PREFIX}oper_${RUN_ID}`,
  password: `Qc155-Oper-${RUN_ID.slice(0, 12)}`,
};

/**
 * Los seis datos capturados en el alta (R25). Solo los tres obligatorios: telefono, correo y
 * direccion se dejan vacios a proposito, que ya cubren `customer-form.test.tsx` y
 * `customer-columns.test.tsx` (R11).
 *
 * **El apellido lleva tilde** (ver cabecera): se busca despues por el mismo apellido sin ella.
 */
const nuevoCliente = {
  firstNames: `Qc155${RUN_ID.slice(0, 8)}`,
  lastNames: `Gómez${RUN_ID}`,
  city: `${FIXTURE_PREFIX}ciudad_${RUN_ID}`,
} as const;

/** El termino de busqueda: la MISMA normalizacion que aplica el modulo, sobre el apellido real. */
const SEARCH_TERM = normalizeCustomerText(nuevoCliente.lastNames);

/** La ciudad tras la edicion (R27). */
const CIUDAD_EDITADA = `${FIXTURE_PREFIX}ciudad_editada_${RUN_ID}`;

/**
 * Empresa efimera de este worker. El indice `companies_name_unique` es GLOBAL, asi que nunca la
 * de instalacion. El listado de clientes esta acotado a la empresa del actor (decision cerrada 4),
 * asi que esta empresa es tambien lo que aisla la lista de este worker de la del otro.
 */
const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;

let companyId: string | null = null;

async function createUserWithRole(user: Credentials, roleName: string): Promise<void> {
  if (!companyId) {
    throw new Error('la empresa del fixture no existe: fallo el beforeAll');
  }
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) {
    throw new Error(
      `falta el rol "${roleName}": este E2E no lo crea porque SUS PERMISOS son el dato bajo ` +
        'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm exec playwright test`.',
    );
  }

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad. Un hash inventado probaria otra cosa.
  await prisma.user.create({
    data: {
      firstNames: `Qc155${RUN_ID.slice(0, 8)}`,
      lastNames: 'Clientes',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId: role.id,
      companyId,
      // QC-78 R1: explicito, no por defecto. La columna es `@default(pending)` y desde esa ficha
      // `pending` no entra por el login, asi que este usuario efimero no llegaria a la pantalla.
      accountStatus: 'active',
    },
    select: { id: true },
  });
}

/** Igualdad EXACTA de texto: un apellido no puede casar con otro que lo tenga como prefijo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * Escribe el termino en la caja compartida y espera a que la URL lo lleve (copia de
 * `e2e/pedidos-busqueda.spec.ts`). Se reintenta porque lo escrito antes de hidratar no emite la
 * busqueda, y WebKit hidrata tarde.
 */
async function searchFor(page: import('@playwright/test').Page, term: string): Promise<void> {
  const searchBox = page.getByTestId(SEARCH_BOX_TESTID);
  await expect(async () => {
    await searchBox.fill('');
    await searchBox.fill(term);
    await expect(page).toHaveURL((url) => url.searchParams.get(SEARCH_PARAM) === term, {
      timeout: 15_000,
    });
  }).toPass({ timeout: 120_000 });
}

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm exec playwright test` interrumpido deja filas
  // `qc155_e2e_*` en la base, y esa basura pone rojo tests de OTRAS features que cuentan filas.
  // El corte POR EDAD no es un adorno: sin el, este `deleteMany` borraria un cliente que el otro
  // proyecto acaba de crear y que esta usando ahora mismo.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  await prisma.customer.deleteMany({
    where: { firstNames: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  // Las empresas huerfanas van DESPUES de sus clientes y de sus usuarios: la FK es restrictiva y
  // borrarlas antes lo rechazaria la base.
  await prisma.company.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // La empresa efimera de este worker, ANTES que sus usuarios. Nace SIN ningun cliente (ver
  // cabecera): el alta es la primera escritura del recorrido 1, no una precondicion.
  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  await createUserWithRole(adminUser, ROLE_ADMINISTRADOR);
  await createUserWithRole(operatorUser, ROLE_OPERADOR);
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara. El orden lo impone
  // la FK restrictiva: clientes -> usuarios -> empresa, todos de ESTE worker (por `companyId`
  // exacto, nunca por `FIXTURE_PREFIX`: el otro proyecto de Playwright tiene su propio worker con
  // su propia empresa corriendo a la vez).
  try {
    if (companyId) await prisma.customer.deleteMany({ where: { companyId } });
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
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda y bcrypt tarda
// a proposito. Un timeout corto produce rojos que no son del codigo.
test.setTimeout(180_000);

test.describe('pantalla de clientes', () => {
  test('el Administrador entra por la URL, da de alta un cliente, lo encuentra sin tilde, lo edita y lo da de baja (R41)', async ({
    page,
  }) => {
    await loginAndLand(page, adminUser);

    // --- 1. La pantalla se sirve a quien tiene `clientes.consultar`, y su item de menu existe
    // (R4). No se pulsa a proposito (ver cabecera): la navegacion del recorrido es por URL.
    await expect(page.getByTestId('nav-clientes')).toHaveCount(1);

    const listUrl = CUSTOMERS_ROUTE;
    await page.goto(listUrl);
    await expect(page.getByTestId(TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    // --- 2. La empresa de este worker nace sin ningun cliente: el estado vacio de R19, con el
    // disparador de alta DENTRO (la sesion trae `clientes.modificar`, R5, R6). La tabla compartida
    // ni siquiera se monta con cero filas de verdad.
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toHaveCount(0);

    // --- 3. El alta ocurre en un PANEL LATERAL, SIN cambiar de URL (R24).
    const urlBeforeSheet = page.url();
    await page.getByTestId(CREATE_OPEN_TESTID).first().click();
    await expect(page.getByTestId(SHEET_TESTID)).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'abrir el panel no debe navegar').toBe(urlBeforeSheet);

    // --- 4. Los tres obligatorios (R25). Telefono, correo y direccion se dejan vacios a
    // proposito: R11 y su marcador de ausencia ya los cubren los tests de unidad.
    await page.getByTestId(FIELD_FIRST_NAMES_TESTID).fill(nuevoCliente.firstNames);
    await page.getByTestId(FIELD_LAST_NAMES_TESTID).fill(nuevoCliente.lastNames);
    await page.getByTestId(FIELD_CITY_TESTID).fill(nuevoCliente.city);

    // --- 5. Guardar: la Server Action REAL de QC-154 contra Postgres, sin `fetch` de por medio
    // (R34).
    await page.getByTestId(FORM_SUBMIT_TESTID).click();

    // --- 6. Con exito el panel se cierra y se avisa por el `<Toaster />` que el layout privado YA
    // monta (R30). Se afirma que HAY un aviso, no cual es su texto.
    await expect(page.getByTestId(SHEET_TESTID)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 60_000 });

    // --- 7. Lo guardo el backend de verdad, no solo lo pinto la pantalla: la fila existe, cuelga
    // de la empresa DEL ACTOR (que el formulario no envia) y los tres opcionales quedaron sin
    // valor -nunca cadena vacia (QC-154 R16)-.
    const created = await prisma.customer.findFirstOrThrow({
      where: { lastNames: nuevoCliente.lastNames },
      select: { id: true, companyId: true, phone: true, email: true, address: true },
    });
    expect(created.companyId, 'la empresa sale del actor, no del formulario').toBe(companyId);
    expect(created.phone).toBeNull();
    expect(created.email).toBeNull();
    expect(created.address).toBeNull();

    // --- 8. Y el cliente esta en la lista sin que nadie recargue nada (R30), con los MISMOS
    // parametros de lista que habia antes de abrir el panel (R24).
    expect(page.url(), 'cerrar el panel no debe perder los parametros de lista').toBe(
      urlBeforeSheet,
    );
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toBeVisible({ timeout: 60_000 });
    const rowLocator = page.getByTestId(`data-table-row-${created.id}`);
    await expect(
      rowLocator.getByTestId(LAST_NAMES_CELL_TESTID).filter({ hasText: exactText(nuevoCliente.lastNames) }),
    ).toHaveCount(1, { timeout: 60_000 });

    // --- 9. LA BUSQUEDA SIN TILDE (R41, R12): el termino escrito en la caja de VERDAD llega al
    // servidor y este recorta sobre el conjunto entero -no hay filtrado en el cliente-. El termino
    // no lleva tilde y la fila que la tiene aparece igual, porque el modulo normaliza (QC-154 R41).
    await searchFor(page, SEARCH_TERM);
    await expect(page.getByTestId(NO_MATCHES_TESTID)).toHaveCount(0);
    await expect(
      rowLocator.getByTestId(LAST_NAMES_CELL_TESTID).filter({ hasText: exactText(nuevoCliente.lastNames) }),
    ).toHaveCount(1, { timeout: 60_000 });

    // --- 10. Editar (R27): precarga los seis valores actuales, aqui se cambia SOLO la ciudad y
    // se envia el reemplazo completo.
    await rowLocator.getByTestId(ACTION_EDIT_TESTID).click();
    await expect(page.getByTestId(SHEET_TESTID)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(FIELD_CITY_TESTID).fill(CIUDAD_EDITADA);
    await page.getByTestId(FORM_SUBMIT_TESTID).click();
    await expect(page.getByTestId(SHEET_TESTID)).toHaveCount(0, { timeout: 60_000 });

    // --- 11. La celda cambia (R27, R30), en la MISMA fila -localizada por el id que puso la base
    // de datos, no por su posicion-.
    await expect(rowLocator.getByTestId(CITY_CELL_TESTID)).toHaveText(exactText(CIUDAD_EDITADA), {
      timeout: 60_000,
    });

    // --- 12. Dar de baja (R31): el dialogo NOMBRA al cliente por su nombre completo.
    await rowLocator.getByTestId(ACTION_DELETE_TESTID).click();
    await expect(page.getByTestId(DELETE_DIALOG_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(DELETE_MESSAGE_TESTID)).toContainText(
      `${nuevoCliente.firstNames} ${nuevoCliente.lastNames}`,
    );
    await page.getByTestId(DELETE_CONFIRM_TESTID).click();
    await expect(page.getByTestId(DELETE_DIALOG_TESTID)).toHaveCount(0, { timeout: 60_000 });

    // --- 13. La baja es LOGICA en la base (R31, decision cerrada 4): la fila sigue existiendo,
    // pero marcada.
    const deshabilitado = await prisma.customer.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    expect(deshabilitado.deletedAt, 'la baja debe marcar deletedAt, no borrar la fila').not.toBeNull();

    // --- 14. Y DEJA DE VERSE (R33, R41): con la busqueda todavia puesta, la lista pasa a «sin
    // coincidencias» -la caja sigue montada (R20)- y la fila del cliente dado de baja ya no
    // aparece en ninguna parte de la pantalla.
    await expect(page.getByTestId(NO_MATCHES_TESTID)).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByTestId(LAST_NAMES_CELL_TESTID).filter({ hasText: exactText(nuevoCliente.lastNames) }),
    ).toHaveCount(0);
  });

  test('una sesion valida sin `clientes.consultar` recibe 404 dentro del layout privado y no ve la tabla (R42)', async ({
    page,
  }) => {
    // El Operador del seed no tiene ni `clientes.consultar` ni `clientes.modificar` (decision
    // cerrada 3), asi que la pantalla de clientes le esta cerrada. Donde aterriza lo deriva
    // `loginAndLand` de sus permisos (`e2e/helpers/landing.ts`).
    await loginAndLand(page, operatorUser);

    // --- 1. Sin `clientes.consultar` el item de menu no se emite (R4, R6): ni etiqueta, ni
    // destino, ni identificador de test.
    await expect(page.getByTestId('nav-clientes')).toHaveCount(0);

    // --- 2. Sesion valida, permiso ausente: **404, sin redireccion**. La respuesta es
    // indistinguible de la de una ruta que no existe, que es justo lo que evita delatar que el
    // modulo esta ahi. No es «no autenticado»: no acaba en el login, y esa diferencia es lo que un
    // redirect enmascararia.
    const response = await page.goto(CUSTOMERS_ROUTE);
    expect(
      response?.status(),
      'una ruta privada sin permiso debe responder 404, indistinguible de una que no existe',
    ).toBe(404);

    // --- 3. Y ese 404 se pinta DENTRO del layout privado (QC-75 R8): el usuario conserva su menu
    // y su salida en vez de quedarse en una pagina pelada.
    const notFound = page.getByTestId(NOT_FOUND_TESTID);
    await expect(notFound).toBeVisible({ timeout: 60_000 });

    // --- 4. Y no delata nada (R4): ni el modulo, ni el permiso, ni que la pantalla exista.
    const notFoundText = ((await notFound.textContent()) ?? '').toLowerCase();
    for (const word of FORBIDDEN_404_WORDS) {
      expect(
        notFoundText.includes(word),
        `la pantalla de 404 no puede mencionar «${word}»: distinguiria «no existe» de «no puedes»`,
      ).toBe(false);
    }

    // --- 5. Ni un dato de clientes: ni el titulo, ni la tabla compartida, ni el estado vacio -que
    // ya delataria que la pantalla existe- ni el disparador del alta.
    await expect(page.getByTestId(TITLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(DATA_TABLE_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(LIST_EMPTY_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(CREATE_OPEN_TESTID)).toHaveCount(0);
  });
});
