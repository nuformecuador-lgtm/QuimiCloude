import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  buildPinningStorageKey,
  usePinnedColumns,
} from '@/components/shared/data-table/use-pinned-columns';

/**
 * Tests de T10 (`tasks.md`): guardar, restaurar, valor corrupto, columna que ya no existe,
 * aislamiento entre `tableId` y `localStorage` que lanza en `setItem`/`getItem` (R25, R26).
 */

const COLUMN_IDS = ['nombre', 'stock', 'precio'] as const;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePinnedColumns', () => {
  it('fijar una columna la guarda en localStorage bajo la clave construida', () => {
    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    act(() => {
      result.current.togglePin('nombre');
    });

    const raw = window.localStorage.getItem(buildPinningStorageKey('inventario'));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ left: ['nombre'], right: [] });
  });

  it('restaura lo fijado guardado previamente al montarse', async () => {
    window.localStorage.setItem(
      buildPinningStorageKey('inventario'),
      JSON.stringify({ left: ['nombre'], right: ['precio'] }),
    );

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: ['nombre'], right: ['precio'] });
    });
  });

  it('un valor con JSON invalido se degrada a sin nada fijado, sin lanzar', async () => {
    window.localStorage.setItem(buildPinningStorageKey('inventario'), '{ no es json valido');

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: [], right: [] });
    });
  });

  it('un JSON valido con forma equivocada se degrada a sin nada fijado, sin lanzar', async () => {
    window.localStorage.setItem(
      buildPinningStorageKey('inventario'),
      JSON.stringify({ pinned: ['nombre'] }),
    );

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: [], right: [] });
    });
  });

  it('descarta ids de columna que ya no existen', async () => {
    window.localStorage.setItem(
      buildPinningStorageKey('inventario'),
      JSON.stringify({ left: ['nombre', 'columna-borrada'], right: [] }),
    );

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: ['nombre'], right: [] });
    });
  });

  it('aisla lo fijado entre dos tableId distintos', () => {
    const inventario = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));
    const recetas = renderHook(() => usePinnedColumns('recetas', COLUMN_IDS));

    act(() => {
      inventario.result.current.togglePin('nombre');
    });
    act(() => {
      recetas.result.current.togglePin('precio', 'right');
    });

    expect(inventario.result.current.pinning).toEqual({ left: ['nombre'], right: [] });
    expect(recetas.result.current.pinning).toEqual({ left: [], right: ['precio'] });

    expect(JSON.parse(window.localStorage.getItem(buildPinningStorageKey('inventario')) as string)).toEqual(
      { left: ['nombre'], right: [] },
    );
    expect(JSON.parse(window.localStorage.getItem(buildPinningStorageKey('recetas')) as string)).toEqual({
      left: [],
      right: ['precio'],
    });
  });

  it('fijar y soltar siguen funcionando en la sesion cuando setItem lanza', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('cuota llena');
    });

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    expect(() => {
      act(() => {
        result.current.togglePin('nombre');
      });
    }).not.toThrow();

    expect(result.current.pinning).toEqual({ left: ['nombre'], right: [] });

    expect(() => {
      act(() => {
        result.current.togglePin('nombre');
      });
    }).not.toThrow();

    expect(result.current.pinning).toEqual({ left: [], right: [] });
  });

  it('fijar y soltar siguen funcionando en la sesion cuando getItem lanza', async () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('acceso denegado');
    });

    const { result } = renderHook(() => usePinnedColumns('inventario', COLUMN_IDS));

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: [], right: [] });
    });

    act(() => {
      result.current.togglePin('stock', 'right');
    });

    expect(result.current.pinning).toEqual({ left: [], right: ['stock'] });
  });

  it('el defecto por columna nace fijado en el borde que pide cuando no hay nada persistido', async () => {
    const { result } = renderHook(() =>
      usePinnedColumns('inventario', COLUMN_IDS, { left: ['nombre'], right: ['precio'] }),
    );

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: ['nombre'], right: ['precio'] });
    });
  });

  it('con algo persistido gana lo persistido, no el defecto por columna', async () => {
    window.localStorage.setItem(
      buildPinningStorageKey('inventario'),
      JSON.stringify({ left: [], right: [] }),
    );

    const { result } = renderHook(() =>
      usePinnedColumns('inventario', COLUMN_IDS, { left: ['nombre'], right: ['precio'] }),
    );

    await vi.waitFor(() => {
      expect(result.current.pinning).toEqual({ left: [], right: [] });
    });
  });
});
