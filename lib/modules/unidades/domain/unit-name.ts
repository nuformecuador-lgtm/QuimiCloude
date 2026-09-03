// lib/modules/unidades/domain/unit-name.ts
/** Forma canonica para comparar nombres de unidad: recorta, ignora mayusculas, quita acentos y
 *  quita todo lo que no sea [a-z0-9]. «Mililitro», «mililitro» y «MILI-LITRO» producen la misma
 *  clave. Es la UNICA definicion (R4): la columna `name_normalized` y cualquier consumidor
 *  futuro usan esta. */
export function normalizeUnitName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
