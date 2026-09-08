/**
 * AMBITO de una consulta del catalogo de unidades (QC-76 R17, R18): la empresa EN CUYO NOMBRE
 * se pregunta. Dominio puro —ni Prisma, ni `next/*`, ni estado—, para que el puerto pueda
 * exigirlo en su firma sin arrastrar nada de servidor al contrato.
 *
 * `companyId` NO es opcional a proposito: «sin ambito» no es un caso valido del listado. Lo que
 * distingue una unidad de sistema de una de empresa es la columna `company_id` NULA de la FILA
 * (R11), nunca un ambito ausente en la consulta; traducir ese `NULL` a la condicion de lectura
 * es trabajo de `companyScopeWhere` en el adaptador, que es donde vive la UNICA definicion del
 * «de la empresa o de sistema» (R18).
 *
 * NO AUTORIZA NADA. Es un criterio de FILTRADO. El permiso se comprueba aparte y antes, en el
 * caso de uso (R20).
 */
export type UnitScope = { readonly companyId: string };
