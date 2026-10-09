import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONDITIONING_ACTIONS_TEXTS,
  CONDITIONING_TEAM_GROUP_ADMINS_TESTID,
  CONDITIONING_TEAM_GROUP_EMPTY_TESTID,
  CONDITIONING_TEAM_GROUPS_TESTID,
  CONDITIONING_TEAM_PEOPLE_TESTID,
  CONDITIONING_TEAM_USER_IDS_FIELD,
  CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD,
  COUNTDOWN_GATED_BUTTON_TESTID,
  ConditioningActions,
  START_CONDITIONING_DIALOG_TESTID,
  START_CONDITIONING_ERROR_TESTID,
  START_CONDITIONING_FORM_TESTID,
  START_CONDITIONING_ORDER_ID_FIELD,
  START_CONDITIONING_TEXTS,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import type { ConditioningTeamCandidates } from '@/lib/modules/asignaciones';
import type { StartConditioningResult } from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';

const { startConditioningActionMock } = vi.hoisted(() => ({
  startConditioningActionMock:
    vi.fn<(prev: StartConditioningResult, data: FormData) => Promise<StartConditioningResult>>(),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions', () => ({
  startConditioningAction: startConditioningActionMock,
  finishConditioningAction: vi.fn(),
}));

const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const TURNO_MANANA = '55555555-5555-4555-8555-555555555555';
const SOLO_JEFES = '66666666-6666-4666-8666-666666666666';
const TURNO_TARDE = '77777777-7777-4777-8777-777777777777';

