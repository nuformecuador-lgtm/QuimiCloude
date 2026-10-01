import type { ReactNode } from 'react';

/**
 * Tipos del contrato de `components/shared/data-table` (`design.md > 3`, T3).
 *
 * **Sin React salvo el tipo `ReactNode`.** Este archivo NO importa `lib/modules/`,
 * `lib/composition` ni ningun tipo de dominio (R2, R4, R30): el componente presenta filas de
 * CUALQUIER tipo sin conocer una entidad concreta, y eso solo es posible si su contrato tampoco
 * la conoce.
 *
 * Todo `readonly`: los parametros de lista (`DataTableParams`) son la forma que se emite completa
 * en cada cambio (R6, R7), y una forma mutable invitaria a mutarla en vez de construir la
 * siguiente version.
 */

/** Direccion de orden de una columna (R12). Una sola columna a la vez (pregunta abierta 5). */
export type SortDirection = 'asc' | 'desc';

/** El orden vigente: que columna y en que direccion (R7, R12, R14). */
export type DataTableSort = {
  readonly columnId: string;
  readonly direction: SortDirection;
};

/**
 * Las CUATRO formas de filtro que el componente soporta (R15), como union discriminada por
 * `kind`: es lo que permite que el mismo control sepa que pintar sin adivinar (`design.md > 6`).
 */
export type DataTableFilterValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'numberRange'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'select'; readonly values: readonly string[] }
  | { readonly kind: 'dateRange'; readonly from: string | null; readonly to: string | null };

/**
 * Conjunto completo de parametros de lista (R7): pagina, tamano, orden, filtros activos y
 * busqueda. Es la UNICA forma que se emite en `onParamsChange`, identica para cualquier cambio
 * de R6.
 */
export type DataTableParams = {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: DataTableSort | null;
  readonly filters: Readonly<Record<string, DataTableFilterValue>>;
  readonly search: string;
};

/**
 * Como declara una columna que forma de filtro ofrece (R15). Union paralela a
 * `DataTableFilterValue`: `select` necesita sus opciones para pintar el control; las otras tres
 * formas no necesitan nada mas alla de su `kind`.
 */
export type DataTableFilterSpec =
  | { readonly kind: 'text' }
  | { readonly kind: 'numberRange' }
  | { readonly kind: 'select'; readonly options: readonly { value: string; label: string }[] }
  | { readonly kind: 'dateRange' };

/**
 * Configuracion declarativa de una columna (R3, R4): datos, no marcado incrustado. `TRow` es
 * generico porque el componente no conoce ninguna entidad concreta.
 */
export type DataTableColumn<TRow> = {
  readonly id: string;
  readonly label: string;
  readonly align: 'start' | 'end' | 'center';
  /** Como se obtiene el contenido de la celda. Devuelve `ReactNode`, no `string` (pregunta abierta 4). */
  readonly cell: (row: TRow) => ReactNode;
  /** Ausente = no ordenable (R14). */
  readonly sortable?: boolean;
  /** Ausente = no aparece en la barra de filtros (R15). */
  readonly filter?: DataTableFilterSpec;
  /** Ausente = el usuario puede fijarla (R23); `false` la excluye del fijado. */
  readonly pinnable?: boolean;
  /**
   * Ancho fijo de la columna (`th` + `td`), como estilo `width` en linea. Numero = px,
   * cadena = cualquier valor CSS (`'12rem'`, `'200px'`). Ausente = sin ancho declarado, el
   * layout automatico reparte por contenido como siempre.
   */
  readonly width?: number | string;
  /**
   * Como se comporta el texto cuando supera el ancho disponible. `true` o ausente = truncado
   * (`overflow-hidden` + `text-ellipsis`, manteniendo el `whitespace-nowrap` de la tabla: el
   * comportamiento de siempre). `false` = el texto salta de linea dentro del ancho permitido
   * (`whitespace-normal` + `break-words`), util junto a `width`.
   */
  readonly hideText?: boolean;
};

/**
 * Textos de los tres estados y etiquetas accesibles de los controles (R22, R27). Todos
 * obligatorios: el componente NO incrusta ningun texto propio de un dominio concreto.
 */
