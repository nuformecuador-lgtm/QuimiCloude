// `/asignacion` reparte pestañas y sección solo por permiso.
//
// No se renderiza el árbol: `AsignacionPage` se invoca como la invoca el App Router y se inspecciona
// el elemento de React devuelto sin montarlo, el mismo criterio que
// `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`. Las secciones de cada vista son
// componentes de servidor `async` que jsdom no ejecuta, así que no hace falta doblar la base de
// datos ni las Server Actions: basta con comprobar CUÁL elemento se coloca en el árbol y con qué
// props, nunca lo que pinta por dentro.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { Suspense, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  type SessionUser,
} from '@/lib/modules/identity';

const { getSessionUserMock, getSessionContextMock, listPackingOrdersMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  listPackingOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: { listPackingOrders: listPackingOrdersMock },
  // `order-assignment-actions.ts` construye su traductor de errores al cargar el modulo: sin este
  // doble el import de las secciones (aunque nunca se invoquen) rompe la carga del archivo.
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

import AsignacionPage from '@/app/(private)/asignacion/page';
import {
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  AssignmentViewTabs,
  COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT,
  CompanyOrdersListSection,
  CompanyOrdersSkeleton,
  ConditionedOrdersListSection,
  ConditioningOrdersListSection,
  ConditioningOrdersSkeleton,
  FinishedOrdersListSection,
  PackingOrdersListSection,
} from '@/app/(private)/asignacion/components';

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-qc145',
    username: 'usuario.prueba',
    displayName: 'Usuario de Prueba',
    roleName: 'CUALQUIERA',
    permissions,
  };
}

const OPERADOR = ['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar'];
/** Exactamente los permisos sembrados del Empacador: consulta, pero no ejecuta. */
const EMPACADOR = ['asignaciones.consultar', 'terminados.consultar', 'empaque.modificar'];
const ADMINISTRADOR = ['pedidos.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'];
// Sesiones sin rol sembrado: ejecutan y ademas ven «Terminados» (y, la segunda, «Por empacar»).
const EJECUTOR_CON_TERMINADOS = ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'];
const EJECUTOR_CON_EMPAQUE = [
  'asignaciones.consultar',
  'asignaciones.ejecutar',
  'terminados.consultar',
  'empaque.modificar',
];

/** Busca en el árbol de elementos, SIN montarlo, todos los nodos cuyo `type` sea `objetivo`. */
function encontrarPorTipo(nodo: ReactNode, objetivo: unknown, hallazgos: ReactElement[] = []): ReactElement[] {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return hallazgos;
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) encontrarPorTipo(hijo, objetivo, hallazgos);
    return hallazgos;
  }
  if (typeof nodo !== 'object' || !('type' in nodo)) return hallazgos;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  if (elemento.type === objetivo) hallazgos.push(elemento);
  encontrarPorTipo(elemento.props?.children, objetivo, hallazgos);
  return hallazgos;
}

async function invocar(vista?: string) {
  return AsignacionPage({
    searchParams: Promise.resolve(vista === undefined ? {} : { vista }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
  listPackingOrdersMock.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });
});

describe('R11 — Operador: solo «Mis asignados», sin pestañas', () => {
  it('no ofrece `AssignmentViewTabs` y monta `AssignedOrdersListSection` con `vista: "asignados"`', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(OPERADOR));

    const arbol = await invocar();

    expect(encontrarPorTipo(arbol, AssignmentViewTabs)).toHaveLength(0);
    const [seccion] = encontrarPorTipo(arbol, AssignedOrdersListSection);
    expect(seccion).toBeDefined();
    expect(seccion.props).toMatchObject({ vista: 'asignados' });
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, CompanyOrdersListSection)).toHaveLength(0);
  });
});

describe('R12 — quien ejecuta y ve terminados: «Mis asignados» + «Terminados», con pestañas', () => {
  it('ofrece las dos vistas en `AssignmentViewTabs` y, sin `vista` en la URL, monta la primera', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await invocar();

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas).toBeDefined();
    expect(pestanas.props).toMatchObject({ current: 'asignados', views: ['asignados', 'terminados'] });
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(0);
  });

  it('con `?vista=terminados`, monta `FinishedOrdersListSection` y no `AssignedOrdersListSection`', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await invocar('terminados');

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ current: 'terminados' });
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
  });
});

