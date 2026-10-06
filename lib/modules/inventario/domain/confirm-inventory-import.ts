import type { ConfirmInventoryImport } from './inventory-import-contract';

export type ConfirmInventoryImportDeps = Readonly<Record<string, unknown>>;

export function createConfirmInventoryImport(deps: ConfirmInventoryImportDeps): ConfirmInventoryImport {
  return async () => {
    void deps;
    throw new Error('confirmInventoryImport: sin implementar');
  };
}
