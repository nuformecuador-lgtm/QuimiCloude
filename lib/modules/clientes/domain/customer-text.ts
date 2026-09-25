// lib/modules/clientes/domain/customer-text.ts
/** Forma canonica para buscar sin acentos ni mayusculas en nombres, apellidos y ciudad de un
 *  cliente: NFD, descarte de diacriticos, minusculas y solo [a-z0-9]. Es la UNICA definicion
 *  (R42): la columna `*_normalized` y cualquier consulta futura usan esta.
 *  Misma forma que `normalizeSupplierName` (QC-42), copiada y no importada (regla de
 *  dependencias entre modulos). */
export function normalizeCustomerText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