describe('R13 — con `pedidos.consultar`: solo «Todos», sin pestañas', () => {
  it('no ofrece `AssignmentViewTabs`, aunque tenga ademas el permiso de terminados', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(ADMINISTRADOR));

    const arbol = await invocar();

    expect(encontrarPorTipo(arbol, AssignmentViewTabs)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, CompanyOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(0);
  });
});

describe('R15 — una vista inexistente o no permitida cae a la primera, sin error y sin revelarla', () => {
  it('un valor que no es ninguna vista conocida no lanza y sirve «Mis asignados» al Operador', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(OPERADOR));

    const arbol = await invocar('no-existe');

    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
  });

  it('«todos» pedido por quien no la tiene cae a «Mis asignados», y las pestañas siguen ofreciendo solo las suyas', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await invocar('todos');

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ current: 'asignados', views: ['asignados', 'terminados'] });
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, CompanyOrdersListSection)).toHaveLength(0);
  });

  it('«asignados» pedido por un Administrador -que no la tiene- cae a «Todos»', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(ADMINISTRADOR));

    const arbol = await invocar('asignados');

    expect(encontrarPorTipo(arbol, CompanyOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
  });
});

describe('R27 — «Terminados» y «Todos» reciben los mismos parametros de pagina tolerantes', () => {
  it('un `page`/`pageSize` invalidos no hacen fallar la pantalla y llegan acotados a la seccion', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await AsignacionPage({
      searchParams: Promise.resolve({ vista: 'terminados', page: '-3', pageSize: '999' }),
    });

    const [seccion] = encontrarPorTipo(arbol, FinishedOrdersListSection);
    expect(seccion.props).toMatchObject({ params: { page: 1, pageSize: 10 } });
  });
});

describe('R32 — el skeleton de «Todos» suma la columna de fecha con el filtro exacto', () => {
  async function fallbackDeTodos(status?: string) {
    getSessionUserMock.mockResolvedValue(sesionCon(ADMINISTRADOR));
    const arbol = await AsignacionPage({
      searchParams: Promise.resolve(
        status === undefined ? { vista: 'todos' } : { vista: 'todos', status },
      ),
    });
    const [limite] = encontrarPorTipo(arbol, Suspense);
    const fallback = (limite.props as { fallback: ReactElement }).fallback;
    expect(fallback.type).toBe(CompanyOrdersSkeleton);
    return fallback.props as { showFinishedAt?: boolean };
  }

  it.each(['TERMINADO', 'ENTREGADO'])('con exactamente %s, `showFinishedAt: true`', async (status) => {
    expect(await fallbackDeTodos(status)).toMatchObject({ showFinishedAt: true });
  });

  it.each([undefined, 'TERMINADO,ENTREGADO', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'])(
    'con el filtro %s, `showFinishedAt: false`',
    async (status) => {
      expect(await fallbackDeTodos(status)).toMatchObject({ showFinishedAt: false });
    },
  );

  it('con `showFinishedAt` pinta una columna mas que sin ella', () => {
    const { unmount } = render(<CompanyOrdersSkeleton rows={1} />);
    const base = screen.getAllByRole('columnheader').length;
    expect(base).toBe(COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT);
    unmount();

    render(<CompanyOrdersSkeleton rows={1} showFinishedAt />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(base + 1);
    cleanup();
  });
});

describe('R39 — la pestaña «Por empacar» solo aparece con `empaque.modificar`, y al final', () => {
  it('sin el permiso, no se ofrece la pestaña ni se monta la seccion', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await invocar();

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ views: ['asignados', 'terminados'] });
    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(0);
  });

  it('con el permiso, la pestaña se ofrece al final y `?vista=por_empacar` monta la seccion', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_EMPAQUE));

    const arbol = await invocar('por_empacar');

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ views: ['asignados', 'terminados', 'por_empacar'] });
    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(1);
  });

  it('pedida por la direccion sin el permiso, cae a la vista por defecto sin revelar que existe', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_TERMINADOS));

    const arbol = await invocar('por_empacar');

    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
  });

  it('con el permiso, aterriza en «Mis asignados» igual que antes: R39 no cambia el aterrizaje', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EJECUTOR_CON_EMPAQUE));

    const arbol = await invocar();

    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(0);
  });
});

