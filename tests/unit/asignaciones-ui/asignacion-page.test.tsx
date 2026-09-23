// `/asignacion` reparte pestañas y sección solo por permiso.
//
// No se renderiza el árbol: `AsignacionPage` se invoca como la invoca el App Router y se inspecciona
// el elemento de React devuelto sin montarlo, el mismo criterio que
// `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`. Las secciones de cada vista son
// componentes de servidor `async` que jsdom no ejecuta, así que no hace falta doblar la base de
// datos ni las Server Actions: basta con comprobar CUÁL elemento se coloca en el árbol y con qué
// props, nunca lo que pinta por dentro.
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/modules/identity';

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
  // `order-assignment-actions.ts` construye su traductor de errores al cargar el modulo: sin este
  // doble el import de las secciones (aunque nunca se invoquen) rompe la carga del archivo.
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

import AsignacionPage from '@/app/(private)/asignacion/page';
import {
  AssignedOrdersListSection,
  AssignmentViewTabs,
  CompanyOrdersListSection,
  FinishedOrdersListSection,
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

const OPERADOR = ['inventario.consultar', 'asignaciones.consultar'];
const EMPACADOR = ['asignaciones.consultar', 'terminados.consultar'];
const ADMINISTRADOR = ['pedidos.consultar', 'asignaciones.consultar', 'terminados.consultar'];

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

describe('R12 — Empacador: «Mis asignados» + «Terminados», con pestañas', () => {
  it('ofrece las dos vistas en `AssignmentViewTabs` y, sin `vista` en la URL, monta la primera', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

    const arbol = await invocar();

    const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
    expect(pestanas).toBeDefined();
    expect(pestanas.props).toMatchObject({ current: 'asignados', views: ['asignados', 'terminados'] });
    expect(encontrarPorTipo(arbol, AssignedOrdersListSection)).toHaveLength(1);
    expect(encontrarPorTipo(arbol, FinishedOrdersListSection)).toHaveLength(0);
  });

  it('con `?vista=terminados`, monta `FinishedOrdersListSection` y no `AssignedOrdersListSection`', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

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

  it('«todos» pedido por un Empacador -que no la tiene- cae a «Mis asignados», y las pestañas siguen ofreciendo solo las suyas', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

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
    getSessionUserMock.mockResolvedValue(sesionCon(EMPACADOR));

    const arbol = await AsignacionPage({
      searchParams: Promise.resolve({ vista: 'terminados', page: '-3', pageSize: '999' }),
    });

    const [seccion] = encontrarPorTipo(arbol, FinishedOrdersListSection);
    expect(seccion.props).toMatchObject({ params: { page: 1, pageSize: 10 } });
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
});
