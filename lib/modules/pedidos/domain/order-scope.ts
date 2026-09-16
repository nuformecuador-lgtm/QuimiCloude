// lib/modules/pedidos/domain/order-scope.ts
/**
 * La empresa en cuyo nombre se consulta o se escribe en `pedidos`. Lo construye el caso de uso a
 * partir de `actor.companyId`, despues de `requirePermission`: filtra, no autoriza.
 *
 * `companyId` no es opcional: `orders.company_id` es NOT NULL y «sin ambito» no es un caso valido
 * de ninguna operacion del modulo.
 */
export type OrderScope = { readonly companyId: string };
