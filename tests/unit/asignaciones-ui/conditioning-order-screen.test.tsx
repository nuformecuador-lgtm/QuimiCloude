import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONDITIONING_ACTIONS_TEXTS,
  CONDITIONING_BATCH_DATA_LINE_TESTID,
  CONDITIONING_BATCH_DATA_SECTION_TESTID,
  CONDITIONING_ORDER_BACK_LINK_TESTID,
  CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID,
  CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID,
  CONDITIONING_ORDER_CONDITIONER_TESTID,
  CONDITIONING_ORDER_DISTRIBUTION_TESTID,
  CONDITIONING_ORDER_NUMBER_TESTID,
  CONDITIONING_ORDER_QUANTITY_TESTID,
  CONDITIONING_ORDER_RECIPE_TESTID,
  CONDITIONING_ORDER_STATUS_TESTID,
  CONDITIONING_TEAM_LIST_GROUP_NAME_TESTID,
  CONDITIONING_TEAM_LIST_GROUP_TESTID,
  CONDITIONING_TEAM_LIST_TESTID,
  ConditioningOrderScreen,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import { buildConditioningOrdersColumns } from '@/app/(private)/asignacion/components';
import type {
  ConditioningBatchLineView,
  ConditioningOrderDetail,
  ConditioningTeamCandidates,
} from '@/lib/modules/asignaciones';

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions', () => ({
  startConditioningAction: vi.fn(),
  finishConditioningAction: vi.fn(),
  saveConditioningBatchDataAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const SCREEN_DIR = path.join(process.cwd(), 'app', '(private)', 'asignacion', 'acondicionamiento', '[id]');

const ROW: ConditioningOrderDetail = {
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
  team: [],
  batchData: null,
};

const CANDIDATES: ConditioningTeamCandidates = {
  people: [{ id: 'user-3', displayName: 'Carla Gómez' }],
  workGroups: [],
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

describe('las acciones del detalle', () => {
  function botones(): string[] {
    return screen.queryAllByRole('button').map((boton) => boton.textContent ?? '');
  }

  it('R1: en POR_ACONDICIONAR ofrece solo «Acondicionar»', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...ROW, status: 'POR_ACONDICIONAR', conditionedByName: null, conditionedById: null }}
        canStart
        candidates={CANDIDATES}
      />,
    );

    expect(botones()).toEqual([CONDITIONING_ACTIONS_TEXTS.start]);
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeNull();
  });

  it('R2: en EN_ACONDICIONAMIENTO de quien lo acondiciona ofrece solo «Terminar»', () => {
    render(<ConditioningOrderScreen order={ROW} canFinish />);

    expect(botones()).toEqual([CONDITIONING_ACTIONS_TEXTS.finish]);
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeNull();
  });

  it('R3: en EN_ACONDICIONAMIENTO con otra persona no ofrece ninguna acción y dice quién lo acondiciona', () => {
    const { container } = render(<ConditioningOrderScreen order={ROW} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);
    expect(screen.getByTestId(CONDITIONING_ORDER_CONDITIONER_TESTID)).toHaveTextContent(
      'Lo acondiciona Berta Ruiz.',
    );
  });

  it('R3: en TERMINADO no ofrece ninguna acción', () => {
    const { container } = render(<ConditioningOrderScreen order={{ ...ROW, status: 'TERMINADO' }} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);
  });

  it('R1: sin candidatos no ofrece «Acondicionar» y pinta el error del catálogo en role="alert"', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...ROW, status: 'POR_ACONDICIONAR', conditionedByName: null, conditionedById: null }}
        canStart
        candidates={null}
        candidatesError={{ status: 'error', code: 'unauthorized', message: 'No tienes permiso.' }}
      />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const alerta = screen.getByTestId(CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID);
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveTextContent('No tienes permiso.');
  });
});