describe('QC-201 — el Empacador sembrado no ejecuta: sin «Mis asignados»', () => {
  it('R19: ve «Terminados» y «Por empacar», aterriza en «Terminados» y no monta «Mis asignados»', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

    const arbol = await invocar();

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ current: 'terminados', views: ['terminados', 'por_empacar'] });
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
  });

  it('R19a: `?vista=asignados` aterriza en «Terminados» sin revelar la vista', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

    const arbol = await invocar('asignados');

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ current: 'terminados', views: ['terminados', 'por_empacar'] });
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
  });

  it('R19: `?vista=por_empacar` monta la seccion de empaque', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

    const arbol = await invocar('por_empacar');

    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
  });
});

describe('QC-201 — `canExecute` baja por props desde la sesion (R10, R11, R11a)', () => {
  it('R11: con `asignaciones.ejecutar`, seccion y skeleton reciben `canExecute: true`', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(OPERADOR));

    const arbol = await invocar();

    const [seccion] = encontrarPorTipo(arbol, AssignedOrdersListSection);
    expect(seccion.props).toMatchObject({ canExecute: true });
    const [limite] = encontrarPorTipo(arbol, Suspense);
    const fallback = (limite.props as { fallback: ReactElement }).fallback;
    expect(fallback.type).toBe(AssignedOrdersSkeleton);
    expect(fallback.props).toMatchObject({ canExecute: true });
  });

  it('R10: sin `asignaciones.ejecutar`, aunque el rol se llame «Operador», la seccion recibe `canExecute: false`', async () => {
    // Solo una sesion artificial llega a la vista «asignados» sin ejecutar: la del fallback de
    // `resolveAssignmentViews` cuando no hay ninguna otra vista.
    getSessionUserMock.mockResolvedValue({
      ...sesionCon(['asignaciones.consultar']),
      roleName: 'Operador',
    });

    const arbol = await invocar();

    const [seccion] = encontrarPorTipo(arbol, AssignedOrdersListSection);
    expect(seccion.props).toMatchObject({ canExecute: false });
    const [limite] = encontrarPorTipo(arbol, Suspense);
    const fallback = (limite.props as { fallback: ReactElement }).fallback;
    expect(fallback.props).toMatchObject({ canExecute: false });
  });

  it('R11a: la pagina decide con `canExecuteAssignedOrders(sessionUser)` y no escribe el codigo del permiso para ello', () => {
    const fuente = readFileSync(
      path.join(process.cwd(), 'app', '(private)', 'asignacion', 'page.tsx'),
      'utf8',
    );

    expect(fuente).toMatch(/canExecuteAssignedOrders\(sessionUser\)/);
    expect(fuente).not.toContain('asignaciones.ejecutar');
    expect(fuente).not.toMatch(/roleName/);
  });
});

describe('las pestañas miden al menos 44x44 px (`design.md > 6.6`)', () => {
  afterEach(() => {
    cleanup();
  });

  it('cada disparador de `AssignmentViewTabs` cumple el objetivo tactil minimo y es un enlace real', () => {
    render(<AssignmentViewTabs current="asignados" views={['asignados', 'terminados']} />);

    const disparadores = screen.getAllByRole('tab');
    expect(disparadores).toHaveLength(2);
    for (const boton of disparadores) {
      expect(boton.className).toContain('min-h-11');
      expect(boton.className).toContain('min-w-11');
      expect(boton.tagName).toBe('A');
      expect(boton).toHaveAttribute('href');
    }
  });

  it('R39 - «Por empacar» se ofrece al final, con su propia etiqueta y objetivo tactil', () => {
    render(
      <AssignmentViewTabs
        current="asignados"
        views={['asignados', 'terminados', 'por_empacar']}
      />,
    );

    const disparadores = screen.getAllByRole('tab');
    expect(disparadores).toHaveLength(3);
    expect(disparadores.at(-1)).toHaveTextContent('Por empacar');
    expect(disparadores.at(-1)?.className).toContain('min-h-11');
    expect(disparadores.at(-1)?.className).toContain('min-w-11');
  });
});

