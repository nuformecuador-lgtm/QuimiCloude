// lib/modules/proveedores/index.ts — CONTRATO PUBLICO del modulo `proveedores`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving de T14 NO pasan por aqui.
//
// T13 (`tasks.md`, `design.md > 4`): el contrato pasa de exponer solo la normalizacion
// -lo unico que QC-42 tenia- a exponer tipos, esquemas, errores y las NUEVE factories de
// caso de uso, que es lo que `lib/composition` necesita para cablearlas y lo que las
// Server Actions necesitan para tipar su entrada y reconocer sus errores.
export { requirePermission, type Actor } from './domain/actor';
export { type SupplierScope } from './domain/supplier-scope';
// QC-70 (R17, R18): `NotFoundError` se partio en `SupplierNotFoundError` y
// `CatalogLineNotFoundError` -un codigo con un solo mensaje no podia decir a la vez «el
// proveedor» y «la linea»- y `DuplicateNameError` paso a `SupplierDuplicateNameError`.
// Los nombres viejos NO se reexportan: dejarlos vivos permitiria seguir lanzando el codigo
// generico que la ficha quita.
export {
  ProveedoresError,
  UnauthorizedError,
  SupplierNotFoundError,
  CatalogLineNotFoundError,
  SupplierDuplicateNameError,
  DuplicateCatalogLineError,
  ValidationError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
// 2026-09-07: la pantalla de detalle estrena la tabla compartida y necesita saber QUE se puede
// ordenar y filtrar. Se publica la lista blanca -como ya hacia `pedidos` con la suya- para que la
// pantalla la compruebe contra el contrato en vez de contra una copia escrita a mano.
export { SUPPLIER_CATALOG_LINE_QUERYABLE } from './domain/supplier-catalog-line-queryable';
export { SUPPLIER_QUERYABLE } from './domain/supplier-queryable';
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
  CATALOG_LINE_NAME_MAX_LENGTH,
  CATALOG_LINE_MATERIAL_MAX_LENGTH,
  CATALOG_LINE_MOUTH_MAX_LENGTH,
  type CreateCatalogLineInput,
  type UpdateCatalogLineInput,
  type CatalogLineMeasurement,
  type CatalogLineMeasurements,
} from './domain/catalog-line-input';
export { type NewSupplier, type SupplierView } from './domain/supplier-view';
// QC-52: `CatalogLineTerms` desaparece y lo sustituye `CatalogLineFields`. No es un
// renombrado cosmetico: la edicion paso de tres campos comerciales a los SIETE de negocio
// (R24, P6), asi que conservar el nombre anterior habria descrito mal lo que el tipo es.
// El error de «articulo del inventario no encontrado» tampoco se reexporta ya: QC-52 lo
// borro del modulo porque su caso no puede ocurrir (R32).
export {
  type CatalogLineFields,
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
// La importacion por identidad, que `documentos` orquesta desde su caso de uso de
// confirmacion. Las dos factories nuevas y sus tipos, nada mas: el puerto que las cablea
// (`SupplierCatalogImportRepository`) no sale de aqui, igual que ningun otro puerto del
// modulo -quien lo necesita es `lib/composition`, que importa la implementacion.
export {
  createFindCatalogLinesByIdentity,
  type FindCatalogLinesByIdentityDeps,
  type AliveCatalogLineByIdentity,
} from './domain/find-catalog-lines-by-identity';
export {
  createImportCatalogLines,
  type ImportCatalogLinesDeps,
  type ImportCatalogLinesSummary,
} from './domain/import-catalog-lines';