describe('el equipo guardado', () => {
  const TEAM: ConditioningOrderDetail['team'] = [
    { userId: 'user-3', displayName: 'Carla Gómez', origin: { kind: 'direct' } },
    {
      userId: 'user-4',
      displayName: 'Dario Pérez',
      origin: { kind: 'workGroup', workGroupId: 'group-1', workGroupName: 'Turno mañana' },
    },
    { userId: 'user-5', displayName: 'Elena Sanz', origin: { kind: 'direct' } },
    {
      userId: 'user-6',
      displayName: 'Fermín Ruiz',
      origin: { kind: 'workGroup', workGroupId: 'group-1', workGroupName: 'Turno mañana' },
    },
  ];

  function nombres(grupo: HTMLElement): (string | null)[] {
    return within(grupo)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
  }

  it.each(['EN_ACONDICIONAMIENTO', 'TERMINADO'] as const)(
    'R25: en %s pinta «Equipo» con las sueltas juntas y cada grupo con su nombre al comenzar',
    (status) => {
      render(<ConditioningOrderScreen order={{ ...ROW, status, team: TEAM }} />);

      const equipo = screen.getByTestId(CONDITIONING_TEAM_LIST_TESTID);
      expect(within(equipo).getByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
      const [sueltas, grupo, ...resto] = within(equipo).getAllByTestId(CONDITIONING_TEAM_LIST_GROUP_TESTID);
      if (sueltas === undefined || grupo === undefined) throw new Error('faltan grupos');
      expect(resto).toHaveLength(0);
      expect(sueltas).toHaveAttribute('data-kind', 'direct');
      expect(nombres(sueltas)).toEqual(['Carla Gómez', 'Elena Sanz']);
      expect(within(grupo).getByTestId(CONDITIONING_TEAM_LIST_GROUP_NAME_TESTID)).toHaveTextContent(
        'Turno mañana',
      );
      expect(nombres(grupo)).toEqual(['Dario Pérez', 'Fermín Ruiz']);
      expect(within(equipo).queryAllByRole('button')).toHaveLength(0);
    },
  );

  it('R25: pinta el nombre que trae el equipo, también el de una persona dada de baja', () => {
    render(
      <ConditioningOrderScreen
        order={{
          ...ROW,
          team: [{ userId: 'user-9', displayName: 'Persona de baja', origin: { kind: 'direct' } }],
        }}
      />,
    );

    expect(screen.getByTestId(CONDITIONING_TEAM_LIST_TESTID)).toHaveTextContent('Persona de baja');
  });

  it('R25: sin equipo no pinta la sección', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...ROW, status: 'POR_ACONDICIONAR', conditionedByName: null, conditionedById: null }}
      />,
    );

    expect(screen.queryByTestId(CONDITIONING_TEAM_LIST_TESTID)).toBeNull();
  });
});

