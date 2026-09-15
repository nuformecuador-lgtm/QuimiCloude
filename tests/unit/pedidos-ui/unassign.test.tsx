// QC-102 T9 — Quitar a UNA persona del pedido: R31 (con el toast + refresco de R33).
//
// **`unassignResponsibleAction` es un espia; las otras dos son dobles que REVIENTAN.** R31 dice
// «exactamente esa persona y ese pedido»: quitar a una no puede pasar por la operacion de grupo
// ni por una reasignacion, y un doble que lanza lo deja dicho sin depender de una lista de
// `not.toHaveBeenCalled()`.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderResponsibles,
  RESPONSIBLE_ORDER_ID_FIELD,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_USER_ID_FIELD,
} from '@/app/(private)/pedidos/components';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import type { UnassignResponsibleFormState } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { setupUser } from '../../helpers/user-event';

const { desasignarMock, routerMock } = vi.hoisted(() => ({
  desasignarMock:
    vi.fn<
      (prev: UnassignResponsibleFormState, data: FormData) => Promise<UnassignResponsibleFormState>
    >(),
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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al quitar a UNA persona (R31)`);
  };
  return {
    unassignResponsibleAction: desasignarMock,
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
  };
});

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';
const ANA = '00000000-0000-4000-8000-000000000000';
const BRUNO = '00000001-0000-4000-8000-000000000001';
const CARLA = '00000002-0000-4000-8000-000000000002';

const RESPONSABLES: readonly OrderResponsible[] = [
  { userId: ANA, displayName: 'Ana Torres', origin: { kind: 'direct' } },
  { userId: BRUNO, displayName: 'Bruno Diaz', origin: { kind: 'direct' } },
  {
    userId: CARLA,
    displayName: 'Carla Ruiz',
    origin: { kind: 'workGroup', workGroupId: TURNO, workGroupName: 'Turno de mañana' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  desasignarMock.mockResolvedValue({ status: 'success' });
  vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

function botonDe(userId: string): HTMLElement {
  const boton = screen
    .getAllByTestId(RESPONSIBLE_REMOVE_PERSON_TESTID)
    .find((candidato) => candidato.dataset.userId === userId);
  if (boton === undefined) throw new Error(`no hay boton de quitar para ${userId}`);
  return boton;
}

describe('quitar a una persona desasigna EXACTAMENTE a esa (R31)', () => {
  it('una sola invocacion, con esa persona y ese pedido', async () => {
    const user = setupUser();
    render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);

    await user.click(botonDe(BRUNO));

    await waitFor(() => expect(desasignarMock).toHaveBeenCalledTimes(1));
    const [, formData] = desasignarMock.mock.calls[0] ?? [];
    expect(formData?.get(RESPONSIBLE_ORDER_ID_FIELD)).toBe(PEDIDO);
    expect(formData?.get(RESPONSIBLE_USER_ID_FIELD)).toBe(BRUNO);
  });

  it('en negativo: NO viaja ninguna otra persona, ni una lista', async () => {
    const user = setupUser();
    render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);

    await user.click(botonDe(BRUNO));
    await waitFor(() => expect(desasignarMock).toHaveBeenCalledTimes(1));

    const [, formData] = desasignarMock.mock.calls[0] ?? [];
    expect(formData?.getAll(RESPONSIBLE_USER_ID_FIELD)).toEqual([BRUNO]);
    expect(formData?.getAll('userIds')).toEqual([]);
  });

  it('a una persona que vino de un GRUPO se la quita igual, y por la MISMA operacion', async () => {
    const user = setupUser();
    render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);

    // Si la pantalla intentara resolverlo por la operacion de grupo, su doble lanzaria.
    await user.click(botonDe(CARLA));

    await waitFor(() => expect(desasignarMock).toHaveBeenCalledTimes(1));
    const [, formData] = desasignarMock.mock.calls[0] ?? [];
    expect(formData?.get(RESPONSIBLE_USER_ID_FIELD)).toBe(CARLA);
  });

  it('hay un boton de quitar por persona, y solo uno por persona', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);

    const ids = screen
      .getAllByTestId(RESPONSIBLE_REMOVE_PERSON_TESTID)
      .map((boton) => boton.dataset.userId);
    expect(ids).toEqual([ANA, BRUNO, CARLA]);
  });

  it('con exito se refresca con la MISMA URL (R33)', async () => {
    const user = setupUser();
    render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);

    await user.click(botonDe(ANA));

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
