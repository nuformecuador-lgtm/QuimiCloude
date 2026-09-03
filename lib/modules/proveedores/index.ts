// lib/modules/proveedores/index.ts — CONTRATO PUBLICO del modulo `proveedores`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving de T14 NO pasan por aqui.
//
// T13 (`tasks.md`, `design.md > 4`): el contrato pasa de exponer solo la normalizacion
// -lo unico que QC-42 tenia- a exponer tipos, esquemas, errores y las NUEVE factories de
// caso de uso, que es lo que `lib/composition` necesita para cablearlas y lo que las
// Server Actions necesitan para tipar su entrada y reconocer sus errores.
export { requireAdmin, type Actor } from './domain/actor';
export {
  ProveedoresError,
  UnauthorizedError,
  NotFoundError,
  DuplicateNameError,
  DuplicateCatalogLineError,
  ProductNotFoundError,
  ValidationError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
export { normalizeSupplierName } from './domain/supplier-name';
export {
  createSupplierSchema,
  updateSupplierSchema,
  blankToNull,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_PHONE_MAX_LENGTH,
  SUPPLIER_EMAIL_MAX_LENGTH,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from './domain/supplier-input';
export {
  createCatalogLineSchema,
  updateCatalogLineSchema,
  type CreateCatalogLineInput,
  type UpdateCatalogLineInput,
} from './domain/catalog-line-input';
export { type NewSupplier, type SupplierView } from './domain/supplier-view';
export {
  type CatalogLineTerms,
  type CatalogLineView,
  type NewCatalogLine,
} from './domain/catalog-line-view';

// Las nueve factories de caso de uso (`design.md > 4`). Los tipos `*Deps` viajan con ellas:
// quien las cablea es `lib/composition`, y sin el tipo no podria declarar la dependencia.
export { createCreateSupplier, type CreateSupplierDeps } from './domain/create-supplier';
export { createUpdateSupplier, type UpdateSupplierDeps } from './domain/update-supplier';
export { createDeleteSupplier, type DeleteSupplierDeps } from './domain/delete-supplier';
export { createGetSupplier, type GetSupplierDeps } from './domain/get-supplier';
export { createListSuppliers, type ListSuppliersDeps } from './domain/list-suppliers';
export { createCreateCatalogLine, type CreateCatalogLineDeps } from './domain/create-catalog-line';
export { createUpdateCatalogLine, type UpdateCatalogLineDeps } from './domain/update-catalog-line';
export { createDeleteCatalogLine, type DeleteCatalogLineDeps } from './domain/delete-catalog-line';
export { createListCatalogLines, type ListCatalogLinesDeps } from './domain/list-catalog-lines';