describe('enlace de vuelta según el estado', () => {
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

  it('R1 R2: ni la página ni la pantalla son Server Actions ni llaman a una; las acciones viven en los modales', () => {
    const fuentes = [
      readFileSync(path.join(SCREEN_DIR, 'page.tsx'), 'utf8'),
      readFileSync(path.join(SCREEN_DIR, 'components', 'conditioning-order-screen.tsx'), 'utf8'),
    ];

    for (const fuente of fuentes) {
      expect(fuente).not.toContain("'use server'");
      expect(fuente).not.toMatch(/adapters\/driving\/(?!require-page-permission)/);
      expect(fuente).not.toMatch(/\w+Action\(/);
      expect(fuente).not.toContain('<form');
    }
  });
});

describe('«Datos de lote» en el detalle', () => {
  const LINE: ConditioningBatchLineView = {
    batchId: 'batch-1',
    presentationId: 'pres-1',
    presentationName: 'Frasco',
    packagingName: '500 g',
    packages: 12,
    provisionalLot: '0000042',
    lot: null,
    expiryDate: null,
    productionDate: null,
  };
  const SECOND: ConditioningBatchLineView = {
    ...LINE,
    batchId: 'batch-2',
    presentationId: 'pres-2',
    presentationName: 'Bolsa',
    packagingName: '1 kg',
    packages: 4,
  };
  const MINE = { ...ROW, conditionedById: 'user-1', conditionedByName: 'Ana Ruiz' };

  it.each(['EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'] as const)(
    'R1 R18 R21: en %s, con batchData, pinta la sección con un bloque por línea en orden de alta',
    (status) => {
      render(
        <ConditioningOrderScreen order={{ ...MINE, status, batchData: { lines: [LINE, SECOND], missingCount: 2 } }} />,
      );

      const seccion = screen.getByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID);
      expect(within(seccion).getByRole('heading', { name: 'Datos de lote' })).toBeInTheDocument();
      expect(
        within(seccion)
          .getAllByTestId(CONDITIONING_BATCH_DATA_LINE_TESTID)
          .map((bloque) => bloque.querySelector('legend')?.textContent),
      ).toEqual(['12 × 500 g', '4 × 1 kg']);
      expect(within(seccion).getByRole('button', { name: 'Guardar datos de lote' })).toBeInTheDocument();
    },
  );

  it('R3: en POR_ACONDICIONAR (batchData null) no hay sección ni ningún campo', () => {
    const { container } = render(
      <ConditioningOrderScreen
        order={{ ...ROW, status: 'POR_ACONDICIONAR', conditionedByName: null, conditionedById: null, batchData: null }}
      />,
    );

    expect(screen.queryByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID)).toBeNull();
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('R3: si lo acondiciona otra persona (batchData null) no hay sección ni aviso', () => {
    const { container } = render(<ConditioningOrderScreen order={{ ...ROW, batchData: null }} />);

    expect(screen.queryByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID)).toBeNull();
    expect(screen.queryByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID)).toBeNull();
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('R4: con una línea sin datos dice «Faltan los datos de lote de 1 línea.» y «Terminar» va deshabilitado', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...MINE, batchData: { lines: [LINE], missingCount: 1 } }}
        canFinish
        finishBlocked
      />,
    );

    const aviso = screen.getByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID);
    expect(aviso).toHaveTextContent('Faltan los datos de lote de 1 línea.');
    const terminar = screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish });
    expect(terminar).toBeDisabled();
    expect(terminar).toHaveAttribute('aria-describedby', aviso.id);
  });

  it('R4: con k > 1 líneas sin datos dice «Faltan los datos de lote de k líneas.»', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...MINE, batchData: { lines: [LINE, SECOND], missingCount: 2 } }}
        canFinish
        finishBlocked
      />,
    );

    expect(screen.getByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID)).toHaveTextContent(
      'Faltan los datos de lote de 2 líneas.',
    );
    expect(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeDisabled();
  });

  it('R4: con todas las líneas con datos no hay aviso y «Terminar» está habilitado', () => {
    const conDatos = { ...LINE, provisionalLot: null, lot: 'L-1', expiryDate: '2027-01-01', productionDate: '2026-10-01' };
    render(
      <ConditioningOrderScreen order={{ ...MINE, batchData: { lines: [conDatos], missingCount: 0 } }} canFinish />,
    );

    expect(screen.queryByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID)).toBeNull();
    const terminar = screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish });
    expect(terminar).toBeEnabled();
    expect(terminar).not.toHaveAttribute('aria-describedby');
  });

  it('R21: en ENTREGADO no ofrece «Acondicionar» ni «Terminar» y la vuelta es «Volver a «Entregados»»', () => {
    render(
      <ConditioningOrderScreen
        order={{ ...MINE, status: 'ENTREGADO', batchData: { lines: [LINE], missingCount: 1 } }}
      />,
    );

    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeNull();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeNull();
    expect(screen.getByTestId(CONDITIONING_ORDER_STATUS_TESTID)).toHaveTextContent('Entregado');
    const back = screen.getByTestId(CONDITIONING_ORDER_BACK_LINK_TESTID);
    expect(back).toHaveTextContent('Volver a «Entregados»');
    expect(back).toHaveAttribute('href', '/asignacion?vista=acondicionados_entregados');
    expect(back.className).toContain('min-h-11');
  });
});
