// QC-39 T13 — Multiplataforma y desbordamiento de la pantalla de unidades: R27 y R48.
//
// **La pantalla REAL, en los DOS viewports.** Se monta `page.tsx` entera —con su `<Suspense>`, su
// seccion de servidor, la tabla compartida, el panel lateral y el dialogo de borrado— porque lo
// que R27 y R48 preguntan —quien se desplaza, que es alcanzable, que mide cada control— solo tiene
// respuesta con el arbol completo: el contenedor de scroll lo aporta el primitivo `Table`, y los
// dos destinos de la fila los monta la columna de acciones.
//
// **Cuatro columnas, y la de equivalencia es la que mas ancho pide** (`design.md > 8`): «1 kg =
// 1000 gr» es una frase, no un dato corto, asi que aqui el desbordamiento en angosto es probable y
// no teorico. Por eso una de las filas es DERIVADA y con la base resuelta: sin ella este archivo
// mediria una tabla mas estrecha que la de verdad.
//
// **El layout privado NO se monta aqui, y es deliberado.** Lo que R27 acota es el desbordamiento
// **de la pantalla**: «ningun ancestro» significa ningun ancestro dentro de lo que esta feature
// construye. El armazon heredado ya tiene su propia cobertura en `tests/unit/private-layout.test.tsx`.
//
// **Cada caso corre a 375 px y a 1280 px**, sin excepcion de escritorio (`requirements.md > R48`).
// No es un `for` dentro de un caso: es `describe.each`, para que el informe diga en cual de los dos
// anchos fallo.
//
// **Lo que jsdom NO puede decir, y como se sustituye.** jsdom no hace layout: `offsetWidth` es 0 y
// `getComputedStyle` no resuelve clases de Tailwind, que ademas no estan compiladas aqui. Asi que
// «44x44 px» y «16 px» se afirman sobre los tokens de clase (`min-h-11`/`min-w-11` = 2.75rem = 44
// px; `text-base` = 1rem = 16 px, mas `md:text-base` para que el campo no vuelva a 14 px en el
// breakpoint de escritorio), que es el mismo criterio que ya usan QC-11, QC-35, QC-44 y QC-45 y el
// unico honesto en este entorno. La medida real en un dispositivo la cubre la comprobacion manual
// en WebKit que `tasks.md > T13` deja anotada aparte; no este archivo.
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `unidades`, que esta ficha solo
// abre para lo que R1-R6 acotan. Las tres de escritura FALLAN si se les llama: este archivo mide la
// pantalla, no la ejercita contra el backend.
//
// **Ningun assert sobre copy** (R49): todo se localiza por rol accesible, por `data-testid` publico
// de la tabla compartida o por constantes exportadas del barrel de la ruta.

