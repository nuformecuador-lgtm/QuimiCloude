export type ProductBatchView = {
  readonly id: string;
  readonly lot: string;
  readonly stock: number;
  readonly unitId: string;
  readonly purchaseDate: string;
  readonly expiryDate: string | null;
};
