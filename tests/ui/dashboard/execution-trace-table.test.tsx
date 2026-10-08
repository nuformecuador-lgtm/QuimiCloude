// La lista de pedidos ejecutados del dashboard. `useRouter` esta simulado: lo que se afirma es la
// URL exacta que recibe `router.push`. La accion de lista esta simulada: es el borde del modulo.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_ORDER_MARK,
  CANCELLED_ONLY_LABEL,
  DELETED_ORDER_MARK,
  EXECUTION_TRACE_SECTION_TESTID,
  ExecutionTraceListSection,
  ExecutionTraceTable,
  LAST_AT_COLUMN_ID,
  PERSON_COLUMN_ID,
  TRACE_LINK_TEXT,
  createDefaultExecutionTraceListParams,
  executionTraceListHref,
  formatTraceDuration,
  type ExecutionTraceListParams,
} from '@/app/(private)/dashboard/components';
import { SEARCH_DEBOUNCE_MS } from '@/components/shared/data-table';
import type { ExecutionTracePerson, ExecutionTraceRow } from '@/lib/modules/asignaciones';
import { executionTraceRoute } from '@/lib/shared/routes';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock, listExecutionTracesActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listExecutionTracesActionMock: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/execution-trace-actions', () => ({
  listExecutionTracesAction: listExecutionTracesActionMock,
  getExecutionTraceAction: vi.fn(),
}));

