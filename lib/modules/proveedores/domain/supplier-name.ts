// lib/modules/proveedores/domain/supplier-name.ts
/** Forma canonica para comparar nombres de proveedor: sin acentos, sin caracteres especiales
 *  y sin distinguir mayusculas. «Quimicos del Pacifico S.A.», «quimicos-del-pacifico sa» y
 *  «QUIMICOS DEL PACIFICO S A» producen la misma clave. Es la UNICA definicion (R8): la
 *  columna `name_normalized` y cualquier consulta futura usan esta.
 *  Misma forma que `normalizeRecipeName` (QC-24) y `normalizePresentationName` (QC-20). */
export function normalizeSupplierName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
