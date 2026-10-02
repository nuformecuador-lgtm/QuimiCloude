// lib/modules/inventario/domain/finished-goods.ts
//
// Dominio PURO: sin base de datos, sin framework, sin reloj. `planFinishedGoodsLine` calcula,
// a partir de los envases de UNA linea del reparto y el contenido de su presentacion,
// la cantidad exacta que entra. Comparte la aritmetica en `BigInt` escalado a cuatro decimales
// del resto del modulo (`unit-cost.ts`, `decimal-quantity.ts`): ningun importe ni cantidad pasa
// por coma flotante binaria.

import type { ProductId } from './product-catalog';

/** Los envases ya no se calculan aqui -los da la linea del reparto, entero y positivo
 *  por construccion-, asi que no hay division que pueda dejar `no_whole_package`: ese caso
 *  desaparece del tipo. `unitCost` es el UNICO del pedido entero, ya resuelto por quien
 *  llama; esta funcion no lo recalcula, solo decide si hay contenido con que entrar. */
export type FinishedGoodsLinePlan =
  | { readonly kind: 'planned'; readonly quantity: string }
  | { readonly kind: 'no_content' };

const SCALE = 4;

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
 * Cantidad que entra de UNA linea del reparto: `quantity = packages * content`, exacta -ya no
 * hay division que hacer, los envases son entrada validada rio arriba-. `unitCost` viaja
 * en la entrada porque el contrato lo necesita (es el mismo para todas las lineas del pedido),
 * pero esta funcion no lo usa: quien reciba `'planned'` escribe el lote con el `unitCost`
 * que ya tenia, no con nada que salga de aqui.
 */
export function planFinishedGoodsLine(input: {
  readonly packages: number;
  readonly content: string | null;
  readonly unitCost: string;
}): FinishedGoodsLinePlan {
  if (input.content === null) {
    return { kind: 'no_content' };
  }

  const contentScaled = toScaledInteger(input.content);
  const quantity = fromScaledInteger(BigInt(input.packages) * contentScaled);

  return { kind: 'planned', quantity };
}

/** Lo que `inventario` devuelve al terminar (o rechazar) la entrada de un lote de produccion. */
export type FinishedGoodsOutcome =
  | { readonly kind: 'received'; readonly productId: ProductId; readonly productName: string; readonly packages: string }
  | { readonly kind: 'presentation_without_content' };

/** Servicio que `inventario` ofrece a `pedidos` para Terminar el empaque: da de alta el
 *  producto terminado de una combinacion (si no existia), su lote y su asiento -uno por linea
 *  del reparto-, y recalcula la existencia. Lo implementa un adaptador driven de
 *  `inventario` sobre la transaccion compartida y lo cablea `lib/composition`. */
export interface FinishedGoodsIntake {
  receiveFromOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderPresentationLineId: string;
    readonly packages: number;
    readonly orderContent: string | null;
    readonly unitCost: string;
    readonly actorId: string;
    readonly now: Date;
  }): Promise<FinishedGoodsOutcome>;
}
