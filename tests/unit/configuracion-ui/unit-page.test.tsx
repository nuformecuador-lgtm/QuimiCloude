// QC-39 T8 — La pantalla de unidades, su corte por permiso y sus tres estados: R7, R12, R14, R17,
// R23, R24, R25, R26, R49.
//
// **La ubicacion se DERIVA de la constante** (R8): la ruta esperada se compone como
// `app/(private)${UNITS_ROUTE}/page.tsx` y se comprueba que el archivo esta ahi. Nunca se escribe
// el literal de la URL.
//
// **`listUnitsAction` esta mockeada.** No es un atajo: es el borde del modulo `unidades`, y
// sustituirla es lo unico que permite ejercitar error, vacio y lista sin base de datos. Se mockea
// tambien **el proveedor de sesion** —no `requirePagePermission`—, de modo que el corte se ejecuta
// de verdad, `assertPermission` incluido.
//
// **Los tres estados se distinguen por `data-testid` DISTINTOS** (R49), nunca por copy.

import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NO_EQUIVALENCE_LABEL,
  UNIT_CREATE_OPEN_TESTID,
  UNIT_LIST_CLEAR_SEARCH_TESTID,
  UNIT_LIST_EMPTY_TESTID,
  UNIT_LIST_ERROR_CODE_TESTID,
  UNIT_LIST_ERROR_MESSAGE_TESTID,
  UNIT_LIST_ERROR_TESTID,
  UNIT_LIST_FIRST_PAGE_TESTID,
  UNIT_LIST_RETRY_TESTID,
  UNIT_LIST_SKELETON_TESTID,
  UNIT_LIST_TESTID,
  UNIT_ROW_SKELETON_TESTID,
  formatUnitEquivalence,
} from '@/app/(private)/configuracion/unidades/components';
import UnidadesPage from '@/app/(private)/configuracion/unidades/page';
import type { Page, UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { LOGIN_ROUTE_SESSION_ENDED, UNITS_ROUTE } from '@/lib/shared/routes';
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

type Resultado =
  | { status: 'success'; data: Page<UnitView> | readonly UnitView[] }
  | { status: 'error'; code: string; message: string };

const { routerMock, listUnitsActionMock, getSessionUserMock, notFoundMock, redirectMock } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. Los dobles hacen lo mismo:
    // si no lanzaran, el corte seguiria ejecutandose y el test mediria otra cosa.
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn<(ruta: string) => never>(() => {
      throw new Error('NEXT_REDIRECT');
    }),
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
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// Dobles de escritura que FALLAN si se les llama: pintar la lista no muta nada.
vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la lista`);
  };
  return {
    listUnitsAction: listUnitsActionMock,
    createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
    updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
    deleteUnitAction: vi.fn(noDebeInvocarse('deleteUnitAction')),
  };
});

const RAIZ = join(__dirname, '..', '..', '..');
const RUTA_PAGINA = join(RAIZ, 'app', '(private)', ...UNITS_ROUTE.split('/').filter(Boolean));

/** Los DOS permisos que la pantalla exige (R12). Se declaran aqui como fuente del test. */
const PERMISOS_DE_LA_PANTALLA = ['unidades.consultar', 'unidades.modificar'] as const;

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

/**
 * Cadena **inconfundible** a proposito: el caso de `unauthorized` busca su ausencia en todo el
 * documento, y con un valor realista no distinguiria entre «no se muestra» y «se muestra pero
 * parece otra cosa».
 */
const DATO_QUE_NO_DEBE_VERSE = 'UNIDAD-SECRETA-NO-VISIBLE';

const GRAMO: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Gramo',
  symbol: 'gr',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

function unidad(overrides: Partial<UnitView> = {}): UnitView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: DATO_QUE_NO_DEBE_VERSE,
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: false,
    ...overrides,
  };
}

function pagina(
  items: readonly UnitView[],
  extra: { page?: number; totalPages?: number } = {},
): Resultado {
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
 * Cablea las DOS lecturas de `design.md > 5.3` sobre el mismo doble: la primera llega **con**
 * consulta —la pagina que se pinta— y la segunda **sin** ninguna —el catalogo del indice y del
 * selector—. Es exactamente como las distingue la Server Action real (sus sobrecargas).
 */
function conLecturas(pagina_: Resultado, catalogo: Resultado): void {
  listUnitsActionMock.mockImplementation(async (query?: unknown) =>
    query === undefined ? catalogo : pagina_,
  );
}

const CATALOGO_VACIO: Resultado = { status: 'success', data: [] as readonly UnitView[] };

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar un
 * componente `async` —se queda suspendido para siempre—, asi que sin esto la lista no llegaria a
 * pintarse nunca. Lo que se conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key` y su
 * `fallback` siguen siendo los que declara la pagina. Copiado de `presentation-page.test.tsx`.
 *
 * El caso de R25 se apoya justo en lo contrario: renderizar el arbol SIN resolver deja la seccion
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

/** Anota cada acceso a la promesa de `searchParams`, para probar el ORDEN del corte (R12). */
const accesoAParametros = vi.fn<() => void>();

/** Una promesa espia: `await` sobre ella llama a su `then`, que anota el acceso antes de resolver.
 *  Es la forma exacta en que el App Router entrega `searchParams` —un thenable—, asi que no falsea
 *  nada de la pantalla; solo deja constancia de que fue leida. */
function parametrosEspia(valor: Consulta): Promise<Consulta> {
  return {
    then: (resolve: (value: Consulta) => unknown) => {
      accesoAParametros();
      return resolve(valor);
    },
  } as unknown as Promise<Consulta>;
}

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo `async`. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return UnidadesPage({ searchParams: parametrosEspia(searchParams) });
}

