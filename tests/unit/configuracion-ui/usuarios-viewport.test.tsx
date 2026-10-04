// QC-67 T14 — Multiplataforma y desbordamiento de la pantalla de usuarios: R21 y R40.
//
// **La pantalla REAL, en los DOS viewports.** Se monta `page.tsx` entera —con su `<Suspense>`, su
// seccion de servidor, la tabla compartida, el panel lateral y los dos dialogos— porque lo que R21
// y R40 preguntan —quien se desplaza, que es alcanzable, cuanto mide cada control— solo tiene
// respuesta con el arbol completo: el contenedor de scroll lo aporta el primitivo `Table` y los
// tres destinos de la fila los monta la columna de acciones.
//
// **SEIS columnas, y la de correo es la que mas ancho pide** (`design.md > 7`): un correo
// corporativo es largo de verdad, asi que en angosto el desbordamiento es probable y no teorico.
// Por eso una de las filas lleva correo, nombre mostrable y nombre de usuario largos a proposito:
// sin ella este archivo mediria una tabla mas estrecha que la de verdad.
//
// **El layout privado NO se monta aqui, y es deliberado.** Lo que R21 acota es el desbordamiento
// **de la pantalla**: «sin provocar scroll horizontal del documento» significa que nada de lo que
// esta feature construye lo provoca. El armazon heredado ya tiene su cobertura en
// `tests/unit/private-layout.test.tsx` (R39).
//
// **Cada caso corre a 375 px y a 1280 px**, sin excepcion de escritorio (`requirements.md > R40`,
// `design.md > 11`). No es un `for` dentro de un caso: es `describe.each`, para que el informe diga
// en cual de los dos anchos fallo.
//
// **Lo que jsdom NO puede decir, y como se sustituye.** jsdom no hace layout: `offsetWidth` es 0 y
// `getComputedStyle` no resuelve clases de Tailwind, que ademas no estan compiladas aqui. Asi que
// «44x44 px» y «16 px» se afirman sobre los tokens de clase (`min-h-11`/`min-w-11` = 2.75rem = 44
// px; `text-base` = 1rem = 16 px, mas `md:text-base` para que el campo no vuelva a 14 px en el
// breakpoint de escritorio), que es el mismo criterio de QC-11, QC-35, QC-44, QC-45 y QC-39 y el
// unico honesto en este entorno.
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `identity`, que esta ficha NO
// abre (R37). Las cuatro de escritura FALLAN si se les llama: este archivo mide la pantalla, no la
// ejercita contra el backend.
//
// **Ningun assert sobre copy** (R41): todo se localiza por rol accesible, por `data-testid` publico
// de la tabla compartida o por constantes exportadas del barrel de la ruta.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  ACCOUNT_STATUS_COLUMN_ID,
  CHANGE_USER_STATUS_ACTION_LABEL,
  DELETE_USER_ACTION_LABEL,
  DELETE_USER_CONFIRM_TESTID,
  DELETE_USER_DIALOG_TESTID,
  DELETE_USER_DISMISS_TESTID,
  DISPLAY_NAME_COLUMN_ID,
  EDIT_USER_ACTION_LABEL,
  EMAIL_COLUMN_ID,
  ROLE_NAME_COLUMN_ID,
  USERNAME_COLUMN_ID,
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_EDIT_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_BUSINESS_FIELDS,
  USER_COLUMN_COUNT,
  USER_CREATE_OPEN_TESTID,
  USER_FIELD_TESTIDS,
  USER_FORM_CANCEL_TESTID,
  USER_FORM_SUBMIT_TESTID,
  USER_FORM_TESTID,
  USER_LIST_TESTID,
  USER_ROW_ACTIONS_TESTID,
  USER_SHEET_TESTID,
  USER_STATUS_CONFIRM_TESTID,
  USER_STATUS_DIALOG_TESTID,
  USER_STATUS_DISMISS_TESTID,
  USER_STATUS_SELECT_TESTID,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import type { RoleOption, UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/** Area tactil minima de R40: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de R40: `text-base` = 1rem = 16 px, y que no baje en el breakpoint. */
const FUENTE_DE_CAMPO = ['text-base', 'md:text-base'] as const;

const { routerMock, listUsersActionMock, listRolesActionMock, getSessionUserMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    listUsersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    listRolesActionMock: vi.fn<() => Promise<unknown>>(),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

/**
 * La pagina abre con `requirePagePermission`, que lee la sesion por `@/lib/composition`. Se mockea
 * **el proveedor de sesion**, no el corte: asi el corte se ejecuta de verdad —`assertPermission`
 * incluido— y este archivo sigue afirmando solo lo suyo. Sin esto, `cookies()` revienta fuera de
 * una peticion real.
 */
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

/** Sesion con los DOS permisos: sin `usuarios.modificar` no habria ni acciones ni panel (R6). */
const USUARIO_CON_PERMISO = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el test de viewport`);
  };
  return {
    listUsersAction: listUsersActionMock,
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: listRolesActionMock,
}));

// QC-101 T7 — La Server Action del CIERRE DE SESIONES, doble que FALLA si se la llama.
//
// Mismo motivo que el bloque de grupos: el panel de detalle monta ahora el dialogo del cierre de
// sesiones, y `session-actions.ts` lee `observabilidad` de `@/lib/composition` al cargarse —y el
// doble de composicion de este archivo declara solo `identity`—. Pintar la pantalla no cierra la
// sesion de nadie: si alguien la llamara, el caso se pondria rojo.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(() => {
    throw new Error('endAllSessionsAction no debe invocarse al pintar la pantalla');
  }),
}));

// QC-85 T7 — Las SIETE Server Actions de GRUPOS, dobles que FALLAN si se les llama.
//
// **No es un cambio de guion de este archivo**: no toca ni un `test(...)`, ni un selector, ni una
// asercion. Desde que la pantalla de usuarios sirve DOS pestanas, su barrel arrastra
// `work-group-actions.ts`, que lee `observabilidad` de `@/lib/composition` **al cargarse** —y el
// doble de composicion de este archivo declara solo `identity`—. Aislar ese borde es exactamente
// lo que este archivo ya hacia con `user-actions` y `role-actions`.
//
// Que las SIETE lancen **TENSA** lo que el archivo afirma —la pestana de personas no consulta ni
// escribe NADA de grupos— en vez de relajarlo (QC-85 R6).
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la pestana de personas`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  };
});

