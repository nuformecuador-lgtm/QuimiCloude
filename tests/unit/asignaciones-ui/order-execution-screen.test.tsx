import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_EXECUTION_ORDER_ID_FIELD,
  ORDER_EXECUTION_ORDER_QUANTITY_TESTID,
  ORDER_EXECUTION_RECIPE_NAME_TESTID,
  ORDER_EXECUTION_SCREEN_TESTID,
  OrderExecutionScreen,
} from '@/app/(private)/asignacion/[id]/components';
import type { AssignedOrderExecutionView } from '@/lib/modules/asignaciones';

/**
 * El recorrido completo: R18, R19, R20, R21, R26. La confirmacion visible de R15 vive en la
 * lista de pedidos asignados, no en esta pantalla: ver `assigned-orders-states.test.tsx`.
 */

const { finishAssignedOrderActionMock } = vi.hoisted(() => ({
  finishAssignedOrderActionMock: vi.fn(),
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
      percentage: '10.00',
      quantity: '10',
      unit: LITRO,
      alternativeUnits: [MILILITRO],
    },
  ],
};

function marcarTodo(): void {
  for (const casilla of screen.queryAllByRole('checkbox')) {
    if (casilla.getAttribute('aria-checked') !== 'true') {
      fireEvent.click(casilla);
    }
  }
}

// Un paso sin lista de verificacion: aisla la espera de tiempo del bloqueo por elementos.
const EXECUTION_SIN_ELEMENTOS: AssignedOrderExecutionView = {
  ...EXECUTION,
  steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso sin elementos pendientes' }] }] }],
};

const EXECUTION_DOS_PASOS: AssignedOrderExecutionView = {
  ...EXECUTION,
  steps: [
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso uno sin elementos' }] }] },
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso dos sin elementos' }] }] },
  ],
};

describe('pantalla de ejecucion — R21: el factor y las cantidades tal cual estan escritas', () => {
  it('muestra la cantidad del pedido y la cantidad de la linea CARACTER A CARACTER', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.getByText(new RegExp(EXECUTION.orderQuantity))).toBeVisible();
    expect(screen.getByTestId('order-execution-line-quantity-0')).toHaveTextContent(
      EXECUTION.lines[0]!.quantity,
    );
  });
});

describe('pantalla de ejecucion — QC-147 R19: sin ningun factor de escala', () => {
  it('no monta ningun banner ni factor de escala: `order-scale-banner` se borro', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.queryByTestId('order-scale-banner')).toBeNull();
    expect(screen.queryByTestId('order-scale-banner-factor')).toBeNull();
  });
});

describe('pantalla de ejecucion — QC-147 R26: la cantidad del pedido en su propia linea', () => {
  it('pinta "Pedido 250" en un elemento propio con su testid, fuera de la lista de lineas', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    const cantidadPedido = screen.getByTestId(ORDER_EXECUTION_ORDER_QUANTITY_TESTID);
    expect(cantidadPedido).toHaveTextContent('Pedido 250');
    expect(cantidadPedido.closest('[data-testid="order-execution-lines"]')).toBeNull();
  });

  it('pinta "Pedido 200" cuando la cantidad del pedido llega con ceros de relleno', () => {
    render(<OrderExecutionScreen execution={{ ...EXECUTION, orderQuantity: '200.0000' }} />);

    expect(screen.getByTestId(ORDER_EXECUTION_ORDER_QUANTITY_TESTID)).toHaveTextContent(
      'Pedido 200',
    );
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

describe('pantalla de ejecucion — R4: la espera minima de 5 segundos por paso', () => {
  it('a los 4999 ms el avance sigue impedido y a los 5000 ms deja de estarlo', async () => {
    vi.useFakeTimers();
    try {
      render(<OrderExecutionScreen execution={EXECUTION_SIN_ELEMENTOS} />);
      const finalizar = screen.getByTestId('step-reader-finish');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4999);
      });
      expect(finalizar).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(finalizar).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pantalla de ejecucion — R5: la cuenta del primer paso arranca sola', () => {
  it('muestra la cuenta completa al montar sin ninguna accion del usuario y no ofrece ningun control "Comenzar"', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');
    expect(screen.queryByRole('button', { name: /comenzar/i })).toBeNull();
    expect(screen.queryByText(/comenzar/i)).toBeNull();
  });
});

describe('pantalla de ejecucion — el error de la operacion se muestra sin bloquear la pantalla', () => {
  it('si la operacion falla, muestra el error', async () => {
    // Enmienda 2026-09-18 (QC-125): la pantalla ahora exige 5 s por paso, asi que el camino de
    // error tiene que cumplirlos antes de pulsar Finalizar.
    finishAssignedOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_delivered_frozen',
      message: 'Un pedido entregado conserva sus responsables tal como estaban.',
    });
    vi.useFakeTimers();
    try {
      render(<OrderExecutionScreen execution={EXECUTION} />);
      marcarTodo();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      // El reloj falso solo hacia falta para cumplir la espera; el resto de la aserción sigue
      // con temporizadores reales, como el resto del archivo.
      vi.useRealTimers();
    }

    fireEvent.click(screen.getByTestId('step-reader-finish'));

    expect(await screen.findByTestId('order-execution-finish-error')).toBeVisible();
  });
});

