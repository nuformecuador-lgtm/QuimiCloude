import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE_ACONDICIONAMIENTO, SEED_ROLE_PERMISSIONS, type SessionUser } from '@/lib/modules/identity';

const { getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: {},
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

import AsignacionPage from '@/app/(private)/asignacion/page';
import {
  CONDITIONED_ORDER_NOTICE_TESTID,
  ConditionedOrderNotice,
  conditionedOrderNoticeText,
} from '@/app/(private)/asignacion/components';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
  getSessionUserMock.mockResolvedValue({
    id: 'u-acondicionador',
    username: 'acondicionador.prueba',
    displayName: 'Acondicionador de Prueba',
    roleName: 'CUALQUIERA',
    permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? [],
  });
});

/** Busca en el árbol de elementos, sin montarlo, los nodos cuyo `type` sea `objetivo`. */
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

describe('ConditionedOrderNotice — el aviso al volver de Terminar', () => {
  it('R27: dice «Pedido <n> acondicionado» y nunca «entregado»', () => {
    render(<ConditionedOrderNotice orderNumber="2026-0000040" />);

    const aviso = screen.getByTestId(CONDITIONED_ORDER_NOTICE_TESTID);
    expect(aviso).toBeVisible();
    expect(aviso).toHaveTextContent('Pedido 2026-0000040 acondicionado');
    expect(aviso.textContent?.toLowerCase()).not.toContain('entregado');
  });

  it('R27: el texto sale de una función', () => {
    expect(conditionedOrderNoticeText('2026-0000041')).toBe('Pedido 2026-0000041 acondicionado');
  });

  it('R27: usa role="status" para que un lector de pantalla lo anuncie sin mover el foco', () => {
    render(<ConditionedOrderNotice orderNumber="2026-0000042" />);

    expect(screen.getByTestId(CONDITIONED_ORDER_NOTICE_TESTID)).toHaveAttribute('role', 'status');
  });
});

describe('/asignacion pinta el aviso al aterrizar desde Terminar', () => {
  it('R27: con `vista=por_acondicionar&acondicionado=<n>` monta el aviso con ese número', async () => {
    const arbol = await AsignacionPage({
      searchParams: Promise.resolve({ vista: 'por_acondicionar', acondicionado: '2026-0000040' }),
    });

    const [aviso, ...resto] = encontrarPorTipo(arbol, ConditionedOrderNotice);
    expect(resto).toHaveLength(0);
    expect(aviso?.props).toEqual({ orderNumber: '2026-0000040' });
  });

  it('R27: sin el parámetro no hay aviso', async () => {
    const arbol = await AsignacionPage({ searchParams: Promise.resolve({ vista: 'por_acondicionar' }) });

    expect(encontrarPorTipo(arbol, ConditionedOrderNotice)).toHaveLength(0);
  });

  it('R27: en otra pestaña el parámetro no pinta el aviso', async () => {
    const arbol = await AsignacionPage({
      searchParams: Promise.resolve({ vista: 'acondicionados', acondicionado: '2026-0000040' }),
    });

    expect(encontrarPorTipo(arbol, ConditionedOrderNotice)).toHaveLength(0);
  });
});
