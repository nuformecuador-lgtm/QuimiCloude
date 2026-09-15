// QC-102 T9 — Confirmar una asignacion: R32 (una sola operacion, `FormData`, campos en ingles),
// R33 (toast con el `added` que devuelve la accion + `router.refresh()`) y R34 (error por `code`,
// dentro del panel, sin perder lo marcado).
//
// **`assignResponsiblesAction` es un espia; las otras dos son dobles que REVIENTAN**: R32 exige
// «una sola operacion», asi que marcar tres personas y dos grupos no puede resolverse a base de
// llamadas sueltas a las otras.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderResponsibles,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_ERROR_TESTID,
  RESPONSIBLE_ORDER_ID_FIELD,
  RESPONSIBLE_USER_IDS_FIELD,
  RESPONSIBLE_WORK_GROUP_IDS_FIELD,
  RESPONSIBLE_WORK_GROUP_TESTID,
  assignResponsiblesSuccessMessage,
} from '@/app/(private)/pedidos/components';
import type { AssignResponsiblesFormState } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { setupUser } from '../../helpers/user-event';

const { asignarMock, routerMock } = vi.hoisted(() => ({
  asignarMock:
    vi.fn<
      (prev: AssignResponsiblesFormState, data: FormData) => Promise<AssignResponsiblesFormState>
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
    throw new Error(`${nombre} no debe invocarse al ASIGNAR (R32: una sola operacion)`);
  };
  return {
    assignResponsiblesAction: asignarMock,
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
  };
});

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const MARA = '0000000a-0000-4000-8000-00000000000a';
const NOE = '0000000b-0000-4000-8000-00000000000b';
const OSCAR = '0000000c-0000-4000-8000-00000000000c';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';
const CALIDAD = 'bbbbbbbb-0000-4000-8000-00000000bbbb';

const PERSONAS = [
  { id: MARA, displayName: 'Mara Vidal' },
  { id: NOE, displayName: 'Noe Pardo' },
  { id: OSCAR, displayName: 'Oscar Lima' },
];

const GRUPOS = [
  { id: TURNO, name: 'Turno de mañana' },
  { id: CALIDAD, name: 'Control de calidad' },
];

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  asignarMock.mockResolvedValue({ status: 'success', added: 4 });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

function montar() {
  render(
    <OrderResponsibles
      orderId={PEDIDO}
      responsibles={[]}
      canWrite
      people={PERSONAS}
      workGroups={GRUPOS}
    />,
  );
}

function casillaDePersona(userId: string): HTMLElement {
  const casilla = screen
    .getAllByTestId(RESPONSIBLE_CANDIDATE_TESTID)
    .find((candidato) => candidato.dataset.userId === userId);
  if (casilla === undefined) throw new Error(`no hay casilla para ${userId}`);
  return casilla;
}

function casillaDeGrupo(workGroupId: string): HTMLElement {
  const casilla = screen
    .getAllByTestId(RESPONSIBLE_WORK_GROUP_TESTID)
    .find((candidato) => candidato.dataset.workGroupId === workGroupId);
  if (casilla === undefined) throw new Error(`no hay casilla para ${workGroupId}`);
  return casilla;
}

describe('confirmar envia UNA sola operacion con personas y grupos juntos (R32)', () => {
  it('dos personas y dos grupos viajan en la MISMA invocacion', async () => {
    const user = setupUser();
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(casillaDePersona(OSCAR));
    await user.click(casillaDeGrupo(TURNO));
    await user.click(casillaDeGrupo(CALIDAD));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));

    await waitFor(() => expect(asignarMock).toHaveBeenCalledTimes(1));

    const [, formData] = asignarMock.mock.calls[0] ?? [];
    expect(formData?.get(RESPONSIBLE_ORDER_ID_FIELD)).toBe(PEDIDO);
    expect(formData?.getAll(RESPONSIBLE_USER_IDS_FIELD)).toEqual([MARA, OSCAR]);
    expect(formData?.getAll(RESPONSIBLE_WORK_GROUP_IDS_FIELD)).toEqual([TURNO, CALIDAD]);
  });

  it('lo que viaja es un `FormData` con los campos EN INGLES (R32, QC-87 R44)', async () => {
    const user = setupUser();
    montar();

    await user.click(casillaDePersona(NOE));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await waitFor(() => expect(asignarMock).toHaveBeenCalledTimes(1));

    const [previo, formData] = asignarMock.mock.calls[0] ?? [];
    expect(formData).toBeInstanceOf(FormData);
    expect(previo).toEqual({ status: 'idle' });
    expect([...(formData?.keys() ?? [])].sort()).toEqual(
      [RESPONSIBLE_ORDER_ID_FIELD, RESPONSIBLE_USER_IDS_FIELD].sort(),
    );
  });

  it('sin nada marcado no se puede confirmar: la operacion no se invoca', async () => {
    const user = setupUser();
    montar();

    const confirmar = screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID);
    expect(confirmar).toBeDisabled();

    await user.click(confirmar).catch(() => undefined);
    expect(asignarMock).not.toHaveBeenCalled();
  });

  it('solo grupos, sin ninguna persona marcada, sigue siendo UNA operacion', async () => {
    const user = setupUser();
    montar();

    await user.click(casillaDeGrupo(CALIDAD));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));

    await waitFor(() => expect(asignarMock).toHaveBeenCalledTimes(1));
    const [, formData] = asignarMock.mock.calls[0] ?? [];
    expect(formData?.getAll(RESPONSIBLE_USER_IDS_FIELD)).toEqual([]);
    expect(formData?.getAll(RESPONSIBLE_WORK_GROUP_IDS_FIELD)).toEqual([CALIDAD]);
  });
});

