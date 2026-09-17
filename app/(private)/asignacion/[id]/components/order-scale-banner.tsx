/**
 * El factor entre la cantidad del pedido y la cantidad para la que esta escrita la receta,
 * visible y fijo. `recipeBaseQuantity` y `scaleFactorText` viajan `| null` porque el modelo de
 * receta no declara ninguna cantidad base: mientras lo sean, esta pantalla muestra solo la
 * cantidad del pedido. Cuando ese dato exista, encenderlo aqui no exige tocar el resto de la
 * pantalla.
 */

export const ORDER_SCALE_BANNER_TESTID = 'order-scale-banner';
export const ORDER_SCALE_BANNER_QUANTITY_TESTID = 'order-scale-banner-quantity';
export const ORDER_SCALE_BANNER_FACTOR_TESTID = 'order-scale-banner-factor';

const QUANTITY_LABEL = 'Pedido';
const BASE_LABEL = 'receta para';

export type OrderScaleBannerProps = {
  readonly orderQuantity: string;
  readonly recipeBaseQuantity: string | null;
  readonly scaleFactorText: string | null;
};

export function OrderScaleBanner({
  orderQuantity,
  recipeBaseQuantity,
  scaleFactorText,
}: OrderScaleBannerProps) {
  const hasFactor = recipeBaseQuantity !== null && scaleFactorText !== null;

  return (
    <p data-testid={ORDER_SCALE_BANNER_TESTID} className="text-base font-medium">
      <span data-testid={ORDER_SCALE_BANNER_QUANTITY_TESTID}>
        {QUANTITY_LABEL} {orderQuantity}
      </span>
      {hasFactor ? (
        <span data-testid={ORDER_SCALE_BANNER_FACTOR_TESTID}>
          {' '}
          · {BASE_LABEL} {recipeBaseQuantity} · {scaleFactorText}
        </span>
      ) : null}
    </p>
  );
}