/** El catalogo de roles del selector del panel (R24). */
const ROLES: readonly RoleOption[] = [
  { id: '55555555-5555-4555-8555-555555555555', name: 'Administrador' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Operador' },
];

/** Una fila corriente. */
const ANA: UserRow = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operador',
  accountStatus: 'active',
};

/**
 * La fila que de verdad pone a prueba el ancho: nombre mostrable, nombre de usuario y sobre todo
 * **correo** largos. Es el caso que una fila corta no llegaria a ejercitar (R21).
 */
const LARGA: UserRow = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Restrepo De La Hoz Villavicencio, Maria Fernanda Del Socorro',
  username: 'maria.fernanda.restrepo.delahoz',
  email: 'maria.fernanda.restrepo.delahoz@expediciones-a-granel.example.com',
  roleName: 'Administrador',
  accountStatus: 'blocked',
};

const FILAS = [ANA, LARGA] as const;

/** Las cinco columnas de datos mas la de acciones (R10). */
const COLUMNAS = [
  DISPLAY_NAME_COLUMN_ID,
  USERNAME_COLUMN_ID,
  EMAIL_COLUMN_ID,
  ROLE_NAME_COLUMN_ID,
  ACCOUNT_STATUS_COLUMN_ID,
  ACTIONS_COLUMN_ID,
] as const;

