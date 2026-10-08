import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONDITIONING_ORDER_BACK_LINK_TESTID,
  CONDITIONING_ORDER_CONDITIONER_TESTID,
  CONDITIONING_ORDER_DISTRIBUTION_TESTID,
  CONDITIONING_ORDER_NUMBER_TESTID,
  CONDITIONING_ORDER_QUANTITY_TESTID,
  CONDITIONING_ORDER_RECIPE_TESTID,
  CONDITIONING_ORDER_STATUS_TESTID,
  ConditioningOrderScreen,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import { buildConditioningOrdersColumns } from '@/app/(private)/asignacion/components';
import type { ConditioningOrderRow } from '@/lib/modules/asignaciones';

afterEach(() => {
  cleanup();
});

const SCREEN_DIR = path.join(process.cwd(), 'app', '(private)', 'asignacion', 'acondicionamiento', '[id]');

const ROW: ConditioningOrderRow = {
  id: 'order-a',
  numberText: '2026-0000040',
  recipeName: 'Jarabe simple',
  quantity: '20.5000',
  unitId: 'unit-kg',
  unitLabel: 'kg',
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Frasco', packagingName: '500 g', packages: 12 },
    { presentationId: 'pres-2', presentationName: 'Bolsa', packagingName: '1 kg', packages: 4 },
  ],
  status: 'EN_ACONDICIONAMIENTO',
  conditionedByName: 'Berta Ruiz',
  conditionedById: 'user-2',
};

describe('el detalle muestra los datos del pedido', () => {
  it('R15: número (h1), receta, cantidad con unidad, reparto entero, estado y quién acondiciona', () => {
    render(<ConditioningOrderScreen order={ROW} />);

    const numero = screen.getByTestId(CONDITIONING_ORDER_NUMBER_TESTID);
    expect(numero.tagName).toBe('H1');
    expect(numero).toHaveTextContent('2026-0000040');
    expect(screen.getByTestId(CONDITIONING_ORDER_RECIPE_TESTID)).toHaveTextContent('Jarabe simple');
    expect(screen.getByTestId(CONDITIONING_ORDER_QUANTITY_TESTID)).toHaveTextContent('20.5 kg');
    expect(screen.getByTestId(CONDITIONING_ORDER_DISTRIBUTION_TESTID)).toHaveTextContent(
      '12 × 500 g / 4 × 1 kg',
    );
    const estado = screen.getByTestId(CONDITIONING_ORDER_STATUS_TESTID);
    expect(estado).toHaveTextContent('En acondicionamiento');
    expect(estado).toHaveAttribute('data-status', 'EN_ACONDICIONAMIENTO');
    expect(screen.getByTestId(CONDITIONING_ORDER_CONDITIONER_TESTID)).toHaveTextContent(
      'Lo acondiciona Berta Ruiz.',
    );
  });

  it('R15: los valores son los mismos que pinta su fila en «Por acondicionar»', () => {
    const celdas = buildConditioningOrdersColumns().map((column) => {
      const { container } = render(<>{column.cell(ROW)}</>);
      const text = container.textContent;
      cleanup();
      return text;
    });
    const [numero, receta, envases, estado, quien] = celdas;

    render(<ConditioningOrderScreen order={ROW} />);

    expect(screen.getByTestId(CONDITIONING_ORDER_NUMBER_TESTID).textContent).toBe(numero);
    expect(screen.getByTestId(CONDITIONING_ORDER_RECIPE_TESTID).textContent).toBe(receta);
    expect(screen.getByTestId(CONDITIONING_ORDER_DISTRIBUTION_TESTID)).toHaveTextContent(envases ?? '');
    expect(screen.getByTestId(CONDITIONING_ORDER_STATUS_TESTID).textContent).toBe(estado);
    expect(screen.getByTestId(CONDITIONING_ORDER_CONDITIONER_TESTID)).toHaveTextContent(quien ?? '');
  });

  it('R15: sin receta dice «Esta receta está dada de baja.» y sin reparto «Sin presentación»', () => {
    render(<ConditioningOrderScreen order={{ ...ROW, recipeName: null, presentationLines: [] }} />);

    expect(screen.getByTestId(CONDITIONING_ORDER_RECIPE_TESTID)).toHaveTextContent(
      'Esta receta está dada de baja.',
    );
    expect(screen.getByTestId(CONDITIONING_ORDER_DISTRIBUTION_TESTID)).toHaveTextContent('Sin presentación');
  });

  it('R16: en POR_ACONDICIONAR no hay nadie que acondicione y no se pinta la frase', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...ROW, status: 'POR_ACONDICIONAR', conditionedByName: null, conditionedById: null }}
      />,
    );

    expect(screen.queryByTestId(CONDITIONING_ORDER_CONDITIONER_TESTID)).toBeNull();
    expect(screen.getByTestId(CONDITIONING_ORDER_STATUS_TESTID)).toHaveTextContent('Por acondicionar');
  });
});

describe('solo lectura, con un enlace de vuelta según el estado', () => {
  it.each(['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const)(
    'R16: en %s no hay ningún botón ni formulario',
    (status) => {
      const { container } = render(<ConditioningOrderScreen order={{ ...ROW, status }} />);

      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(container.querySelectorAll('button')).toHaveLength(0);
      expect(container.querySelectorAll('form')).toHaveLength(0);
    },
  );

  it.each(['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'] as const)(
    'R16: en %s la vuelta es «Volver a «Por acondicionar»», con 44 px',
    (status) => {
      render(<ConditioningOrderScreen order={{ ...ROW, status }} />);

      const back = screen.getByTestId(CONDITIONING_ORDER_BACK_LINK_TESTID);
      expect(back).toHaveTextContent('Volver a «Por acondicionar»');
      expect(back).toHaveAttribute('href', '/asignacion?vista=por_acondicionar');
      expect(back.className).toContain('min-h-11');
      expect(back.className).toContain('min-w-11');
    },
  );

  it('R16: en TERMINADO la vuelta es «Volver a «Terminados»»', () => {
    render(<ConditioningOrderScreen order={{ ...ROW, status: 'TERMINADO' }} />);

    const back = screen.getByTestId(CONDITIONING_ORDER_BACK_LINK_TESTID);
    expect(back).toHaveTextContent('Volver a «Terminados»');
    expect(back).toHaveAttribute('href', '/asignacion?vista=acondicionados');
  });

  it('R16: ni la pantalla ni la página importan una Server Action ni un adaptador driving', () => {
    const fuentes = [
      readFileSync(path.join(SCREEN_DIR, 'page.tsx'), 'utf8'),
      readFileSync(path.join(SCREEN_DIR, 'components', 'conditioning-order-screen.tsx'), 'utf8'),
    ];

    for (const fuente of fuentes) {
      expect(fuente).not.toContain("'use server'");
      expect(fuente).not.toMatch(/adapters\/driving\/(?!require-page-permission)/);
      expect(fuente).not.toMatch(/import[^;]*\w+Action\b/);
      expect(fuente).not.toMatch(/\w+Action\(/);
      expect(fuente).not.toContain('<form');
    }
  });
});