describe('con exito: cuantas se anadieron y refresco sin navegar (R33)', () => {
  it('el aviso lleva el `added` que devolvio la ACCION, no la cuenta de lo marcado', async () => {
    const user = setupUser();
    // Se marcan DOS y el servidor dice que entraron CUATRO (un grupo trajo gente). La cifra
    // cierta es la suya: reaplicar anade solo a los que faltaban (QC-87).
    asignarMock.mockResolvedValue({ status: 'success', added: 4 });
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(casillaDeGrupo(TURNO));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));

    await waitFor(() => expect(toastExito).toHaveBeenCalledWith(assignResponsiblesSuccessMessage(4)));
  });

  it('se refresca con `router.refresh()` y NO se navega a ninguna URL', async () => {
    const user = setupUser();
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('en negativo: la pantalla NO llama a `revalidatePath` (R33)', async () => {
    const { readFileSync } = await import('node:fs');
    const codigo = readFileSync('app/(private)/pedidos/components/order-responsibles.tsx', 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(codigo).not.toContain('revalidatePath');
    expect(codigo).not.toContain('router.push');
    expect(codigo).not.toContain('router.replace');
  });
});

describe('con error: dentro del panel, por `code`, sin perder lo marcado (R34)', () => {
  it('el error se pinta DENTRO de la seccion y lleva su `code`', async () => {
    const user = setupUser();
    asignarMock.mockResolvedValue({
      status: 'error',
      code: 'order_cancelled_not_assignable',
      message: 'da igual lo que diga este texto',
    } as AssignResponsiblesFormState);
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));

    const region = await screen.findByTestId(RESPONSIBLE_ERROR_TESTID);
    // La decision es por el CODIGO estable, nunca por el texto del mensaje.
    expect(region.dataset.code).toBe('order_cancelled_not_assignable');
    expect(region).toHaveAttribute('role', 'alert');
  });

  it('lo ya marcado SIGUE marcado y se puede reintentar sin volver a marcar', async () => {
    const user = setupUser();
    asignarMock.mockResolvedValue({
      status: 'error',
      code: 'order_cancelled_not_assignable',
      message: 'da igual',
    } as AssignResponsiblesFormState);
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(casillaDeGrupo(TURNO));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await screen.findByTestId(RESPONSIBLE_ERROR_TESTID);

    // Segundo intento SIN volver a marcar nada: viaja lo mismo que la primera vez.
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await waitFor(() => expect(asignarMock).toHaveBeenCalledTimes(2));

    const [, segundo] = asignarMock.mock.calls[1] ?? [];
    expect(segundo?.getAll(RESPONSIBLE_USER_IDS_FIELD)).toEqual([MARA]);
    expect(segundo?.getAll(RESPONSIBLE_WORK_GROUP_IDS_FIELD)).toEqual([TURNO]);
  });

  it('con error NO se avisa de exito y NO se refresca (el panel sigue como estaba)', async () => {
    const user = setupUser();
    asignarMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'da igual',
    } as AssignResponsiblesFormState);
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await screen.findByTestId(RESPONSIBLE_ERROR_TESTID);

    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('tras un exito posterior el error desaparece', async () => {
    const user = setupUser();
    asignarMock.mockResolvedValueOnce({
      status: 'error',
      code: 'unauthorized',
      message: 'da igual',
    } as AssignResponsiblesFormState);
    montar();

    await user.click(casillaDePersona(MARA));
    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await screen.findByTestId(RESPONSIBLE_ERROR_TESTID);

    await user.click(screen.getByTestId(RESPONSIBLE_CONFIRM_TESTID));
    await waitFor(() => expect(screen.queryByTestId(RESPONSIBLE_ERROR_TESTID)).toBeNull());
  });
});
