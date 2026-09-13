// QC-102 T7 y T9 — La regla multiplataforma sobre lo que esta feature anade: R35.
//
// `docs/architecture.md > Componentes > Regla: multiplataforma` y `design.md > 6`. Tres cosas, y
// las tres se afirman sobre el DOM, no sobre una promesa en un comentario:
//
//   1. objetivos tactiles de 44x44 en TODO control que esta feature monta;
//   2. `font-size` de al menos 16 px en el campo del buscador —por debajo, Safari en iOS hace
//      zoom al enfocar y la pantalla salta—;
//   3. ninguna informacion accesible SOLO por `:hover`: la lista completa se alcanza abriendo el
//      panel, que es la segunda puerta que la decision 1 creo (H5).
//
// **No se declara ninguna excepcion de escritorio** (`design.md > 6`), asi que no hay nada que
// eximir aqui.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderResponsibles,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_OVERFLOW_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_WORK_GROUP_TESTID,
  ResponsibleAvatars,
  responsiblesOverflowLabel,
} from '@/app/(private)/pedidos/components';
import type { OrderResponsible } from '@/lib/modules/asignaciones';

import { setupUser } from '../../helpers/user-event';

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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: vi.fn(async () => ({ status: 'success', added: 1 })),
  removeWorkGroupFromOrderAction: vi.fn(async () => ({ status: 'success', removed: 1 })),
  unassignResponsibleAction: vi.fn(async () => ({ status: 'success' })),
  listOrderResponsiblesAction: vi.fn(async () => ({ status: 'success', data: [] })),
}));

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';

const RESPONSABLES: readonly OrderResponsible[] = [
  { userId: '00000000-0000-4000-8000-000000000000', displayName: 'Ana Torres', origin: { kind: 'direct' } },
  {
    userId: '00000001-0000-4000-8000-000000000001',
    displayName: 'Bruno Diaz',
    origin: { kind: 'workGroup', workGroupId: TURNO, workGroupName: 'Turno de mañana' },
  },
];

const MUCHOS: readonly OrderResponsible[] = Array.from({ length: 9 }, (_, indice) => ({
  userId: `0000000${indice}-0000-4000-8000-00000000000${indice}`,
  displayName: `Persona ${indice}`,
  origin: { kind: 'direct' } as const,
}));

/** Las dos clases que, en este repo, SON el objetivo tactil de 44x44. */
function esObjetivoTactil(elemento: Element): boolean {
  return elemento.className.includes('min-h-11') && elemento.className.includes('min-w-11');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function montarPanel() {
  render(
    <OrderResponsibles
      orderId={PEDIDO}
      responsibles={RESPONSABLES}
      canWrite
      people={[{ id: '0000000a-0000-4000-8000-00000000000a', displayName: 'Mara Vidal' }]}
      workGroups={[{ id: TURNO, name: 'Turno de mañana' }]}
    />,
  );
}

describe('objetivos tactiles de 44x44 en todo lo que esta feature monta (R35)', () => {
  it('el `+N` de la fila', () => {
    render(<ResponsibleAvatars responsibles={MUCHOS} />);

    expect(esObjetivoTactil(screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID))).toBe(true);
  });

  it('los controles del panel: buscador, casillas, quitar persona, quitar grupo y confirmar', () => {
    montarPanel();

    for (const testid of [
      RESPONSIBLE_SEARCH_TESTID,
      RESPONSIBLE_CANDIDATE_TESTID,
      RESPONSIBLE_WORK_GROUP_TESTID,
      RESPONSIBLE_REMOVE_GROUP_TESTID,
      RESPONSIBLE_CONFIRM_TESTID,
    ]) {
      const control = screen.getAllByTestId(testid)[0];
      expect(control, `falta ${testid}`).toBeDefined();
      expect(esObjetivoTactil(control as Element), `${testid} no es 44x44`).toBe(true);
    }

    for (const quitar of screen.getAllByTestId(RESPONSIBLE_REMOVE_PERSON_TESTID)) {
      expect(esObjetivoTactil(quitar)).toBe(true);
    }
  });
});

describe('16 px en el campo del buscador (R35)', () => {
  it('el campo declara `text-base` en TODOS los anchos, no solo en movil', () => {
    montarPanel();

    const campo = screen.getByTestId(RESPONSIBLE_SEARCH_TESTID);
    expect(campo.className).toContain('text-base');
    // `md:text-base` es lo que impide que un `md:text-sm` heredado del primitivo lo baje a 14 px
    // en escritorio y deje el campo con dos tamanos segun el ancho.
    expect(campo.className).toContain('md:text-base');
  });
});

describe('ninguna informacion accesible SOLO por `:hover` (R35, H5)', () => {
  it('el `+N` es alcanzable por teclado y ABRE el panel al activarse', async () => {
    const user = setupUser();
    const abrirPanel = vi.fn<() => void>();
    render(<ResponsibleAvatars responsibles={MUCHOS} onShowAll={abrirPanel} />);

    const boton = screen.getByRole('button', { name: responsiblesOverflowLabel(6) });
    boton.focus();
    expect(boton).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(abrirPanel).toHaveBeenCalledTimes(1);
  });

  it('abierto el panel, la lista COMPLETA esta ahi sin pasar el puntero por nada', () => {
    render(<OrderResponsibles orderId={PEDIDO} responsibles={MUCHOS} />);

    // Los nueve, sin `+N` y sin tooltip de por medio: la segunda puerta de la decision 1.
    expect(screen.getAllByText(/^Persona \d$/)).toHaveLength(9);
    expect(screen.queryByTestId(RESPONSIBLE_OVERFLOW_TESTID)).toBeNull();
  });
});
