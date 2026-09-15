// QC-102 T8 — La seccion de responsables en modo LECTURA: R25, R12 y R27.
//
// **Las tres Server Actions de QC-87 son dobles que REVIENTAN si se las llama.** En modo lectura
// no hay ninguna operacion que invocar, y la unica forma de afirmarlo sin una lista de
// `not.toHaveBeenCalled()` es que llamar a cualquiera rompa el caso. Sirve ademas a la decision
// cerrada 7: pintar la seccion **no cuesta ninguna consulta**.
//
// **Ningun assert sobre el copy**: todo por `data-testid` exportado o por rol accesible.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_RESPONSIBLES_EMPTY_TESTID,
  ORDER_RESPONSIBLES_TESTID,
  OrderResponsibles,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_GROUP_NAME_TESTID,
  RESPONSIBLE_GROUP_TESTID,
  RESPONSIBLE_PERSON_NAME_TESTID,
  RESPONSIBLE_PERSON_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_WORK_GROUP_TESTID,
  groupResponsiblesByOrigin,
} from '@/app/(private)/pedidos/components';
import type { OrderResponsible } from '@/lib/modules/asignaciones';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al PINTAR la seccion (decision cerrada 7)`);
  };
  return {
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
  };
});

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const TURNO_MANANA = 'aaaaaaaa-0000-4000-8000-00000000aaaa';
const CALIDAD = 'bbbbbbbb-0000-4000-8000-00000000bbbb';

function persona(indice: number, nombre: string, origen: OrderResponsible['origin']) {
  return {
    userId: `0000000${indice}-0000-4000-8000-00000000000${indice}`,
    displayName: nombre,
    origin: origen,
  } satisfies OrderResponsible;
}

/** DOCE responsables repartidos en tres origenes. Doce, y no tres: R25 dice «sin limite». */
function doceResponsables(
  nombreDelTurno = 'Turno de mañana',
): readonly OrderResponsible[] {
  const directo = { kind: 'direct' } as const;
  const turno = {
    kind: 'workGroup',
    workGroupId: TURNO_MANANA,
    workGroupName: nombreDelTurno,
  } as const;
  const calidad = {
    kind: 'workGroup',
    workGroupId: CALIDAD,
    workGroupName: 'Control de calidad',
  } as const;

  return [
    persona(0, 'Ana Torres', directo),
    persona(1, 'Bruno Diaz', directo),
    persona(2, 'Carla Ruiz', turno),
    persona(3, 'Diego Salas', turno),
    persona(4, 'Elena Prado', turno),
    persona(5, 'Fabio Nieto', turno),
    persona(6, 'Gema Lopez', calidad),
    persona(7, 'Hugo Marin', calidad),
    persona(8, 'Irene Costa', calidad),
    persona(9, 'Julio Vera', calidad),
    persona(10, 'Karla Mota', calidad),
    persona(11, 'Luis Pena', directo),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('en el panel salen TODOS, agrupados por su origen (R25)', () => {
  it('los doce se pintan: el panel no recorta, el `+N` recorta la COLUMNA', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} />);

    expect(screen.getAllByTestId(RESPONSIBLE_PERSON_TESTID)).toHaveLength(12);
  });

  it('se agrupan en TRES bloques: el directo y los dos grupos de trabajo', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} />);

    const bloques = screen.getAllByTestId(RESPONSIBLE_GROUP_TESTID);
    expect(bloques.map((bloque) => bloque.dataset.kind)).toEqual([
      'direct',
      'workGroup',
      'workGroup',
    ]);
    expect(bloques.map((bloque) => bloque.dataset.workGroupId)).toEqual([
      undefined,
      TURNO_MANANA,
      CALIDAD,
    ]);
  });

  it('cada persona cae en SU bloque, y el nombre del grupo se pinta junto a ellas', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} />);

    const [directo, turno, calidad] = screen.getAllByTestId(RESPONSIBLE_GROUP_TESTID);

    const nombresDe = (bloque: HTMLElement | undefined) =>
      Array.from(bloque?.querySelectorAll(`[data-testid="${RESPONSIBLE_PERSON_NAME_TESTID}"]`) ?? [])
        .map((nodo) => nodo.textContent);

    expect(nombresDe(directo)).toEqual(['Ana Torres', 'Bruno Diaz', 'Luis Pena']);
    expect(nombresDe(turno)).toEqual(['Carla Ruiz', 'Diego Salas', 'Elena Prado', 'Fabio Nieto']);
    expect(nombresDe(calidad)).toEqual([
      'Gema Lopez',
      'Hugo Marin',
      'Irene Costa',
      'Julio Vera',
      'Karla Mota',
    ]);

    const titulos = screen
      .getAllByTestId(RESPONSIBLE_GROUP_NAME_TESTID)
      .map((nodo) => nodo.textContent);
    expect(titulos).toContain('Turno de mañana');
    expect(titulos).toContain('Control de calidad');
  });

  it('sin responsables se dice que no hay, y no se pinta ningun bloque', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={[]} />);

    expect(screen.getByTestId(ORDER_RESPONSIBLES_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.queryAllByTestId(RESPONSIBLE_GROUP_TESTID)).toEqual([]);
  });

  it('la funcion de agrupado, por si sola, no pierde ni duplica a nadie (R25)', () => {
    const grupos = groupResponsiblesByOrigin(doceResponsables());

    const total = grupos.reduce((suma, grupo) => suma + grupo.responsibles.length, 0);
    expect(total).toBe(12);

    const ids = grupos.flatMap((grupo) => grupo.responsibles.map((r) => r.userId));
    expect(new Set(ids).size).toBe(12);
  });
});

describe('el nombre del grupo viene CONGELADO en el dato (R12)', () => {
  it('lo que se pinta es el `workGroupName` de la FILA, no un catalogo', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} />);

    expect(
      screen.getAllByTestId(RESPONSIBLE_GROUP_NAME_TESTID).map((n) => n.textContent),
    ).toContain('Turno de mañana');
  });

  it('renombrar el grupo DESPUES no cambia lo que este pedido muestra (R12)', () => {
    // Lo unico que cambia es el nombre que trae el propio responsable: es lo que pasaria si el
    // grupo se renombrara y el pedido se releyera. Si la pantalla consultara `work_groups`, este
    // test no podria distinguir nada; como lee el dato, el nombre nuevo sale de aqui y solo de aqui.
    const { unmount } = render(
      <OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables('Turno de mañana')} />,
    );
    unmount();

    render(
      <OrderResponsibles
        orderId={PEDIDO}
        responsibles={doceResponsables('Turno de mañana')}
        workGroups={[{ id: TURNO_MANANA, name: 'NOMBRE NUEVO DEL CATALOGO' }]}
      />,
    );

    const titulos = screen
      .getAllByTestId(RESPONSIBLE_GROUP_NAME_TESTID)
      .map((nodo) => nodo.textContent);

    // El catalogo trae el nombre NUEVO y el bloque sigue pintando el CONGELADO.
    expect(titulos).toContain('Turno de mañana');
    expect(titulos).not.toContain('NOMBRE NUEVO DEL CATALOGO');
  });

  it('el agrupado toma el nombre del origen de la fila, tal cual (R12)', () => {
    const grupos = groupResponsiblesByOrigin(doceResponsables('Turno de tarde'));
    const turno = grupos.find(
      (grupo) => grupo.kind === 'workGroup' && grupo.workGroupId === TURNO_MANANA,
    );

    expect(turno?.kind === 'workGroup' ? turno.workGroupName : null).toBe('Turno de tarde');
  });
});

describe('modo LECTURA: se ve, no se toca (R25, base de R28)', () => {
  it('sin `canWrite` no hay buscador, ni selector, ni confirmar, ni quitar', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} />);

    expect(screen.getByTestId(ORDER_RESPONSIBLES_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(RESPONSIBLE_SEARCH_TESTID)).toBeNull();
    expect(screen.queryAllByTestId(RESPONSIBLE_CANDIDATE_TESTID)).toEqual([]);
    expect(screen.queryAllByTestId(RESPONSIBLE_WORK_GROUP_TESTID)).toEqual([]);
    expect(screen.queryByTestId(RESPONSIBLE_CONFIRM_TESTID)).toBeNull();
    expect(screen.queryAllByTestId(RESPONSIBLE_REMOVE_PERSON_TESTID)).toEqual([]);
    expect(screen.queryAllByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID)).toEqual([]);
  });

  it('ni con catalogos por props: el permiso lo decide `canWrite`, no que haya catalogo', () => {
    render(
      <OrderResponsibles
        orderId={PEDIDO}
        responsibles={doceResponsables()}
        people={[{ id: '0000000a-0000-4000-8000-00000000000a', displayName: 'Mara Vidal' }]}
        workGroups={[{ id: CALIDAD, name: 'Control de calidad' }]}
      />,
    );

    expect(screen.queryByTestId(RESPONSIBLE_SEARCH_TESTID)).toBeNull();
  });
});

describe('los catalogos llegan por PROPS: el cliente no los pide (R27)', () => {
  it('con `people` y `workGroups` por props se pintan sin ninguna consulta', () => {
    render(
      <OrderResponsibles
        orderId={PEDIDO}
        responsibles={[]}
        canWrite
        people={[
          { id: '0000000a-0000-4000-8000-00000000000a', displayName: 'Mara Vidal' },
          { id: '0000000b-0000-4000-8000-00000000000b', displayName: 'Noe Pardo' },
        ]}
        workGroups={[{ id: CALIDAD, name: 'Control de calidad' }]}
      />,
    );

    expect(screen.getAllByTestId(RESPONSIBLE_CANDIDATE_TESTID)).toHaveLength(2);
    expect(screen.getAllByTestId(RESPONSIBLE_WORK_GROUP_TESTID)).toHaveLength(1);
  });

  it('el codigo NO importa `lib/composition` ni las consultas de catalogo (R27)', async () => {
    const { readFileSync } = await import('node:fs');
    const codigo = readFileSync(
      'app/(private)/pedidos/components/order-responsibles.tsx',
      'utf8',
    )
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(codigo).not.toContain('lib/composition');
    expect(codigo).not.toContain('listUsersAction');
    expect(codigo).not.toContain('listWorkGroupsAction');
    // Y tampoco consulta responsables al abrirse (decision cerrada 7).
    expect(codigo).not.toContain('listOrderResponsiblesAction');
  });

  it('catalogo vacio: se degrada con su texto y no tumba nada (H1, R15)', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={doceResponsables()} canWrite />);

    // La seccion sigue en pie y los doce responsables siguen viendose.
    expect(screen.getByTestId(ORDER_RESPONSIBLES_TESTID)).toBeInTheDocument();
    expect(screen.getAllByTestId(RESPONSIBLE_PERSON_TESTID)).toHaveLength(12);
    expect(screen.queryAllByTestId(RESPONSIBLE_CANDIDATE_TESTID)).toEqual([]);
  });
});
