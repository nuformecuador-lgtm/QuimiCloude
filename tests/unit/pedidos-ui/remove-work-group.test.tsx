// QC-102 T9 — Quitar un GRUPO ENTERO desde el panel: R30 (y el toast + refresco de R33).
//
// **`removeWorkGroupFromOrderAction` es un espia; `unassignResponsibleAction` es un doble que
// REVIENTA.** Es el corazon del requisito: R30 dice «una llamada con ese grupo, y NO una
// desasignacion por cada persona del grupo». Con la desasignacion armada, la implementacion
// ingenua —recorrer los cinco del grupo— no falla por un `toHaveBeenCalledTimes` que alguien
// podria aflojar: rompe el caso.
//
// **Ningun assert sobre el copy**: el aviso se compara con la funcion exportada que lo compone.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderResponsibles,
  RESPONSIBLE_ORDER_ID_FIELD,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_WORK_GROUP_ID_FIELD,
  removeWorkGroupSuccessMessage,
} from '@/app/(private)/pedidos/components';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import type { RemoveWorkGroupFromOrderFormState } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { setupUser } from '../../helpers/user-event';

const { quitarGrupoMock, routerMock } = vi.hoisted(() => ({
  quitarGrupoMock:
    vi.fn<
      (
        prev: RemoveWorkGroupFromOrderFormState,
        data: FormData,
      ) => Promise<RemoveWorkGroupFromOrderFormState>
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
    throw new Error(`${nombre} no debe invocarse al quitar un GRUPO entero (R30)`);
  };
  return {
    removeWorkGroupFromOrderAction: quitarGrupoMock,
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
  };
});

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';

/** CINCO personas del mismo grupo: si alguien desasignara persona a persona serian cinco viajes. */
const RESPONSABLES: readonly OrderResponsible[] = [
  'Carla Ruiz',
  'Diego Salas',
  'Elena Prado',
  'Fabio Nieto',
  'Gema Lopez',
].map((displayName, indice) => ({
  userId: `0000000${indice}-0000-4000-8000-00000000000${indice}`,
  displayName,
  origin: { kind: 'workGroup', workGroupId: TURNO, workGroupName: 'Turno de mañana' },
}));

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  quitarGrupoMock.mockResolvedValue({ status: 'success', removed: 5 });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

function montar() {
  render(<OrderResponsibles orderId={PEDIDO} responsibles={RESPONSABLES} canWrite />);
}

describe('quitar un grupo entero es UNA operacion, no N desasignaciones (R30)', () => {
  it('se invoca la operacion de quitar grupo EXACTAMENTE una vez', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID));

    await waitFor(() => expect(quitarGrupoMock).toHaveBeenCalledTimes(1));
  });

  it('viaja ESE grupo y ESE pedido, con los campos en ingles', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID));
    await waitFor(() => expect(quitarGrupoMock).toHaveBeenCalledTimes(1));

    const [, formData] = quitarGrupoMock.mock.calls[0] ?? [];
    expect(formData?.get(RESPONSIBLE_ORDER_ID_FIELD)).toBe(PEDIDO);
    expect(formData?.get(RESPONSIBLE_WORK_GROUP_ID_FIELD)).toBe(TURNO);
  });

  it('en negativo: NINGUNA desasignacion individual (el doble revienta si se la llama)', async () => {
    const user = setupUser();
    montar();

    // Cinco personas en el grupo. Si la pantalla las recorriera, `unassignResponsibleAction`
    // lanzaria y el caso moriria aqui.
    await user.click(screen.getByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID));

    await waitFor(() => expect(quitarGrupoMock).toHaveBeenCalledTimes(1));
    expect(quitarGrupoMock.mock.calls).toHaveLength(1);
  });

  it('hay UN solo boton de quitar grupo por grupo, no uno por persona (R30)', () => {
    montar();

    expect(screen.getAllByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID)).toHaveLength(1);
  });

  it('con exito se avisa con cuantas se llevo el grupo y se refresca (R33)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID));

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(toastExito).toHaveBeenCalledWith(removeWorkGroupSuccessMessage(5));
    // Ni `push` ni `replace`: pagina, orden y filtros del listado se conservan.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
