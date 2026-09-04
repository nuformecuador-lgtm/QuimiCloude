// lib/modules/inventario/index.ts — CONTRATO PUBLICO del modulo inventario.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor (R31,
// `design.md > 3`) -QC-22 lo hara-.
export { ADMIN_ROLE_NAME, requireAdmin, type Actor } from './domain/actor';
export {
  InventarioError,
  UnauthorizedError,
  NotFoundError,
  DuplicateNameError,
  PresentationInUseError,
  ValidationError,
} from './domain/errors';
export {
  type Page,
  type PageQuery,
  pageQuerySchema,
  type ProductQuery,
  productQuerySchema,
} from './domain/page';
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
