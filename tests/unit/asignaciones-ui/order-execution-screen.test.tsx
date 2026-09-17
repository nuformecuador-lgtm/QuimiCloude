import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  ORDER_EXECUTION_CONFIRMATION_TESTID,
  ORDER_EXECUTION_RECIPE_NAME_TESTID,
  ORDER_EXECUTION_SCREEN_TESTID,
  OrderExecutionScreen,
} from '@/app/(private)/asignacion/[id]/components';
import type { AssignedOrderExecutionView } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

/**
 * El recorrido completo: R15, R18, R19, R20, R21, R26.
 */

const { routerMock, finishAssignedOrderActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  finishAssignedOrderActionMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  finishAssignedOrderAction: finishAssignedOrderActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LITRO = { id: 'unit-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null } as const;
const MILILITRO = {
  id: 'unit-ml',
  name: 'Mililitro',
  symbol: 'ml',
  baseUnitId: 'unit-l',
  factor: '0.001',
} as const;

const EXECUTION: AssignedOrderExecutionView = {
  orderId: 'order-1',
  numberText: 'PED-0007',
  status: 'EN_CURSO',
  recipeName: 'Barniz acrílico',
  orderQuantity: '250',
  recipeBaseQuantity: null,
  scaleFactorText: null,
  steps: [
    {
      blocks: [
        { kind: 'paragraph', spans: [{ text: 'Verifica el equipo antes de cargar' }] },
        { kind: 'checklist', items: [{ spans: [{ text: 'Guantes puestos' }] }] },
      ],
    },
  ],
  lines: [
    {
      productName: 'Resina acrílica',
      quantity: '10',
      unit: LITRO,
      alternativeUnits: [MILILITRO],
    },
  ],
};

async function marcarTodo(user: ReturnType<typeof setupUser>): Promise<void> {
  for (const casilla of screen.queryAllByRole('checkbox')) {
    if (casilla.getAttribute('aria-checked') !== 'true') {
      await user.click(casilla);
    }
  }
}

describe('pantalla de ejecucion — R21: el factor y las cantidades tal cual estan escritas', () => {
  it('muestra la cantidad del pedido y la cantidad de la linea CARACTER A CARACTER', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.getByText(new RegExp(EXECUTION.orderQuantity))).toBeVisible();
    expect(screen.getByText(EXECUTION.lines[0]!.quantity, { exact: false })).toBeVisible();
  });

  it('sin cantidad base de receta no pinta ningun factor inventado', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.queryByTestId('order-scale-banner-factor')).toBeNull();
  });
});

describe('pantalla de ejecucion — R19: bloqueo sin escape con el motivo visible', () => {
  it('no permite finalizar mientras queden items sin marcar, y no invoca la operacion', async () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    const finalizar = screen.getByTestId('step-reader-finish');
    expect(finalizar).toBeDisabled();
    expect(screen.getByTestId('step-reader-blocked-reason')).toBeVisible();

    expect(finishAssignedOrderActionMock).not.toHaveBeenCalled();
  });
});

describe('pantalla de ejecucion — R15: confirmacion visible y vuelta a la lista', () => {
  it('al finalizar muestra la confirmacion y navega a la lista de pedidos asignados', async () => {
    finishAssignedOrderActionMock.mockResolvedValue({ status: 'success' });
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-finish'));

    expect(await screen.findByTestId(ORDER_EXECUTION_CONFIRMATION_TESTID)).toBeVisible();
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(ASSIGNED_ORDERS_ROUTE));
  });

  it('si la operacion falla, muestra el error y NO muestra la confirmacion', async () => {
    finishAssignedOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_delivered_frozen',
      message: 'Un pedido entregado conserva sus responsables tal como estaban.',
    });
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-finish'));

    expect(await screen.findByTestId('order-execution-finish-error')).toBeVisible();
    expect(screen.queryByTestId(ORDER_EXECUTION_CONFIRMATION_TESTID)).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('pantalla de ejecucion — R20: ningun control de edicion', () => {
  it('no ofrece ningun campo de texto ni area de edicion', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByTestId(ORDER_EXECUTION_RECIPE_NAME_TESTID)).toHaveTextContent(
      EXECUTION.recipeName as string,
    );
  });
});

describe('pantalla de ejecucion — R26: objetivos tactiles de 44x44 en todo control nuevo', () => {
  /** Las dos clases que, en este repo, SON el objetivo tactil de 44x44. */
  function esObjetivoTactil(elemento: Element): boolean {
    return elemento.className.includes('min-h-11') && elemento.className.includes('min-w-11');
  }

  it('todo boton y todo selector de la pantalla cumple el objetivo tactil minimo', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    const controles = [
      ...Array.from(document.querySelectorAll('button')),
      ...Array.from(document.querySelectorAll('[data-slot="select-trigger"]')),
      ...Array.from(document.querySelectorAll('[data-slot="checkbox"]')),
    ];

    expect(controles.length).toBeGreaterThan(0);
    for (const control of controles) {
      expect(esObjetivoTactil(control), control.outerHTML).toBe(true);
    }
  });

  it('no usa `100vh` en su contenedor: usa `min-h-dvh`', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.getByTestId(ORDER_EXECUTION_SCREEN_TESTID).parentElement?.className).toContain(
      'min-h-dvh',
    );
  });
});

describe('R1 — ningun literal de ruta nuevo en la pagina', () => {
  it('page.tsx no incrusta `/asignacion` como cadena: la direccion la resuelve el App Router', () => {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const PAGINA = join(
      HERE,
      '..',
      '..',
      '..',
      'app',
      '(private)',
      'asignacion',
      '[id]',
      'page.tsx',
    );
    const fuente = readFileSync(PAGINA, 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(fuente).not.toMatch(/['"`]\/asignacion/);
  });
});

describe('R18 — el asistente heredado no aparece en el diff de esta rama', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(HERE, '..', '..', '..');

  function git(args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  }

  function mergeBaseConDev(): string | null {
    try {
      return git(['merge-base', 'origin/dev', 'HEAD']).trim();
    } catch {
      return null;
    }
  }

  it('`components/shared/step-reader/**` no cambia respecto a la base de fusion', (ctx) => {
    const base = mergeBaseConDev();
    if (base === null) {
      ctx.skip(
        'no se pudo calcular `git merge-base origin/dev HEAD`: este caso NO ha comprobado nada.',
      );
      return;
    }

    const cambiados = git(['diff', '--name-only', base, '--', 'components/shared/step-reader'])
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '');

    expect(
      cambiados,
      `esta rama modifico el asistente heredado: ${cambiados.join(', ')}`,
    ).toEqual([]);
  });
});
