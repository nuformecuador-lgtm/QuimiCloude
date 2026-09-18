// lib/modules/proveedores/domain/supplier-scope.ts
/**
 * La empresa en cuyo nombre se consulta o se escribe en `proveedores`. La construye el caso
 * de uso a partir de `actor.companyId`, siempre despues de `requirePermission`: este tipo
 * FILTRA que fila es visible o modificable, pero no decide si el actor puede llegar a
 * pedirlo -eso ya lo resolvio el permiso, antes-.
 *
 * `companyId` no es opcional: tanto `suppliers.company_id` como
 * `supplier_catalog_lines.company_id` son NOT NULL y no existe ninguna operacion de este
 * modulo que tenga sentido sin saber de que empresa habla.
 */
export type SupplierScope = { readonly companyId: string };
