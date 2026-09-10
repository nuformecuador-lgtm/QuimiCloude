// lib/modules/inventario/index.ts — CONTRATO PUBLICO del modulo inventario.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor (R31,
// `design.md > 3`) -QC-22 lo hara-.
export { requirePermission, type Actor } from './domain/actor';
// QC-70 (R17, R18): `NotFoundError` se abrio en `ProductNotFoundError` y
// `PresentationNotFoundError`, y `DuplicateNameError` paso a `PresentationDuplicateNameError`.
// El codigo generico no podia tener UN mensaje que dijera a la vez «el producto» y «la
// presentacion», que es lo que el catalogo unico exige (`design.md > 3`, `> 4.1`).
export {
  InventarioError,
  UnauthorizedError,
  ProductNotFoundError,
  PresentationNotFoundError,
  PresentationDuplicateNameError,
  PresentationInUseError,
  ValidationError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
// QC-57 (R24, R31): el contrato generico de consulta de lista. `productQuerySchema` y
// `ProductQuery` se fueron con el: el listado de productos ya no tiene busqueda propia.
export {
  type ListFilterKind,
  type ListFilterValue,
  type ListQuery,
  type ListQueryable,
  type ListSort,
  type SanitizedListQuery,
  type SortDirection,
  createListQuerySchema,
  sanitizeListQuery,
} from './domain/list-query';
export { PRESENTATION_QUERYABLE } from './domain/presentation-queryable';
export { PRODUCT_QUERYABLE } from './domain/product-queryable';
export { normalizePresentationName } from './domain/presentation-name';
// QC-57 (R19): la UNICA definicion de «mismo nombre de producto». Se publica en el contrato
// -como las otras cuatro `normalize*Name`- para que sus tests la importen por aqui y no por
// una ruta profunda: si el barrel dejara de exportarla, el test no compilaria.
export { normalizeProductName } from './domain/product-name';
export {
  createPresentationSchema,
  updatePresentationSchema,
  type CreatePresentationInput,
  type UpdatePresentationInput,
} from './domain/presentation-input';
export {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from './domain/product-input';
export { type NewProduct, type ProductView } from './domain/product-view';
export { type PresentationView } from './domain/presentation-view';

// Las nueve factories de caso de uso (`design.md > 3`).
export { createCreateProduct, type CreateProductDeps } from './domain/create-product';
export { createUpdateProduct, type UpdateProductDeps } from './domain/update-product';
export { createDeleteProduct, type DeleteProductDeps } from './domain/delete-product';
export { createGetProduct, type GetProductDeps } from './domain/get-product';
export { createListProducts, type ListProductsDeps } from './domain/list-products';
export { createCreatePresentation, type CreatePresentationDeps } from './domain/create-presentation';
export { createUpdatePresentation, type UpdatePresentationDeps } from './domain/update-presentation';
export { createDeletePresentation, type DeletePresentationDeps } from './domain/delete-presentation';
export { createListPresentations, type ListPresentationsDeps } from './domain/list-presentations';

// --- Costura hacia otros modulos, aportada por QC-24 ---------------------------------
// Publica SOLO TIPOS: es por donde `recetas` apunta a un producto sin tocar la tabla
// `products` ni el cliente Prisma. La implementacion de `ProductCatalog` es un adaptador
// driven de ESTE modulo y su cableado vive en `lib/composition`; las trae QC-25.
export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog';
