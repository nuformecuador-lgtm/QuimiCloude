import type { CSSProperties } from 'react';

import type { DataTableColumn } from './data-table-types';

/**
 * Estilo y clases derivados de `width`/`hideText` por columna (`data-table-types.ts`).
 *
 * Funciones puras sin DOM (como `data-table-params.ts`): `th` y `td` de la misma columna
 * comparten el mismo calculo, y el test las ejerce sobre el DOM pintado.
 */

/**
 * `column.width` -> `style={{ width, minWidth }}` (numero = px) o `undefined` si no hay
 * ancho fijo. Se fija tambien `min-width` con el mismo valor: en layout automatico el
 * `width` solo es una sugerencia y la columna se encoje al repartir el contenedor -sobre
 * todo con `hideText: false`, donde el texto parte y el contenido minimo colapsa al largo
 * de una palabra-. Con el minimo fijado, la columna toma su ancho declarado y, si no cabe,
 * la tabla desborda con scroll en vez de encogerla.
 */
export function toWidthStyle<TRow>(
  column: Pick<DataTableColumn<TRow>, 'width'>,
): CSSProperties | undefined {
  if (column.width === undefined) return undefined;
  const value = typeof column.width === 'number' ? `${column.width}px` : column.width;
  return { width: value, minWidth: value };
}

/**
 * `column.hideText` -> clases de truncado o de salto de linea. `true` o ausente = truncado
 * (`overflow-hidden` + `text-ellipsis` sobre el `whitespace-nowrap` que ya trae
 * `components/ui/table.tsx`); `false` = el texto salta de linea (`whitespace-normal` gana a
 * `whitespace-nowrap` por `twMerge` en `cn`, mas `break-words`).
 */
export function toColumnTextClass<TRow>(
  column: Pick<DataTableColumn<TRow>, 'hideText'>,
): string {
  return column.hideText === false ? 'whitespace-normal break-words' : 'overflow-hidden text-ellipsis';
}

/**
 * Junta el estilo sticky del fijado con el `width` de la columna. `undefined` si no hay
 * ninguno: asi las celdas sin fijar ni ancho siguen sin estilo en linea (lo mide el test P2
 * de `tests/unit/pedidos-ui/pedidos-viewport.test.tsx`).
 */
export function mergeCellStyle(
  sticky: CSSProperties | undefined,
  width: CSSProperties | undefined,
): CSSProperties | undefined {
  if (sticky === undefined && width === undefined) return undefined;
  return { ...sticky, ...width };
}
