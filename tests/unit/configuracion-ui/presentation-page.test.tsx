// QC-45 T5 — La pantalla de presentaciones y sus tres estados: R1, R7, R15, R16, R17.
//
// **La ubicacion se DERIVA de la constante** (R2): la ruta esperada se compone como
// `app/(private)${PRESENTATIONS_ROUTE}/page.tsx` y se comprueba que el archivo esta ahi. Nunca se
// escribe el literal de la URL.
//
// **`listPresentationsAction` esta mockeada.** No es un atajo: es el borde del modulo
// `inventario` (QC-20, `done` y mergeado), que esta ficha **no abre** (R30), y sustituirla es lo
// unico que permite ejercitar error, vacio y lista sin base de datos.
//
// **Los tres estados se distinguen por `data-testid` DISTINTOS** (R35), nunca por copy: el copy
// cambia sin avisar y un assert sobre el no dice nada sobre la exclusividad de los estados.

import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PRESENTATION_ACTION_EDIT_TESTID,
  PRESENTATION_CREATE_OPEN_TESTID,
  PRESENTATION_FORM_TESTID,
  PRESENTATION_LIST_EMPTY_TESTID,
  PRESENTATION_LIST_ERROR_CODE_TESTID,
  PRESENTATION_LIST_ERROR_MESSAGE_TESTID,
  PRESENTATION_LIST_ERROR_TESTID,
  PRESENTATION_LIST_FIRST_PAGE_TESTID,
  PRESENTATION_LIST_RETRY_TESTID,
  PRESENTATION_LIST_SKELETON_TESTID,
  PRESENTATION_LIST_TESTID,
  PRESENTATION_ROW_SKELETON_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
} from '@/app/(private)/configuracion/presentaciones/components';
import PresentacionesPage from '@/app/(private)/configuracion/presentaciones/page';
import type { PresentationView } from '@/lib/modules/inventario';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

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
 * asi el corte se ejecuta de verdad -`assertPermission` incluido- y este archivo sigue afirmando
 * exactamente lo mismo que antes sobre los tres estados de la lista. Quien vigila el corte en si
 * es `presentations-route-contract.test.ts` y `tests/guards/guard-pantallas-exigen-permiso.test.ts`.
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

// Dobles de escritura que FALLAN si se les llama: pintar la lista no muta nada.
vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la lista`);
  };
  return {
    listPresentationsAction: listPresentationsActionMock,
    createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
    updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
    deletePresentationAction: vi.fn(noDebeInvocarse('deletePresentationAction')),
  };
});

/**
 * QC-80 (R16, R19): la seccion pide el catalogo de unidades UNA vez por pantalla, junto al
 * listado. Se mockea la Server Action de `unidades` -el borde de otro modulo- para poder ejercitar
 * tambien su camino de FALLO, que es lo que R19 gobierna.
 */
vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const UNIDADES: readonly UnitView[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: true,
  },
];

const RAIZ = join(__dirname, '..', '..', '..');

/**
 * Datos del fixture. Cadena **inconfundible** a proposito: el caso de `unauthorized` busca su
 * ausencia en todo el documento, y con un valor realista no distinguiria entre «no se muestra» y
 * «se muestra pero parece otra cosa».
 */
const DATO_QUE_NO_DEBE_VERSE = 'PRESENTACION-SECRETA-NO-VISIBLE';

function presentacion(overrides: Partial<PresentationView> = {}): PresentationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: DATO_QUE_NO_DEBE_VERSE,
    nameNormalized: 'presentacion secreta no visible',
    unitId: UNIDADES[0]!.id,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  };
}

function pagina(
  items: readonly PresentationView[],
  extra: { page?: number; totalPages?: number } = {},
): PresentationListResult {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page: extra.page ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar un
 * componente `async` —se queda suspendido para siempre—, asi que sin esto la lista no llegaria a
 * pintarse nunca. Lo que se conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key` y
 * su `fallback` siguen siendo los que declara la pagina. Copiado de `inventario/product-page`,
 * que es donde vive el original.
 *
 * El caso de R16 se apoya justo en lo contrario: renderizar el arbol SIN resolver deja la seccion
 * suspendida y obliga a `<Suspense>` a pintar su `fallback`.
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

