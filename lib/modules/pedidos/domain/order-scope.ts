// lib/modules/pedidos/domain/order-scope.ts
/**
 * AMBITO de una consulta o una escritura del modulo `pedidos` (QC-60 R16, R18): la empresa EN
 * CUYO NOMBRE se consulta o se escribe. Dominio puro -ni Prisma, ni `next/*`, ni estado-, para
 * que el puerto pueda exigirlo en su firma sin arrastrar nada de servidor al contrato publico.
 *
 * **No autoriza: filtra.** Que el `Actor` traiga empresa no concede ningun permiso. El permiso
 * se comprueba APARTE y PRIMERO, en la primera linea del caso de uso con `requirePermission`
 * (R28), antes de zod y antes de tocar ningun puerto; solo despues la empresa se convierte en
 * `OrderScope` y entra en la consulta
 * (`docs/architecture.md > Acceso a datos y autorizacion`).
 *
 * `companyId` NO es opcional a proposito: `orders.company_id` es NOT NULL porque no hay
 * «pedido de sistema» (`design.md > 2.1`). «Sin ambito» no es un caso valido de ninguna
 * operacion del modulo, asi que no hay forma de expresarlo en este tipo.
 *
 * Lo construye el caso de uso a partir de `actor.companyId` -que a su vez rellena el adaptador
 * driving desde el contexto de sesion del servidor, nunca desde la entrada del llamante (R17)-
 * y lo consume el UNICO punto de consulta del adaptador driven, donde vive la unica definicion
 * de «de la empresa» (`design.md > 5`).
 *
 * `OrderCatalog` es la excepcion deliberada y recibe una `string`: ver el docblock de
 * `order-catalog.ts` y `design.md > 6`.
 */
export type OrderScope = { readonly companyId: string };
