// El detalle del recorrido. La pagina se ejecuta como funcion `async`: el permiso, la accion y
// `notFound` estan simulados, son los bordes de la ruta.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExecutionTracePage from '@/app/(private)/dashboard/recorrido/[id]/page';
import { BACK_TO_LIST_TEXT, ExecutionTraceDetail } from '@/app/(private)/dashboard/recorrido/[id]/components';
import {
  DELETED_ORDER_MARK,
  GO_BACK_MARK,
  createDefaultExecutionTraceListParams,
  executionTraceListHref,
  formatTraceDuration,
} from '@/app/(private)/dashboard/components';
import type { ExecutionTraceDetail as ExecutionTraceDetailData } from '@/lib/modules/asignaciones';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';

const { requirePagePermissionMock, getExecutionTraceActionMock, notFoundMock } = vi.hoisted(() => ({
  requirePagePermissionMock: vi.fn<(code: string) => Promise<void>>(),
  getExecutionTraceActionMock: vi.fn<(orderId: string) => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/require-page-permission', () => ({
  requirePagePermission: requirePagePermissionMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/execution-trace-actions', () => ({
  getExecutionTraceAction: getExecutionTraceActionMock,
  listExecutionTracesAction: vi.fn(),
}));

const ORDER_ID = '0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718';
const MIN = 60 * 1000;

const TRACE: ExecutionTraceDetailData = {
  orderId: ORDER_ID,
  numberText: '2026-0000042',
  status: 'CANCELADO',
  deleted: false,
  firstAt: new Date('2026-10-07T08:00:00.000Z'),
  lastAt: new Date('2026-10-07T08:20:00.000Z'),
  duration: { kind: 'closed', ms: 20 * MIN },
  goBackCount: 1,
  steps: [
    {
      id: 'e1',
      orderId: ORDER_ID,
      userId: 'u1',
      userDisplayName: 'Ana Ruiz',
      action: 'start',
      stepPosition: 1,
      reason: null,
      occurredAt: new Date('2026-10-07T08:00:00.000Z'),
      gapToNextMs: 5 * MIN,
      isGoBack: false,
    },
    {
      id: 'e2',
      orderId: ORDER_ID,
      userId: 'u1',
      userDisplayName: 'Ana Ruiz',
      action: 'advance',
      stepPosition: 2,
      reason: null,
      occurredAt: new Date('2026-10-07T08:05:00.000Z'),
      gapToNextMs: 5 * MIN,
      isGoBack: false,
    },
    {
      id: 'e3',
      orderId: ORDER_ID,
      userId: 'u2',
      userDisplayName: null,
      action: 'go_back',
      stepPosition: 1,
      reason: null,
      occurredAt: new Date('2026-10-07T08:10:00.000Z'),
      gapToNextMs: 10 * MIN,
      isGoBack: true,
    },
    {
      id: 'e4',
      orderId: ORDER_ID,
      userId: 'u1',
      userDisplayName: 'Ana Ruiz',
      action: 'cancel',
      stepPosition: 1,
      reason: 'Falta materia prima',
      occurredAt: new Date('2026-10-07T08:20:00.000Z'),
      gapToNextMs: null,
      isGoBack: false,
    },
  ],
};

async function abrir(searchParams: Record<string, string> = {}, id = ORDER_ID) {
  return ExecutionTracePage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  });
}

function pasos(): HTMLElement[] {
  return screen.getAllByTestId('execution-trace-step');
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePagePermissionMock.mockResolvedValue(undefined);
  getExecutionTraceActionMock.mockResolvedValue({ status: 'success', data: TRACE });
});

afterEach(() => {
  cleanup();
});

describe('R12 - R18 - R20 - la pagina del recorrido', () => {
  it('R20 - exige dashboard.consultar antes de leer el recorrido', async () => {
    await abrir();
    expect(requirePagePermissionMock).toHaveBeenCalledWith('dashboard.consultar');
    expect(requirePagePermissionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getExecutionTraceActionMock.mock.invocationCallOrder[0],
    );
  });

  it('R20 - sin permiso no llega a leer nada', async () => {
    requirePagePermissionMock.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(abrir()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getExecutionTraceActionMock).not.toHaveBeenCalled();
  });

  it('R12 - pide el recorrido del id de la ruta, sin depender de la consulta', async () => {
    await abrir({ page: '2', q: '42' });
    expect(getExecutionTraceActionMock).toHaveBeenCalledWith(ORDER_ID);
  });

  it('R20 - la primera linea de la pagina es el corte por permiso', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(private)/dashboard/recorrido/[id]/page.tsx'),
      'utf8',
    );
    const body = source.slice(source.indexOf('export default async function'));
    const firstStatement = body.slice(body.indexOf('{\n', body.indexOf(') {')) + 2).trim().split('\n')[0];
    expect(firstStatement).toBe("await requirePagePermission('dashboard.consultar');");
  });

  it('R18 - order_not_found responde 404', async () => {
    getExecutionTraceActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_not_found',
      message: 'El pedido solicitado no existe.',
    });
    await expect(abrir()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('R18 - un pedido dado de baja con anotaciones abre su recorrido marcado', async () => {
    getExecutionTraceActionMock.mockResolvedValue({ status: 'success', data: { ...TRACE, deleted: true } });
    render(await abrir());
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('execution-trace-deleted')).toHaveTextContent(DELETED_ORDER_MARK);
  });
});