type Consulta = Record<string, string | string[] | undefined>;

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo `async`. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return PresentacionesPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // El filtro de fecha de la tabla compartida usa `window.matchMedia`, que jsdom no implementa.
  // Se stubea con el helper HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local.
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(USUARIO_CON_PERMISO);
  listPresentationsActionMock.mockResolvedValue(pagina([]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: UNIDADES });
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la pantalla vive en la ruta DERIVADA de la constante (R1, R2)', () => {
  it('existe `app/(private)${PRESENTATIONS_ROUTE}/page.tsx`, compuesto a partir de la constante', () => {
    const esperada = join(RAIZ, 'app', '(private)', ...PRESENTATIONS_ROUTE.split('/').filter(Boolean), 'page.tsx');

    expect(existsSync(esperada), `no existe la pagina en ${esperada}`).toBe(true);
  });
});

describe('la pantalla NO declara armazon propio: lo hereda del layout privado (R1, R26, R33)', () => {
  it('no monta ningun landmark principal, ni barra lateral, ni cabecera de aplicacion', async () => {
    await renderPantalla();

    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('su fuente no monta la region de avisos ni el armazon: en la zona privada hay UNA sola', () => {
    const fuente = readFileSync(
      join(RAIZ, 'app', '(private)', ...PRESENTATIONS_ROUTE.split('/').filter(Boolean), 'page.tsx'),
      'utf8',
    )
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    for (const prohibido of ['Toaster', 'SidebarProvider', 'AppSidebar', 'SidebarInset']) {
      expect(fuente, `page.tsx no debe montar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('los tres estados son mutuamente excluyentes y se distinguen por data-testid (R35)', () => {
  it('cargando: mientras la lista esta en vuelo se pinta el esqueleto, no la tabla (R16)', async () => {
    // Sin resolver los Server Components `async`, `<Suspense>` pinta su `fallback`.
    render(await arbolDeLaPantalla({ pageSize: String(MAX_PAGE_SIZE) }));

    const esqueleto = screen.getByTestId(PRESENTATION_LIST_SKELETON_TESTID);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    // Tantas filas como el tamano de pagina PEDIDO: el esqueleto dice la verdad sobre la consulta.
    expect(screen.getAllByTestId(PRESENTATION_ROW_SKELETON_TESTID)).toHaveLength(MAX_PAGE_SIZE);

    expect(screen.queryByTestId(PRESENTATION_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeNull();
  });

  it('vacio: sin ninguna presentacion se pinta el estado propio, NO una tabla sin filas (R15)', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([]));

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_EMPTY_TESTID)).toBeInTheDocument();
    // La accion util cuando no hay nada: crear la primera.
    expect(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID)).toBeInTheDocument();
    // Vacio de verdad: no se ofrece «volver a la primera pagina», que es otro caso distinto.
    expect(screen.queryByTestId(PRESENTATION_LIST_FIRST_PAGE_TESTID)).toBeNull();

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_SKELETON_TESTID)).toBeNull();
  });

  it('lista: con presentaciones se pinta la tabla y ninguno de los otros dos estados', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([presentacion({ name: 'Bidón 20 L' })]));

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(PRESENTATION_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeNull();
  });

  it('error: se dice que fallo, con su mensaje y su codigo, y NO se pinta una tabla vacia (R17)', async () => {
    listPresentationsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      'La consulta no es válida.',
    );
    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_CODE_TESTID)).toHaveTextContent(
      'invalid_input',
    );
    // Y ofrece reintentar de verdad.
    expect(screen.getByTestId(PRESENTATION_LIST_RETRY_TESTID)).toBeEnabled();

    // Lo que R17 existe para impedir: confundir «fallo» con «no hay nada».
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_SKELETON_TESTID)).toBeNull();
  });
});

describe('la pagina que se quedo atras vuelve a la primera (R15)', () => {
  it('con la pagina vacia y page > total se ofrece el enlace a la primera, derivado de la constante (R2)', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([], { page: 4, totalPages: 2 }));

    await renderPantalla({ page: '4' });

    const enlace = screen.getByTestId(PRESENTATION_LIST_FIRST_PAGE_TESTID);
    expect(enlace).toHaveAttribute('href', expect.stringContaining(`${PRESENTATIONS_ROUTE}?`));
    expect(enlace.getAttribute('href')).toContain('page=1');
  });
});

describe('la pantalla no autoriza nada por su cuenta (R7)', () => {
  it('con `unauthorized` se pinta el error y NI UN DATO del catalogo', async () => {
    listPresentationsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar presentaciones.',
    });

    const { container } = await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_CODE_TESTID)).toHaveTextContent(
      'unauthorized',
    );

    // La pantalla no oculta columnas por rol ni lee la sesion: simplemente no tiene datos.
    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(PRESENTATION_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('la seccion no lee la sesion: su fuente no toca cookies, composicion ni permisos', () => {
    const fuente = readFileSync(
      join(
        RAIZ,
        'app',
        '(private)',
        ...PRESENTATIONS_ROUTE.split('/').filter(Boolean),
        'components',
        'presentation-list-section.tsx',
      ),
      'utf8',
    )
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    for (const prohibido of ['next/headers', 'cookies(', 'lib/composition', 'requirePermission']) {
      expect(fuente, `la seccion no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('una sola llamada de lectura por pantalla (R7, R30)', () => {
  it('se invoca `listPresentationsAction` UNA vez, con los parametros enteros y sin traducir', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([presentacion({ name: 'Saco 25 kg' })]));

    await renderPantalla({ page: '2', pageSize: String(MAX_PAGE_SIZE), q: 'saco' });

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(1);
    // QC-80 R16: el catalogo de unidades tambien se pide UNA sola vez por pantalla, sin consulta
    // -el catalogo entero- y no una vez por fila ni una vez por panel.
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
    expect(listUnitsActionMock.mock.calls[0]).toEqual([]);
    // Campo a campo la misma forma que `ListQuery`: ninguna clave de mas.
    expect(Object.keys(listPresentationsActionMock.mock.calls[0][0] as object).sort()).toEqual([
      'filters',
      'page',
      'pageSize',
      'search',
      'sort',
    ]);
    expect(listPresentationsActionMock.mock.calls[0][0]).toMatchObject({
      page: 2,
      pageSize: MAX_PAGE_SIZE,
      search: 'saco',
    });
  });
});

describe('QC-80 R19 — sin catalogo de unidades no se ofrece ni el alta ni la edicion', () => {
  it('con el catalogo en error se pinta el estado de error y NINGUN disparador de alta', async () => {
    // R19 — un formulario con el selector vacio seria PEOR que el error: dejaria al usuario
    // delante de un campo obligatorio imposible de rellenar. Aqui el listado va BIEN y trae
    // filas: lo unico que falla es el catalogo, y aun asi la pantalla no ofrece escribir.
    listPresentationsActionMock.mockResolvedValue(pagina([presentacion({ name: 'Saco 25 kg' })]));
    listUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar unidades.',
    });

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_CODE_TESTID)).toHaveTextContent(
      'unauthorized',
    );

    // Ni el disparador de la cabecera, ni el de la fila: no hay por donde abrir un panel.
    expect(screen.queryByTestId(PRESENTATION_CREATE_OPEN_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_ACTION_EDIT_TESTID)).toBeNull();
    // Y por tanto tampoco hay ningun formulario montado.
    expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('con el catalogo en error tampoco se ofrece «crear la primera» en el estado vacio', async () => {
    // R19 — el tercer sitio donde vive un disparador, y el mas facil de olvidar: el slot del
    // estado vacio. Sin catalogo no se monta ninguno de los tres.
    listPresentationsActionMock.mockResolvedValue(pagina([]));
    listUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'No se pudo leer el catálogo de unidades.',
    });

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(PRESENTATION_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_CREATE_OPEN_TESTID)).toBeNull();
  });

  it('con el catalogo OK los disparadores vuelven a estar: el error es del catalogo, no del diseno', async () => {
    // El positivo que le da sentido al negativo de arriba.
    listPresentationsActionMock.mockResolvedValue(pagina([presentacion({ name: 'Saco 25 kg' })]));

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID)).toBeInTheDocument();
    expect(screen.getAllByTestId(PRESENTATION_ACTION_EDIT_TESTID)).toHaveLength(1);
    expect(screen.queryByTestId(PRESENTATION_LIST_ERROR_TESTID)).toBeNull();
  });
});

/** QC-71 T9 — R17 y R18 en el estado de error de la lista de presentaciones. */
describe('lista de presentaciones — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listPresentationsActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const region = await screen.findByTestId(PRESENTATION_LIST_ERROR_TESTID);

    // Identificado por `data-testid`, nunca por su texto: lo prohibe la convencion de esta
    // pantalla. `toHaveTextContent` sigue probando que el identificador esta RENDERIZADO como
    // texto y no escondido en un atributo (R17).
    const referencia = within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listPresentationsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(PRESENTATION_LIST_ERROR_CODE_TESTID)).toHaveTextContent(
      'unauthorized',
    );
    esperarSinIdentificador();
  });
});