function pagina(items: readonly UserRow[]) {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

/**
 * Resuelve los Server Components `async` del arbol: `react-dom` en jsdom no sabe ejecutar un
 * componente `async` —se queda suspendido para siempre—. Lo que se conserva es el arbol REAL de
 * `page.tsx`. Copiado de `usuarios-page.test.tsx`, que a su vez lo hereda de la pantalla hermana.
 */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

/** Monta la pantalla REAL con la lista ya resuelta. */
async function renderPantalla() {
  return render(
    await resolverServerComponents(await UsuariosPage({ searchParams: Promise.resolve({}) })),
  );
}

/** Todas las clases de un elemento, ya troceadas: `className` de un SVG no es una cadena. */
function clases(elemento: Element): string[] {
  return Array.from(elemento.classList);
}

/**
 * La primera declaracion del atributo `style` que FIJA un alto de ventana, o `null` si no hay.
 *
 * **Por que mira declaraciones y no la subcadena `100vh`.** Este detector nacio buscando `100vh` en
 * todo el atributo `style`, y mordio a un falso positivo: al abrir el `<SelectContent>` del dialogo
 * de estado, el posicionador de Base UI (`internals/useAnchorPositioning`) siembra en linea
 * `--available-width: 100vw` y `--available-height: 100vh` sobre el envoltorio del popup —junto a
 * `position: fixed`, `opacity: 0`, `pointer-events: none` y `--transform-origin`— como valor de
 * respaldo para que un `max-height: min(x, var(--available-height))` del consumidor resuelva a una
 * longitud valida en la primera pasada, antes de que `size()` escriba los px reales.
 *
 * Esa variable **mide, no aplica**: es el techo del espacio disponible, no el alto de nadie. Lo que
 * R40 prohibe es otra cosa —clavar el alto de una pieza a la ventana, que en movil se mide SIN la
 * barra del navegador y deja el ultimo trozo fuera de alcance—. Asi que el detector se tenso en
 * PRECISION, no se aflojo en severidad: sigue mordiendo cualquier `height`/`min-height`/`max-height`
 * en `100vh` venga de donde venga, y solo deja pasar las propiedades personalizadas (`--algo`), que
 * no aplican alto a nada por si solas. La prueba de que sigue mordiendo es el caso anti-vacuidad
 * del final de este archivo: sin el, un detector afinado de mas pasaria en verde sin comprobar nada.
 */
function alturaDeVentanaEnLinea(estilo: string): string | null {
  for (const declaracion of estilo.split(';')) {
    const separador = declaracion.indexOf(':');
    if (separador === -1) continue;

    const propiedad = declaracion.slice(0, separador).trim().toLowerCase();
    const valor = declaracion.slice(separador + 1).trim().toLowerCase();

    // Propiedad personalizada: publica una medida para que otra regla la consuma; no fija alto.
    if (propiedad.startsWith('--')) continue;
    if (!/^(?:min-|max-)?height$/.test(propiedad)) continue;
    if (valor.includes('100vh')) return `${propiedad}: ${valor}`;
  }

  return null;
}

/**
 * R40 — Ninguna pieza del arbol montado mide su alto con la ventana.
 *
 * `100vh` en un navegador movil mide la ventana SIN la barra del navegador, asi que el ultimo trozo
 * queda debajo de ella y no se alcanza. Se comprueba sobre el DOM montado —clases y estilo en
 * linea—, no sobre la fuente de la ruta: el alto podria colarse por cualquier pieza que la pantalla
 * componga, incluido lo que se pinta en un portal. El criterio de «estilo en linea» lo fija
 * `alturaDeVentanaEnLinea`, que distingue fijar un alto de publicar una medida.
 */
function sinAlturaDeVentana(contexto: string): void {
  const prohibidas = new Set(['h-screen', 'min-h-screen', 'max-h-screen']);

  for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
    for (const clase of clases(elemento)) {
      expect(prohibidas.has(clase), `${elemento.tagName} usa ${clase} ${contexto}`).toBe(false);
      expect(clase, `${elemento.tagName} usa 100vh ${contexto}`).not.toContain('100vh');
    }
    const enLinea = alturaDeVentanaEnLinea(elemento.getAttribute('style') ?? '');
    expect(enLinea, `${elemento.tagName} fija un alto de ventana en linea ${contexto}`).toBeNull();
  }

  for (const raiz of [document.documentElement, document.body]) {
    const enLinea = alturaDeVentanaEnLinea(raiz.getAttribute('style') ?? '');
    expect(enLinea, `${raiz.tagName} con alto de ventana ${contexto}`).toBeNull();
  }
}

