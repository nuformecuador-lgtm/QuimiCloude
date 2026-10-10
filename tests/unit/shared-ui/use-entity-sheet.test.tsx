// `useEntitySheet`: apertura controlada o propia y el guardado (cerrar, avisar y refrescar).

import { act, cleanup, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntitySheet } from '@/hooks/use-entity-sheet';

const { routerMock } = vi.hoisted(() => ({
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

const EXITO = 'Guardado.';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useEntitySheet', () => {
  it('R11 — sin `open` lleva su propio estado de apertura', () => {
    const { result } = renderHook(() => useEntitySheet({ successMessage: EXITO }));

    expect(result.current.isControlled).toBe(false);
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.changeOpen(true));
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.changeOpen(false));
    expect(result.current.isOpen).toBe(false);
  });

  it('R11 — con `open` es controlado: refleja `open` y avisa por `onOpenChange`', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useEntitySheet({ open, onOpenChange, successMessage: EXITO }),
      { initialProps: { open: true } },
    );

    expect(result.current.isControlled).toBe(true);
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.changeOpen(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Controlado: no cambia hasta que el dueño baja el nuevo `open`.
    expect(result.current.isOpen).toBe(true);

    rerender({ open: false });
    expect(result.current.isOpen).toBe(false);
  });

  it('R11 — al guardar con éxito: cerrar, toast de éxito del modo y refresh, en ese orden', () => {
    const orden: string[] = [];
    const onOpenChange = vi.fn((open: boolean) => {
      orden.push(`cerrar:${open}`);
    });
    vi.spyOn(toast, 'success').mockImplementation((mensaje) => {
      orden.push(`toast:${String(mensaje)}`);
      return 1;
    });
    routerMock.refresh.mockImplementation(() => {
      orden.push('refresh');
    });

    const { result } = renderHook(() =>
      useEntitySheet({ open: true, onOpenChange, successMessage: EXITO }),
    );

    act(() => result.current.handleSaved());

    expect(orden).toEqual(['cerrar:false', `toast:${EXITO}`, 'refresh']);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('R11 — sin `open`, guardar cierra el panel propio; un mensaje explícito sustituye al del modo', () => {
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const { result } = renderHook(() => useEntitySheet({ successMessage: EXITO }));

    act(() => result.current.changeOpen(true));
    act(() => result.current.handleSaved('Otro aviso.'));

    expect(result.current.isOpen).toBe(false);
    expect(success).toHaveBeenCalledWith('Otro aviso.');
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});
