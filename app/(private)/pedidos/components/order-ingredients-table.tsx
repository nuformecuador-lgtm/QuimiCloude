'use client';

import { Loader2Icon } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { consumedQuantity, formatPercentage, type RecipeLineView } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import { subtractDecimal } from './order-decimal';

/**
 * Los ingredientes de la receta elegida, con los datos de sus productos (nombre, porcentaje,
 * unidad y stock), dentro del formulario de pedido.
 *
 * **Pieza puramente PRESENTACIONAL**: las lineas, las unidades y el estado de la consulta
 * llegan por props. Quien decide CUANDO pedir el detalle de la receta -y que hacer con el
 * resultado- es `OrderForm`, que es el que tiene el id elegido.
 *
 * **Los datos vienen del JOIN que ya hace el detalle de `recetas`**: `getRecipe` resuelve
 * cada `productId` de `recipe_lines` contra `ProductCatalog.findRefs` -el contrato de
 * `inventario`- y trae nombre y stock. Este componente solo los pinta; no consulta ni
 * resuelve nada por su cuenta. La PRESENTACION ya no viaja aqui: se mudo de `products` a
 * `product_batches` el 2026-09-09, y una linea de receta referencia un producto, no un
 * lote, asi que no hay presentacion por ingrediente que mostrar.
 *
 * **La unidad es la del PRODUCTO, no de la linea** (`productUnitId`): la receta ya no guarda
 * unidad. Se traduce aqui con el catalogo que la seccion baja por props: simbolo si lo
 * hay, nombre si no, y el marcador cuando el insumo no tiene unidad resoluble —sin lotes o
 * dado de baja— o cuando el id no existe en el catalogo.
 *
 * **Una linea cuyo producto esta de baja llega con `productName: null`**: la linea
 * se conserva y aqui se dice que el producto no esta disponible, en vez de dejar la celda
 * vacia o pintar el id tecnico.
 *
 * **La columna «porcentaje» pinta `line.percentage` con `formatPercentage`**: «10,00 %», la
 * parte del insumo dentro de la receta.
 *
 * **La columna «cantidad requerida» es `consumedQuantity(pedido, porcentaje)`**: la cantidad
 * del pedido por el porcentaje, dividido 100, en decimal exacto. Sin cantidad escrita vale `0`;
 * en cuanto cambia el campo, se recalcula. Es una columna DE CONSULTA: no viaja en el envio, que
 * sigue llevando la cantidad tal cual se escribio.
 *
 * **La columna «restante» resta lo requerido al stock**: `stock - requerida`, con
 * `subtractDecimal` —misma aritmetica exacta—. Si el pedido pide mas de lo que hay, el valor
 * queda NEGATIVO y se resalta en rojo (`text-destructive` sobre un fondo suave), para que el
 * faltante se vea de un vistazo. Sin stock (`productStock: null`) se muestra el marcador, igual
 * que en la columna de stock: no hay resta que calcular.
 *
 * **Las columnas numericas se PINTAN con dos decimales**: el stock llega con la escala de la
 * columna («0.1000»), y la requerida y la restante salen de un producto de decimales que suma
 * escalas y puede dar mas cifras. Ninguna de esas cifras de mas ayuda a leer la tabla, asi que
 * la celda las pasa por `formatDecimalDisplay`. El porcentaje ya llega con 2 decimales
 * (`formatPercentage`) y no pasa por esa funcion.
 *
 * El redondeo es SOLO del pixel: `requiredOf` y `remainingOf` siguen devolviendo el valor
 * EXACTO, y `isShort` mira ese exacto y no el redondeado —un faltante de 0.001 redondea a «0» y
 * perderia el signo, dejando sin resaltar justo la fila que avisa de que no alcanza—. Y cuando
 * el redondeo cambia lo que se ve, la celda lleva el valor exacto en su `title`
 * (`exactDecimalTitle`): la cifra completa queda a un hover, no desaparece.
 */

/** Prefijo de los `data-testid` de la tabla. Ningun test depende del copy. */
export const ORDER_INGREDIENTS_TESTID = 'order-ingredients';
export const ORDER_INGREDIENTS_TABLE_TESTID = 'order-ingredients-table';
export const ORDER_INGREDIENTS_EMPTY_TESTID = 'order-ingredients-empty';
export const ORDER_INGREDIENTS_ERROR_TESTID = 'order-ingredients-error';
export const ORDER_INGREDIENTS_LOADING_TESTID = 'order-ingredients-loading';

const MISSING_PRODUCT_LABEL = 'Producto no disponible';

/** Marcador de ausencia. Constante para que ningun test dependa del caracter. */
const MISSING_VALUE_MARK = '—';

