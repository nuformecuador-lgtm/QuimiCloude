'use client';

/**
 * Delimitador vertical entre columnas de la tabla (`data-table.tsx`, T11).
 *
 * Una linea de 1 px al 50% del alto de la fila, centrada verticalmente sobre el borde
 * derecho de la celda (`top-1/4` + `h-1/2`). Es un `span` absoluto y no un `border-right`:
 * el borde ocuparia el 100% del alto y sumaria ancho al layout; el span no mueve nada y se
 * ve igual con cualquier altura de fila, porque cada celda posiciona el suyo.
 *
 * La celda que lo contiene debe ser `relative` (lo pone quien compone). Es `aria-hidden` y
 * `pointer-events-none`: puro adorno visual, sin semantica ni interaccion. No se pinta en la
 * ultima columna: ahi no hay nada que delimitar.
 */

export type DataTableColumnDividerProps = {
  /** `data-testid` con el que el test localiza el divisor (`data-table-*-divider-<id>`). */
  readonly testId: string;
};

export function DataTableColumnDivider({ testId }: DataTableColumnDividerProps) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className="pointer-events-none absolute top-1/4 right-0 h-1/2 w-px bg-border"
    />
  );
}
