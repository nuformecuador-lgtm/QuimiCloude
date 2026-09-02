// lib/modules/recetas/domain/recipe-name.ts
/** Forma canonica para comparar nombres de receta: sin acentos, sin caracteres especiales y
 *  sin distinguir mayusculas. «Desengrasante 5 %», «desengrasante-5%» y «DESENGRASANTE 5%»
 *  producen la misma clave. Es la UNICA definicion (R8): la columna `name_normalized` y
 *  cualquier consulta futura usan esta. */
export function normalizeRecipeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
