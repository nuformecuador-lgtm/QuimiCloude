// QC-45 T10 — Multiplataforma y desbordamiento de la pantalla de presentaciones: R18 y R34.
//
// **La pantalla REAL, en los DOS viewports.** Se monta `page.tsx` entera —con su `<Suspense>`, su
// seccion de servidor, la tabla compartida, el panel lateral y el dialogo de borrado— porque lo
// que R18 y R34 preguntan —quien se desplaza, que es alcanzable, que mide cada control— solo
// tiene respuesta con el arbol completo: el contenedor de scroll lo aporta el primitivo `Table`,
// y los dos destinos de la fila los monta la columna de acciones.
//
// **El layout privado NO se monta aqui, y es deliberado.** `app/(private)/layout.tsx` y
// `lib/shared/navigation/private-nav.ts` estan siendo reescritos por QC-75 en paralelo (misma
// decision que dejo anotada `page.tsx` sobre `PRESENTATIONS_LABEL`), y esta ficha no los toca.
// Ademas, lo que R18 acota es el desbordamiento **de la pantalla**: «ningun ancestro» significa
// ningun ancestro dentro de lo que esta feature construye. El armazon heredado ya tiene su propia
// cobertura en `tests/unit/private-layout.test.tsx`.
//
// **Cada caso corre a 375 px y a 1280 px**, sin excepcion de escritorio (`requirements.md > R34`
// y `design.md > 7`). No es un `for` dentro de un caso: es `describe.each`, para que el informe
// diga en cual de los dos anchos fallo.
//
// **Lo que jsdom NO puede decir, y como se sustituye.** jsdom no hace layout: `offsetWidth` es 0 y
// `getComputedStyle` no resuelve clases de Tailwind, que ademas no estan compiladas aqui. Asi que
// «44x44 px» y «16 px» se afirman sobre los tokens de clase (`min-h-11`/`min-w-11` = 2.75rem = 44
// px; `text-base` = 1rem = 16 px, mas `md:text-base` para que el campo no vuelva a 14 px en el
// breakpoint de escritorio), que es el mismo criterio que ya usan QC-11, QC-35 y QC-44 y el unico
// honesto en este entorno. La medida real en un dispositivo la cubre la comprobacion manual en
// WebKit que `tasks.md > T10` deja anotada aparte; no esta ficha.
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `inventario` (QC-20, mergeado),
// que esta ficha no abre (R30). Las tres de escritura FALLAN si se les llama: este archivo mide
// la pantalla, no la ejercita contra el backend.
//
// **Ningun assert sobre copy** (R35): todo se localiza por rol accesible, por `data-testid`
// publico de la tabla compartida o por constantes exportadas del barrel de la ruta.

import { cleanup, render, screen, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  DELETE_PRESENTATION_CONFIRM_TESTID,
  DELETE_PRESENTATION_DIALOG_TESTID,
  DELETE_PRESENTATION_DISMISS_TESTID,
  NAME_COLUMN_ID,
  PRESENTATION_ACTION_DELETE_TESTID,
  PRESENTATION_ACTION_EDIT_TESTID,
  PRESENTATION_CREATE_OPEN_TESTID,
  PRESENTATION_FIELD_NAME_TESTID,
  PRESENTATION_FORM_CANCEL_TESTID,
  PRESENTATION_FORM_SUBMIT_TESTID,
  PRESENTATION_FORM_TESTID,
  PRESENTATION_LIST_TESTID,
  PRESENTATION_ROW_ACTIONS_TESTID,
  PRESENTATION_SHEET_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
  deletePresentationLabel,
  editPresentationLabel,
} from '@/app/(private)/configuracion/presentaciones/components';
import PresentacionesPage from '@/app/(private)/configuracion/presentaciones/page';
import type { PresentationView } from '@/lib/modules/inventario';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/** Area tactil minima de R34: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de R34: `text-base` = 1rem = 16 px, y que no baje en el breakpoint. */
const FUENTE_DE_CAMPO = ['text-base', 'md:text-base'] as const;