/** Monta la pantalla con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // El filtro de fecha de la tabla compartida usa `window.matchMedia`, que jsdom no implementa. Se
  // stubea con el helper HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local.
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(sesionCon(PERMISOS_DE_LA_PANTALLA));
  conLecturas(pagina([]), CATALOGO_VACIO);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la pantalla vive en la ruta DERIVADA de la constante (R7, R8)', () => {
  it('existe `app/(private)${UNITS_ROUTE}/page.tsx`, compuesto a partir de la constante', () => {
    expect(existsSync(join(RUTA_PAGINA, 'page.tsx'))).toBe(true);
  });
});

describe('la pantalla NO declara armazon propio: lo hereda del layout privado (R7, R39, R47)', () => {
  it('no monta ningun landmark principal, ni barra lateral, ni cabecera de aplicacion', async () => {
    await renderPantalla();

    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('su fuente no monta la region de avisos ni el armazon: en la zona privada hay UNA sola', () => {
    const fuente = readFileSync(join(RUTA_PAGINA, 'page.tsx'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    for (const prohibido of ['Toaster', 'SidebarProvider', 'AppSidebar', 'SidebarInset']) {
      expect(fuente, `page.tsx no debe montar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('el corte por permiso ocurre ANTES de leer nada (R12)', () => {
  it('sin sesion redirige al login, y no responde 404: un anonimo no recibe 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(listUnitsActionMock).not.toHaveBeenCalled();
    expect(accesoAParametros).not.toHaveBeenCalled();
  });

  for (const ausente of PERMISOS_DE_LA_PANTALLA) {
    const presentes = PERMISOS_DE_LA_PANTALLA.filter((codigo) => codigo !== ausente);

    it(`sin \`${ausente}\` responde 404 y no llega a leer ni la URL ni el catalogo`, async () => {
      getSessionUserMock.mockResolvedValue(sesionCon(presentes));

      await expect(arbolDeLaPantalla()).rejects.toThrow();

      expect(notFoundMock).toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(listUnitsActionMock).not.toHaveBeenCalled();
      expect(accesoAParametros).not.toHaveBeenCalled();
    });
  }

  it('con los DOS permisos entra, lee la URL y pide la lista', async () => {
    await renderPantalla({ page: '1' });

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(accesoAParametros).toHaveBeenCalled();
    expect(listUnitsActionMock).toHaveBeenCalled();
  });
});

describe('las DOS lecturas de la seccion, con los parametros sin traducir (R23, R36)', () => {
  it('una con la consulta entera y otra sin ninguna: pagina + catalogo', async () => {
    conLecturas(pagina([unidad({ name: 'Kilogramo' })]), { status: 'success', data: [GRAMO] });

    await renderPantalla({ page: '2', pageSize: String(MAX_PAGE_SIZE), q: 'kilo' });

    expect(listUnitsActionMock).toHaveBeenCalledTimes(2);
    const consultas = listUnitsActionMock.mock.calls.map(([query]) => query);
    expect(consultas.filter((query) => query === undefined)).toHaveLength(1);

    const consulta = consultas.find((query) => query !== undefined) as object;
    // Campo a campo la misma forma que `ListQuery`: ninguna clave de mas.
    expect(Object.keys(consulta).sort()).toEqual([
      'filters',
      'page',
      'pageSize',
      'search',
      'sort',
    ]);
    expect(consulta).toMatchObject({ page: 2, pageSize: MAX_PAGE_SIZE, search: 'kilo' });
  });
});

describe('los tres estados son mutuamente excluyentes y se distinguen por data-testid (R49)', () => {
  it('cargando: mientras la lista esta en vuelo se pinta el esqueleto, no la tabla (R25)', async () => {
    // Sin resolver los Server Components `async`, `<Suspense>` pinta su `fallback`.
    render(await arbolDeLaPantalla({ pageSize: String(MAX_PAGE_SIZE) }));

    const esqueleto = screen.getByTestId(UNIT_LIST_SKELETON_TESTID);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    // Tantas filas como el tamano de pagina PEDIDO: el esqueleto dice la verdad sobre la consulta.
    expect(screen.getAllByTestId(UNIT_ROW_SKELETON_TESTID)).toHaveLength(MAX_PAGE_SIZE);

    expect(screen.queryByTestId(UNIT_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_ERROR_TESTID)).toBeNull();
  });

  it('vacio: es el de «la busqueda no encontro nada» y NO ofrece crear la primera (R24)', async () => {
    conLecturas(pagina([]), CATALOGO_VACIO);

    await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_EMPTY_TESTID)).toBeInTheDocument();
    // Lo que esta pantalla se aparta de su hermana: aqui NO se ofrece «crea la primera».
    expect(screen.queryByTestId(UNIT_CREATE_OPEN_TESTID)).toBeNull();
    // Sin termino y en la primera pagina, tampoco se ofrece limpiar ni volver: no aplican.
    expect(screen.queryByTestId(UNIT_LIST_CLEAR_SEARCH_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_FIRST_PAGE_TESTID)).toBeNull();

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_SKELETON_TESTID)).toBeNull();
  });

  it('lista: con unidades se pinta la tabla y ninguno de los otros dos estados', async () => {
    conLecturas(pagina([unidad({ name: 'Kilogramo' })]), { status: 'success', data: [GRAMO] });

    await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(UNIT_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_ERROR_TESTID)).toBeNull();
  });

  it('error: se dice que fallo, con su mensaje y su codigo, y NO se pinta tabla vacia (R26)', async () => {
    conLecturas(
      { status: 'error', code: 'invalid_input', message: 'La consulta no es válida.' },
      CATALOGO_VACIO,
    );

    await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(UNIT_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      'La consulta no es válida.',
    );
    expect(screen.getByTestId(UNIT_LIST_ERROR_CODE_TESTID)).toHaveTextContent('invalid_input');
    expect(screen.getByTestId(UNIT_LIST_RETRY_TESTID)).toBeEnabled();

    // Lo que R26 existe para impedir: confundir «fallo» con «no hay nada».
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_LIST_SKELETON_TESTID)).toBeNull();
  });
});

describe('el vacio ofrece las salidas que aplican, derivadas de la constante (R8, R24)', () => {
  it('con termino de busqueda se ofrece limpiarlo, y el destino se queda sin `q`', async () => {
    conLecturas(pagina([]), CATALOGO_VACIO);

    await renderPantalla({ q: 'inexistente' });

    const enlace = screen.getByTestId(UNIT_LIST_CLEAR_SEARCH_TESTID);
    expect(enlace).toHaveAttribute('href', expect.stringContaining(`${UNITS_ROUTE}?`));
    expect(enlace.getAttribute('href')).not.toContain('q=');
    expect(enlace.getAttribute('href')).toContain('page=1');
  });

  it('con la pagina pedida mayor que el total se ofrece volver a la primera', async () => {
    conLecturas(pagina([], { page: 4, totalPages: 2 }), CATALOGO_VACIO);

    await renderPantalla({ page: '4' });

    const enlace = screen.getByTestId(UNIT_LIST_FIRST_PAGE_TESTID);
    expect(enlace).toHaveAttribute('href', expect.stringContaining(`${UNITS_ROUTE}?`));
    expect(enlace.getAttribute('href')).toContain('page=1');
  });
});

describe('la pantalla no autoriza nada por su cuenta (R14)', () => {
  it('con `unauthorized` se pinta el error y NI UN DATO del catalogo', async () => {
    conLecturas(
      {
        status: 'error',
        code: 'unauthorized',
        message: 'No tienes permiso para consultar unidades.',
      },
      CATALOGO_VACIO,
    );

    const { container } = await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(UNIT_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('la seccion no lee la sesion: su fuente no toca cookies, composicion ni permisos', () => {
    const fuente = readFileSync(join(RUTA_PAGINA, 'components', 'unit-list-section.tsx'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    for (const prohibido of ['next/headers', 'cookies(', 'lib/composition', 'requirePermission']) {
      expect(fuente, `la seccion no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('si la SEGUNDA lectura falla, la lista se pinta igual (R17, `design.md > 5.3`)', () => {
  const DERIVADA = unidad({ name: 'Kilogramo', symbol: 'kg', baseUnitId: GRAMO.id, factor: '1000.0000' });

  it('en positivo: con el catalogo resuelto, la equivalencia sale como frase armada', async () => {
    conLecturas(pagina([DERIVADA]), { status: 'success', data: [GRAMO] });

    const { container } = await renderPantalla();

    expect(container.textContent).toContain(formatUnitEquivalence(DERIVADA, GRAMO));
  });

  it('en negativo: con la segunda lectura en error, la tabla se pinta y la celda cae al marcador', async () => {
    conLecturas(pagina([DERIVADA]), {
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar unidades.',
    });

    const { container } = await renderPantalla();

    // La lista NO cae al estado de error: la primera lectura es la que decide (R26).
    expect(screen.getByTestId(UNIT_LIST_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(UNIT_LIST_ERROR_TESTID)).toBeNull();
    // Y la equivalencia degrada al marcador neutro, sin la frase y sin romper la fila (R17).
    expect(container.textContent).toContain(NO_EQUIVALENCE_LABEL);
    expect(container.textContent).not.toContain(formatUnitEquivalence(DERIVADA, GRAMO));
  });
});

/** QC-71 T9 — R17 y R18 en el estado de error de la lista de unidades. */
describe('lista de unidades — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    conLecturas(errorInesperado(), CATALOGO_VACIO);

    await renderPantalla();

    const region = screen.getByTestId(UNIT_LIST_ERROR_TESTID);

    // Identificado por `data-testid`, nunca por su texto: lo prohibe la convencion de esta
    // pantalla. `toHaveTextContent` sigue probando que el identificador esta RENDERIZADO como
    // texto y no escondido en un atributo (R17).
    const referencia = within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    conLecturas(
      { status: 'error', code: 'unauthorized', message: 'No autorizado.' },
      CATALOGO_VACIO,
    );

    await renderPantalla();

    expect(screen.getByTestId(UNIT_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});
