const SCALE = 4;
const ZERO = BigInt(0);

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function toScaled(amount: string): bigint {
  if (!DECIMAL_PATTERN.test(amount)) {
    throw new Error(`finished-goods-dispatch: no es un decimal valido: ${JSON.stringify(amount)}`);
  }
  const [whole = '', fraction = ''] = amount.split('.');
  const digits = fraction.length > SCALE ? fraction.slice(0, SCALE) : fraction.padEnd(SCALE, '0');
  const negative = whole.startsWith('-');
  const magnitude = BigInt(whole.replace('-', '') + digits);
  return negative ? -magnitude : magnitude;
}

/** Envases enteros de un lote: floor(stock / content), exacto a cuatro decimales. Sin contenido
 *  positivo o sin existencia no hay ningun envase que contar. */
export function wholePackagesIn(stock: string, packageContent: string): number {
  const content = toScaled(packageContent);
  const available = toScaled(stock);
  if (content <= ZERO || available <= ZERO) return 0;
  return Number(available / content);
}

export type DeliverableBatch = {
  readonly batchId: string;
  readonly presentationId: string;
  readonly lot: string;
  /** YYYY-MM-DD */
  readonly purchaseDate: string;
  readonly expiryDate: string | null;
  /** decimal(14,4) */
  readonly packageContent: string;
  /** Al menos 1: los lotes sin un envase entero no se devuelven. */
  readonly availablePackages: number;
};

/** Lectura fuera de transaccion de los lotes que se pueden entregar, por fecha de entrada y luego
 *  por lote, ascendentes. El orden solo es de presentacion: el lote lo elige el usuario. */
export interface FinishedBatchCatalog {
  findDeliverableBatches(
    recipeId: string,
    presentationIds: readonly string[],
    companyId: string,
  ): Promise<readonly DeliverableBatch[]>;
}

export type FinishedGoodsDispatchInput = {
  readonly companyId: string;
  readonly orderId: string;
  readonly orderDeliveryId: string;
  readonly recipeId: string;
  readonly presentationId: string;
  readonly allocations: readonly { readonly batchId: string; readonly packages: number }[];
  readonly actorId: string;
  readonly now: Date;
};

export type FinishedGoodsDispatchOutcome =
  | {
      readonly kind: 'dispatched';
      readonly lines: readonly {
        readonly batchId: string;
        readonly packages: number;
        /** packages x packageContent, decimal(14,4), positivo. */
        readonly quantity: string;
      }[];
    }
  | { readonly kind: 'batch_not_found'; readonly batchId: string }
  | { readonly kind: 'insufficient'; readonly batchId: string; readonly availablePackages: number };

/** Salida de producto terminado hacia un cliente. Lo implementa un adaptador driven de
 *  `inventario` sobre la transaccion de quien llama. */
export interface FinishedGoodsDispatch {
  dispatchForDelivery(input: FinishedGoodsDispatchInput): Promise<FinishedGoodsDispatchOutcome>;
}