const CANDIDATES: ConditioningTeamCandidates = {
  people: [
    { id: ANA, displayName: 'Ana López' },
    { id: BRUNO, displayName: 'Bruno Díaz' },
  ],
  workGroups: [
    { id: TURNO_MANANA, name: 'Turno mañana', contributes: 3, excludedAdministrators: 1 },
    { id: SOLO_JEFES, name: 'Solo jefes', contributes: 0, excludedAdministrators: 2 },
    { id: TURNO_TARDE, name: 'Turno tarde', contributes: 2, excludedAdministrators: 0 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  startConditioningActionMock.mockImplementation(() => Promise.resolve({ status: 'success' }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

function pintar() {
  return render(
    <ConditioningActions kind="start" orderId={ORDER_ID} orderNumber="2026-0000040" candidates={CANDIDATES} />,
  );
}

function abrir(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start }));
  return screen.getByTestId(START_CONDITIONING_DIALOG_TESTID);
}

function avanzar(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function comenzar(): HTMLElement {
  return screen.getByTestId(COUNTDOWN_GATED_BUTTON_TESTID);
}

function casilla(dialogo: HTMLElement, nombre: string | RegExp): HTMLElement {
  return within(dialogo).getByRole('checkbox', { name: nombre });
}

function marcar(dialogo: HTMLElement, nombre: string | RegExp): void {
  fireEvent.click(casilla(dialogo, nombre));
}

/** Pasa la espera con timers falsos y deja los reales para que React resuelva la acción. */
function pasarLaEspera(): void {
  avanzar(5000);
  vi.useRealTimers();
}

async function enviar(): Promise<void> {
  await act(async () => {
    fireEvent.click(comenzar());
  });
}

describe('el modal de Acondicionar', () => {
  it('R5: abre con el selector de personas, el de grupos, «Comenzar» y «Cancelar»', () => {
    pintar();
    const dialogo = abrir();

    expect(within(dialogo).getByText(START_CONDITIONING_TEXTS.title('2026-0000040'))).toBeInTheDocument();
    const personas = within(dialogo).getByTestId(CONDITIONING_TEAM_PEOPLE_TESTID);
    expect(within(personas).getAllByRole('checkbox')).toHaveLength(2);
    const grupos = within(dialogo).getByTestId(CONDITIONING_TEAM_GROUPS_TESTID);
    expect(within(grupos).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(dialogo).getByRole('button', { name: /Comenzar/ })).toBe(comenzar());
    expect(within(dialogo).getByRole('button', { name: START_CONDITIONING_TEXTS.cancel })).toBeInTheDocument();
  });

  it('R5: «Cancelar» cierra el modal sin llamar a la acción', async () => {
    pintar();
    const dialogo = abrir();
    marcar(dialogo, 'Ana López');

    fireEvent.click(within(dialogo).getByRole('button', { name: START_CONDITIONING_TEXTS.cancel }));
    avanzar(1000);

    expect(screen.queryByTestId(START_CONDITIONING_DIALOG_TESTID)).toBeNull();
    expect(startConditioningActionMock).not.toHaveBeenCalled();
  });

  it('R6: ofrece las personas que llegan como candidatas, con su nombre', () => {
    pintar();
    const dialogo = abrir();

    const personas = within(dialogo).getByTestId(CONDITIONING_TEAM_PEOPLE_TESTID);
    expect(within(personas).getByRole('checkbox', { name: 'Ana López' })).toBeInTheDocument();
    expect(within(personas).getByRole('checkbox', { name: 'Bruno Díaz' })).toBeInTheDocument();
  });

  it('R7: cada grupo dice «<nombre> · <n> personas» y, con Administradores, la línea de excluidos', () => {
    pintar();
    const dialogo = abrir();
    const grupos = within(dialogo).getByTestId(CONDITIONING_TEAM_GROUPS_TESTID);

    expect(within(grupos).getByText('Turno mañana · 3 personas')).toBeInTheDocument();
    expect(within(grupos).getByText('Turno tarde · 2 personas')).toBeInTheDocument();
    const avisos = within(grupos)
      .getAllByTestId(CONDITIONING_TEAM_GROUP_ADMINS_TESTID)
      .map((aviso) => aviso.textContent);
    expect(avisos).toEqual([
      '1 Administrador de este grupo no entra en el equipo.',
      '2 Administradores de este grupo no entran en el equipo.',
    ]);
    expect(casilla(grupos, /^Turno mañana/)).toHaveAccessibleDescription(
      '1 Administrador de este grupo no entra en el equipo.',
    );
  });

  it('R7: un grupo que no aporta personas tiene la casilla deshabilitada y lo dice', () => {
    pintar();
    const dialogo = abrir();
    const grupos = within(dialogo).getByTestId(CONDITIONING_TEAM_GROUPS_TESTID);

    const soloJefes = casilla(grupos, /^Solo jefes/);
    expect(soloJefes).toHaveAttribute('aria-disabled', 'true');
    expect(within(grupos).getByTestId(CONDITIONING_TEAM_GROUP_EMPTY_TESTID)).toHaveTextContent(
      'Este grupo no aporta personas al equipo.',
    );

    fireEvent.click(soloJefes);
    expect(soloJefes).toHaveAttribute('aria-checked', 'false');
    expect(casilla(grupos, /^Turno tarde/)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('«Comenzar»: la espera y la selección', () => {
  it('R9: al abrir está deshabilitado con la cuenta en «00:05»', () => {
    pintar();
    const dialogo = abrir();
    marcar(dialogo, 'Ana López');

    expect(comenzar()).toBeDisabled();
    expect(within(comenzar()).getByRole('timer')).toHaveTextContent('00:05');

    avanzar(4000);
    expect(comenzar()).toBeDisabled();
    avanzar(1000);
    expect(comenzar()).toBeEnabled();
  });

  it('R8: pasada la espera sigue deshabilitado sin nada marcado y se habilita al marcar', () => {
    pintar();
    const dialogo = abrir();

    avanzar(5000);
    expect(comenzar()).toBeDisabled();

    marcar(dialogo, /^Turno tarde/);
    expect(comenzar()).toBeEnabled();

    marcar(dialogo, /^Turno tarde/);
    expect(comenzar()).toBeDisabled();
  });

  it('R9: al cerrar y volver a abrir la cuenta empieza otra vez en «00:05»', () => {
    pintar();
    let dialogo = abrir();
    marcar(dialogo, 'Ana López');
    avanzar(5000);
    expect(comenzar()).toBeEnabled();

    fireEvent.click(within(dialogo).getByRole('button', { name: START_CONDITIONING_TEXTS.cancel }));
    avanzar(1000);
    expect(screen.queryByTestId(START_CONDITIONING_DIALOG_TESTID)).toBeNull();

    dialogo = abrir();
    marcar(dialogo, 'Ana López');
    expect(comenzar()).toBeDisabled();
    expect(within(comenzar()).getByRole('timer')).toHaveTextContent('00:05');
  });
});

describe('el envío', () => {
  it('R5: envía orderId, userIds y workGroupIds en el orden en que se marcaron', async () => {
    pintar();
    const dialogo = abrir();
    marcar(dialogo, 'Bruno Díaz');
    marcar(dialogo, 'Ana López');
    marcar(dialogo, /^Turno tarde/);
    marcar(dialogo, /^Turno mañana/);
    pasarLaEspera();

    await enviar();

    expect(startConditioningActionMock).toHaveBeenCalledTimes(1);
    const [, formData] = startConditioningActionMock.mock.calls[0] ?? [];
    expect(formData?.get(START_CONDITIONING_ORDER_ID_FIELD)).toBe(ORDER_ID);
    expect(formData?.getAll(CONDITIONING_TEAM_USER_IDS_FIELD)).toEqual([BRUNO, ANA]);
    expect(formData?.getAll(CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD)).toEqual([TURNO_TARDE, TURNO_MANANA]);
  });

  it('R5: un grupo marcado sin personas sueltas también se envía, con userIds vacío', async () => {
    pintar();
    const dialogo = abrir();
    marcar(dialogo, /^Turno tarde/);
    pasarLaEspera();

    await enviar();

    const [, formData] = startConditioningActionMock.mock.calls[0] ?? [];
    expect(formData?.getAll(CONDITIONING_TEAM_USER_IDS_FIELD)).toEqual([]);
    expect(formData?.getAll(CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD)).toEqual([TURNO_TARDE]);
  });

  it('R28: si la acción falla, el modal sigue abierto con el mensaje en role="alert" y lo marcado sigue marcado', async () => {
    startConditioningActionMock.mockImplementation(() =>
      Promise.resolve({
        status: 'error',
        code: 'conditioning_team_empty',
        message: 'El equipo de acondicionamiento necesita al menos una persona.',
      }),
    );
    pintar();
    const dialogo = abrir();
    marcar(dialogo, 'Ana López');
    marcar(dialogo, /^Turno mañana/);
    pasarLaEspera();

    await enviar();

    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta).toHaveTextContent('El equipo de acondicionamiento necesita al menos una persona.');
    expect(alerta).toHaveAttribute('data-testid', START_CONDITIONING_ERROR_TESTID);
    expect(screen.getByTestId(START_CONDITIONING_DIALOG_TESTID)).toBeInTheDocument();
    expect(casilla(dialogo, 'Ana López')).toHaveAttribute('aria-checked', 'true');
    expect(casilla(dialogo, /^Turno mañana/)).toHaveAttribute('aria-checked', 'true');
    const formulario = within(dialogo).getByTestId(START_CONDITIONING_FORM_TESTID) as HTMLFormElement;
    const datos = new FormData(formulario);
    expect(datos.getAll(CONDITIONING_TEAM_USER_IDS_FIELD)).toEqual([ANA]);
    expect(datos.getAll(CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD)).toEqual([TURNO_MANANA]);
  });

  it('con éxito el modal se cierra y el detalle sigue a la vista', async () => {
    pintar();
    const dialogo = abrir();
    marcar(dialogo, 'Ana López');
    pasarLaEspera();

    await enviar();

    await waitFor(() => expect(screen.queryByTestId(START_CONDITIONING_DIALOG_TESTID)).toBeNull());
  });
});