describe('las dos vistas del acondicionador', () => {
  const ACONDICIONADOR = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? [];

  afterEach(() => {
    cleanup();
  });

  it('R2: el rol sembrado ve exactamente «Por acondicionar» y «Terminados» y aterriza en la primera', async () => {
    expect(ACONDICIONADOR).toContain('acondicionamiento.modificar');
    getSessionUserMock.mockResolvedValue(sesionCon(ACONDICIONADOR));

    const arbol = await invocar();

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({
      current: 'por_acondicionar',
      views: ['por_acondicionar', 'acondicionados'],
    });
    expect(encontrarPorTipo(arbol, ConditioningOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, ConditionedOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, PackingOrdersListSection)).toHaveLength(0);
    expect(encontrarPorTipo(arbol, CompanyOrdersListSection)).toHaveLength(0);
  });

  it('R2: la sección de «Por acondicionar» va dentro de Suspense con su esqueleto', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(ACONDICIONADOR));

    const arbol = await invocar('por_acondicionar');

    const [limite] = encontrarPorTipo(arbol, Suspense);
    const fallback = (limite.props as { fallback: ReactElement }).fallback;
    expect(fallback.type).toBe(ConditioningOrdersSkeleton);
    expect(fallback.props).toMatchObject({ list: 'por_acondicionar' });
    const [seccion] = encontrarPorTipo(arbol, ConditioningOrdersListSection);
    expect(seccion.props).toMatchObject({ params: { page: 1, pageSize: 10 } });
  });

  it('R5: `?vista=acondicionados` marca «Terminados» y monta su sección con su esqueleto', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(ACONDICIONADOR));

    const arbol = await invocar('acondicionados');

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas.props).toMatchObject({ current: 'acondicionados' });
    expect(encontrarPorTipo(arbol, ConditionedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, ConditioningOrdersListSection)).toHaveLength(0);
    const [limite] = encontrarPorTipo(arbol, Suspense);
    const fallback = (limite.props as { fallback: ReactElement }).fallback;
    expect(fallback.type).toBe(ConditioningOrdersSkeleton);
    expect(fallback.props).toMatchObject({ list: 'acondicionados' });
  });

  it.each([ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR])(
    'R4: %s pidiendo `?vista=por_acondicionar` o `?vista=acondicionados` cae a su vista por defecto, sin pestaña ni sección',
    async (rol) => {
      getSessionUserMock.mockResolvedValue(sesionCon(SEED_ROLE_PERMISSIONS[rol] ?? []));
      const porDefecto = await invocar();

      for (const vista of ['por_acondicionar', 'acondicionados']) {
        const arbol = await invocar(vista);

        expect(encontrarPorTipo(arbol, ConditioningOrdersListSection)).toHaveLength(0);
        expect(encontrarPorTipo(arbol, ConditionedOrdersListSection)).toHaveLength(0);
        for (const pestanas of encontrarPorTipo(arbol, AssignmentViewTabs)) {
          const props = pestanas.props as { views: readonly string[] };
          expect(props.views).not.toContain('por_acondicionar');
          expect(props.views).not.toContain('acondicionados');
        }
        expect(JSON.stringify(arbol)).toBe(JSON.stringify(porDefecto));
      }
    },
  );

  it('R5: las dos pestañas se rotulan «Por acondicionar» y «Terminados», son enlaces a su vista, marcan la vigente y miden 44x44', () => {
    render(<AssignmentViewTabs current="acondicionados" views={['por_acondicionar', 'acondicionados']} />);

    const disparadores = screen.getAllByRole('tab');
    expect(disparadores.map((tab) => tab.textContent)).toEqual(['Por acondicionar', 'Terminados']);
    expect(screen.getByTestId('assignment-view-tab-por_acondicionar')).toHaveAttribute(
      'href',
      '/asignacion?vista=por_acondicionar',
    );
    const vigente = screen.getByTestId('assignment-view-tab-acondicionados');
    expect(vigente).toHaveAttribute('href', '/asignacion?vista=acondicionados');
    expect(vigente).toHaveAttribute('aria-selected', 'true');
    for (const tab of disparadores) {
      expect(tab.tagName).toBe('A');
      expect(tab.className).toContain('min-h-11');
      expect(tab.className).toContain('min-w-11');
    }
  });
});
