// lib/modules/inventario/domain/finished-goods.ts
//
// Dominio PURO: sin base de datos, sin framework, sin reloj. `planFinishedGoods` calcula, a
// partir de la cantidad del pedido y el contenido de su presentacion, cuantos envases enteros
// entran, la cantidad exacta que representan y el costo unitario del lote. Comparte la
// aritmetica en `BigInt` escalado a cuatro decimales del resto del modulo (`unit-cost.ts`,
// `decimal-quantity.ts`): ningun importe ni cantidad pasa por coma flotante binaria.

import { deriveUnitCost } from './unit-cost';

import type { ProductId } from './product-catalog';

export type FinishedGoodsPlan =
  | {
      readonly kind: 'planned';
      readonly packages: string;
      readonly quantity: string;
      readonly content: string;
      readonly unitCost: string;
    }
  | { readonly kind: 'no_content' }
  | { readonly kind: 'no_whole_package' };

const SCALE = 4;
const ZERO = BigInt(0);

/** La forma exacta de `decimal(14,4)` no negativo: hasta diez enteros y cuatro decimales. */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * Cadena decimal -> entero escalado a cuatro decimales. Lanza si la cadena no tiene la forma
 * acordada: a diferencia de `unit-cost.ts`, quien llama aqui no es un borde de `zod` sino la
 * escritura del lote, que solo recibe cantidades ya validadas rio arriba (la cantidad del
 * pedido y el contenido copiado o vigente de la presentacion).
 */
function toScaledInteger(amount: string): bigint {
  if (!DECIMAL_PATTERN.test(amount)) {
    throw new Error(`finished-goods: no es un decimal valido: ${JSON.stringify(amount)}`);
  }
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole + fraction.padEnd(SCALE, '0'));
}

/** Entero escalado -> cadena `'d.dddd'`, siempre con sus cuatro decimales. */
function fromScaledInteger(scaled: bigint): string {
  const digits = scaled.toString().padStart(SCALE + 1, '0');
  const cut = digits.length - SCALE;
  return `${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/**
 * Envases enteros y cantidad que entra de un lote de producto terminado.
 *
 *  - `packages = floor(orderQuantity / content)`, con enteros escalados: la division de
 *    `BigInt` trunca hacia cero, y los dos operandos son siempre positivos, asi que truncar
 *    hacia cero es truncar hacia abajo.
 *  - `quantity = packages * content`, exacta.
 *  - `unitCost = deriveUnitCost(lotCost, quantity)`, HALF_UP a cuatro decimales; cuando
 *    `deriveUnitCost` devuelve `null` -el costo del lote es cero, o el unitario redondea a
 *    cero- el plan entra a costo `'0.0000'`: un lote de produccion es el unico que puede
 *    costar cero.
 */
export function planFinishedGoods(input: {
  readonly orderQuantity: string;
  readonly content: string | null;
  readonly lotCost: string;
}): FinishedGoodsPlan {
  if (input.content === null) {
    return { kind: 'no_content' };
  }

  const orderScaled = toScaledInteger(input.orderQuantity);
  const contentScaled = toScaledInteger(input.content);
  const packages = orderScaled / contentScaled;
  if (packages === ZERO) {
    return { kind: 'no_whole_package' };
  }

  const quantity = fromScaledInteger(packages * contentScaled);
  const unitCost = deriveUnitCost(input.lotCost, quantity) ?? '0.0000';

  return {
    kind: 'planned',
    packages: packages.toString(),
    quantity,
    content: fromScaledInteger(contentScaled),
    unitCost,
  };
}

/** Lo que `inventario` devuelve al terminar (o rechazar) la entrada de un lote de produccion. */
export type FinishedGoodsOutcome =
  | { readonly kind: 'received'; readonly productId: ProductId; readonly productName: string; readonly packages: string }
  | { readonly kind: 'presentation_without_content' }
  | { readonly kind: 'no_whole_package' };

/** Servicio que `inventario` ofrece a `pedidos` para el Finalizar: da de alta el producto
 *  terminado de una combinacion (si no existia), su lote y su asiento, y recalcula la
 *  existencia. Lo implementa un adaptador driven de `inventario` sobre la transaccion
 *  compartida y lo cablea `lib/composition`. */
export interface FinishedGoodsIntake {
  receiveFromOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly orderContent: string | null;
    readonly lotCost: string;
    readonly actorId: string;
    readonly now: Date;
  }): Promise<FinishedGoodsOutcome>;
}
