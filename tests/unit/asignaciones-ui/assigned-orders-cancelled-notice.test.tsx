// La lista de pedidos asignados confirma una cancelacion al volver de la pantalla de ejecucion.
//
// `AsignacionPage` se invoca como la invoca el App Router y se inspecciona el elemento devuelto sin
// montar las secciones de cada vista (son Server Components `async`); el aviso hallado si se monta,
// para afirmar su texto y su `role`.
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/modules/identity';

const { getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: { listPackingOrders: vi.fn() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

import {
  ASSIGNED_ORDER_CANCELLED_TESTID,
  AssignedOrderCancelledNotice,
  AssignmentViewTabs,
} from '@/app/(private)/asignacion/components';
import AsignacionPage from '@/app/(private)/asignacion/page';
import { CANCELLED_ORDER_PARAM } from '@/lib/shared/routes';

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-cancelado',
    username: 'usuario.prueba',
    displayName: 'Usuario de Prueba',
    roleName: 'CUALQUIERA',
    permissions,
  };
}

const CON_TRES_VISTAS = [
  'asignaciones.consultar',
  'asignaciones.ejecutar',
  'terminados.consultar',
  'empaque.modificar',
];
const CON_TODOS = ['pedidos.consultar', 'asignaciones.consultar', 'empaque.modificar'];

function encontrarPorTipo(
  nodo: ReactNode,
  objetivo: unknown,
  hallazgos: ReactElement[] = [],
): ReactElement[] {
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

/** Hijos directos del contenedor de la pagina, aplanados, para comparar el orden. */
function hijosDeLaPagina(arbol: ReactElement): unknown[] {
  const raiz = arbol as ReactElement<{ children?: ReactNode }>;
  return [raiz.props.children].flat(Infinity);
}

async function invocar(searchParams: Record<string, string>) {
  return (await AsignacionPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
});

afterEach(() => {
  cleanup();
});

describe('lista de pedidos asignados: confirmacion de cancelacion', () => {
  it.each([
    { permisos: CON_TRES_VISTAS, vista: 'asignados' },
    { permisos: CON_TRES_VISTAS, vista: 'terminados' },
    { permisos: CON_TRES_VISTAS, vista: 'por_empacar' },
    { permisos: CON_TODOS, vista: 'todos' },
  ])(
    'R25: con el parametro, en la vista $vista enseña «Pedido 2026-0000007 cancelado» con role="status", encima de las pestañas',
    async ({ permisos, vista }) => {
      getSessionUserMock.mockResolvedValue(sesionCon(permisos));

      const arbol = await invocar({ vista, [CANCELLED_ORDER_PARAM]: '2026-0000007' });

      const avisos = encontrarPorTipo(arbol, AssignedOrderCancelledNotice);
      expect(avisos).toHaveLength(1);

      const hijos = hijosDeLaPagina(arbol);
      const [pestanas] = encontrarPorTipo(arbol, AssignmentViewTabs);
      expect(pestanas).toBeDefined();
      expect(hijos.indexOf(avisos[0])).toBeGreaterThanOrEqual(0);
      expect(hijos.indexOf(avisos[0])).toBeLessThan(hijos.indexOf(pestanas));

      render(avisos[0]);
      const aviso = screen.getByTestId(ASSIGNED_ORDER_CANCELLED_TESTID);
      expect(aviso).toHaveAttribute('role', 'status');
      expect(aviso).toHaveTextContent('Pedido 2026-0000007 cancelado');
      expect(screen.getByRole('status')).toBe(aviso);
    },
  );

  it('R25: sin el parametro, no pinta ningun aviso de cancelacion', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(CON_TRES_VISTAS));

    const arbol = await invocar({});

    expect(encontrarPorTipo(arbol, AssignedOrderCancelledNotice)).toHaveLength(0);
  });
});
