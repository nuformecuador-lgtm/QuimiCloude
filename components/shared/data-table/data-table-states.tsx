import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import type { DataTableTexts } from './data-table-types';

/**
 * Los tres estados de la tabla compartida (`design.md > 7`, T5): vacio, cargando y error.
 *
 * **El error nunca se pinta como vacio** (decision 7 de `requirements.md`): son tres situaciones
 * distintas y cada una dice lo suyo. Los tres son identificables por `data-testid`/rol, nunca por
 * su copy (R21), y todo el copy llega por `texts` (R22) — este archivo no incrusta ningun texto
 * propio de un dominio concreto.
 */

/** Estado de carga/error que gobierna la tabla (`DataTableProps['status']`, `design.md > 3.3`). */
type DataTableStatus = 'idle' | 'loading' | 'error';

/**
 * Los cuatro desenlaces posibles de `design.md > 7`. `'rows'` significa «pinta la tabla»: ese
 * desenlace no lo resuelve este archivo, lo consume `data-table.tsx` (T11) para decidir si monta
 * las filas.
 */
export type DataTableVisibleState = 'error' | 'loading' | 'empty' | 'rows';

/**
 * Decide cual de los cuatro desenlaces corresponde, a partir de `status` y del numero de filas.
 *
 * La precedencia (`design.md > 7`) es **error > loading > empty > rows**, y la dicta el propio
 * `status` de tres valores, no una cadena de booleanos: R21 exige que los tres estados sean
 * mutuamente excluyentes, y esa exclusividad ya la fija el tipo `DataTableStatus`.
 */
export function resolveDataTableState(status: DataTableStatus, rowCount: number): DataTableVisibleState {
  if (status === 'error') {
    return 'error';
  }

  if (status === 'loading') {
    return 'loading';
  }

  if (rowCount === 0) {
    return 'empty';
  }

  return 'rows';
}

type DataTableErrorProps = {
  /** Textos del componente; solo se usa `error` (R22). */
  readonly texts: Pick<DataTableTexts, 'error'>;
  /** Mensaje concreto que entrega la pantalla (R21). Ausente si la pantalla no lo tiene aun. */
  readonly errorMessage?: string;
};

/**
 * Estado de error (R21): dice que la operacion fallo, con el `errorMessage` que la pantalla
 * entregue. `role="alert"` para que la tecnologia de asistencia lo anuncie sin depender del color
 * ni del texto para distinguirlo de los otros dos estados.
 */
export function DataTableError({ texts, errorMessage }: DataTableErrorProps) {
  return (
    <div
      role="alert"
      data-testid="data-table-error"
      className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">{texts.error}</p>
      {errorMessage === undefined ? null : (
        <p className="text-sm text-muted-foreground" data-testid="data-table-error-message">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

/** Numero de filas de esqueleto cuando la pantalla no indica cuantas quiere (`design.md > 7`). */
const DEFAULT_SKELETON_ROW_COUNT = 5;

type DataTableLoadingProps = {
  /** Textos del componente; solo se usa `loading` (R22), como etiqueta accesible del indicador. */
  readonly texts: Pick<DataTableTexts, 'loading'>;
  /** Cuantas columnas tiene la tabla, para que el esqueleto tenga la misma forma. */
  readonly columnCount: number;
  /** Cuantas filas de esqueleto pintar. Por defecto, `DEFAULT_SKELETON_ROW_COUNT`. */
  readonly rowCount?: number;
};

/**
 * Indicador de carga (R20): filas de esqueleto con la primitiva `skeleton` ya instalada, en lugar
 * de las filas reales. `role="status"` mas el texto visualmente oculto lo anuncia a la tecnologia
 * de asistencia sin depender del color.
 */
export function DataTableLoading({ texts, columnCount, rowCount = DEFAULT_SKELETON_ROW_COUNT }: DataTableLoadingProps) {
  const filas = Array.from({ length: rowCount });
  const columnas = Array.from({ length: columnCount });

  return (
    <div
      data-testid="data-table-loading"
      role="status"
      aria-label={texts.loading}
      className="flex flex-col gap-2 p-4"
    >
      <span className="sr-only">{texts.loading}</span>
      {filas.map((_valorFila, indiceFila) => (
        <div key={indiceFila} className="flex gap-2" data-testid={`data-table-loading-row-${indiceFila}`}>
          {columnas.map((_valorColumna, indiceColumna) => (
            <Skeleton key={indiceColumna} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

type DataTableEmptyProps = {
  /** Textos del componente; solo se usa `empty` (R22). */
  readonly texts: Pick<DataTableTexts, 'empty'>;
  /** Accion opcional del estado vacio (R19, pregunta abierta 4 de `requirements.md`). */
  readonly emptyAction?: ReactNode;
};

/**
 * Estado vacio (R19): identificable en lugar de una tabla sin filas, con la accion opcional que
 * la pantalla decida pasar (`emptyAction`, no un texto: un boton no es un texto).
 */
export function DataTableEmpty({ texts, emptyAction }: DataTableEmptyProps) {
  return (
    <div
      data-testid="data-table-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">{texts.empty}</p>
      {emptyAction === undefined ? null : emptyAction}
    </div>
  );
}
