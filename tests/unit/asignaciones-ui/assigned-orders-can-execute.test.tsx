// La columna «Entrar» se decide en servidor y baja por props: `AssignedOrdersListSection` es un
// Server Component `async`, asi que se le llama como funcion y se renderiza lo que devuelve. La
// accion de lista esta mockeada: es el borde del modulo `asignaciones`.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_COLUMN_ID,
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  AssignedOrdersTable,
  assignedOrdersSkeletonColumnCount,
  buildAssignedOrdersColumns,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import { assignedOrderRoute } from '@/lib/shared/routes';

const { listAssignedOrdersActionMock, routerMock } = vi.hoisted(() => ({
  listAssignedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  listAssignedOrdersAction: listAssignedOrdersActionMock,
}));

const PARAMS: DataTableParams = { page: 1, pageSize: 10, sort: null, filters: {}, search: '' };

const ORDERS: readonly AssignedOrderView[] = [
  {
    id: 'order-1',
    numberText: '2026-000123',
    recipeName: 'Jarabe simple',
    quantity: '12.500',
    priority: 'ALTA',
    status: 'PENDIENTE',
    otherResponsibles: [],
    presentationLines: [],
    unitId: null,
    unitLabel: null,
  },
  {
    id: 'order-2',
    numberText: '2026-000124',
    recipeName: 'Barniz',
    quantity: '3',
    priority: 'BAJA',
    status: 'EN_CURSO',
    otherResponsibles: [],
    presentationLines: [],
    unitId: null,
    unitLabel: null,
  },
];

function enlacesDeEjecucion(): HTMLAnchorElement[] {
  return ORDERS.flatMap((order) =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href="${assignedOrderRoute(order.id)}"]`)),
  );
}

beforeEach(() => {
  listAssignedOrdersActionMock.mockResolvedValue({
    status: 'success',
    data: { items: ORDERS, total: ORDERS.length, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('sin `asignaciones.ejecutar` la tabla no emite «Entrar»', () => {
  it('R10: `buildAssignedOrdersColumns({ canExecute: false })` no declara la columna `enter`', () => {
    const ids = buildAssignedOrdersColumns({ canExecute: false }).map((column) => column.id);

    expect(ids).not.toContain(ASSIGNED_ORDER_ENTER_COLUMN_ID);
    expect(ids).toHaveLength(buildAssignedOrdersColumns({ canExecute: true }).length - 1);
  });

  it('R10: la seccion con `canExecute: false` no pinta cabecera «Entrar» ni enlace a `/asignacion/[id]`', async () => {
    render(await AssignedOrdersListSection({ params: PARAMS, vista: 'asignados', canExecute: false }));

    const tabla = screen.getByTestId('assigned-orders-table');
    expect(within(tabla).queryByRole('columnheader', { name: /Entrar/ })).toBeNull();
    expect(enlacesDeEjecucion()).toHaveLength(0);
    expect(screen.getByText('2026-000123')).toBeInTheDocument();
  });

  it('R10: el esqueleto con `canExecute: false` pinta tantas columnas como la tabla', () => {
    const columnas = buildAssignedOrdersColumns({ canExecute: false }).length;
    expect(assignedOrdersSkeletonColumnCount(false)).toBe(columnas);

    render(<AssignedOrdersSkeleton rows={2} canExecute={false} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(columnas);
    for (const fila of screen.getAllByTestId('assigned-order-row-skeleton')) {
      expect(fila.querySelectorAll('td')).toHaveLength(columnas);
    }
  });
});

describe('con `asignaciones.ejecutar` la tabla queda como hoy', () => {
  it('R11: la seccion con `canExecute: true` pinta «Entrar» con su enlace a cada pedido', async () => {
    render(await AssignedOrdersListSection({ params: PARAMS, vista: 'asignados', canExecute: true }));

    expect(buildAssignedOrdersColumns({ canExecute: true }).at(-1)?.id).toBe(
      ASSIGNED_ORDER_ENTER_COLUMN_ID,
    );
    expect(enlacesDeEjecucion().length).toBeGreaterThanOrEqual(ORDERS.length);
  });

  it('R11: el esqueleto con `canExecute: true` pinta tantas columnas como la tabla', () => {
    const columnas = buildAssignedOrdersColumns({ canExecute: true }).length;
    expect(assignedOrdersSkeletonColumnCount(true)).toBe(columnas);

    render(<AssignedOrdersSkeleton rows={1} canExecute />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(columnas);
  });

  it('R11: la tabla cliente recalcula las columnas cuando cambia `canExecute`', () => {
    const { rerender } = render(
      <AssignedOrdersTable rows={ORDERS} params={PARAMS} totalPages={1} vista="asignados" canExecute />,
    );
    expect(enlacesDeEjecucion().length).toBeGreaterThanOrEqual(ORDERS.length);

    rerender(
      <AssignedOrdersTable
        rows={ORDERS}
        params={PARAMS}
        totalPages={1}
        vista="asignados"
        canExecute={false}
      />,
    );
    expect(enlacesDeEjecucion()).toHaveLength(0);
  });
});

describe('la decision no se toma en los componentes', () => {
  it('R11a: ni la seccion, ni la tabla, ni las columnas, ni el esqueleto leen el rol o escriben el codigo del permiso', () => {
    const carpeta = path.join(process.cwd(), 'app', '(private)', 'asignacion', 'components');
    for (const archivo of [
      'assigned-orders-list-section.tsx',
      'assigned-orders-table.tsx',
      'assigned-orders-columns.tsx',
      'assigned-orders-skeleton.tsx',
      'assigned-order-enter-trigger.tsx',
    ]) {
      const fuente = readFileSync(path.join(carpeta, archivo), 'utf8');
      expect(fuente, archivo).not.toContain('asignaciones.ejecutar');
      expect(fuente, archivo).not.toMatch(/roleName|ROLE_/);
    }
  });
});