export type DataTableTexts = {
  /** Estado vacio (R19). */
  readonly empty: string;
  /** Indicador de carga (R20). */
  readonly loading: string;
  /** Estado de error, antes de anexar `errorMessage` (R21). */
  readonly error: string;
  /** Placeholder/etiqueta del campo de busqueda global (R17). */
  readonly search: string;
  /** Etiqueta del disparador de la barra/menu de filtros (R15). */
  readonly filters: string;
  /**
   * `aria-label` del disparador del menu de una columna (R27). El nombre de la columna lo pone
   * `column.label`, que ya llega por la configuracion de columnas; esto es solo el verbo.
   */
  readonly columnMenu: string;
  /** `aria-label` de la accion de pagina anterior (R10). */
  readonly previousPage: string;
  /** `aria-label` de la accion de pagina siguiente (R10). */
  readonly nextPage: string;
  /**
   * Indicador de pagina actual/total. Funcion en vez de cadena fija porque el texto necesita los
   * dos numeros para ser identificable sin depender del copy (R10, R22).
   */
  readonly pageIndicator: (page: number, totalPages: number) => string;
  /** Etiqueta del selector de tamano de pagina (R11). */
  readonly pageSize: string;
  /** Etiqueta de la accion de ordenar ascendente en el menu de cabecera (R12). */
  readonly sortAscending: string;
  /** Etiqueta de la accion de ordenar descendente en el menu de cabecera (R12). */
  readonly sortDescending: string;
  /** Etiqueta de la accion de fijar columna (R23). */
  readonly pinColumn: string;
  /** Etiqueta de la accion de soltar columna (R23). */
  readonly unpinColumn: string;
  /** Etiqueta de la accion de abrir el filtro de una columna (R15). */
  readonly filterColumn: string;
  /** Etiqueta de la accion de limpiar un filtro (R16). */
  readonly clearFilter: string;
  /** Atajo de rango de fechas: ultima semana (R18). */
  readonly lastWeek: string;
  /** Atajo de rango de fechas: ultimo mes (R18). */
  readonly lastMonth: string;
  /** Atajo de rango de fechas: ultimo año (R18). */
  readonly lastYear: string;
  /**
   * `aria-label` de la flecha que desplaza la tabla a la izquierda cuando desborda
   * horizontalmente. Opcional con valor interno por defecto: asi los nueve consumidores
   * existentes no cambian; quien quiera localizar la etiqueta la provee por tabla.
   */
  readonly scrollLeft?: string;
  /**
   * `aria-label` de la flecha que desplaza la tabla a la derecha cuando desborda
   * horizontalmente. Opcional con valor interno por defecto (ver `scrollLeft`).
   */
  readonly scrollRight?: string;
};

/**
 * Props del componente compuesto (`design.md > 3.3`). `status` es un estado unico de tres
 * valores, no tres booleanos: R21 exige que los tres estados sean mutuamente excluyentes, y esa
 * exclusividad la fija el tipo, no una cadena de `if`.
 */
export type DataTableProps<TRow> = {
  /** Clave de persistencia del pineo en `localStorage` (R25, R26). */
  readonly tableId: string;
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow) => string;
  /** Estado de lista, controlado desde fuera (R5). */
  readonly params: DataTableParams;
  readonly totalPages: number;
  readonly onParamsChange: (next: DataTableParams) => void;
  readonly status: 'idle' | 'loading' | 'error';
  readonly errorMessage?: string;
  readonly texts: DataTableTexts;
  /** Accion opcional del estado vacio (R19, pregunta abierta 4). */
  readonly emptyAction?: ReactNode;
  /** Acciones de la barra, decididas por la pantalla segun sus permisos (R30). */
  readonly toolbarActions?: ReactNode;
  /**
   * Si la barra monta el campo de busqueda global (R17). **Ausente = `true`**: el comportamiento
   * de siempre, para que ningun consumidor existente cambie por esta prop. Con `false` el campo
   * NO se monta (QC-35 `design.md > 6.2`), lo que necesita una lista cuya lista blanca declara
   * `searchable: false` y para la que una caja de busqueda inerte mentiria.
   *
   * `DataTableTexts` NO cambia por esto: `texts.search` sigue siendo obligatorio, porque hacer
   * opcional un campo del contrato de textos afectaria a todos los consumidores para ahorrar
   * una cadena.
   */
  readonly searchable?: boolean;
  /**
   * Ids de columna que nacen fijadas al borde izquierdo cuando el usuario **no** tiene todavia
   * ninguna preferencia guardada para este `tableId` (QC-35 `design.md > 6.3`). Ausente = nada
   * fijado por defecto, el comportamiento de siempre.
   *
   * Es un valor **por defecto**, no una imposicion: en cuanto hay algo persistido para ese
   * `tableId` gana lo persistido, asi que el usuario puede soltar la columna y su decision se
   * recuerda (R25, R26).
   */
  readonly defaultPinnedColumns?: readonly string[];
};