import { cleanup, render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  DELETE_UNIT_CONFIRM_TESTID,
  DELETE_UNIT_DIALOG_TESTID,
  DELETE_UNIT_DISMISS_TESTID,
  EQUIVALENCE_COLUMN_ID,
  NAME_COLUMN_ID,
  SYMBOL_COLUMN_ID,
  UNIT_ACTION_DELETE_TESTID,
  UNIT_ACTION_EDIT_TESTID,
  UNIT_COLUMN_COUNT,
  UNIT_CREATE_OPEN_TESTID,
  UNIT_FIELD_BASE_TESTID,
  UNIT_FIELD_FACTOR_TESTID,
  UNIT_FIELD_NAME_TESTID,
  UNIT_FIELD_SYMBOL_TESTID,
  UNIT_FORM_CANCEL_TESTID,
  UNIT_FORM_SUBMIT_TESTID,
  UNIT_FORM_TESTID,
  UNIT_LIST_TESTID,
  UNIT_ROW_ACTIONS_TESTID,
  UNIT_SHEET_TESTID,
  deleteUnitLabel,
  editUnitLabel,
} from '@/app/(private)/configuracion/unidades/components';
import UnidadesPage from '@/app/(private)/configuracion/unidades/page';
import type { Page, UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { clickRowAction, openRowActionsMenu } from '../../helpers/row-actions-menu';
import { setupUser } from '../../helpers/user-event';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/** Area tactil minima de R48: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de R48: `text-base` = 1rem = 16 px, y que no baje en el breakpoint. */
const FUENTE_DE_CAMPO = ['text-base', 'md:text-base'] as const;

type Resultado =
  | { status: 'success'; data: Page<UnitView> | readonly UnitView[] }
  | { status: 'error'; code: string; message: string };

const { routerMock, listUnitsActionMock, getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listUnitsActionMock: vi.fn<(query?: unknown) => Promise<Resultado>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

/**
 * La pagina abre con los DOS `requirePagePermission`, que leen la sesion por `@/lib/composition`.
 * Se mockea **el proveedor de sesion**, no `requirePagePermission`: asi el corte se ejecuta de
 * verdad y este archivo sigue afirmando solo lo suyo —que la pantalla se usa en angosto y en
 * ancho—. Sin esto, `cookies()` revienta fuera de una peticion real.
 */
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

/** Sesion con los DOS permisos que la pantalla exige: sin ellos habria 404 en vez de lista. */
const USUARIO_CON_PERMISO = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: ['unidades.consultar', 'unidades.modificar'],
};

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el test de viewport`);
  };
  return {
    listUnitsAction: listUnitsActionMock,
    createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
    updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
    deleteUnitAction: vi.fn(noDebeInvocarse('deleteUnitAction')),
  };
});

/** Unidad BASE de sistema: es la que resuelve la equivalencia de la derivada, y no lleva acciones. */
const GRAMO: UnitView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Gramo',
  symbol: 'gr',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

/**
 * Unidad DERIVADA de empresa: la fila que de verdad pone a prueba el ancho. Su celda de
 * equivalencia arma la frase entera —«1 kg = 1000 gr»— y su celda de acciones lleva los dos
 * botones, porque no es de sistema (R28).
 */
const KILOGRAMO: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: GRAMO.id,
  factor: '1000.0000',
  isSystem: false,
};

/**
 * Una derivada mas, con nombre largo a proposito y **sin simbolo**: asi la frase se compone con el
 * nombre completo y la columna de equivalencia pide todo el ancho que puede pedir. Es el caso que
 * un nombre corto no llegaria a poner a prueba.
 */
const UNIDAD_LARGA: UnitView = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Tonelada métrica para expediciones a granel de producto terminado',
  symbol: null,
  baseUnitId: GRAMO.id,
  factor: '1000000.0000',
  isSystem: false,
};

/** Las filas que la pagina pinta. `GRAMO` va incluida: es la fila SIN acciones (R29). */
const FILAS = [GRAMO, KILOGRAMO, UNIDAD_LARGA] as const;

/** Las filas que SI ofrecen acciones: las que no son de sistema. */
const FILAS_CON_ACCIONES = [KILOGRAMO, UNIDAD_LARGA] as const;

function pagina(items: readonly UnitView[]): Resultado {
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
 * Cablea las DOS lecturas de `design.md > 5.3` sobre el mismo doble: la primera llega **con**
 * consulta —la pagina que se pinta— y la segunda **sin** ninguna —el catalogo del indice de bases y
 * del selector—. Es exactamente como las distingue la Server Action real.
 */
function conLecturas(): void {
  listUnitsActionMock.mockImplementation(async (query?: unknown) =>
    query === undefined
      ? ({ status: 'success', data: FILAS as readonly UnitView[] } satisfies Resultado)
      : pagina(FILAS),
  );
}

/**
 * Resuelve los Server Components `async` del arbol: `react-dom` en jsdom no sabe ejecutar un
 * componente `async` —se queda suspendido para siempre—. Lo que se conserva es el arbol REAL de
 * `page.tsx`. Copiado de `unit-page.test.tsx`, que a su vez lo hereda de la pantalla hermana.
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
    await resolverServerComponents(await UnidadesPage({ searchParams: Promise.resolve({}) })),
  );
}

/** Todas las clases de un elemento, ya troceadas: `className` de un SVG no es una cadena. */
function clases(elemento: Element): string[] {
  return Array.from(elemento.classList);
}

/**
 * R48 — Ninguna pieza del arbol montado mide su alto con la ventana.
 *
 * `100vh` en un navegador movil mide la ventana SIN la barra del navegador, asi que el ultimo trozo
 * queda debajo de ella y no se alcanza. Se comprueba sobre el DOM montado —clases y estilo en
 * linea—, no sobre la fuente de la ruta: el alto podria colarse por cualquier pieza que la pantalla
 * componga, incluido lo que se pinta en un portal.
 */
function sinAlturaDeVentana(contexto: string): void {
  const prohibidas = new Set(['h-screen', 'min-h-screen', 'max-h-screen']);

  for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
    for (const clase of clases(elemento)) {
      expect(prohibidas.has(clase), `${elemento.tagName} usa ${clase} ${contexto}`).toBe(false);
      expect(clase, `${elemento.tagName} usa 100vh ${contexto}`).not.toContain('100vh');
    }
    const estilo = elemento.getAttribute('style') ?? '';
    expect(estilo, `${elemento.tagName} usa 100vh en linea ${contexto}`).not.toContain('100vh');
  }

  expect(document.documentElement.style.height, `html con alto fijo ${contexto}`).not.toContain(
    '100vh',
  );
  expect(document.body.style.height, `body con alto fijo ${contexto}`).not.toContain('100vh');
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
  conLecturas();
});

afterEach(() => {
  cleanup();
  // El bloqueo de scroll de Base UI escribe `overflow` en linea sobre `html`/`body` mientras un
  // portal esta abierto, y lo restaura al cerrarlo. Los casos que abren el panel o el dialogo
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

describe.each(VIEWPORTS)('pantalla de unidades en viewport %s (%i px)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  // ------------------------------------------------------------------------------------------
  // R27 — Las cuatro columnas, y el desbordamiento contenido en la tabla
  // ------------------------------------------------------------------------------------------

  it('la lista es utilizable: las CUATRO columnas, sus filas y la paginacion (R27)', async () => {
    await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByTestId('data-table-pagination')).toBeVisible();

    const columnas = [
      NAME_COLUMN_ID,
      SYMBOL_COLUMN_ID,
      EQUIVALENCE_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ] as const;
    expect(columnas, 'la lista tiene cuatro columnas y ni una mas').toHaveLength(UNIT_COLUMN_COUNT);

    for (const unidad of FILAS) {
      const fila = screen.getByTestId(`data-table-row-${unidad.id}`);
      expect(fila, `la fila de ${unidad.id} a ${ancho}px`).toBeVisible();

      for (const columna of columnas) {
        expect(
          within(fila).getByTestId(`data-table-cell-${columna}`),
          `la celda ${columna} de ${unidad.id} a ${ancho}px`,
        ).toBeVisible();
      }
    }
  });

  it('el desbordamiento se resuelve DENTRO de la tabla, no en el documento (R27)', async () => {
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

    // Nadie fuerza el ancho del documento: ni `w-screen`, ni un `overflow` en linea sobre
    // `html`/`body`.
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      expect(clases(elemento), `${elemento.tagName} fuerza el ancho del documento`).not.toContain(
        'w-screen',
      );
    }
    expect(document.documentElement.style.overflowX).toBe('');
    expect(document.body.style.overflowX).toBe('');
  });

  it('la columna de equivalencia va DENTRO del desplazador y no mueve el documento (R27)', async () => {
    await renderPantalla();

    const contenedor = contenedorDeLaTabla();

    // Es la columna que mas ancho pide: la frase entera, con factor y unidad de la que deriva. Si
    // alguna vez saliera del contenedor —una celda en portal, un tooltip fijo—, el desbordamiento
    // dejaria de ser el de la tabla y pasaria a ser el del documento.
    const frases = [
      { unidad: KILOGRAMO, frase: `1 kg = 1000 ${GRAMO.symbol}` },
      { unidad: UNIDAD_LARGA, frase: `1 ${UNIDAD_LARGA.name} = 1000000 ${GRAMO.symbol}` },
    ] as const;

    for (const { unidad, frase } of frases) {
      const fila = screen.getByTestId(`data-table-row-${unidad.id}`);
      const celda = within(fila).getByTestId(`data-table-cell-${EQUIVALENCE_COLUMN_ID}`);

      expect(celda, `la equivalencia de ${unidad.id} a ${ancho}px`).toBeVisible();
      expect(
        contenedor.contains(celda),
        `la equivalencia de ${unidad.id} se sale del desplazador a ${ancho}px`,
      ).toBe(true);
      // El recorte con puntos suspensivos es solo visual: la frase entera, con el factor y la
      // unidad base, sigue en la celda.
      expect(celda.textContent?.trim(), `la equivalencia de ${unidad.id}`).toBe(frase);
      expect(clases(celda), `la celda de equivalencia de ${unidad.id} a ${ancho}px`).toContain(
        'text-ellipsis',
      );
      // Recortarse no es ocultarse: la celda nunca desaparece.
      for (const clase of clases(celda)) {
        expect(clase, `la celda de equivalencia ${clase} a ${ancho}px`).not.toBe('hidden');
      }
    }

    // El documento no gana desplazamiento horizontal por culpa de la columna.
    expect(document.documentElement.style.overflowX).toBe('');
    expect(document.body.style.overflowX).toBe('');
  });

  it('las acciones de fila siguen siendo alcanzables dentro de la tabla (R27)', async () => {
    await renderPantalla();

    const contenedor = contenedorDeLaTabla();

    for (const unidad of FILAS_CON_ACCIONES) {
      const fila = screen.getByTestId(`data-table-row-${unidad.id}`);
      const celda = within(fila).getByTestId(`data-table-cell-${ACTIONS_COLUMN_ID}`);

      expect(within(celda).getByTestId(UNIT_ROW_ACTIONS_TESTID)).toBeVisible();
      // Viajan DENTRO del contenedor que se desplaza: el scroll de la tabla las alcanza sin que el
      // documento se mueva.
      expect(contenedor.contains(celda)).toBe(true);
    }
  });

  // ------------------------------------------------------------------------------------------
  // R48 — Nada detras del puntero
  // ------------------------------------------------------------------------------------------

  it('editar y borrar se alcanzan, visibles, desde el disparador de cada fila, sin :hover (R48)', async () => {
    const user = setupUser();
    await renderPantalla();

    // 1) En el DOM: los dos controles de CADA fila con acciones estan visibles ya, sin pasar el
    //    puntero por encima. En tactil no hay puntero que pasar. Se localizan ademas por su rol y
    //    su nombre accesible, que es el contrato que R28 exige y que compone el propio componente.
    for (const unidad of FILAS_CON_ACCIONES) {
      const fila = screen.getByTestId(`data-table-row-${unidad.id}`);
      const menu = await openRowActionsMenu(user, within(fila).getByTestId(UNIT_ROW_ACTIONS_TESTID));

      for (const accion of [UNIT_ACTION_EDIT_TESTID, UNIT_ACTION_DELETE_TESTID]) {
        const control = within(menu).getByTestId(accion);
        expect(control, `${accion} a ${ancho}px`).toBeVisible();
        expect(control, `${accion} a ${ancho}px`).toBeEnabled();
      }

      expect(within(menu).getByRole('menuitem', { name: editUnitLabel() })).toBeVisible();
      expect(within(menu).getByRole('menuitem', { name: deleteUnitLabel() })).toBeVisible();

      await user.keyboard('{Escape}');
    }

    expect(screen.getByTestId(UNIT_CREATE_OPEN_TESTID)).toBeVisible();

    // 2) En las clases: ningun elemento de la pantalla usa el puntero para REVELAR nada. Un
    //    `hover:bg-muted` es decoracion y no molesta a nadie; lo que R48 prohibe es que la
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

  // ------------------------------------------------------------------------------------------
  // R48 — 44x44 px y 16 px
  // ------------------------------------------------------------------------------------------

  it('los controles tactiles de la lista miden al menos 44x44 px (R48)', async () => {
    const user = setupUser();
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${KILOGRAMO.id}`);
    const disparador = within(fila).getByTestId(UNIT_ROW_ACTIONS_TESTID);
    const controles = [disparador, screen.getByTestId(UNIT_CREATE_OPEN_TESTID)];

    const menu = await openRowActionsMenu(user, disparador);
    for (const accion of [UNIT_ACTION_EDIT_TESTID, UNIT_ACTION_DELETE_TESTID]) {
      expect(within(menu).getByTestId(accion).className, `${accion} a ${ancho}px`).toContain(
        'min-h-11',
      );
    }

    for (const control of controles) {
      for (const token of AREA_TACTIL) {
        expect(control.className, `${control.getAttribute('data-testid')} a ${ancho}px`).toContain(
          token,
        );
      }
    }
  });

  it('el panel lateral es utilizable: los CUATRO campos a 16 px y acciones de 44x44 px (R48)', async () => {
    // 16 px es el umbral por debajo del cual Safari en iOS hace zoom al enfocar el campo, y ese
    // zoom deja la pantalla desplazada a mano. Se comprueba en los DOS anchos: `md:text-base` esta
    // justamente para que el campo no vuelva a 14 px en el breakpoint de escritorio.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(UNIT_CREATE_OPEN_TESTID));
    await screen.findByTestId(UNIT_FORM_TESTID);

    const panel = screen.getByTestId(UNIT_SHEET_TESTID);
    expect(panel, `el panel a ${ancho}px`).toBeVisible();

    // Los CUATRO campos de negocio (R33): fuente de 16 px y alto tactil. El selector de «deriva
    // de» entra en la cuenta: es un control que se toca, no solo un campo que se lee.
    const campos = [
      UNIT_FIELD_NAME_TESTID,
      UNIT_FIELD_SYMBOL_TESTID,
      UNIT_FIELD_BASE_TESTID,
      UNIT_FIELD_FACTOR_TESTID,
    ] as const;

    for (const campo of campos) {
      const control = screen.getByTestId(campo);
      expect(control, `${campo} a ${ancho}px`).toBeVisible();
      for (const token of FUENTE_DE_CAMPO) {
        expect(control.className, `${campo} a ${ancho}px`).toContain(token);
      }
      expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
    }

    for (const accion of [UNIT_FORM_SUBMIT_TESTID, UNIT_FORM_CANCEL_TESTID]) {
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

  it('el dialogo de borrado es utilizable y sus dos acciones miden 44x44 px (R48)', async () => {
    const user = setupUser();
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${KILOGRAMO.id}`);
    await clickRowAction(
      user,
      within(fila).getByTestId(UNIT_ROW_ACTIONS_TESTID),
      UNIT_ACTION_DELETE_TESTID,
    );

    const dialogo = await screen.findByTestId(DELETE_UNIT_DIALOG_TESTID);
    expect(dialogo, `el dialogo a ${ancho}px`).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();

    for (const accion of [DELETE_UNIT_CONFIRM_TESTID, DELETE_UNIT_DISMISS_TESTID]) {
      const control = screen.getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    sinAlturaDeVentana(`con el dialogo abierto a ${ancho}px`);
  });

  // ------------------------------------------------------------------------------------------
  // R48 — Sin `100vh`
  // ------------------------------------------------------------------------------------------

  it('la pantalla no usa 100vh como alto (R48)', async () => {
    await renderPantalla();

    sinAlturaDeVentana(`a ${ancho}px`);
  });
});
