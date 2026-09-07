'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

/**
 * Persistencia del pineo de columnas en `localStorage` (`design.md > 5`, T10).
 *
 * La UNICA preferencia que el componente persiste por su cuenta (R5). No conoce
 * `DataTableParams` ni emite nada por `onParamsChange`: el pineo vive fuera de los parametros de
 * lista.
 */

/** Lado al que puede fijarse una columna (`design.md > 13`, pregunta abierta 6: ambos bordes). */
export type PinSide = 'left' | 'right';

/** Forma persistida y expuesta: ids de columna fijados a cada borde (R25). */
export type PinnedColumnsState = {
  readonly left: readonly string[];
  readonly right: readonly string[];
};

const EMPTY_PINNING: PinnedColumnsState = { left: [], right: [] };

/** Forma que se valida al leer de `localStorage`: JSON corrupto o de otra forma se descarta (R25). */
const persistedPinningSchema = z.object({
  left: z.array(z.string()),
  right: z.array(z.string()),
});

/**
 * Construye la clave de `localStorage` para un `tableId` (R25, R26), en una funcion pura y
 * exportada para que el test no la escriba a mano.
 */
export function buildPinningStorageKey(tableId: string): string {
  return `qc:data-table:${tableId}:pinning`;
}

/**
 * Lee y valida el valor guardado para `tableId`. Envuelve `localStorage.getItem`: en modo
 * privado de Safari o con la API ausente puede lanzar, y eso degrada a "sin nada fijado" en vez
 * de propagar el error (R25).
 *
 * Devuelve `null` cuando NO hay preferencia utilizable del usuario -clave ausente, lectura que
 * lanza, JSON corrupto u otra forma-, y solo entonces se aplica `defaultPinnedColumns`
 * (QC-35 `design.md > 6.3`). Distinguir "no hay nada guardado" de "hay un `{left:[],right:[]}`
 * guardado" es lo que hace que soltar la columna fijada por defecto se recuerde en vez de
 * revivir en la siguiente visita (R25, R26).
 */
function readPersistedPinning(tableId: string): PinnedColumnsState | null {
  let raw: string | null;

  try {
    raw = window.localStorage.getItem(buildPinningStorageKey(tableId));
  } catch {
    // localStorage no disponible (modo privado, permisos) o getItem lanza: se degrada a "sin
    // preferencia guardada" sin propagar el error (R25).
    return null;
  }

  if (raw === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Valor guardado no es JSON valido (versión anterior u otra escritura): se descarta (R25).
    return null;
  }

  const result = persistedPinningSchema.safeParse(parsed);

  if (!result.success) {
    // JSON valido pero con una forma distinta a la esperada: se descarta (R25).
    return null;
  }

  return result.data;
}

/**
 * Escribe el valor para `tableId`. Envuelve `localStorage.setItem`: cuota llena o modo privado
 * pueden lanzar, y eso degrada a "funciona sin recordar" sin propagar el error (R25).
 */
function writePersistedPinning(tableId: string, state: PinnedColumnsState): void {
  try {
    window.localStorage.setItem(buildPinningStorageKey(tableId), JSON.stringify(state));
  } catch {
    // setItem lanzo (cuota llena, modo privado de Safari): fijar/soltar sigue funcionando en la
    // sesion actual, simplemente no se recuerda entre visitas (R25).
  }
}

/** Descarta del estado los ids de columna que ya no existen en `columnIds` (R25). */
function withOnlyExistingColumns(
  state: PinnedColumnsState,
  columnIds: readonly string[],
): PinnedColumnsState {
  const validIds = new Set(columnIds);

  return {
    left: state.left.filter((id) => validIds.has(id)),
    right: state.right.filter((id) => validIds.has(id)),
  };
}

/** Defecto estable para `defaultPinnedColumns`: sin nada fijado, el comportamiento de siempre. */
const NO_DEFAULT_PINNED: readonly string[] = [];

export type UsePinnedColumnsResult = {
  readonly pinning: PinnedColumnsState;
  /**
   * Fija `columnId` en `side` (izquierda por defecto); si ya estaba fijada en cualquiera de los
   * dos bordes, la suelta.
   */
  togglePin(columnId: string, side?: PinSide): void;
  setPinning(next: PinnedColumnsState): void;
};

/**
 * Hook de persistencia del pineo (R25, R26). Estado inicial: sin nada fijado, siempre — la
 * lectura de `localStorage` ocurre en un efecto tras el montaje, nunca en render, porque leerlo
 * en render de un componente que tambien se renderiza en servidor produce discrepancia de
 * hidratacion (`design.md > 5`).
 *
 * `defaultPinnedColumns` (QC-35 `design.md > 6.3`) se aplica DENTRO de ese mismo efecto y SOLO
 * cuando no hay nada persistido para el `tableId`. Nunca en el estado inicial ni en render: el
 * servidor no puede saber si el navegador tiene preferencia guardada, asi que arrancar con la
 * columna fijada reintroduciria exactamente la discrepancia de hidratacion que esta cabecera
 * documenta.
 */
export function usePinnedColumns(
  tableId: string,
  columnIds: readonly string[],
  defaultPinnedColumns: readonly string[] = NO_DEFAULT_PINNED,
): UsePinnedColumnsResult {
  const [pinning, setPinningState] = useState<PinnedColumnsState>(EMPTY_PINNING);

  // Resume `columnIds` como cadena para no depender de su identidad de array.
  const columnIdsKey = columnIds.join('\u0000');
  // Mismo motivo para el defecto: el consumidor suele pasar un array literal en cada render.
  const defaultPinnedKey = defaultPinnedColumns.join('\u0000');

  useEffect(() => {
    // Restaura tras el montaje, nunca durante el render (discrepancia de hidratacion, R25). La
    // funcion nombrada, en vez de un `setState` como primera sentencia del efecto, es lo que este
    // repo usa para una restauracion desde una fuente externa (`data-table-filter-date.tsx`).
    const restore = () => {
      const persisted = readPersistedPinning(tableId);
      // Sin preferencia guardada -> el defecto que declara la pantalla; con preferencia guardada
      // gana SIEMPRE la del usuario, incluida la de no tener nada fijado (R25, R26).
      const next: PinnedColumnsState = persisted ?? { left: [...defaultPinnedColumns], right: [] };
      setPinningState(withOnlyExistingColumns(next, columnIds));
    };
    restore();
    // Se relee al cambiar de tabla, de conjunto de columnas validas o de defecto; las claves
    // resumen los arrays para no depender de su identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, columnIdsKey, defaultPinnedKey]);

  const setPinning = useCallback(
    (next: PinnedColumnsState) => {
      setPinningState(next);
      writePersistedPinning(tableId, next);
    },
    [tableId],
  );

  const togglePin = useCallback(
    (columnId: string, side: PinSide = 'left') => {
      setPinningState((current) => {
        const isPinned = current.left.includes(columnId) || current.right.includes(columnId);

        const next: PinnedColumnsState = isPinned
          ? {
              left: current.left.filter((id) => id !== columnId),
              right: current.right.filter((id) => id !== columnId),
            }
          : {
              left: side === 'left' ? [...current.left, columnId] : current.left,
              right: side === 'right' ? [...current.right, columnId] : current.right,
            };

        writePersistedPinning(tableId, next);
        return next;
      });
    },
    [tableId],
  );

  return useMemo(() => ({ pinning, togglePin, setPinning }), [pinning, togglePin, setPinning]);
}