/** El envoltorio de scroll que aporta el primitivo `Table`, con la tabla dentro. */
function contenedorDeLaTabla(): HTMLElement {
  const tabla = screen.getByRole('table');
  const contenedor = tabla.parentElement;
  expect(contenedor, 'la tabla debe ir envuelta en su contenedor de scroll').not.toBeNull();
  expect(contenedor?.getAttribute('data-slot')).toBe('table-container');
  return contenedor as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getSessionUserMock.mockResolvedValue(USUARIO_CON_PERMISO);
  listUsersActionMock.mockResolvedValue(pagina(FILAS));
  listRolesActionMock.mockResolvedValue({ status: 'success', data: ROLES });
});

afterEach(() => {
  cleanup();
  // El bloqueo de scroll de Base UI escribe `overflow` en linea sobre `html`/`body` mientras un
  // portal esta abierto, y lo restaura al cerrarlo. Los casos que abren el panel o un dialogo
  // terminan SIN cerrarlos, asi que ese estilo sobrevive a `cleanup()` y contaminaria al caso
  // siguiente —que es justo el que afirma que nadie desplaza el documento—. Se limpia aqui en vez
  // de exceptuar `body` del barrido: la excepcion taparia una violacion de verdad.
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  resetViewport();
  vi.restoreAllMocks();
});

const VIEWPORTS = [
  ['angosto', NARROW_VIEWPORT],
  ['ancho', WIDE_VIEWPORT],
] as const;

