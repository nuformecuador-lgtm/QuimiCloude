/** Forma canonica para buscar sin acentos ni mayusculas en nombres, apellidos y ciudad de un
 *  cliente: NFD, descarte de diacriticos, minusculas y solo [a-z0-9]. Es la UNICA definicion:
 *  la columna `*_normalized` y cualquier consulta futura usan esta.
 *  Misma forma que `normalizeSupplierName`, copiada y no importada: un modulo no depende de
 *  otro para una utilidad tan pequena. */
export function normalizeCustomerText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