describe('pantalla de ejecucion — R13: el ultimo paso tambien espera', () => {
  it('pulsar Finalizar antes de los 5 s no invoca finishAssignedOrderAction', async () => {
    vi.useFakeTimers();
    try {
      render(<OrderExecutionScreen execution={EXECUTION_SIN_ELEMENTOS} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      fireEvent.click(screen.getByTestId('step-reader-finish'));

      expect(finishAssignedOrderActionMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pantalla de ejecucion — R18: el envio no lleva la espera y remontar la reinicia', () => {
  it('el FormData enviado tras cumplir la espera y finalizar solo lleva orderId; remontar reinicia la cuenta en el paso 1', async () => {
    finishAssignedOrderActionMock.mockResolvedValue({ status: 'success' });
    vi.useFakeTimers();
    try {
      const { unmount } = render(<OrderExecutionScreen execution={EXECUTION_DOS_PASOS} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      fireEvent.click(screen.getByTestId('step-reader-next'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('step-reader-finish'));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(finishAssignedOrderActionMock).toHaveBeenCalledTimes(1);
      const [, formData] = finishAssignedOrderActionMock.mock.calls[0] as [unknown, FormData];
      expect([...formData.keys()]).toEqual([ORDER_EXECUTION_ORDER_ID_FIELD]);
      expect(formData.get(ORDER_EXECUTION_ORDER_ID_FIELD)).toBe(EXECUTION_DOS_PASOS.orderId);

      unmount();
      render(<OrderExecutionScreen execution={EXECUTION_DOS_PASOS} />);

      expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 2');
      expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');
      expect(screen.getByTestId('step-reader-next')).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
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
  /** El alto minimo de 44x44, o el de 64px de la accion primaria de StepReader en ejecucion. */
  function esObjetivoTactil(elemento: Element): boolean {
    const alturaMinima = elemento.className.includes('min-h-11') || elemento.className.includes('min-h-16');
    return alturaMinima && elemento.className.includes('min-w-11');
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

// Tensado a lista cerrada el 2026-09-18 (QC-125, ratificado por el humano): esta ficha SI
// necesita tocar `step-reader.tsx` (botones, motivo del bloqueo y cronometro son internos del
// asistente), asi que la igualdad contra `[]` de QC-63 dejaba de poder cumplirse. Lo que sigue
// prohibido es cualquier OTRO archivo de la carpeta.
describe('R18 — el asistente heredado solo puede cambiar step-reader.tsx (lista cerrada)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(HERE, '..', '..', '..');

  const PERMITIDOS = ['components/shared/step-reader/step-reader.tsx'];

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

  it('todo archivo cambiado de `components/shared/step-reader/**` esta en la lista permitida', (ctx) => {
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

    const fueraDeLaLista = cambiados.filter((archivo) => !PERMITIDOS.includes(archivo));

    expect(
      fueraDeLaLista,
      `esta rama modifico un archivo del asistente fuera de la lista cerrada: ${fueraDeLaLista.join(', ')}`,
    ).toEqual([]);
  });
});
