/**
 * AMBITO de una consulta o una escritura del modulo `inventario` (QC-49 R13): la empresa EN
 * CUYO NOMBRE se pregunta o se escribe. Dominio puro —ni Prisma, ni `next/*`, ni estado—,
 * para que los dos puertos puedan exigirlo en su firma sin arrastrar nada de servidor al
 * contrato publico.
 *
 * `companyId` NO es opcional a proposito, y aqui se aparta de `units` a conciencia: las tres
 * tablas de inventario llevan `company_id` NOT NULL porque **no hay inventario de sistema**
 * (`design.md > 2.1`). «Sin ambito» no es un caso valido de ninguna operacion del modulo, asi
 * que no hay ninguna forma de expresarlo en este tipo.
 *
 * NO AUTORIZA NADA. Es un criterio de FILTRADO. El permiso se comprueba aparte y ANTES, en la
 * primera linea del caso de uso con `requirePermission` (R11, R24); solo despues la empresa
 * entra en la consulta. Que el actor traiga empresa no concede ningun permiso.
 *
 * Lo construye el caso de uso a partir de `actor.companyId` —que a su vez rellena el adaptador
 * driving desde el contexto de sesion del servidor, nunca desde la entrada del llamante (R12,
 * R17)—, y lo consume el UNICO punto de consulta del adaptador driven, que es donde vive la
 * unica definicion de «de la empresa» (`design.md > 5`).
 */
export type InventoryScope = { readonly companyId: string };