describe.each(VIEWPORTS)('pantalla de usuarios en viewport %s (%i px)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  // ------------------------------------------------------------------------------------------
  // R21 — Las seis columnas, y el desbordamiento contenido en la tabla
  // ------------------------------------------------------------------------------------------

  it('la lista es utilizable: las SEIS columnas, sus filas y la paginacion (R21)', async () => {
    await renderPantalla();

    expect(screen.getByTestId(USER_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByTestId('data-table-pagination')).toBeVisible();

    expect(COLUMNAS, 'la lista tiene seis columnas y ni una mas').toHaveLength(USER_COLUMN_COUNT);

    for (const usuario of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${usuario.id}`);
      expect(fila, `la fila de ${usuario.id} a ${ancho}px`).toBeVisible();

      for (const columna of COLUMNAS) {
        expect(
          within(fila).getByTestId(`data-table-cell-${columna}`),
          `la celda ${columna} de ${usuario.id} a ${ancho}px`,
        ).toBeVisible();
      }
    }
  });

  it('el desbordamiento se resuelve DENTRO de la tabla, no en el documento (R21)', async () => {
    await renderPantalla();

    // El scroll horizontal lo aporta el contenedor del primitivo `Table`, que envuelve a la tabla.
    const contenedor = contenedorDeLaTabla();
    expect(clases(contenedor)).toContain('overflow-x-auto');

    // Y es el UNICO desplazador horizontal de la pantalla: si un ancestro tambien desplazara, el
    // desbordamiento se escaparia de la tabla y acabaria moviendo el documento.
    const desplazadores = Array.from(
      document.body.querySelectorAll('.overflow-x-auto, .overflow-x-scroll'),
    );
    expect(desplazadores, `mas de un desplazador horizontal a ${ancho}px`).toEqual([contenedor]);

    // Ningun ANCESTRO de la tabla lo declara: se sube la cadena entera hasta `body`.
    for (
      let ancestro = contenedor.parentElement;
      ancestro !== null;
      ancestro = ancestro.parentElement
    ) {
      for (const clase of clases(ancestro)) {
        expect(
          clase.startsWith('overflow-x-'),
          `${ancestro.tagName} declara ${clase} por encima de la tabla a ${ancho}px`,
        ).toBe(false);
      }
      expect((ancestro as HTMLElement).style.overflowX, `${ancestro.tagName} a ${ancho}px`).toBe('');
    }

    // Nadie fuerza el ancho del documento: ni `w-screen`, ni un `overflow` en linea.
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      expect(clases(elemento), `${elemento.tagName} fuerza el ancho del documento`).not.toContain(
        'w-screen',
      );
    }
    expect(document.documentElement.style.overflowX).toBe('');
    expect(document.body.style.overflowX).toBe('');
  });

  it('la columna de correo va DENTRO del desplazador y no mueve el documento (R21)', async () => {
    await renderPantalla();

    const contenedor = contenedorDeLaTabla();

    // Es la columna que mas ancho pide. Si alguna vez saliera del contenedor —una celda en portal,
    // un tooltip fijo—, el desbordamiento dejaria de ser el de la tabla y pasaria a ser el del
    // documento.
    for (const usuario of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${usuario.id}`);
      const celda = within(fila).getByTestId(`data-table-cell-${EMAIL_COLUMN_ID}`);

      expect(celda, `el correo de ${usuario.id} a ${ancho}px`).toBeVisible();
      expect(
        contenedor.contains(celda),
        `el correo de ${usuario.id} se sale del desplazador a ${ancho}px`,
      ).toBe(true);
      expect(celda.textContent?.trim().length, `el correo de ${usuario.id}`).toBeGreaterThan(0);
      // Y no se corta con puntos suspensivos ni se oculta: se alcanza desplazando la tabla.
      for (const clase of clases(celda)) {
        expect(clase, `la celda de correo ${clase} a ${ancho}px`).not.toBe('overflow-hidden');
        expect(clase, `la celda de correo ${clase} a ${ancho}px`).not.toBe('hidden');
      }
    }

    expect(document.documentElement.style.overflowX).toBe('');
    expect(document.body.style.overflowX).toBe('');
  });

  it('las acciones de fila siguen siendo alcanzables dentro de la tabla (R21)', async () => {
    await renderPantalla();

    const contenedor = contenedorDeLaTabla();

    for (const usuario of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${usuario.id}`);
      const celda = within(fila).getByTestId(`data-table-cell-${ACTIONS_COLUMN_ID}`);

      expect(within(celda).getByTestId(USER_ROW_ACTIONS_TESTID)).toBeVisible();
      // Viajan DENTRO del contenedor que se desplaza: el scroll de la tabla las alcanza sin que el
      // documento se mueva.
      expect(contenedor.contains(celda)).toBe(true);
    }
  });

  // ------------------------------------------------------------------------------------------
  // R40 — Nada detras del puntero
  // ------------------------------------------------------------------------------------------

  it('el disparador de acciones esta en el DOM y visible desde el primer render, sin :hover (R40)', async () => {
    await renderPantalla();

    // 1) En el DOM: el disparador de CADA fila esta visible ya, sin pasar el puntero por encima.
    //    En tactil no hay puntero que pasar. Se nombra con el usuario de su fila (R41). Las TRES
    //    acciones viven detras de este disparador -decision humana puntual de esta pantalla, ver
    //    `user-row-actions.tsx`- y se prueban en el caso siguiente, que lo abre con un clic.
    for (const usuario of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${usuario.id}`);
      const disparador = within(fila).getByTestId(USER_ROW_ACTIONS_TESTID);

      expect(disparador, `disparador de ${usuario.id} a ${ancho}px`).toBeVisible();
      expect(disparador, `disparador de ${usuario.id} a ${ancho}px`).toBeEnabled();
      expect(disparador).toHaveAccessibleName(expect.stringContaining(usuario.displayName));
    }

    expect(screen.getByTestId(USER_CREATE_OPEN_TESTID)).toBeVisible();

    // 2) En las clases: ningun elemento de la pantalla usa el puntero para REVELAR nada. Un
    //    `hover:bg-muted` es decoracion y no molesta a nadie; lo que R40 prohibe es que la
    //    existencia o la visibilidad de un control dependa del puntero.
    const revelaConElPuntero =
      /^(group-)?hover:(flex|block|inline|inline-flex|grid|visible|opacity-100)$/;
    const ocultoDeSalida = new Set(['invisible', 'opacity-0']);

    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(clase, `${elemento.tagName} revela con el puntero a ${ancho}px`).not.toMatch(
          revelaConElPuntero,
        );
        expect(
          ocultoDeSalida.has(clase),
          `${elemento.tagName} arranca oculto y solo el puntero lo trae a ${ancho}px`,
        ).toBe(false);
      }
    }
  });

  it('abrir el disparador con un CLIC (nunca hover) revela las tres acciones, cada una con su nombre (R40)', async () => {
    const user = setupUser();
    await renderPantalla();

    for (const usuario of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${usuario.id}`);
      const disparador = within(fila).getByTestId(USER_ROW_ACTIONS_TESTID);

      // Antes del clic, ninguna accion esta en el DOM: no hay nada que un `:hover` pudiera revelar.
      expect(
        screen.queryByTestId(USER_ACTION_EDIT_TESTID),
        `editar de ${usuario.id} antes de abrir a ${ancho}px`,
      ).toBeNull();

      await user.click(disparador);

      for (const [testid, nombre] of [
        [USER_ACTION_EDIT_TESTID, EDIT_USER_ACTION_LABEL],
        [USER_ACTION_STATUS_TESTID, CHANGE_USER_STATUS_ACTION_LABEL],
        [USER_ACTION_DELETE_TESTID, DELETE_USER_ACTION_LABEL],
      ] as const) {
        const item = await screen.findByTestId(testid);
        expect(item, `${testid} de ${usuario.id} a ${ancho}px`).toBeVisible();
        expect(item).toHaveAccessibleName(nombre);
      }

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByTestId(USER_ACTION_EDIT_TESTID)).toBeNull(),
      );
    }
  });

  // ------------------------------------------------------------------------------------------
  // R40 — 44x44 px y 16 px
  // ------------------------------------------------------------------------------------------

  it('los controles tactiles de la lista miden al menos 44x44 px (R40)', async () => {
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${ANA.id}`);
    const controles = [
      within(fila).getByTestId(USER_ROW_ACTIONS_TESTID),
      screen.getByTestId(USER_CREATE_OPEN_TESTID),
    ];

    for (const control of controles) {
      for (const token of AREA_TACTIL) {
        expect(control.className, `${control.getAttribute('data-testid')} a ${ancho}px`).toContain(
          token,
        );
      }
    }
  });

  it('el panel es utilizable: los NUEVE campos a 16 px y acciones de 44x44 px (R40)', async () => {
    // 16 px es el umbral por debajo del cual Safari en iOS hace zoom al enfocar el campo, y ese
    // zoom deja la pantalla desplazada a mano. Se comprueba en los DOS anchos: `md:text-base` esta
    // justamente para que el campo no vuelva a 14 px en el breakpoint de escritorio.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(USER_CREATE_OPEN_TESTID));
    await screen.findByTestId(USER_FORM_TESTID);

    const panel = screen.getByTestId(USER_SHEET_TESTID);
    expect(panel, `el panel a ${ancho}px`).toBeVisible();

    // Los NUEVE campos de negocio (R23): fuente de 16 px y alto tactil. Los dos selectores entran
    // en la cuenta: son controles que se tocan, no solo campos que se leen.
    for (const campo of USER_BUSINESS_FIELDS) {
      const control = screen.getByTestId(USER_FIELD_TESTIDS[campo]);
      expect(control, `${campo} a ${ancho}px`).toBeVisible();
      for (const token of FUENTE_DE_CAMPO) {
        expect(control.className, `${campo} a ${ancho}px`).toContain(token);
      }
      expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
    }

    for (const accion of [USER_FORM_SUBMIT_TESTID, USER_FORM_CANCEL_TESTID]) {
      const control = screen.getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    // El panel no se pega al borde inferior del movil: respeta el area segura.
    expect(panel.className, `el panel a ${ancho}px`).toContain('env(safe-area-inset-bottom)');

    // Y con el panel abierto la pantalla sigue sin medirse contra la ventana.
    sinAlturaDeVentana(`con el panel abierto a ${ancho}px`);
  });

  it('el dialogo de borrado es utilizable y sus dos acciones miden 44x44 px (R40)', async () => {
    const user = setupUser();
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${ANA.id}`);
    await user.click(within(fila).getByTestId(USER_ROW_ACTIONS_TESTID));
    await user.click(
      await esperarInteractiva(await screen.findByTestId(USER_ACTION_DELETE_TESTID)),
    );

    const dialogo = await screen.findByTestId(DELETE_USER_DIALOG_TESTID);
    expect(dialogo, `el dialogo a ${ancho}px`).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();

    for (const accion of [DELETE_USER_CONFIRM_TESTID, DELETE_USER_DISMISS_TESTID]) {
      const control = screen.getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    sinAlturaDeVentana(`con el dialogo de borrado abierto a ${ancho}px`);
  });

  it('el dialogo de estado es utilizable: selector a 16 px y acciones de 44x44 px (R40)', async () => {
    const user = setupUser();
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${ANA.id}`);
    await user.click(within(fila).getByTestId(USER_ROW_ACTIONS_TESTID));
    await user.click(
      await esperarInteractiva(await screen.findByTestId(USER_ACTION_STATUS_TESTID)),
    );

    const dialogo = await screen.findByTestId(USER_STATUS_DIALOG_TESTID);
    expect(dialogo, `el dialogo a ${ancho}px`).toBeVisible();

    const selector = screen.getByTestId(USER_STATUS_SELECT_TESTID);
    for (const token of [...FUENTE_DE_CAMPO, ...AREA_TACTIL]) {
      expect(selector.className, `el selector de estado a ${ancho}px`).toContain(token);
    }

    for (const accion of [USER_STATUS_CONFIRM_TESTID, USER_STATUS_DISMISS_TESTID]) {
      const control = screen.getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    sinAlturaDeVentana(`con el dialogo de estado abierto a ${ancho}px`);
  });

  // ------------------------------------------------------------------------------------------
  // R40 — Sin `100vh`
  // ------------------------------------------------------------------------------------------

  it('la pantalla no usa 100vh como alto (R40)', async () => {
    await renderPantalla();

    sinAlturaDeVentana(`a ${ancho}px`);
  });
});

