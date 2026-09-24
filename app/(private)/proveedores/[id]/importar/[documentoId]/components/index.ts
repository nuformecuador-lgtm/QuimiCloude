// Barrel de los componentes de la revision de importacion de catalogo (R42,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente, nunca
// aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { CatalogImportReview, type RowFormState } from './catalog-import-review';
export { CatalogImportRow, KIND_LABELS } from './catalog-import-row';
export { CropPicker } from './crop-picker';
export { NewPresentationUnits, type NewPresentationGroup } from './new-presentation-units';
export { CatalogImportSummary } from './catalog-import-summary';
