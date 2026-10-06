import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { compareQuantities } from './decimal-quantity';
import { ValidationError } from './errors';
import { planFinishedGoodsLine } from './finished-goods';
import { createProductWithFirstBatchSchema } from './product-batch-input';
import { isWholeQuantity } from './product-input';
import { deriveUnitCost } from './unit-cost';

import type { StockIncreaseListener } from './stock-increase-listener';
import type {
  ImportedFinishedGoodsOutcome,
  InventoryImportRepository,
} from '../ports/inventory-import-repository';

const batchFields = createProductWithFirstBatchSchema.shape;

const MESSAGE_SIN_COSTO = 'Indica el costo unitario o el costo total.';
const MESSAGE_ENVASES = 'La existencia de un producto terminado es un numero entero de envases mayor que 0.';

/**
 * Fila de producto terminado: la existencia son envases enteros y hace falta uno de los dos costos,
 * porque la base exige `unit_cost` en todo lote con `package_content`. Los subesquemas son los del
 * alta manual de un lote.
 */
export const importFinishedGoodsRowSchema = z
  .strictObject({
    stock: batchFields.stock,
    unitCost: batchFields.unitCost,
    totalCost: batchFields.totalCost,
    lot: batchFields.lot,
    purchaseDate: batchFields.purchaseDate,
    expiryDate: batchFields.expiryDate,
  })
  .superRefine((value, ctx) => {
    if (batchFields.stock.safeParse(value.stock).success) {
      if (!isWholeQuantity(value.stock) || compareQuantities(value.stock.trim(), '0') <= 0) {
        ctx.addIssue({ code: 'custom', message: MESSAGE_ENVASES, path: ['stock'] });
      }
    }
    if ((value.unitCost ?? null) === null && (value.totalCost ?? null) === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['unitCost'] });
    }
  });

export type ImportFinishedGoodsRow = z.infer<typeof importFinishedGoodsRowSchema>;

/** Envases enteros de una existencia ya validada (`12` o `12.0000`). */
export function packagesOf(stock: string): number {
  return Number(stock.trim().split('.')[0]);
}

/**
 * Costo unitario en la unidad de la presentacion. El unitario recibido prevalece; si solo viene
 * el total, se reparte sobre la cantidad del lote (envases x contenido). `null` si no da un costo
 * guardable.
 */
export function resolveFinishedGoodsUnitCost(input: {
  readonly packages: number;
  readonly content: string;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
}): string | null {
  if (input.unitCost !== null) return input.unitCost;
  if (input.totalCost === null) return null;
  const plan = planFinishedGoodsLine({ packages: input.packages, content: input.content, unitCost: '0' });
  if (plan.kind === 'no_content') return null;
  return deriveUnitCost(input.totalCost, plan.quantity);
}

export type ImportFinishedGoodsInput = {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly presentationId: string;
  /** Contenido de la presentacion con el que se planifico; solo para repartir un costo total. */
  readonly content: string;
  readonly packages: number;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
  readonly lot: string | null;
  /** `YYYY-MM-DD`; `null` = hoy. */
  readonly purchaseDate: string | null;
  readonly expiryDate: string | null;
};

export type ImportFinishedGoodsDeps = {
  readonly imports: Pick<InventoryImportRepository, 'receiveImportedFinishedGoods'>;
  readonly stockIncreases?: StockIncreaseListener;
  readonly now?: () => Date;
};

export type ImportFinishedGoods = (
  input: ImportFinishedGoodsInput,
  actor: Actor | null | undefined,
) => Promise<ImportedFinishedGoodsOutcome>;

/**
 * Entrada de un lote de producto terminado ligado a su formula, fuera del empaque: el producto de
 * (formula, presentacion) nace si falta y el lote entra con su asiento de apertura, como el alta
 * manual de un lote.
 */
export function createImportFinishedGoods(deps: ImportFinishedGoodsDeps): ImportFinishedGoods {
  const now = deps.now ?? (() => new Date());

  return async function importFinishedGoods(input, actor) {
    requirePermission(actor, 'inventario.modificar');
    const scope = { companyId: actor.companyId };

    if (!Number.isSafeInteger(input.packages) || input.packages <= 0) {
      throw new ValidationError('packages: envases enteros mayores que 0');
    }
    const unitCost = resolveFinishedGoodsUnitCost(input);
    if (unitCost === null) throw new ValidationError('unitCost: sin costo guardable');

    const instant = now();
    const today = instant.toISOString().slice(0, 10);
    const purchaseDate = input.purchaseDate ?? today;
    if (purchaseDate > today) throw new ValidationError(`purchaseDate: fecha de compra futura (${purchaseDate})`);

    const outcome = await deps.imports.receiveImportedFinishedGoods(
      {
        recipeId: input.recipeId,
        recipeName: input.recipeName,
        presentationId: input.presentationId,
        packages: input.packages,
        unitCost,
        lot: input.lot,
        purchaseDate,
        expiryDate: input.expiryDate,
        createdBy: actor.id,
      },
      instant,
      scope,
    );

    if (outcome.kind === 'received') {
      await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instant });
    }
    return outcome;
  };
}
