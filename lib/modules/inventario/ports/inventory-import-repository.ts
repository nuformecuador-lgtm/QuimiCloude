import type { ImportResultTotals } from '../domain/inventory-import-contract';
import type { InventoryScope } from '../domain/inventory-scope';
import type { ProductType } from '../domain/product-type';

export type ImportProductRef = {
  readonly id: string;
  readonly nameNormalized: string;
  readonly type: ProductType;
  readonly unitId: string | null;
  readonly presentationId: string | null;
  readonly recipeId: string | null;
};

/** Un lote de producto terminado que entra por importacion, ya validado y con el costo resuelto. */
export type ImportedFinishedGoods = {
  readonly recipeId: string;
  /** Nombre de la formula: con el de la presentacion forma el del producto si hay que crearlo. */
  readonly recipeName: string;
  readonly presentationId: string;
  /** Envases, entero positivo. La cantidad del lote es envases x contenido de la presentacion. */
  readonly packages: number;
  /** En la unidad de la presentacion. */
  readonly unitCost: string;
  /** `null` = lo genera el backend con el correlativo de la empresa. */
  readonly lot: string | null;
  /** `YYYY-MM-DD`. */
  readonly purchaseDate: string;
  /** `YYYY-MM-DD` o `null`. */
  readonly expiryDate: string | null;
  readonly createdBy: string;
};

export type ExistingImport = { readonly importId: string; readonly importedAt: Date };

export type ImportClaim =
  | { readonly kind: 'claimed'; readonly importId: string }
  | { readonly kind: 'already'; readonly importId: string; readonly importedAt: Date };

export type ImportedFinishedGoodsOutcome =
  | { readonly kind: 'received'; readonly productId: string; readonly lot: string; readonly created: boolean }
  | { readonly kind: 'presentation_without_content' }
  | { readonly kind: 'duplicate_lot' };

/** Lecturas en lote y escrituras propias de la importacion de inventario. */
export interface InventoryImportRepository {
  /**
   * Productos vivos cuyo nombre normalizado esta en `names` (se normalizan aqui), de cualquier
   * tipo, ordenados por `created_at` y despues `id` ascendentes: la primera de cada identidad es
   * la misma que elige `ProductRepository.findAliveIdByNameInPresentationUnit`.
   */
  findAliveProductsByNormalizedNames(
    names: readonly string[],
    scope: InventoryScope,
  ): Promise<readonly ImportProductRef[]>;

  /** Productos terminados vivos de cada par (formula, presentacion), con el mismo orden. */
  findAliveFinishedProducts(
    pairs: readonly { recipeId: string; presentationId: string }[],
    scope: InventoryScope,
  ): Promise<readonly ImportProductRef[]>;

  /** Lotes de la empresa con esos codigos, tambien los de productos dados de baja: el codigo de
   *  lote es unico en la empresa sin mirar si su producto sigue vivo. */
  findBatchesByLots(
    lots: readonly string[],
    scope: InventoryScope,
  ): Promise<readonly { lot: string; productId: string }[]>;

  /** La importacion ya confirmada con esa clave en la empresa, o `null`. Solo lee. */
  findImport(importKey: string, scope: InventoryScope): Promise<ExistingImport | null>;

  /** Reserva la clave de importacion. Si la empresa ya la tenia, devuelve la importacion previa
   *  y no escribe nada. */
  claimImport(
    input: { importKey: string; fileName: string; fileSha256: string; createdBy: string; now: Date },
    scope: InventoryScope,
  ): Promise<ImportClaim>;

  /** Cierra la importacion con sus cuentas. Lanza si `importId` no es de la empresa. */
  finishImport(importId: string, totals: ImportResultTotals, now: Date, scope: InventoryScope): Promise<void>;

  /**
   * En una transaccion propia: el producto terminado de (formula, presentacion) nace si falta,
   * entra su lote con `package_content`, su asiento `opening` y se recalcula la existencia.
   */
  receiveImportedFinishedGoods(
    input: ImportedFinishedGoods,
    now: Date,
    scope: InventoryScope,
  ): Promise<ImportedFinishedGoodsOutcome>;
}
