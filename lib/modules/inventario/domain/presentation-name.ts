/**
 * Normalizacion pura del nombre de presentacion (D12, R19; `design.md > 2.2`). Se
 * persiste junto al nombre para que un indice unico de base de datos garantice R18/R20
 * sin comparar al vuelo.
 *
 * Cuatro pasos, en orden:
 * 1. `trim()` -recorta los extremos (R9)-.
 * 2. `toLowerCase()` -ignora mayusculas/minusculas-.
 * 3. `normalize('NFD')` + borrado de las marcas diacriticas (`\p{Diacritic}`) -"Bidon" -> "bidon"-.
 * 4. Borrado de todo lo que no sea `[a-z0-9]` -ignora espacios y signos-.
 *
 * «Bidon 20 L», «bidon 20 l» y «BIDON-20L» colapsan las tres en `bidon20l`. Un nombre
 * de solo signos -p. ej. `«---»`- normaliza a la cadena vacia; quien llama a esta
 * funcion decide que hacer con eso (R37, el esquema zod la rechaza como invalida).
 */
export function normalizePresentationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