/**
 * Etiqueta visible de la unidad del insumo: simbolo, nombre, o el marcador cuando el insumo no
 * tiene unidad resoluble (`productUnitId === null`) o el id no existe en el catalogo.
 */
function unitLabel(productUnitId: string | null, units: readonly UnitView[]): string {
  if (productUnitId === null) return MISSING_VALUE_MARK;
  const unit = units.find((candidate) => candidate.id === productUnitId);
  return unit?.symbol ?? unit?.name ?? MISSING_VALUE_MARK;
}

export type OrderIngredientsTableProps = {
  /** Lineas de la receta elegida, tal cual las entrega el detalle de `recetas`. */
  readonly lines: readonly RecipeLineView[];
  /** Catalogo de unidades, por props: resuelve el `productUnitId` de cada linea. */
  readonly units: readonly UnitView[];
  /** La cantidad escrita en el formulario: escalo con ella la «cantidad requerida». */
  readonly quantity: string;
  /** Hay una consulta en vuelo: la tabla aun no tiene lineas definitivas. */
  readonly loading: boolean;
  /** Fallo de la consulta del detalle. `null` = no fallo. */
  readonly error: string | null;
};

export function OrderIngredientsTable({
  lines,
  units,
  quantity,
  loading,
  error,
}: OrderIngredientsTableProps) {
  /**
   * Cantidad requerida de una linea: cantidad del pedido x porcentaje / 100, en decimal
   * exacto. `null` en lineas sin porcentaje (MACHINE, PACKAGING): no consumen, se pinta el
   * marcador y no hay resta que calcular.
   */
  const requiredOf = (line: RecipeLineView): string | null =>
    line.percentage === null
      ? null
      : quantity.trim() === ''
        ? '0'
        : consumedQuantity(quantity, line.percentage);

  /** Restante de una linea: el stock MENOS lo requerido. `null` = sin stock o sin requerida. */
  const remainingOf = (line: RecipeLineView): string | null => {
    const required = requiredOf(line);
    if (line.productStock === null || required === null) return null;
    return subtractDecimal(line.productStock.toString(), required);
  };

  /** Faltante: el restante es negativo, el pedido pide mas de lo que hay. Se resalta en rojo. */
  const isShort = (remaining: string): boolean => remaining.startsWith('-');

  return (
    <section
      className="flex flex-col gap-2"
      data-testid={ORDER_INGREDIENTS_TESTID}
      aria-busy={loading}
    >
      <h2 className="text-sm font-medium">Ingredientes</h2>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={ORDER_INGREDIENTS_ERROR_TESTID}
        >
          {error}
        </p>
      ) : lines.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid={ORDER_INGREDIENTS_EMPTY_TESTID}
        >
          Esta receta no tiene ingredientes.
        </p>
      ) : (
        <Table data-testid={ORDER_INGREDIENTS_TABLE_TESTID}>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Porcentaje</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Cantidad requerida</TableHead>
              <TableHead className="text-right">Restante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const required = requiredOf(line);
              const remaining = remainingOf(line);
              return (
                <TableRow key={line.id} data-testid={`order-ingredient-${index}`}>
                  <TableCell data-testid="order-ingredient-product">
                    {line.productName ?? MISSING_PRODUCT_LABEL}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid="order-ingredient-percentage"
                  >
                    {line.percentage === null ? MISSING_VALUE_MARK : `${formatPercentage(line.percentage)} %`}
                  </TableCell>
                  <TableCell data-testid="order-ingredient-unit">
                    {unitLabel(line.productUnitId, units)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={
                      line.productStock === null
                        ? undefined
                        : exactDecimalTitle(line.productStock.toString())
                    }
                    data-testid="order-ingredient-stock"
                  >
                    {line.productStock === null
                      ? MISSING_VALUE_MARK
                      : formatDecimalDisplay(line.productStock.toString())}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={required === null ? undefined : exactDecimalTitle(required)}
                    data-testid="order-ingredient-required"
                  >
                    {required === null ? MISSING_VALUE_MARK : formatDecimalDisplay(required)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={remaining === null ? undefined : exactDecimalTitle(remaining)}
                    data-testid="order-ingredient-remaining"
                  >
                    {remaining === null ? (
                      MISSING_VALUE_MARK
                    ) : (
                      <span
                        className={
                          isShort(remaining)
                            ? 'inline-block rounded bg-destructive/10 px-1 font-semibold text-destructive'
                            : undefined
                        }
                      >
                        {formatDecimalDisplay(remaining)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-sm text-muted-foreground empty:hidden"
        data-testid={ORDER_INGREDIENTS_LOADING_TESTID}
      >
        {loading ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            <span>Cargando ingredientes…</span>
          </>
        ) : null}
      </p>
    </section>
  );
}