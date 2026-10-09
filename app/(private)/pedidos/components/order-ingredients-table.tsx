'use client';

import { Spinner } from '@/components/shared/spinner';
import {
  APPROXIMATE_LABEL,
  ApproximateMark,
  NotConvertibleNotice,
} from '@/components/shared/unit-conversion-marks';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createOrderSchema, resolveLineNeed, type OrderLineNeed } from '@/lib/modules/pedidos';
import { formatPercentage, type RecipeLineView } from '@/lib/modules/recetas';
import type { MassVolumeBridge, UnitConversion, UnitView } from '@/lib/modules/unidades';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';

import { subtractDecimal } from './order-decimal';

/**
 * Los ingredientes de la receta elegida, con los datos de sus productos (nombre, porcentaje
 * y stock con su unidad), dentro del formulario de pedido.
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
 * unidad. No tiene columna propia: va pegada a la cifra en «stock», «cantidad requerida» y «restante» («720 L»),
 * tambien en su `aria-label`. Se traduce con el catalogo que la seccion baja por props: simbolo
 * si lo hay, nombre si no. Si el insumo no tiene unidad resoluble —sin lotes o dado de baja— o
 * el id no existe en el catalogo, se pinta solo la cifra.
 *
 * **Una linea cuyo producto esta de baja llega con `productName: null`**: la linea
 * se conserva y aqui se dice que el producto no esta disponible, en vez de dejar la celda
 * vacia o pintar el id tecnico.
 *
 * **La columna «porcentaje» pinta `line.percentage` con `formatPercentage`**: «10,00 %», la
 * parte del insumo dentro de la receta.
 *
 * **La «cantidad requerida» sale de `resolveLineNeed`**, la misma regla que el costo y la reserva,
 * asi que va en la unidad del insumo. Sin unidad del pedido elegida no hay en que unidad leer la
 * cifra y se pinta el marcador. Una cantidad que el contrato no acepta cuenta como `0`.
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

/** Simbolo o nombre de la unidad del insumo; `null` si no hay unidad resoluble. */
function unitLabel(productUnitId: string | null, units: readonly UnitView[]): string | null {
  if (productUnitId === null) return null;
  const unit = units.find((candidate) => candidate.id === productUnitId);
  return unit?.symbol ?? unit?.name ?? null;
}

function withUnit(value: string, unit: string | null): string {
  return unit === null ? value : `${value} ${unit}`;
}

function unitConversionOf(unitId: string | null, units: readonly UnitView[]): UnitConversion | null {
  if (unitId === null) return null;
  return units.find((candidate) => candidate.id === unitId) ?? null;
}

/** `null` sin unidad del pedido elegida (`orderUnitId === ''`): no hay cifra que mostrar. */
export function ingredientNeedOf(
  line: RecipeLineView,
  quantity: string,
  orderUnitId: string,
  units: readonly UnitView[],
  bridge: MassVolumeBridge | null,
): OrderLineNeed | null {
  if (orderUnitId === '') return null;
  const validQuantity = createOrderSchema.shape.quantity.safeParse(quantity).success ? quantity : '0';
  return resolveLineNeed(validQuantity, line.percentage, unitConversionOf(line.productUnitId, units), {
    orderUnitId,
    orderUnit: unitConversionOf(orderUnitId, units),
    bridge,
  });
}

export type OrderIngredientsTableProps = {
  /** Lineas de la receta elegida, tal cual las entrega el detalle de `recetas`. */
  readonly lines: readonly RecipeLineView[];
  /** Catalogo de unidades, por props: resuelve el `productUnitId` de cada linea. */
  readonly units: readonly UnitView[];
  /** La cantidad escrita en el formulario: escalo con ella la «cantidad requerida». */
  readonly quantity: string;
  /** Unidad elegida en el formulario; `''` = sin elegir. */
  readonly orderUnitId: string;
  readonly bridge: MassVolumeBridge | null;
  /** Hay una consulta en vuelo: la tabla aun no tiene lineas definitivas. */
  readonly loading: boolean;
  /** Fallo de la consulta del detalle. `null` = no fallo. */
  readonly error: string | null;
};

export function OrderIngredientsTable({
  lines,
  units,
  quantity,
  orderUnitId,
  bridge,
  loading,
  error,
}: OrderIngredientsTableProps) {
  const requiredOf = (need: OrderLineNeed | null): string | null =>
    need === null || need.kind === 'not_convertible' ? null : need.quantity;

  const remainingOf = (line: RecipeLineView, required: string | null): string | null =>
    line.productStock === null || required === null
      ? null
      : subtractDecimal(line.productStock, required);

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
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Cantidad requerida</TableHead>
              <TableHead className="text-right">Restante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const need = ingredientNeedOf(line, quantity, orderUnitId, units, bridge);
              const required = requiredOf(need);
              const remaining = remainingOf(line, required);
              const unit = unitLabel(line.productUnitId, units);
              const approximate = need?.kind === 'approximate';
              return (
                <TableRow key={line.id} data-testid={`order-ingredient-${index}`}>
                  <TableCell data-testid="order-ingredient-product">
                    {line.productName ?? MISSING_PRODUCT_LABEL}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid="order-ingredient-percentage"
                  >
                    {formatPercentage(line.percentage)} %
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={line.productStock === null ? undefined : exactDecimalTitle(line.productStock)}
                    aria-label={
                      line.productStock === null
                        ? undefined
                        : withUnit(trimDecimal(line.productStock), unit)
                    }
                    data-testid="order-ingredient-stock"
                  >
                    {line.productStock === null
                      ? EMPTY_MARK
                      : withUnit(formatDecimalDisplay(line.productStock), unit)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={required === null ? undefined : exactDecimalTitle(required)}
                    aria-label={
                      required === null
                        ? undefined
                        : withUnit(trimDecimal(required), unit) +
                          (approximate ? ` ${APPROXIMATE_LABEL}` : '')
                    }
                    data-testid="order-ingredient-required"
                  >
                    {need?.kind === 'not_convertible' ? (
                      <NotConvertibleNotice
                        testId="order-ingredient-not-convertible"
                        className="whitespace-normal"
                      />
                    ) : required === null ? (
                      EMPTY_MARK
                    ) : (
                      <>
                        {withUnit(formatDecimalDisplay(required), unit)}
                        {approximate ? (
                          <>
                            {' '}
                            <ApproximateMark testId="order-ingredient-approximate" />
                          </>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={remaining === null ? undefined : exactDecimalTitle(remaining)}
                    aria-label={
                      remaining === null ? undefined : withUnit(trimDecimal(remaining), unit)
                    }
                    data-testid="order-ingredient-remaining"
                  >
                    {remaining === null ? (
                      EMPTY_MARK
                    ) : (
                      <span
                        className={
                          isShort(remaining)
                            ? 'inline-block rounded bg-destructive/10 px-1 font-semibold text-destructive'
                            : undefined
                        }
                      >
                        {withUnit(formatDecimalDisplay(remaining), unit)}
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
            <Spinner />
            <span>Cargando ingredientes…</span>
          </>
        ) : null}
      </p>
    </section>
  );
}