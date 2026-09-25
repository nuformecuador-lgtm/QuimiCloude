/**
 * La empresa en cuyo nombre se consulta o se escribe en `clientes`. La construye el caso de
 * uso a partir de `actor.companyId`, siempre despues de `requirePermission`: este tipo filtra
 * que fila es visible o modificable, pero no decide si el actor puede llegar a pedirlo.
 */
export type CustomerScope = { readonly companyId: string };
