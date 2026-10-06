import type { PreviewInventoryImport } from './inventory-import-contract';

export type PreviewInventoryImportDeps = Readonly<Record<string, unknown>>;

export function createPreviewInventoryImport(deps: PreviewInventoryImportDeps): PreviewInventoryImport {
  return async () => {
    void deps;
    throw new Error('previewInventoryImport: sin implementar');
  };
}