// ----------------------------------------------------------------------------------------------
// R40 — Anti-vacuidad del detector
// ----------------------------------------------------------------------------------------------
//
// `sinAlturaDeVentana` se afino para dejar pasar `--available-height: 100vh` —la medida que siembra
// el posicionador de Base UI, ver su comentario—. Un detector afinado de mas pasa en verde sin
// comprobar nada, que es justo el fallo que se estaba corrigiendo: estos casos montan nodos
// sinteticos y exigen que siga MORDIENDO un alto de ventana de verdad. Si alguien relaja el helper
// hasta volverlo decorativo, esto se pone rojo.
describe('el detector de alto de ventana (R40)', () => {
  // `cleanup()` solo desmonta los contenedores de Testing Library: estos nodos se cuelgan a mano de
  // `body`, asi que sobreviven al caso y el siguiente los volveria a barrer. Se retiran aqui.
  const sinteticos: HTMLElement[] = [];

  afterEach(() => {
    for (const nodo of sinteticos.splice(0)) nodo.remove();
  });

  function nodoSintetico(): HTMLElement {
    const nodo = document.createElement('div');
    document.body.append(nodo);
    sinteticos.push(nodo);
    return nodo;
  }

  function conEstilo(estilo: string): void {
    nodoSintetico().setAttribute('style', estilo);
  }

  it.each([
    ['height: 100vh'],
    ['min-height:100vh'],
    ['MAX-HEIGHT :  100VH'],
    ['color: red; height: 100vh'],
  ])('muerde un alto de ventana declarado en linea: %s', (estilo) => {
    conEstilo(estilo);

    expect(() => sinAlturaDeVentana('en el nodo sintetico')).toThrow();
  });

  it('muerde una clase de alto de ventana', () => {
    nodoSintetico().className = 'min-h-screen';

    expect(() => sinAlturaDeVentana('en el nodo sintetico')).toThrow();
  });

  it('deja pasar una propiedad personalizada, que mide y no aplica alto', () => {
    conEstilo(
      'position: fixed; top: 0px; left: 0px; --available-width: 100vw; ' +
        '--available-height: 100vh; opacity: 0; pointer-events: none; --transform-origin: 0px -4px;',
    );

    expect(() => sinAlturaDeVentana('en el nodo sintetico')).not.toThrow();
  });

  it('muerde un alto de ventana en `html` y en `body`', () => {
    document.documentElement.setAttribute('style', 'height: 100vh');
    expect(() => sinAlturaDeVentana('en html')).toThrow();
    document.documentElement.removeAttribute('style');

    document.body.setAttribute('style', 'min-height: 100vh');
    expect(() => sinAlturaDeVentana('en body')).toThrow();
  });
});