const {
  routerMock,
  listPresentationsActionMock,
  listUnitsActionMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

/**
 * QC-75: la pagina abre con `await requirePagePermission('inventario.modificar')`, que lee la
 * sesion por `@/lib/composition`. Se mockea **el proveedor de sesion**, no `requirePagePermission`:
 * asi el corte se ejecuta de verdad y este archivo sigue afirmando solo lo suyo -que la pantalla se
 * usa en angosto y en ancho-. Sin esto, `cookies()` revienta fuera de una peticion real.
 */
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

/** Sesion con el permiso que la pantalla exige: sin el, `requirePagePermission` haria 404. */
const USUARIO_CON_PERMISO = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el test de viewport`);
  };
  return {
    listPresentationsAction: listPresentationsActionMock,
    createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
    updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
    deletePresentationAction: vi.fn(noDebeInvocarse('deletePresentationAction')),
  };
});

/**
 * QC-80 (R16): la seccion pide el catalogo de unidades con `listUnitsAction()` y lo baja por
 * props hasta el selector del panel. Aqui se mockea porque esta suite monta la pantalla REAL.
 */
vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const UNIDADES: readonly UnitView[] = [
  {
    id: 'unit-kg',
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: true,
  },
  { id: 'unit-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

/**
 * Dos filas, y la segunda con un nombre largo a proposito: con dos columnas el desbordamiento es
 * improbable, y un nombre corto no llegaria a poner a prueba quien absorbe el scroll horizontal.
 */
const PRESENTACION: PresentationView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bidón 20 L',
  nameNormalized: 'bidon 20 l',
  unitId: 'unit-kg',
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

const PRESENTACION_LARGA: PresentationView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Tambor metálico de 200 litros con tapa desmontable y aro de cierre reforzado',
  nameNormalized: 'tambor metalico de 200 litros con tapa desmontable y aro de cierre reforzado',
  unitId: 'unit-l',
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

function pagina(items: readonly PresentationView[]): PresentationListResult {
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
 * `page.tsx`. Copiado de `presentation-page.test.tsx`, que a su vez lo hereda de `inventario`.
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
  return render(await resolverServerComponents(await PresentacionesPage({
    searchParams: Promise.resolve({}),
  })));
}

/** Todas las clases de un elemento, ya troceadas: `className` de un SVG no es una cadena. */
function clases(elemento: Element): string[] {
  return Array.from(elemento.classList);
}

/**
 * R34 — Ninguna pieza del arbol montado mide su alto con la ventana.
 *
 * `100vh` en un navegador movil mide la ventana SIN la barra del navegador, asi que el ultimo
 * trozo queda debajo de ella y no se alcanza. Se comprueba sobre el DOM montado —clases y estilo
 * en linea—, no sobre la fuente de la ruta: el alto podria colarse por cualquier pieza que la
 * pantalla componga, incluido lo que se pinta en un portal.
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

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getSessionUserMock.mockResolvedValue(USUARIO_CON_PERMISO);
  listPresentationsActionMock.mockResolvedValue(pagina([PRESENTACION, PRESENTACION_LARGA]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: UNIDADES });
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

describe.each(VIEWPORTS)('pantalla de presentaciones en viewport %s (%i px)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  // ------------------------------------------------------------------------------------------
  // R18 — El desbordamiento se contiene en la tabla, nunca en el documento
  // ------------------------------------------------------------------------------------------

  it('la lista es utilizable: tabla, filas, celdas y paginacion estan montadas (R18)', async () => {
    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByTestId('data-table-pagination')).toBeVisible();

    for (const presentacion of [PRESENTACION, PRESENTACION_LARGA]) {
      const fila = screen.getByTestId(`data-table-row-${presentacion.id}`);
      expect(fila, `la fila de ${presentacion.id} a ${ancho}px`).toBeVisible();
      expect(within(fila).getByTestId(`data-table-cell-${NAME_COLUMN_ID}`)).toBeVisible();
      expect(within(fila).getByTestId(`data-table-cell-${ACTIONS_COLUMN_ID}`)).toBeVisible();
    }
  });

  it('el desbordamiento se resuelve DENTRO de la tabla, no en el documento (R18)', async () => {
    await renderPantalla();

    // El scroll horizontal lo aporta el contenedor del primitivo `Table`, que envuelve a la tabla.
    const tabla = screen.getByRole('table');
    const contenedor = tabla.parentElement;
    expect(contenedor, 'la tabla debe ir envuelta en su contenedor de scroll').not.toBeNull();
    expect(contenedor?.getAttribute('data-slot')).toBe('table-container');
    expect(clases(contenedor as Element)).toContain('overflow-x-auto');

    // Y es el UNICO desplazador horizontal de la pantalla: si un ancestro tambien desplazara, el
    // desbordamiento se escaparia de la tabla y acabaria moviendo el documento.
    const desplazadores = Array.from(
      document.body.querySelectorAll('.overflow-x-auto, .overflow-x-scroll'),
    );
    expect(desplazadores, `mas de un desplazador horizontal a ${ancho}px`).toEqual([contenedor]);

    // Ningun ANCESTRO de la tabla lo declara: se sube la cadena entera hasta `body`.
    for (
      let ancestro = contenedor?.parentElement ?? null;
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

  it('las acciones de fila siguen siendo alcanzables dentro de la tabla (R18)', async () => {
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${PRESENTACION.id}`);
    const celda = within(fila).getByTestId(`data-table-cell-${ACTIONS_COLUMN_ID}`);

    expect(within(celda).getByTestId(PRESENTATION_ROW_ACTIONS_TESTID)).toBeVisible();

    // Viajan DENTRO del contenedor que se desplaza: el scroll de la tabla las alcanza sin que el
    // documento se mueva.
    expect(screen.getByRole('table').parentElement?.contains(celda)).toBe(true);
  });

  // ------------------------------------------------------------------------------------------
  // R19, R34 — Nada detras del puntero
  // ------------------------------------------------------------------------------------------

  it('editar y borrar estan en el DOM y visibles desde el primer render, sin :hover (R34)', async () => {
    await renderPantalla();

    // 1) En el DOM: los dos controles de CADA fila estan visibles ya, sin pasar el puntero por
    //    encima. En tactil no hay puntero que pasar. Se localizan ademas por su rol y su nombre
    //    accesible, que es el contrato que R19 exige y que compone el propio componente.
    for (const presentacion of [PRESENTACION, PRESENTACION_LARGA]) {
      const fila = screen.getByTestId(`data-table-row-${presentacion.id}`);

      for (const accion of [PRESENTATION_ACTION_EDIT_TESTID, PRESENTATION_ACTION_DELETE_TESTID]) {
        const control = within(fila).getByTestId(accion);
        expect(control, `${accion} a ${ancho}px`).toBeVisible();
        expect(control, `${accion} a ${ancho}px`).toBeEnabled();
      }

      expect(
        within(fila).getByRole('button', { name: editPresentationLabel(presentacion.name) }),
      ).toBeVisible();
      expect(
        within(fila).getByRole('button', { name: deletePresentationLabel(presentacion.name) }),
      ).toBeVisible();
    }

    expect(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID)).toBeVisible();

    // 2) En las clases: ningun elemento de la pantalla usa el puntero para REVELAR nada. Un
    //    `hover:bg-muted` es decoracion y no molesta a nadie; lo que R34 prohibe es que la
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
  // R34 — 44x44 px y 16 px
  // ------------------------------------------------------------------------------------------

  it('los controles tactiles de la lista miden al menos 44x44 px (R34)', async () => {
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${PRESENTACION.id}`);
    const controles = [
      within(fila).getByTestId(PRESENTATION_ACTION_EDIT_TESTID),
      within(fila).getByTestId(PRESENTATION_ACTION_DELETE_TESTID),
      screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID),
    ];

    for (const control of controles) {
      for (const token of AREA_TACTIL) {
        expect(control.className, `${control.getAttribute('data-testid')} a ${ancho}px`).toContain(
          token,
        );
      }
    }
  });

  it('el panel lateral es utilizable: campo de 16 px y acciones de 44x44 px (R34)', async () => {
    // 16 px es el umbral por debajo del cual Safari en iOS hace zoom al enfocar el campo, y ese
    // zoom deja la pantalla desplazada a mano. Se comprueba en los DOS anchos: `md:text-base`
    // esta justamente para que el campo no vuelva a 14 px en el breakpoint de escritorio.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    const panel = screen.getByTestId(PRESENTATION_SHEET_TESTID);
    expect(panel, `el panel a ${ancho}px`).toBeVisible();

    // El unico campo de negocio (R22): fuente de 16 px y alto tactil.
    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    expect(campo, `el campo a ${ancho}px`).toBeVisible();
    for (const token of FUENTE_DE_CAMPO) {
      expect(campo.className, `el campo a ${ancho}px`).toContain(token);
    }
    expect(campo.className, `el campo a ${ancho}px`).toContain('min-h-11');

    // QC-80 R20: el selector de unidad cumple lo mismo, en los dos anchos.
    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector, `el selector de unidad a ${ancho}px`).toBeVisible();
    for (const token of [...FUENTE_DE_CAMPO, ...AREA_TACTIL]) {
      expect(selector.className, `el selector de unidad a ${ancho}px`).toContain(token);
    }

    for (const accion of [PRESENTATION_FORM_SUBMIT_TESTID, PRESENTATION_FORM_CANCEL_TESTID]) {
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

  it('el dialogo de borrado es utilizable y sus dos acciones miden 44x44 px (R34)', async () => {
    const user = setupUser();
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${PRESENTACION.id}`);
    await user.click(within(fila).getByTestId(PRESENTATION_ACTION_DELETE_TESTID));

    const dialogo = await screen.findByTestId(DELETE_PRESENTATION_DIALOG_TESTID);
    expect(dialogo, `el dialogo a ${ancho}px`).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();

    for (const accion of [DELETE_PRESENTATION_CONFIRM_TESTID, DELETE_PRESENTATION_DISMISS_TESTID]) {
      const control = screen.getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    sinAlturaDeVentana(`con el dialogo abierto a ${ancho}px`);
  });

  // ------------------------------------------------------------------------------------------
  // R34 — Sin `100vh`
  // ------------------------------------------------------------------------------------------

  it('la pantalla no usa 100vh como alto (R34)', async () => {
    await renderPantalla();

    sinAlturaDeVentana(`a ${ancho}px`);
  });
});