describe('R13 - R14 - R15 - R16 - lo que muestra el detalle', () => {
  it('R13 - resumen con numero, estado y un unico h1', async () => {
    render(await abrir());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026-0000042');
    expect(screen.getByTestId('execution-trace-status')).toHaveTextContent('Cancelado');
    expect(screen.queryByTestId('execution-trace-deleted')).toBeNull();
  });

  it('R13 - todas las anotaciones en orden, en una lista ordenada, con accion, instante, persona, posicion y motivo', async () => {
    render(await abrir());
    const lista = screen.getByRole('list', { name: 'Anotaciones' });
    expect(lista.tagName).toBe('OL');
    expect(pasos().map((li) => li.getAttribute('data-action'))).toEqual(['start', 'advance', 'go_back', 'cancel']);

    const [primero, , tercero, ultimo] = pasos();
    expect(within(primero).getByTestId('execution-trace-step-action')).toHaveTextContent('Arrancar');
    expect(within(primero).getByTestId('execution-trace-step-instant')).toHaveTextContent('2026-10-07 08:00:00');
    expect(within(primero).getByTestId('execution-trace-step-person')).toHaveTextContent('Ana Ruiz');
    expect(within(primero).getByTestId('execution-trace-step-position')).toHaveTextContent('1');
    expect(within(primero).queryByTestId('execution-trace-step-reason')).toBeNull();
    expect(within(tercero).getByTestId('execution-trace-step-person')).toHaveAccessibleName('Sin dato');
    expect(within(ultimo).getByTestId('execution-trace-step-action')).toHaveTextContent('Cancelar');
    expect(within(ultimo).getByTestId('execution-trace-step-reason')).toHaveTextContent('Falta materia prima');
  });

  it('R14 - cada anotacion salvo la ultima muestra el tramo hasta la siguiente', async () => {
    render(await abrir());
    const tramos = pasos().map((li) => within(li).queryByTestId('execution-trace-step-gap')?.textContent ?? null);
    expect(tramos.slice(0, 3).every((texto) => texto !== null)).toBe(true);
    expect(tramos[0]).toContain('5 min 00 s');
    expect(tramos[2]).toContain('10 min 00 s');
    expect(tramos[3]).toBeNull();
  });

  it('R15 - una sola duracion, la misma cifra que la fila', async () => {
    render(await abrir());
    const duraciones = screen.getAllByTestId('execution-trace-duration');
    expect(duraciones).toHaveLength(1);
    expect(duraciones[0]).toHaveTextContent(formatTraceDuration(TRACE.duration));
  });

  it('R16 - cada retroceder se marca con el texto «Vuelta atrás» y el total coincide', async () => {
    render(await abrir());
    const marcadas = pasos().filter((li) => li.getAttribute('data-go-back') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(within(marcadas[0]).getByTestId('execution-trace-step-go-back')).toHaveTextContent(GO_BACK_MARK);
    expect(screen.getAllByText(GO_BACK_MARK)).toHaveLength(1);
    expect(screen.getByTestId('execution-trace-go-backs')).toHaveTextContent(String(TRACE.goBackCount));
  });
});

describe('R17 - volver a la lista', () => {
  it('R17 - con la consulta del detalle, vuelve a la misma lista', async () => {
    const consulta = { page: '2', pageSize: '25', q: '42', cancelados: '1' };
    render(await abrir(consulta));
    expect(screen.getByRole('link', { name: BACK_TO_LIST_TEXT })).toHaveAttribute(
      'href',
      executionTraceListHref({
        ...createDefaultExecutionTraceListParams(),
        page: 2,
        pageSize: 25,
        orderNumber: '42',
        cancelledOnly: true,
      }),
    );
  });

  it('R17 - sin parametros vuelve a la lista por defecto', async () => {
    render(await abrir());
    expect(screen.getByRole('link', { name: BACK_TO_LIST_TEXT })).toHaveAttribute(
      'href',
      `${DASHBOARD_ROUTE}?page=1&pageSize=10`,
    );
  });

  it('R26 - «Volver» mide 44x44 y es enfocable', () => {
    render(<ExecutionTraceDetail trace={TRACE} backHref={DASHBOARD_ROUTE} />);
    const volver = screen.getByRole('link', { name: BACK_TO_LIST_TEXT });
    expect(volver).toHaveClass('min-h-11', 'min-w-11');
    volver.focus();
    expect(volver).toHaveFocus();
  });
});