const ANA: ExecutionTracePerson = { userId: '3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f', displayName: 'Ana Ruiz' };
const LUIS: ExecutionTracePerson = { userId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', displayName: 'Luis Gil' };

const ACTIVO: ExecutionTraceRow = {
  orderId: 'o-activo',
  numberText: '2026-0000042',
  status: 'EN_CURSO',
  deleted: false,
  people: [ANA],
  firstAt: new Date('2026-10-07T08:00:00.000Z'),
  lastAt: new Date('2026-10-07T08:30:00.000Z'),
  duration: { kind: 'open', ms: 45 * 60 * 1000 },
  goBackCount: 2,
};

const DE_BAJA: ExecutionTraceRow = {
  orderId: 'o-baja',
  numberText: '2026-0000041',
  status: 'EN_CURSO',
  deleted: true,
  people: [ANA, LUIS],
  firstAt: new Date('2026-10-06T08:00:00.000Z'),
  lastAt: new Date('2026-10-06T09:00:00.000Z'),
  duration: { kind: 'unclosed', ms: 60 * 60 * 1000 },
  goBackCount: 0,
};

const CERRADO: ExecutionTraceRow = {
  orderId: 'o-cerrado',
  numberText: '2026-0000040',
  status: 'ENTREGADO',
  deleted: false,
  people: [LUIS],
  firstAt: new Date('2026-10-05T08:00:00.000Z'),
  lastAt: new Date('2026-10-05T09:05:00.000Z'),
  duration: { kind: 'closed', ms: 65 * 60 * 1000 },
  goBackCount: 1,
};

const ROWS = [ACTIVO, DE_BAJA, CERRADO];

const ACTIVO_POR_EMPACAR: ExecutionTraceRow = {
  orderId: 'o-por-empacar',
  numberText: '2026-0000043',
  status: 'POR_EMPACAR',
  deleted: false,
  people: [LUIS],
  firstAt: new Date('2026-10-07T07:00:00.000Z'),
  lastAt: new Date('2026-10-07T07:40:00.000Z'),
  duration: { kind: 'open', ms: 50 * 60 * 1000 },
  goBackCount: 0,
};

function params(overrides: Partial<ExecutionTraceListParams> = {}): ExecutionTraceListParams {
  return { ...createDefaultExecutionTraceListParams(), ...overrides };
}

function montar(p: ExecutionTraceListParams = params(), totalPages = 3) {
  render(<ExecutionTraceTable rows={ROWS} personOptions={[ANA, LUIS]} params={p} totalPages={totalPages} />);
  return p;
}

function ultimoDestino(): string {
  const llamadas = routerMock.push.mock.calls;
  return llamadas[llamadas.length - 1]?.[0] ?? '';
}

function fila(orderId: string): HTMLElement {
  return screen.getByTestId(`data-table-row-${orderId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('R2 - columnas de la fila', () => {
  it('R2 - numero, estado, personas, primera y ultima anotacion, una duracion, vueltas y enlace', () => {
    montar();
    const cabeceras = screen.getAllByRole('columnheader').map((th) => th.textContent ?? '');
    for (const etiqueta of [
      'Nº de pedido',
      'Estado',
      'Personas',
      'Primera anotación',
      'Última anotación',
      'Duración',
      'Vueltas atrás',
      'Recorrido',
    ]) {
      expect(cabeceras.some((texto) => texto.includes(etiqueta))).toBe(true);
    }
    expect(cabeceras.filter((texto) => texto.includes('Duración'))).toHaveLength(1);

    const activa = fila(ACTIVO.orderId);
    expect(within(activa).getByTestId('execution-trace-number')).toHaveTextContent('2026-0000042');
    expect(within(activa).getByText('2026-10-07 08:00:00')).toBeInTheDocument();
    expect(within(activa).getByText('2026-10-07 08:30:00')).toBeInTheDocument();
    expect(within(activa).getByRole('img', { name: ANA.displayName })).toBeInTheDocument();
  });

  it('R2 - la fila dada de baja lleva el texto «Dado de baja» visible, sin depender de hover', () => {
    montar();
    const marca = within(fila(DE_BAJA.orderId)).getByTestId('execution-trace-deleted');
    expect(marca).toHaveTextContent(DELETED_ORDER_MARK);
    expect(marca).toBeVisible();
    expect(within(fila(ACTIVO.orderId)).queryByTestId('execution-trace-deleted')).toBeNull();
  });

  it('R16 - las vueltas atras muestran la cifra del dominio', () => {
    montar();
    expect(within(fila(ACTIVO.orderId)).getByTestId('execution-trace-go-backs')).toHaveTextContent('2');
    expect(within(fila(CERRADO.orderId)).getByTestId('execution-trace-go-backs')).toHaveTextContent('1');
  });
});

describe('R3 - R15 - en curso y duracion', () => {
  it('R3 - la fila activa se marca «En curso» y su duracion es abierta', () => {
    montar();
    const activa = fila(ACTIVO.orderId);
    expect(within(activa).getByTestId('execution-trace-status')).toHaveTextContent('En curso');
    expect(within(activa).getByTestId('execution-trace-duration')).toHaveTextContent('45 min 00 s (en curso)');
  });

  it('R3 - una fila activa en POR_EMPACAR lleva la marca «En curso» aparte del estado y su duracion abierta', () => {
    render(
      <ExecutionTraceTable
        rows={[ACTIVO_POR_EMPACAR, ...ROWS]}
        personOptions={[ANA, LUIS]}
        params={params()}
        totalPages={1}
      />,
    );
    const activa = fila(ACTIVO_POR_EMPACAR.orderId);
    expect(within(activa).getByTestId('execution-trace-active')).toHaveTextContent(ACTIVE_ORDER_MARK);
    expect(within(activa).getByTestId('execution-trace-status')).toHaveTextContent('Por empacar');
    expect(within(activa).getByTestId('execution-trace-duration')).toHaveTextContent('50 min 00 s (en curso)');
    expect(within(fila(ACTIVO.orderId)).getByTestId('execution-trace-active')).toHaveTextContent(ACTIVE_ORDER_MARK);
  });

  it('R3 - la fila dada de baja en EN_CURSO no lleva la marca de actividad aunque su estado diga «En curso»', () => {
    montar();
    const baja = fila(DE_BAJA.orderId);
    expect(within(baja).queryByTestId('execution-trace-active')).toBeNull();
    expect(within(baja).getByTestId('execution-trace-status')).toHaveTextContent('En curso');
    expect(within(baja).getByTestId('execution-trace-deleted')).toBeInTheDocument();
  });

  it('R3 - una fila cerrada no lleva la marca de actividad', () => {
    montar();
    expect(within(fila(CERRADO.orderId)).queryByTestId('execution-trace-active')).toBeNull();
  });

  it('R15 - una sola cifra por fila, la del formateador, con su marca de cierre', () => {
    montar();
    expect(within(fila(CERRADO.orderId)).getByTestId('execution-trace-duration')).toHaveTextContent(
      formatTraceDuration(CERRADO.duration),
    );
    expect(within(fila(DE_BAJA.orderId)).getByTestId('execution-trace-duration')).toHaveTextContent(
      '1 h 00 min (sin cierre anotado)',
    );
  });
});

describe('R4 - el orden lo pone el servidor', () => {
  it('R4 - ninguna columna ofrece ordenar y las filas salen en el orden recibido', () => {
    montar();
    expect(screen.queryByRole('menuitem', { name: /orden/i })).toBeNull();
    const ids = screen.getAllByRole('row').slice(1).map((tr) => tr.getAttribute('data-testid'));
    expect(ids).toEqual(ROWS.map((row) => `data-table-row-${row.orderId}`));
  });
});

describe('R6 - R7 - R8 - R9 - R11 - los filtros navegan a la URL desde la pagina 1', () => {
  it('R6 - buscar un numero navega con q y page 1', async () => {
    vi.useFakeTimers();
    const p = montar(params({ page: 3, pageSize: 25 }));
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: '42' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    vi.useRealTimers();
    expect(ultimoDestino()).toBe(executionTraceListHref({ ...p, page: 1, orderNumber: '42' }));
  });

  it('R7 - el filtro de persona ofrece las personas del servidor y navega con persona y page 1', async () => {
    const user = setupUser();
    const p = montar(params({ page: 2 }));
    fireEvent.click(screen.getByTestId(`data-table-filter-${PERSON_COLUMN_ID}`));
    expect(
      await screen.findByTestId(`data-table-filter-option-${PERSON_COLUMN_ID}-${LUIS.userId}`),
    ).toHaveTextContent(LUIS.displayName);
    await user.click(
      await esperarInteractiva(
        screen.getByTestId(`data-table-filter-option-${PERSON_COLUMN_ID}-${ANA.userId}`),
      ),
    );
    expect(ultimoDestino()).toBe(executionTraceListHref({ ...p, page: 1, userId: ANA.userId }));
  });

  it('R8 - el rango de fechas navega con desde, hasta y page 1', async () => {
    const user = setupUser();
    montar(params({ page: 2 }));
    fireEvent.click(screen.getByTestId(`data-table-filter-date-${LAST_AT_COLUMN_ID}`));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-date-last-week')));
    const destino = new URL(ultimoDestino(), 'http://localhost');
    expect(destino.searchParams.get('desde')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(destino.searchParams.get('hasta')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(destino.searchParams.get('page')).toBe('1');
  });

  it('R9 - el interruptor «solo cancelados» navega con cancelados=1 y page 1', async () => {
    const user = setupUser();
    const p = montar(params({ page: 2, orderNumber: '42' }));
    await user.click(screen.getByRole('checkbox', { name: CANCELLED_ONLY_LABEL }));
    expect(ultimoDestino()).toBe(executionTraceListHref({ ...p, page: 1, cancelledOnly: true }));
  });

  it('R11 - paginar conserva los filtros', async () => {
    const user = setupUser();
    const p = montar(params({ page: 1, orderNumber: '42', userId: ANA.userId, cancelledOnly: true }));
    await user.click(screen.getByTestId('data-table-next'));
    expect(ultimoDestino()).toBe(executionTraceListHref({ ...p, page: 2 }));
  });

  it('R5 - cambiar el tamano a 25 vuelve a la pagina 1 y conserva los filtros', async () => {
    const user = setupUser();
    const p = montar(params({ page: 3, orderNumber: '42' }));
    fireEvent.click(screen.getByTestId('data-table-page-size'));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-page-size-25')));
    expect(ultimoDestino()).toBe(executionTraceListHref({ ...p, page: 1, pageSize: 25 }));
  });
});

describe('R12 - R17 - el enlace de cada fila', () => {
  it('R12 - el enlace es executionTraceRoute(id) con la consulta actual', () => {
    const p = montar(params({ page: 2, orderNumber: '42' }));
    const enlace = within(fila(ACTIVO.orderId)).getByRole('link', { name: new RegExp(TRACE_LINK_TEXT) });
    const href = enlace.getAttribute('href') ?? '';
    expect(href.startsWith(`${executionTraceRoute(ACTIVO.orderId)}?`)).toBe(true);
    expect(href.split('?')[1]).toBe(executionTraceListHref(p).split('?')[1]);
  });
});

describe('R26 - controles tactiles y de teclado', () => {
  it('R26 - el interruptor tiene etiqueta accesible, 44x44 y se opera con teclado', async () => {
    const user = setupUser();
    montar();
    const interruptor = screen.getByRole('checkbox', { name: CANCELLED_ONLY_LABEL });
    expect(interruptor).toHaveClass('min-h-11', 'min-w-11');
    interruptor.focus();
    await user.keyboard(' ');
    expect(ultimoDestino()).toContain('cancelados=1');
  });

  it('R26 - el enlace de cada fila mide 44x44 y es enfocable', () => {
    montar();
    const enlace = within(fila(ACTIVO.orderId)).getByRole('link', { name: new RegExp(TRACE_LINK_TEXT) });
    expect(enlace).toHaveClass('min-h-11', 'min-w-11');
    enlace.focus();
    expect(enlace).toHaveFocus();
  });
});

describe('R1 - R5 - la seccion pide la lista y la monta', () => {
  it('R1 - con datos, monta la tabla con los pedidos ejecutados, en curso y dados de baja incluidos', async () => {
    listExecutionTracesActionMock.mockResolvedValue({
      status: 'success',
      data: {
        page: { items: ROWS, total: 3, page: 1, pageSize: 10, totalPages: 1 },
        personOptions: [ANA, LUIS],
      },
    });
    render(await ExecutionTraceListSection({ params: params() }));
    const seccion = screen.getByTestId(EXECUTION_TRACE_SECTION_TESTID);
    expect(within(seccion).getByTestId('execution-trace-table')).toBeInTheDocument();
    expect(within(seccion).getByTestId(`data-table-row-${ACTIVO.orderId}`)).toBeInTheDocument();
    expect(within(seccion).getByTestId(`data-table-row-${DE_BAJA.orderId}`)).toBeInTheDocument();
    expect(within(seccion).getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(within(seccion).queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('R5 - R6 - R7 - R8 - R9 - la accion recibe los parametros de la URL ya acotados', async () => {
    listExecutionTracesActionMock.mockResolvedValue({
      status: 'success',
      data: { page: { items: [], total: 0, page: 2, pageSize: 25, totalPages: 1 }, personOptions: [] },
    });
    await ExecutionTraceListSection({
      params: params({
        page: 2,
        pageSize: 25,
        orderNumber: 'abc',
        userId: ANA.userId,
        from: '2026-10-01',
        to: '2026-10-07',
        cancelledOnly: true,
      }),
    });
    expect(listExecutionTracesActionMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      orderNumber: 'abc',
      userId: ANA.userId,
      from: '2026-10-01',
      to: '2026-10-07',
      cancelledOnly: true,
    });
  });

  it('R1 - un error de la accion se avisa dentro del area sin tumbar la pantalla', async () => {
    listExecutionTracesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    render(await ExecutionTraceListSection({ params: params() }));
    const seccion = screen.getByTestId(EXECUTION_TRACE_SECTION_TESTID);
    expect(within(seccion).getByRole('alert')).toBeInTheDocument();
    expect(within(seccion).queryByTestId('execution-trace-table')).toBeNull();
  });
});
